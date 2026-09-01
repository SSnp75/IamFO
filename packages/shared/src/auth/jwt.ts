import { SignJWT, jwtVerify, errors as joseErrors } from 'jose';
import { AppError } from '../errors/AppError';
import { ERROR_CODES } from '../errors/codes';

/** Claims carried in the session JWT. */
export interface SessionClaims {
  /** Member id (subject). */
  sub: string;
  /** Unique token id, used to look up explicit-logout revocation in Postgres. */
  jti: string;
}

/** Default access-token lifetime: 8 hours (Requirement 2.1). */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

/**
 * Self-validating session tokens (Phase 0: no Redis).
 *
 * Signature + expiry are verified with the shared secret; explicit logout and
 * account-lock revocation are checked separately against Postgres by the caller
 * (via the token's jti). HS256 is used so Phase 0 needs only a secret string,
 * not a key pair; Phase 2 may switch to RS256 without changing this contract.
 */
export class JwtSessions {
  private readonly key: Uint8Array;

  constructor(secret: string, private readonly ttlSeconds: number = SESSION_TTL_SECONDS) {
    if (!secret || secret.length < 32) {
      throw new Error('JWT secret must be at least 32 characters');
    }
    this.key = new TextEncoder().encode(secret);
  }

  /** Issue a signed token for a member. Generates a random jti for revocation. */
  async issue(memberId: string, jti: string = crypto.randomUUID()): Promise<{ token: string; jti: string; expiresIn: number }> {
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(memberId)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(`${this.ttlSeconds}s`)
      .sign(this.key);
    return { token, jti, expiresIn: this.ttlSeconds };
  }

  /**
   * Verify a token's signature and expiry, returning its claims.
   * Throws AppError(SESSION_EXPIRED) on expiry and AppError(UNAUTHORIZED) on any
   * other verification failure (tampered, malformed, wrong signature).
   */
  async verify(token: string): Promise<SessionClaims> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'] });
      if (typeof payload.sub !== 'string' || typeof payload.jti !== 'string') {
        throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Malformed session token', 401);
      }
      return { sub: payload.sub, jti: payload.jti };
    } catch (err) {
      if (err instanceof AppError) throw err;
      if (err instanceof joseErrors.JWTExpired) {
        throw new AppError(ERROR_CODES.SESSION_EXPIRED, 'Session has expired', 401);
      }
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Invalid session token', 401);
    }
  }
}
