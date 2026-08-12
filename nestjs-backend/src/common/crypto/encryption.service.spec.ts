import { ConfigService } from '@nestjs/config';
import { EncryptionService } from './encryption.service';

const withKey = (key?: string) =>
  new EncryptionService({ get: () => key } as unknown as ConfigService<never, true>);

const KEY = 'a'.repeat(64);

describe('EncryptionService', () => {
  it('round-trips a secret', () => {
    const service = withKey(KEY);
    const token = '1//0gRefreshTokenWithVietnamese-ĐồngÝ';

    expect(service.decrypt(service.encrypt(token))).toBe(token);
  });

  it('never produces the same ciphertext twice', () => {
    const service = withKey(KEY);

    expect(service.encrypt('same')).not.toBe(service.encrypt('same'));
  });

  it('refuses a tampered ciphertext rather than returning garbage', () => {
    // GCM's auth tag is the point: a silently corrupted refresh token would
    // look like a revoked grant.
    const service = withKey(KEY);
    const [iv, tag, payload] = service.encrypt('secret').split(':');
    const flipped = payload.replace(/^./, (c) => (c === 'a' ? 'b' : 'a'));

    expect(() => service.decrypt([iv, tag, flipped].join(':'))).toThrow();
  });

  it('rejects a value that is not in the stored form', () => {
    expect(() => withKey(KEY).decrypt('not-encrypted')).toThrow(/iv:tag:ciphertext/);
  });

  it('says so rather than writing plaintext when no key is set', () => {
    const service = withKey(undefined);

    expect(service.available).toBe(false);
    expect(() => service.encrypt('secret')).toThrow(/ENCRYPTION_KEY/);
  });
});
