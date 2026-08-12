import { createHash, randomBytes } from 'node:crypto';

/**
 * The Google half of the OAuth flow, as pure functions.
 *
 * Written directly rather than through the MCP SDK that ECVBot uses. That SDK
 * exists to talk to an *arbitrary* authorization server it discovers at
 * runtime — dynamic client registration, RFC 9728 metadata — and Google
 * supports neither: the endpoints are fixed constants and the client is
 * registered by hand in the console. Discovery machinery that always resolves
 * to the same two URLs is machinery with nothing to decide.
 *
 * What is kept from ECVBot is everything that was learned the hard way: PKCE,
 * a random state with a short life, and treating the refresh token as
 * one-time-use.
 */

export const AUTH_ENDPOINT = 'https://accounts.google.com/o/oauth2/v2/auth';
export const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * Read-only, and file metadata only until the user picks something.
 *
 * `drive.readonly` is a restricted scope: Google requires an app using it in
 * production to pass verification. That is a real constraint on shipping, not
 * on building — an unverified app works for its own owner and for test users.
 */
export const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];

export interface PkcePair {
  verifier: string;
  challenge: string;
}

/** S256, which is the only challenge method worth using. */
export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString('base64url');
  return {
    verifier,
    challenge: createHash('sha256').update(verifier).digest('base64url'),
  };
}

export function createState(): string {
  return randomBytes(32).toString('hex');
}

export function buildAuthorizationUrl(options: {
  clientId: string;
  redirectUri: string;
  state: string;
  challenge: string;
}): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set('client_id', options.clientId);
  url.searchParams.set('redirect_uri', options.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(' '));
  url.searchParams.set('state', options.state);
  url.searchParams.set('code_challenge', options.challenge);
  url.searchParams.set('code_challenge_method', 'S256');
  // Google returns a refresh token only on the first consent unless asked
  // again explicitly, and without one the connection dies in an hour.
  url.searchParams.set('access_type', 'offline');
  url.searchParams.set('prompt', 'consent');

  return url.toString();
}

export interface TokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope?: string;
}

export function exchangeBody(options: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  verifier: string;
}): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: options.clientId,
    client_secret: options.clientSecret,
    code: options.code,
    redirect_uri: options.redirectUri,
    code_verifier: options.verifier,
  });
}

export function refreshBody(options: {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}): URLSearchParams {
  return new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: options.clientId,
    client_secret: options.clientSecret,
    refresh_token: options.refreshToken,
  });
}

/**
 * Expiry with a minute of headroom, so a token that would lapse mid-request is
 * refreshed before it is used rather than after it fails.
 */
export function expiresAt(expiresIn: number, now = Date.now()): Date {
  return new Date(now + expiresIn * 1000 - 60_000);
}
