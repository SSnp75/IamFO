import { AppError, ERROR_CODES } from '@iamfriendof/shared';

export const PURPOSE_MAX = 500;
export const SKILL_NAME_MIN = 1;
export const SKILL_NAME_MAX = 100;
export const MAX_SKILLS = 50;

/** Purpose statement: accepted iff length <= 500 (Requirement 3.3/3.4). */
export function isValidPurposeStatement(text: string): boolean {
  return text.length <= PURPOSE_MAX;
}

/** Skills: 0–50 total, each name 1–100 chars (Requirement 3.5). */
export function isValidSkillSet(skills: string[]): boolean {
  if (skills.length > MAX_SKILLS) return false;
  return skills.every((s) => s.length >= SKILL_NAME_MIN && s.length <= SKILL_NAME_MAX);
}

export function assertValidPurpose(text: string): void {
  if (!isValidPurposeStatement(text)) {
    throw new AppError(
      ERROR_CODES.PURPOSE_STATEMENT_TOO_LONG,
      `Purpose statement must be at most ${PURPOSE_MAX} characters`,
      422,
    );
  }
}

export function assertValidSkills(skills: string[]): void {
  if (!isValidSkillSet(skills)) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      `Provide at most ${MAX_SKILLS} skills, each 1–100 characters`,
      422,
      { field: 'skills' },
    );
  }
}
