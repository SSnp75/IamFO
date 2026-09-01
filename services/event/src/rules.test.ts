import fc from 'fast-check';
import {
  isValidEventDates,
  discoveryFeed,
  filterByDateRange,
  isEditAllowed,
  EDIT_LOCK_MS,
  type FeedEvent,
} from './rules';

describe('Event rules', () => {
  // Feature: iamfriendof-volunteer-network, Property 16: Event dates must be strictly ordered
  it('Property 16: accepts an event iff end > start', () => {
    fc.assert(
      fc.property(fc.integer(), fc.integer(), (a, b) => {
        expect(isValidEventDates(a, b)).toBe(b > a);
      }),
    );
  });

  // Feature: iamfriendof-volunteer-network, Property 17: Discovery feed contains filtered and ordered events
  it('Property 17: feed contains all and only future events intersecting member interests, sorted ascending', () => {
    const eventArb = fc.record({
      id: fc.uuid(),
      startAtMs: fc.integer({ min: 0, max: 2_000_000 }),
      interestIds: fc.array(fc.integer({ min: 1, max: 10 }), { maxLength: 4 }),
    });
    fc.assert(
      fc.property(
        fc.array(eventArb, { maxLength: 30 }),
        fc.array(fc.integer({ min: 1, max: 10 }), { maxLength: 5 }),
        fc.integer({ min: 0, max: 2_000_000 }),
        (events: FeedEvent[], memberInterests, nowMs) => {
          const feed = discoveryFeed(events, memberInterests, nowMs);
          const interests = new Set(memberInterests);
          // Every returned event is future + intersecting.
          for (const e of feed) {
            expect(e.startAtMs).toBeGreaterThanOrEqual(nowMs);
            expect(e.interestIds.some((id) => interests.has(id))).toBe(true);
          }
          // Sorted ascending.
          for (let i = 1; i < feed.length; i++) {
            expect(feed[i]!.startAtMs).toBeGreaterThanOrEqual(feed[i - 1]!.startAtMs);
          }
          // Completeness: every qualifying event appears.
          const qualifying = events.filter(
            (e) => e.startAtMs >= nowMs && e.interestIds.some((id) => interests.has(id)),
          );
          expect(feed).toHaveLength(qualifying.length);
        },
      ),
    );
  });

  // Feature: iamfriendof-volunteer-network, Property 18: Date-range filter is a strict containment predicate
  it('Property 18: only events with start in [from, to] are returned', () => {
    const eventArb = fc.record({
      id: fc.uuid(),
      startAtMs: fc.integer({ min: 0, max: 1_000_000 }),
      interestIds: fc.constant([] as number[]),
    });
    fc.assert(
      fc.property(
        fc.array(eventArb, { maxLength: 30 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        fc.integer({ min: 0, max: 1_000_000 }),
        (events: FeedEvent[], a, b) => {
          const from = Math.min(a, b);
          const to = Math.max(a, b);
          const result = filterByDateRange(events, from, to);
          for (const e of result) {
            expect(e.startAtMs).toBeGreaterThanOrEqual(from);
            expect(e.startAtMs).toBeLessThanOrEqual(to);
          }
          const expected = events.filter((e) => e.startAtMs >= from && e.startAtMs <= to);
          expect(result).toHaveLength(expected.length);
        },
      ),
    );
  });

  it('edit is locked within 24h of start', () => {
    const start = 100_000_000;
    expect(isEditAllowed(start, start - EDIT_LOCK_MS - 1)).toBe(true);
    expect(isEditAllowed(start, start - EDIT_LOCK_MS + 1)).toBe(false);
    expect(isEditAllowed(start, start)).toBe(false);
  });
});
