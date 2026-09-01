import fc from 'fast-check';
import {
  excludePrivate,
  rankMembers,
  assertValidQueryLength,
  QUERY_MAX,
  type MemberCandidate,
} from './ranking';

const candArb = fc.record({
  memberId: fc.uuid(),
  displayName: fc.string({ minLength: 1, maxLength: 20 }),
  isPrivate: fc.boolean(),
  connected: fc.option(fc.boolean(), { nil: undefined }),
});

describe('Search ranking and privacy', () => {
  // Feature: iamfriendof-volunteer-network, Property 20: Private profiles never appear for non-connected searchers
  it('Property 20: no private, non-connected member appears in results', () => {
    fc.assert(
      fc.property(fc.array(candArb, { maxLength: 30 }), (candidates: MemberCandidate[]) => {
        const visible = excludePrivate(candidates);
        for (const c of visible) {
          // Any visible candidate is either public, or private AND connected.
          expect(!c.isPrivate || c.connected === true).toBe(true);
        }
        // Completeness: every public or connected-private candidate is retained.
        const expected = candidates.filter((c) => !c.isPrivate || c.connected === true);
        expect(visible).toHaveLength(expected.length);
      }),
    );
  });

  // Feature: iamfriendof-volunteer-network, Property 21: Exact name matches rank above partial matches
  it('Property 21: all exact-name matches precede all partial matches', () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 10 }),
        fc.array(candArb, { maxLength: 30 }),
        (query, candidates: MemberCandidate[]) => {
          const ranked = rankMembers(query, candidates);
          const q = query.trim().toLowerCase();
          const isExact = (c: MemberCandidate) => c.displayName.trim().toLowerCase() === q;
          // Find the last exact index and the first partial index; last exact
          // must come before first partial.
          let lastExact = -1;
          let firstPartial = ranked.length;
          ranked.forEach((c, i) => {
            if (isExact(c)) lastExact = Math.max(lastExact, i);
            else firstPartial = Math.min(firstPartial, i);
          });
          if (lastExact >= 0 && firstPartial < ranked.length) {
            expect(lastExact).toBeLessThan(firstPartial);
          }
        },
      ),
    );
  });

  it('ranks exact matches first then alphabetical', () => {
    const ranked = rankMembers('ada', [
      { memberId: '1', displayName: 'Ada Zeta', isPrivate: false },
      { memberId: '2', displayName: 'Ada', isPrivate: false },
      { memberId: '3', displayName: 'Adam', isPrivate: false },
    ]);
    expect(ranked[0]!.displayName).toBe('Ada'); // exact first
    // Then partial matches alphabetically: 'Ada Zeta', 'Adam'
    expect(ranked.slice(1).map((c) => c.displayName)).toEqual(['Ada Zeta', 'Adam']);
  });

  it('rejects an over-long query', () => {
    expect(() => assertValidQueryLength('x'.repeat(QUERY_MAX + 1))).toThrow();
    expect(() => assertValidQueryLength('')).toThrow();
    expect(() => assertValidQueryLength('valid')).not.toThrow();
  });
});
