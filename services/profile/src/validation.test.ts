import fc from 'fast-check';
import { isValidPurposeStatement, isValidSkillSet, PURPOSE_MAX, MAX_SKILLS } from './validation';

describe('Profile validation', () => {
  // Feature: iamfriendof-volunteer-network, Property 6: Purpose statement length invariant
  it('Property 6: accepts a purpose statement iff length <= 500', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 700 }), (s) => {
        expect(isValidPurposeStatement(s)).toBe(s.length <= PURPOSE_MAX);
      }),
    );
  });

  it('accepts skill sets of <=50 skills each 1-100 chars, rejects otherwise', () => {
    fc.assert(
      fc.property(
        fc.array(fc.string({ minLength: 0, maxLength: 120 }), { maxLength: 60 }),
        (skills) => {
          const expected =
            skills.length <= MAX_SKILLS && skills.every((s) => s.length >= 1 && s.length <= 100);
          expect(isValidSkillSet(skills)).toBe(expected);
        },
      ),
    );
  });
});
