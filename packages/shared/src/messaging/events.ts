/**
 * Domain event names shared across all phases.
 *
 * In Phase 0 these are the topics of the in-process event bus.
 * In Phase 1/2 the SAME strings become the AMQP/Kafka routing keys, so a module
 * that publishes/subscribes here can be extracted to a standalone service
 * without changing any event name (Requirement 15.6, 15.9).
 */
export const EVENTS = {
  MEMBER_REGISTERED: 'member.registered',
  MEMBER_UPDATED: 'member.updated',
  MEMBER_ACCOUNT_LOCKED: 'member.account_locked',
  COMMENT_POSTED: 'comment.posted',
  EVENT_CREATED: 'event.created',
  EVENT_UPDATED: 'event.updated',
  EVENT_CANCELLED: 'event.cancelled',
  EVENT_COMPLETED: 'event.completed',
  PARTICIPANT_PROMOTED: 'participant.promoted',
  PM_SCORE_UPDATED: 'pm_score.updated',
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];

/** Payload shapes for each event. Kept minimal and stable across phases. */
export interface EventPayloads {
  [EVENTS.MEMBER_REGISTERED]: { memberId: string; email: string; verificationToken: string };
  [EVENTS.MEMBER_UPDATED]: { memberId: string };
  [EVENTS.MEMBER_ACCOUNT_LOCKED]: { memberId: string; email: string; lockedUntil: string };
  [EVENTS.COMMENT_POSTED]: { commentId: string; targetType: 'event' | 'profile'; targetId: string; authorId: string };
  [EVENTS.EVENT_CREATED]: { eventId: string; organiserId: string };
  [EVENTS.EVENT_UPDATED]: { eventId: string; changedFields: string[] };
  [EVENTS.EVENT_CANCELLED]: { eventId: string };
  [EVENTS.EVENT_COMPLETED]: { eventId: string; organiserId: string };
  [EVENTS.PARTICIPANT_PROMOTED]: { eventId: string; memberId: string };
  [EVENTS.PM_SCORE_UPDATED]: { memberId: string; newScore: number | null };
}

/** A published message: the event name plus its typed payload. */
export type DomainEvent<N extends EventName = EventName> = {
  name: N;
  payload: EventPayloads[N];
  /** UTC ISO timestamp of when the event was published. */
  occurredAt: string;
};
