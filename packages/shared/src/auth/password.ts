/**
 * Password hashing using PBKDF2-HMAC-SHA-256 via Web Crypto (crypto.subtle).
 *
 * Rationale: the design specifies Argon2id, but the native argon2 module does
 * not run on the Cloudflare Workers runtime used in Phase 0. PBKDF2 with a high
 * iteration count and a per-record random salt is available in both Node 20 and
 * Workers, satisfies the "one-way hash with per-record salt" requirement
 * (Req 1.10/1.11), and is swappable for Argon2id in Phase 2 (server runtime)
 * behind this same interface without changing callers.
 *
 * Encoded format: pbkdf2$<iterations>$<saltB64>$<hashB64>
 */
const ALGO = 'PBKDF2';
const HASH = 'SHA-256';
const DEFAULT_ITERATIONS = 210_000; // OWASP 2023 guidance for PBKDF2-SHA256
const KEY_LEN_BYTES = 32;
const SALT_LEN_BYTES = 16;

function toB64(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  // btoa is available in Node 20 and Workers.
  return btoa(binary);
}

function fromB64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    { name: ALGO },
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: ALGO, salt, iterations, hash: HASH },
    keyMaterial,
    KEY_LEN_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** Hash a password with a fresh random salt. Returns the encoded string. */
export async function hashPassword(password: string, iterations = DEFAULT_ITERATIONS): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LEN_BYTES));
  const hash = await derive(password, salt, iterations);
  return `pbkdf2$${iterations}$${toB64(salt)}$${toB64(hash)}`;
}

/** Verify a password against an encoded hash. Constant-time comparison. */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const parts = encoded.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const salt = fromB64(parts[2]!);
  const expected = fromB64(parts[3]!);
  const actual = await derive(password, salt, iterations);
  return timingSafeEqual(actual, expected);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a[i] ?? 0) ^ (b[i] ?? 0);
  return diff === 0;
}
