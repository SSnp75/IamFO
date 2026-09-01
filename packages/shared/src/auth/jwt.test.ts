import { JwtSessions } from './jwt';
import { AppError } from '../errors/AppError';
import { ERROR_CODES } from '../errors/codes';

const SECRET = 'a'.repeat(40);

describe('JwtSessions', () => {
  it('issues a token that verifies back to the same member and jti', async () => {
    const sessions = new JwtSessions(SECRET);
    const { token, jti, expiresIn } = await sessions.issue('member-123');
    expect(expiresIn).toBe(8 * 60 * 60);

    const claims = await sessions.verify(token);
    expect(claims.sub).toBe('member-123');
    expect(claims.jti).toBe(jti);
  });

  it('rejects a tampered token with UNAUTHORIZED', async () => {
    const sessions = new JwtSessions(SECRET);
    const { token } = await sessions.issue('member-123');
    const tampered = token.slice(0, -3) + 'xyz';

    await expect(sessions.verify(tampered)).rejects.toMatchObject({
      code: ERROR_CODES.UNAUTHORIZED,
    });
  });

  it('rejects a token signed with a different secret', async () => {
    const a = new JwtSessions(SECRET);
    const b = new JwtSessions('b'.repeat(40));
    const { token } = await a.issue('m1');

    await expect(b.verify(token)).rejects.toBeInstanceOf(AppError);
  });

  it('reports SESSION_EXPIRED for an expired token', async () => {
    const sessions = new JwtSessions(SECRET, 1);
    const { token } = await sessions.issue('m1');
    // Wait just over the 1s TTL (jose allows no clock skew by default here).
    await new Promise((r) => setTimeout(r, 1500));

    await expect(sessions.verify(token)).rejects.toMatchObject({
      code: ERROR_CODES.SESSION_EXPIRED,
    });
  });

  it('refuses a too-short secret', () => {
    expect(() => new JwtSessions('short')).toThrow();
  });
});
