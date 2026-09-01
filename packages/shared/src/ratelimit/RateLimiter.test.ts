import fc from 'fast-check';
import { RateLimiter, InMemoryRateLimitStore } from './RateLimiter';

describe('RateLimiter', () => {
  it('allows up to the limit then blocks within a window', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = new RateLimiter(store, 3, 60_000);
    const now = 1_000_000;

    const r1 = await limiter.check('ip:1', now);
    const r2 = await limiter.check('ip:1', now);
    const r3 = await limiter.check('ip:1', now);
    const r4 = await limiter.check('ip:1', now);

    expect([r1.allowed, r2.allowed, r3.allowed]).toEqual([true, true, true]);
    expect(r4.allowed).toBe(false);
    expect(r4.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('resets after the window elapses', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = new RateLimiter(store, 1, 10_000);

    const first = await limiter.check('k', 0);
    const blocked = await limiter.check('k', 5_000);
    const afterWindow = await limiter.check('k', 10_000);

    expect(first.allowed).toBe(true);
    expect(blocked.allowed).toBe(false);
    expect(afterWindow.allowed).toBe(true);
  });

  it('keeps separate counters per key', async () => {
    const store = new InMemoryRateLimitStore();
    const limiter = new RateLimiter(store, 1, 10_000);

    expect((await limiter.check('a', 0)).allowed).toBe(true);
    expect((await limiter.check('b', 0)).allowed).toBe(true);
  });

  // Property: for any limit L and any number of requests N in one window,
  // exactly min(N, L) requests are allowed and the rest are blocked.
  it('property: allows exactly min(N, limit) requests within a single window', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 20 }),
        fc.integer({ min: 0, max: 40 }),
        async (limit, n) => {
          const store = new InMemoryRateLimitStore();
          const limiter = new RateLimiter(store, limit, 60_000);
          const now = 500_000;
          let allowed = 0;
          for (let i = 0; i < n; i++) {
            if ((await limiter.check('key', now)).allowed) allowed += 1;
          }
          expect(allowed).toBe(Math.min(n, limit));
        },
      ),
    );
  });
});
