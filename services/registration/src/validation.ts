import { AppError, ERROR_CODES } from '@iamfriendof/shared';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export const NAME_MAX = 50;
export const CUSTOM_SKILL_MAX = 60;
export const MAX_PREDEFINED_SKILLS = 20;
export const MAX_CUSTOM_SKILLS = 10;

export interface SkillDeclaration {
  name: string;
  isCustom: boolean;
}

export interface RegistrationInput {
  firstName: string;
  lastName: string;
  email: string;
  country: string;
  password: string;
  skills: SkillDeclaration[];
}

/**
 * RFC 5322 is large; we use the widely used "practical" validation that accepts
 * the common addr-spec forms and rejects obvious non-emails. This deliberately
 * mirrors what most libraries (and the design's Property 1) expect: a single @,
 * a non-empty local part, and a dotted domain with a valid TLD-ish label.
 */
const EMAIL_RE =
  /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\.)+[A-Za-z]{2,}$/;

export function isValidEmail(email: string): boolean {
  if (email.length === 0 || email.length > 254) return false;
  return EMAIL_RE.test(email);
}

export function isValidPasswordLength(password: string): boolean {
  return password.length >= PASSWORD_MIN && password.length <= PASSWORD_MAX;
}

/**
 * Validate a skill declaration list for registration (Requirements 1.11, 1.12):
 * 1–20 predefined skills, at most 10 custom, each custom label 1–60 chars.
 */
export function validateSkills(skills: SkillDeclaration[]): boolean {
  const predefined = skills.filter((s) => !s.isCustom);
  const custom = skills.filter((s) => s.isCustom);
  if (predefined.length < 1 || predefined.length > MAX_PREDEFINED_SKILLS) return false;
  if (custom.length > MAX_CUSTOM_SKILLS) return false;
  for (const c of custom) {
    const len = c.name.trim().length;
    if (len < 1 || c.name.length > CUSTOM_SKILL_MAX) return false;
  }
  return true;
}

/** Validate a full registration payload, throwing AppError on the first failure. */
export function validateRegistration(input: RegistrationInput): void {
  if (!input.firstName || input.firstName.length > NAME_MAX) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'First name is required and must be at most 50 characters', 422, { field: 'firstName' });
  }
  if (!input.lastName || input.lastName.length > NAME_MAX) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Last name is required and must be at most 50 characters', 422, { field: 'lastName' });
  }
  if (!isValidEmail(input.email)) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'A valid email address is required', 422, { field: 'email' });
  }
  if (!input.country) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Country is required', 422, { field: 'country' });
  }
  if (!isValidPasswordLength(input.password)) {
    throw new AppError(ERROR_CODES.PASSWORD_LENGTH_INVALID, `Password must be between ${PASSWORD_MIN} and ${PASSWORD_MAX} characters`, 422, { field: 'password' });
  }
  if (!validateSkills(input.skills)) {
    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Provide 1–20 predefined skills and at most 10 custom skills (each 1–60 chars)', 422, { field: 'skills' });
  }
}
