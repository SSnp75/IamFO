/**
 * Pure account-lock policy (Requirement 2.3, 2.8), separated from I/O so it can
 * be property-tested in isolation.
 *
 * Rule: an account locks when there are >= MAX_FAILURES failed attempts whose
 * timestamps all fall within a FAILURE_WINDOW_MS sliding window. Once locked,
 * the lock lasts LOCK_DURATION_MS.
 */
export const MAX_FAILURES = 5;
export const FAILURE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
export const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Given the timestamps (ms) of recent FAILED attempts and the current time,
 * decide whether the account should be locked. Returns the lock-until time (ms)
 * if a lock should be applied, otherwise null.
 *
 * We look at the most recent MAX_FAILURES failures: if that many exist and the
 * oldest of them is within the window ending at now, the threshold is met.
 */
export function shouldLock(failureTimestampsMs: number[], nowMs: number): number | null {
  const windowStart = nowMs - FAILURE_WINDOW_MS;
  // Only the lower bound matters for "within the last 10 minutes". We do not
  // upper-bound at exactly nowMs: failure timestamps are assigned by the
  // database clock (NOW()) and may be a few ms ahead of the nowMs captured by
  // the service at the start of the request. A small positive skew still
  // denotes a genuine recent failure and must be counted.
  const withinWindow = failureTimestampsMs.filter((t) => t > windowStart);
  if (withinWindow.length >= MAX_FAILURES) {
    return nowMs + LOCK_DURATION_MS;
  }
  return null;
}

/** Whether an account is currently locked, given its lock-until time (ms) or null. */
export function isLocked(lockedUntilMs: number | null, nowMs: number): boolean {
  return lockedUntilMs !== null && lockedUntilMs > nowMs;
}

/** Remaining lock time in whole minutes (rounded up), min 1 when locked. */
export function remainingLockMinutes(lockedUntilMs: number, nowMs: number): number {
  return Math.max(1, Math.ceil((lockedUntilMs - nowMs) / 60000));
}
