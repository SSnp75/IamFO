import { AppError, ERROR_CODES } from '@iamfriendof/shared';

export const MIN_SELECTION = 1;
export const MAX_SELECTION = 10;
export const CUSTOM_LABEL_MAX = 80;

/** Selection count is valid iff between 1 and 10 inclusive (Requirement 4.2/4.3). */
export function isValidSelectionCount(count: number): boolean {
  return count >= MIN_SELECTION && count <= MAX_SELECTION;
}

/**
 * A custom interest label is valid iff it is non-empty after trimming (i.e. not
 * whitespace-only) and at most 80 characters (Requirement 4.5/4.8).
 */
export function isValidCustomLabel(label: string): boolean {
  const trimmed = label.trim();
  return trimmed.length >= 1 && label.length <= CUSTOM_LABEL_MAX;
}

export function assertValidSelection(interestIds: number[]): void {
  const unique = new Set(interestIds);
  if (!isValidSelectionCount(unique.size)) {
    throw new AppError(
      ERROR_CODES.INTEREST_SELECTION_INVALID,
      `Select between ${MIN_SELECTION} and ${MAX_SELECTION} interest areas`,
      422,
    );
  }
}

export function assertValidCustomLabel(label: string): void {
  if (!isValidCustomLabel(label)) {
    throw new AppError(
      ERROR_CODES.INTEREST_LABEL_INVALID,
      `A valid interest label (1-${CUSTOM_LABEL_MAX} non-whitespace characters) is required`,
      422,
    );
  }
}
