import { AppError, ERROR_CODES } from '@iamfriendof/shared';

export const QUERY_MIN = 1;
export const QUERY_MAX = 100;

/** A member search candidate as ranked in memory. */
export interface MemberCandidate {
  memberId: string;
  displayName: string;
  isPrivate: boolean;
  /** Whether the searching member is connected to this (private) member. */
  connected?: boolean;
}

/** Validate a search query's length (Requirement 10.7 / 8.3). */
export function assertValidQueryLength(query: string): void {
  if (query.length < QUERY_MIN || query.length > QUERY_MAX) {
    throw new AppError(
      ERROR_CODES.SEARCH_QUERY_TOO_LONG,
      `Search query must be between ${QUERY_MIN} and ${QUERY_MAX} characters`,
      422,
    );
  }
}

/**
 * Exclude private profiles from results visible to a non-connected searcher
 * (Requirement 10.3, Property 20). A private candidate is kept only when the
 * searcher is connected to it.
 */
export function excludePrivate(candidates: MemberCandidate[]): MemberCandidate[] {
  return candidates.filter((c) => !c.isPrivate || c.connected === true);
}

/**
 * Rank member results (Requirement 10.4, Property 21): exact (case-insensitive)
 * full-name matches rank above partial matches; within each group, order
 * alphabetically by display name. Pure and total over the candidate list.
 */
export function rankMembers(query: string, candidates: MemberCandidate[]): MemberCandidate[] {
  const q = query.trim().toLowerCase();
  const isExact = (c: MemberCandidate) => c.displayName.trim().toLowerCase() === q;

  return [...candidates].sort((a, b) => {
    const ax = isExact(a) ? 0 : 1;
    const bx = isExact(b) ? 0 : 1;
    if (ax !== bx) return ax - bx; // exact matches first
    return a.displayName.localeCompare(b.displayName); // alphabetical tiebreak
  });
}

/** Full pipeline for a member search: validate, exclude private, rank. */
export function searchMembersInMemory(query: string, candidates: MemberCandidate[]): MemberCandidate[] {
  assertValidQueryLength(query);
  return rankMembers(query, excludePrivate(candidates));
}
