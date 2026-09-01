import fc from 'fast-check';
import {
  isValidEmail,
  isValidPasswordLength,
  validateSkills,
  PASSWORD_MIN,
  PASSWORD_MAX,
  type SkillDeclaration,
} from './validation';

describe('Registration validation', () => {
  // Feature: iamfriendof-volunteer-network, Property 1: Valid email addresses are accepted, invalid ones are rejected
  describe('Property 1: email validity', () => {
    it('accepts well-formed emails', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.stringMatching(/^[a-z][a-z0-9]{0,10}$/),
            fc.stringMatching(/^[a-z][a-z0-9]{0,8}$/),
            fc.constantFrom('com', 'org', 'net', 'io', 'co'),
          ),
          ([local, domain, tld]) => {
            expect(isValidEmail(`${local}@${domain}.${tld}`)).toBe(true);
          },
        ),
      );
    });

    it('rejects strings without a valid single-@ dotted-domain shape', () => {
      fc.assert(
        fc.property(
          fc.oneof(
            fc.constant(''),
            fc.constant('noatsign'),
            fc.constant('two@@at.com'),
            fc.constant('@nodomain.com'),
            fc.constant('local@nodot'),
            fc.constant('local@domain.'),
            fc.constant('spaces in@domain.com'),
          ),
          (bad) => {
            expect(isValidEmail(bad)).toBe(false);
          },
        ),
      );
    });
  });

  // Feature: iamfriendof-volunteer-network, Property 2: Password length controls acceptance
  it('Property 2: accepts a password iff its length is in [8, 128]', () => {
    fc.assert(
      fc.property(fc.string({ minLength: 0, maxLength: 200 }), (pw) => {
        const expected = pw.length >= PASSWORD_MIN && pw.length <= PASSWORD_MAX;
        expect(isValidPasswordLength(pw)).toBe(expected);
      }),
    );
  });

  // Feature: iamfriendof-volunteer-network, Property 4: Skill declaration constraints
  it('Property 4: accepts skills iff 1-20 predefined, <=10 custom, each custom 1-60 chars', () => {
    const skillArb = fc.record({
      name: fc.string({ minLength: 0, maxLength: 80 }),
      isCustom: fc.boolean(),
    });
    fc.assert(
      fc.property(fc.array(skillArb, { maxLength: 40 }), (skills: SkillDeclaration[]) => {
        const predefined = skills.filter((s) => !s.isCustom);
        const custom = skills.filter((s) => s.isCustom);
        const expected =
          predefined.length >= 1 &&
          predefined.length <= 20 &&
          custom.length <= 10 &&
          custom.every((c) => c.name.trim().length >= 1 && c.name.length <= 60);
        expect(validateSkills(skills)).toBe(expected);
      }),
    );
  });
});
