import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { EnvConfig } from '@config/env.config';

/**
 * AES-256-GCM for secrets that have to be stored and read back — OAuth refresh
 * tokens, and the client secret of a connected app.
 *
 * Ported from ECVBot, which holds provider credentials the same way. GCM
 * rather than CBC because the auth tag makes tampering a decrypt failure
 * instead of silent garbage, and a refresh token that decrypts to garbage
 * would look like a revoked grant.
 *
 * The key is read once at construction and the service refuses to work
 * without it. Encrypting with a missing key would mean writing plaintext
 * secrets to the database under a method name that says otherwise.
 */
@Injectable()
export class EncryptionService {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly IV_LENGTH = 12;

  private readonly key: Buffer | null;

  constructor(config: ConfigService<EnvConfig, true>) {
    const hex = config.get('ENCRYPTION_KEY', { infer: true });
    this.key = hex ? Buffer.from(hex, 'hex') : null;
  }

  /** True when a key is configured, so a caller can degrade rather than throw. */
  get available(): boolean {
    return this.key !== null;
  }

  /** `iv:authTag:ciphertext`, all hex. */
  encrypt(plaintext: string): string {
    const key = this.ensureKey();
    const iv = randomBytes(EncryptionService.IV_LENGTH);
    const cipher = createCipheriv(EncryptionService.ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return [
      iv.toString('hex'),
      cipher.getAuthTag().toString('hex'),
      encrypted.toString('hex'),
    ].join(':');
  }

  decrypt(ciphertext: string): string {
    const key = this.ensureKey();
    const parts = ciphertext.split(':');
    if (parts.length !== 3) throw new Error('Stored secret is not in iv:tag:ciphertext form');

    const [iv, tag, payload] = parts;
    const decipher = createDecipheriv(EncryptionService.ALGORITHM, key, Buffer.from(iv, 'hex'));
    decipher.setAuthTag(Buffer.from(tag, 'hex'));

    return Buffer.concat([
      decipher.update(Buffer.from(payload, 'hex')),
      decipher.final(),
    ]).toString('utf8');
  }

  private ensureKey(): Buffer {
    if (!this.key) {
      throw new Error(
        'ENCRYPTION_KEY is not set. Generate one with: openssl rand -hex 32',
      );
    }
    return this.key;
  }
}
