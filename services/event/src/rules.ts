import { AppError, ERROR_CODES } from '@iamfriendof/shared';

export const TITLE_MAX = 120;
export const DESCRIPTION_MAX = 2000;
export const LOCATION_MAX = 500;
export const MIN_PARTICIPANTS = 1;
export const MAX_PARTICIPANTS = 500;
export const EDIT_LOCK_MS = 24 * 60 * 60 * 1000; // 24h before start (Req 7.7)

/** Event dates valid iff end strictly after start (Requirement 7.3, Property 16). */
export function isValidEventDates(startAt: number, endAt: number): boolean {
  return endAt > startAt;
}

/** An item with a start time and a set of interest tag ids. */
export interface FeedEvent {
  id: string;
  startAtMs: number;
  interestIds: number[];
}

/**
 * Discovery feed (Requirement 8.1, Property 17): all and only events whose start
 * is on/after now AND whose interest tags intersect the member's interests,
 * ordered by start ascending. Pure over in-memory arrays.
 */
export function discoveryFeed(
  events: FeedEvent[],
  memberInterestIds: number[],
  nowMs: number,
): FeedEvent[] {
  const interests = new Set(memberInterestIds);
  return events
    .filter((e) => e.startAtMs >= nowMs && e.interestIds.some((id) => interests.has(id)))
    .sort((a, b) => a.startAtMs - b.startAtMs);
}

/**
 * Date-range filter (Requirement 8.4, Property 18): return only events whose
 * start is within the closed interval [fromMs, toMs]. Pure.
 */
export function filterByDateRange(events: FeedEvent[], fromMs: number, toMs: number): FeedEvent[] {
  return events.filter((e) => e.startAtMs >= fromMs && e.startAtMs <= toMs);
}

/** Whether editing is still allowed given the event start and current time. */
export function isEditAllowed(startAtMs: number, nowMs: number): boolean {
  return nowMs <= startAtMs - EDIT_LOCK_MS;
}

export interface CreateEventFields {
  title: string;
  description: string;
  locationDetails?: string | null;
  startAtMs: number;
  endAtMs: number;
  maxParticipants: number;
  interestIds: number[];
}

/** Validate all required event fields; throws AppError on the first failure. */
export function validateCreateEvent(f: CreateEventFields): void {
  const missing: string[] = [];
  if (!f.title || f.title.length > TITLE_MAX) missing.push('title');
  if (!f.description || f.description.length > DESCRIPTION_MAX) missing.push('description');
  if (!Number.isFinite(f.startAtMs)) missing.push('startAt');
  if (!Number.isFinite(f.endAtMs)) missing.push('endAt');
  if (f.locationDetails && f.locationDetails.length > LOCATION_MAX) missing.push('locationDetails');
  if (!f.interestIds || f.interestIds.length < 1) missing.push('interestAreaTags');
  if (missing.length > 0) {
    throw new AppError(ERROR_CODES.MISSING_REQUIRED_FIELD, 'One or more required fields are missing or invalid', 422, {
      fields: missing,
    });
  }
  if (f.maxParticipants < MIN_PARTICIPANTS || f.maxParticipants > MAX_PARTICIPANTS) {
    throw new AppError(
      ERROR_CODES.VALIDATION_ERROR,
      `Maximum participants must be between ${MIN_PARTICIPANTS} and ${MAX_PARTICIPANTS}`,
      422,
    );
  }
  if (!isValidEventDates(f.startAtMs, f.endAtMs)) {
    throw new AppError(ERROR_CODES.INVALID_EVENT_DATES, 'Event end must be after its start', 422);
  }
}
