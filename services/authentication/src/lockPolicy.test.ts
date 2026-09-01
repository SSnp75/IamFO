import fc from 'fast-check';
import {
  shouldLock,
  isLocked,
  remainingLockMinutes,
  MAX_FAILURES,
  FAILURE_WINDOW_MS,
  LOCK_DURATION_MS,
} from './lockPolicy';

describe('Account lock policy', () => {
  it('locks after exactly 5 failures within the window', () => {
    const now = 1_000_000_000;
    const fails = Array.from({ length: 5 }, (_, i) => now - i * 1000); // all within 10 min
    const lockUntil = shouldLock(fails, now);
    expect(lockUntil).toBe(now + LOCK_DURATION_MS);
  });

  it('does not lock with only 4 failures in the window', () => {
    const now = 1_000_000_000;
    const fails = Array.from({ length: 4 }, (_, i) => now - i * 1000);
    expect(shouldLock(fails, now)).toBeNull();
  });

  it('ignores failures older than the window', () => {
    const now = 1_000_000_000;
    // 5 failures but all older than 10 minutes.
    const fails = Array.from({ length: 5 }, (_, i) => now - FAILURE_WINDOW_MS - 1000 - i * 1000);
    expect(shouldLock(fails, now)).toBeNull();
  });

  // Feature: iamfriendof-volunteer-network, Property 5: Account lock activates after 5 failures in 10 minutes
  it('Property 5: locks iff >= MAX_FAILURES failures fall within the 10-minute window', () => {
    fc.assert(
      fc.property(
        // generate failure offsets (ms before now), 0..30 minutes back
        fc.array(fc.integer({ min: 0, max: 30 * 60 * 1000 }), { maxLength: 20 }),
        (offsets) => {
          const now = 5_000_000_000;
          const timestamps = offsets.map((o) => now - o);
          const withinWindow = timestamps.filter((t) => t > now - FAILURE_WINDOW_MS && t <= now);
          const expectLock = withinWindow.length >= MAX_FAILURES;
          const result = shouldLock(timestamps, now);
          expect(result !== null).toBe(expectLock);
          if (result !== null) expect(result).toBe(now + LOCK_DURATION_MS);
        },
      ),
    );
  });

  it('isLocked and remainingLockMinutes behave at boundaries', () => {
    const now = 1_000_000;
    expect(isLocked(null, now)).toBe(false);
    expect(isLocked(now - 1, now)).toBe(false); // expired
    expect(isLocked(now + 60_000, now)).toBe(true);
    expect(remainingLockMinutes(now + 5 * 60_000, now)).toBe(5);
    expect(remainingLockMinutes(now + 1, now)).toBe(1); // rounds up, min 1
  });
});
