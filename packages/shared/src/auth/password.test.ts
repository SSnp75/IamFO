import fc from 'fast-check';
import { hashPassword, verifyPassword } from './password';

// Low iteration count keeps the property test fast; the algorithm is identical.
const FAST = 1000;

describe('password hashing', () => {
  it('verifies a correct password and rejects an incorrect one', async () => {
    const hash = await hashPassword('correct horse battery staple', FAST);
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  // Feature: iamfriendof-volunteer-network, Property 3: Per-record password salt produces distinct hashes
  it('Property 3: hashing the same password twice yields different encoded hashes', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 8, maxLength: 40 }), async (pw) => {
        const h1 = await hashPassword(pw, FAST);
        const h2 = await hashPassword(pw, FAST);
        expect(h1).not.toBe(h2);
        // Both must still verify against the original password.
        expect(await verifyPassword(pw, h1)).toBe(true);
        expect(await verifyPassword(pw, h2)).toBe(true);
      }),
      { numRuns: 20 }, // hashing is expensive; 20 runs is enough signal here
    );
  });

  it('rejects a malformed encoded hash', async () => {
    expect(await verifyPassword('x', 'not-a-valid-hash')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2$abc$salt$hash')).toBe(false);
  });
});
