/**
 * Result of a rate-limit check.
 * - allowed: whether the request may proceed
 * - remaining: requests left in the current window
 * - retryAfterSeconds: when limited, seconds until the window frees capacity
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/**
 * Storage contract for a fixed-window counter. Phase 0 provides an in-memory
 * store (dev / edge-native limiting) and a Postgres-backed store; Phase 1/2
 * swaps in Redis behind this same interface.
 *
 * increment atomically adds one to the counter for `key` within the window that
 * contains `nowMs`, returning the new count and the window's end time (ms).
 */
export interface RateLimitStore {
  increment(key: string, windowMs: number, nowMs: number): Promise<{ count: number; windowEndMs: number }>;
}

/** Fixed-window rate limiter over a pluggable store. */
export class RateLimiter {
  constructor(
    private readonly store: RateLimitStore,
    private readonly limit: number,
    private readonly windowMs: number,
  ) {
    if (limit < 1) throw new Error('rate limit must be >= 1');
    if (windowMs < 1) throw new Error('window must be >= 1ms');
  }

  async check(key: string, nowMs: number = Date.now()): Promise<RateLimitResult> {
    const { count, windowEndMs } = await this.store.increment(key, this.windowMs, nowMs);
    const allowed = count <= this.limit;
    const remaining = Math.max(0, this.limit - count);
    const retryAfterSeconds = allowed ? 0 : Math.max(1, Math.ceil((windowEndMs - nowMs) / 1000));
    return { allowed, remaining, retryAfterSeconds };
  }
}

/**
 * In-memory fixed-window store. Suitable for local dev and single-instance
 * Phase 0 deployments; not shared across instances (that is the Postgres or
 * Redis store's job).
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; windowEndMs: number }>();

  async increment(key: string, windowMs: number, nowMs: number): Promise<{ count: number; windowEndMs: number }> {
    const existing = this.buckets.get(key);
    if (!existing || nowMs >= existing.windowEndMs) {
      const fresh = { count: 1, windowEndMs: nowMs + windowMs };
      this.buckets.set(key, fresh);
      return fresh;
    }
    existing.count += 1;
    return existing;
  }

  /** Test helper. */
  reset(): void {
    this.buckets.clear();
  }
}
