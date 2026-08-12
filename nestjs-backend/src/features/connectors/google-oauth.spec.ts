import { createHash } from 'node:crypto';
import {
  buildAuthorizationUrl,
  createPkcePair,
  createState,
  exchangeBody,
  expiresAt,
  refreshBody,
} from './google-oauth';

describe('createPkcePair', () => {
  it('derives the challenge from the verifier with S256', () => {
    const { verifier, challenge } = createPkcePair();

    expect(challenge).toBe(createHash('sha256').update(verifier).digest('base64url'));
  });

  it('is different every time', () => {
    expect(createPkcePair().verifier).not.toBe(createPkcePair().verifier);
    expect(createState()).not.toBe(createState());
  });
});

describe('buildAuthorizationUrl', () => {
  const url = () =>
    new URL(
      buildAuthorizationUrl({
        clientId: 'client-123',
        redirectUri: 'http://localhost:3000/connectors/google/callback',
        state: 'state-abc',
        challenge: 'challenge-xyz',
      }),
    );

  it('carries the client, redirect, state and challenge', () => {
    const params = url().searchParams;

    expect(params.get('client_id')).toBe('client-123');
    expect(params.get('redirect_uri')).toBe('http://localhost:3000/connectors/google/callback');
    expect(params.get('state')).toBe('state-abc');
    expect(params.get('code_challenge')).toBe('challenge-xyz');
    expect(params.get('code_challenge_method')).toBe('S256');
  });

  it('asks for offline access and a fresh consent', () => {
    // Without both, Google returns no refresh token on a repeat authorization
    // and the connection dies an hour later with no way to renew it.
    const params = url().searchParams;

    expect(params.get('access_type')).toBe('offline');
    expect(params.get('prompt')).toBe('consent');
  });

  it('asks only for read access', () => {
    expect(url().searchParams.get('scope')).toBe('https://www.googleapis.com/auth/drive.readonly');
  });
});

describe('token bodies', () => {
  it('sends the verifier when exchanging a code', () => {
    const body = exchangeBody({
      clientId: 'c',
      clientSecret: 's',
      code: 'the-code',
      redirectUri: 'http://localhost/cb',
      verifier: 'the-verifier',
    });

    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe('the-verifier');
  });

  it('sends the refresh token when renewing', () => {
    const body = refreshBody({ clientId: 'c', clientSecret: 's', refreshToken: 'r' });

    expect(body.get('grant_type')).toBe('refresh_token');
    expect(body.get('refresh_token')).toBe('r');
  });
});

describe('expiresAt', () => {
  it('expires a minute early, so a token cannot lapse mid-request', () => {
    const now = Date.UTC(2026, 2, 15, 8, 0, 0);

    expect(expiresAt(3600, now).toISOString()).toBe('2026-03-15T08:59:00.000Z');
  });
});
