import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SourceConnection } from '@prisma/client';
import { EncryptionService } from '@common/crypto/encryption.service';
import type { EnvConfig } from '@config/env.config';
import { PrismaService } from '@shared/database/prisma.service';
import { folderQuery, planImport, type DriveFile } from './google-drive-files';
import {
  buildAuthorizationUrl,
  createPkcePair,
  createState,
  exchangeBody,
  expiresAt,
  refreshBody,
  TOKEN_ENDPOINT,
  type TokenResponse,
} from './google-oauth';

const PROVIDER = 'google_drive';
const FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const USERINFO_ENDPOINT = 'https://www.googleapis.com/oauth2/v2/userinfo';

/** A pending authorization, held only as long as a person takes to consent. */
const STATE_TTL_MS = 10 * 60 * 1000;

interface PendingAuth {
  ownerId: string;
  verifier: string;
  expiresAt: number;
}

@Injectable()
export class GoogleDriveService {
  private readonly logger = new Logger(GoogleDriveService.name);

  /**
   * In process rather than in Redis, unlike ECVBot.
   *
   * The state lives for the seconds between a redirect and its callback, and
   * eDIP runs as one API process; putting it in Redis would buy nothing but a
   * dependency. It is the first thing to change if this ever runs behind more
   * than one instance — a callback arriving at the wrong one would fail to
   * find its verifier.
   */
  private readonly pending = new Map<string, PendingAuth>();

  /**
   * One refresh at a time per connection.
   *
   * Google rotates the refresh token, so two requests refreshing at once send
   * the same one twice: the first is honoured, the second comes back
   * `invalid_grant`, and the connection looks revoked when it is not. ECVBot
   * hit exactly this and solved it with a Redis lock across instances; within
   * one process a promise per connection is the same guarantee.
   */
  private readonly refreshing = new Map<string, Promise<string>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
    private readonly config: ConfigService<EnvConfig, true>,
  ) {}

  /** Whether the deployment has been given credentials to use at all. */
  get configured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.encryption.available);
  }

  async getConnection(ownerId: string) {
    const connection = await this.prisma.sourceConnection.findUnique({
      where: { ownerId_provider: { ownerId, provider: PROVIDER } },
      select: { accountEmail: true, createdAt: true },
    });

    return { connected: connection !== null, ...connection };
  }

  startAuthorization(ownerId: string): string {
    this.assertConfigured();

    const state = createState();
    const { verifier, challenge } = createPkcePair();
    this.sweepExpiredStates();
    this.pending.set(state, { ownerId, verifier, expiresAt: Date.now() + STATE_TTL_MS });

    return buildAuthorizationUrl({
      clientId: this.clientId,
      redirectUri: this.redirectUri,
      state,
      challenge,
    });
  }

  /**
   * Exchanges the code and stores the grant.
   *
   * The state is consumed whatever happens next: a code that fails to exchange
   * must not leave a verifier behind for a replayed callback to reuse.
   */
  async completeAuthorization(state: string, code: string): Promise<void> {
    this.assertConfigured();

    const auth = this.pending.get(state);
    this.pending.delete(state);
    if (!auth || auth.expiresAt < Date.now()) {
      throw new NotFoundException('This sign-in link has expired. Start again from Sources.');
    }

    const token = await this.postToken(
      exchangeBody({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        code,
        redirectUri: this.redirectUri,
        verifier: auth.verifier,
      }),
    );

    if (!token.refresh_token) {
      throw new ServiceUnavailableException(
        'Google did not return a refresh token, so the connection would expire within the hour. Remove eDIP from your Google account permissions and connect again.',
      );
    }

    const accountEmail = await this.fetchAccountEmail(token.access_token);

    // Upsert, so reconnecting replaces the grant rather than leaving an older
    // one behind that nobody can see to revoke.
    await this.prisma.sourceConnection.upsert({
      where: { ownerId_provider: { ownerId: auth.ownerId, provider: PROVIDER } },
      create: {
        provider: PROVIDER,
        ownerId: auth.ownerId,
        accountEmail,
        accessToken: this.encryption.encrypt(token.access_token),
        refreshToken: this.encryption.encrypt(token.refresh_token),
        accessExpiresAt: expiresAt(token.expires_in),
      },
      update: {
        accountEmail,
        accessToken: this.encryption.encrypt(token.access_token),
        refreshToken: this.encryption.encrypt(token.refresh_token),
        accessExpiresAt: expiresAt(token.expires_in),
      },
    });

    this.logger.log(`connected Google Drive for ${auth.ownerId} (${accountEmail ?? 'unknown'})`);
  }

  async disconnect(ownerId: string): Promise<void> {
    await this.prisma.sourceConnection.deleteMany({ where: { ownerId, provider: PROVIDER } });
  }

  /** One page of a folder, with what would happen to each entry on import. */
  async listFolder(ownerId: string, folderId = 'root', pageToken?: string) {
    const token = await this.accessToken(ownerId);

    const url = new URL(FILES_ENDPOINT);
    url.searchParams.set('q', folderQuery(folderId));
    url.searchParams.set('fields', 'nextPageToken, files(id, name, mimeType, size, modifiedTime)');
    // Folders first, then by name, so a browser reads like a file manager.
    url.searchParams.set('orderBy', 'folder, name');
    url.searchParams.set('pageSize', '100');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const body = await this.driveRequest<{ files: DriveFile[]; nextPageToken?: string }>(url, token);

    return {
      files: body.files.map((file) => ({ ...file, plan: planImport(file) })),
      nextPageToken: body.nextPageToken ?? null,
    };
  }

  /** The bytes of one file, exporting it first when it is a native Google doc. */
  async fetchFile(ownerId: string, file: DriveFile): Promise<{ filename: string; bytes: Buffer }> {
    const plan = planImport(file);
    if (plan.action === 'skip') throw new NotFoundException(plan.reason);

    const token = await this.accessToken(ownerId);
    const url = new URL(`${FILES_ENDPOINT}/${encodeURIComponent(file.id)}`);

    if (plan.action === 'export') {
      url.pathname += '/export';
      url.searchParams.set('mimeType', plan.exportMimeType);
    } else {
      url.searchParams.set('alt', 'media');
    }

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Google Drive refused to send "${file.name}" (${response.status}).`,
      );
    }

    return { filename: plan.filename, bytes: Buffer.from(await response.arrayBuffer()) };
  }

  // ---- tokens -------------------------------------------------------------

  private async accessToken(ownerId: string): Promise<string> {
    const connection = await this.prisma.sourceConnection.findUnique({
      where: { ownerId_provider: { ownerId, provider: PROVIDER } },
    });
    if (!connection) throw new NotFoundException('Google Drive is not connected.');

    if (connection.accessExpiresAt > new Date()) {
      return this.encryption.decrypt(connection.accessToken);
    }

    const inFlight = this.refreshing.get(connection.id);
    if (inFlight) return inFlight;

    const refresh = this.refreshAccessToken(connection).finally(() => {
      this.refreshing.delete(connection.id);
    });
    this.refreshing.set(connection.id, refresh);
    return refresh;
  }

  private async refreshAccessToken(connection: SourceConnection): Promise<string> {
    if (!connection.refreshToken) {
      throw new ServiceUnavailableException('This connection has no refresh token. Reconnect.');
    }

    const token = await this.postToken(
      refreshBody({
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        refreshToken: this.encryption.decrypt(connection.refreshToken),
      }),
    );

    await this.prisma.sourceConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: this.encryption.encrypt(token.access_token),
        // Google may hand back a new refresh token; keeping the old one when
        // it does would leave a rotated credential behind.
        ...(token.refresh_token
          ? { refreshToken: this.encryption.encrypt(token.refresh_token) }
          : {}),
        accessExpiresAt: expiresAt(token.expires_in),
      },
    });

    return token.access_token;
  }

  private async postToken(body: URLSearchParams): Promise<TokenResponse> {
    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!response.ok) {
      // The body carries Google's own reason; it names the fault far better
      // than a status code, and it holds no secret.
      throw new ServiceUnavailableException(
        `Google rejected the token request: ${await response.text()}`,
      );
    }

    return (await response.json()) as TokenResponse;
  }

  private async fetchAccountEmail(accessToken: string): Promise<string | null> {
    try {
      const response = await fetch(USERINFO_ENDPOINT, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!response.ok) return null;
      return ((await response.json()) as { email?: string }).email ?? null;
    } catch {
      // A label, not a credential: failing to read it must not fail the
      // connection that otherwise works.
      return null;
    }
  }

  private async driveRequest<T>(url: URL, token: string): Promise<T> {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `Google Drive returned ${response.status}: ${await response.text()}`,
      );
    }
    return (await response.json()) as T;
  }

  // ---- config -------------------------------------------------------------

  private get clientId(): string {
    return this.config.get('GOOGLE_CLIENT_ID', { infer: true }) ?? '';
  }

  private get clientSecret(): string {
    return this.config.get('GOOGLE_CLIENT_SECRET', { infer: true }) ?? '';
  }

  private get redirectUri(): string {
    return this.config.get('GOOGLE_REDIRECT_URI', { infer: true });
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Google Drive is not configured. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ENCRYPTION_KEY.',
      );
    }
  }

  private sweepExpiredStates(): void {
    const now = Date.now();
    for (const [state, auth] of this.pending) {
      if (auth.expiresAt < now) this.pending.delete(state);
    }
  }
}
