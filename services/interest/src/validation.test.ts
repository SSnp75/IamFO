import fc from 'fast-check';
import {
  isValidSelectionCount,
  isValidCustomLabel,
  MIN_SELECTION,
  MAX_SELECTION,
  CUSTOM_LABEL_MAX,
} from './validation';

describe('Interest validation', () => {
  // Feature: iamfriendof-volunteer-network, Property 8: Interest area selection count controls acceptance
  it('Property 8: accepts a selection count iff between 1 and 10', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 30 }), (n) => {
        expect(isValidSelectionCount(n)).toBe(n >= MIN_SELECTION && n <= MAX_SELECTION);
      }),
    );
  });

  // Feature: iamfriendof-volunteer-network, Property 9: Custom interest area label validity
  it('Property 9: rejects empty/whitespace-only/>80 labels, accepts otherwise', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 100 }), (label) => {
        const trimmed = label.trim();
        const expected = trimmed.length >= 1 && label.length <= CUSTOM_LABEL_MAX;
        expect(isValidCustomLabel(label)).toBe(expected);
      }),
    );
  });

  it('specifically rejects whitespace-only labels', () => {
    for (const ws of ['', ' ', '   ', '\t', '\n  \t']) {
      expect(isValidCustomLabel(ws)).toBe(false);
    }
  });
});
