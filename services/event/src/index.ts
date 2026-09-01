import {
  AppError,
  ERROR_CODES,
  EVENTS,
  type Db,
  type MessageBus,
} from '@iamfriendof/shared';
import { EventRepository, type JoinOutcome } from './repository';
import {
  validateCreateEvent,
  isEditAllowed,
  MAX_PARTICIPANTS,
  type CreateEventFields,
} from './rules';

export { eventMigrations } from './migrations';
export * from './rules';

export interface CreateEventInput {
  organiserId: string;
  title: string;
  description: string;
  locationDetails?: string | null;
  startAt: string; // ISO
  endAt: string; // ISO
  maxParticipants?: number;
  interestIds: number[];
}

export class EventService {
  private readonly repo: EventRepository;
  constructor(private readonly db: Db, private readonly bus: MessageBus) {
    this.repo = new EventRepository(db);
  }

  async create(input: CreateEventInput): Promise<{ eventId: string }> {
    const startAtMs = Date.parse(input.startAt);
    const endAtMs = Date.parse(input.endAt);
    const maxParticipants = input.maxParticipants ?? MAX_PARTICIPANTS;

    const fields: CreateEventFields = {
      title: input.title,
      description: input.description,
      locationDetails: input.locationDetails ?? null,
      startAtMs,
      endAtMs,
      maxParticipants,
      interestIds: input.interestIds,
    };
    validateCreateEvent(fields);

    const eventId = await this.repo.create({
      organiserId: input.organiserId,
      title: input.title,
      description: input.description,
      locationDetails: input.locationDetails ?? null,
      startAt: new Date(startAtMs),
      endAt: new Date(endAtMs),
      maxParticipants,
      interestIds: input.interestIds,
    });

    await this.bus.publish(EVENTS.EVENT_CREATED, { eventId, organiserId: input.organiserId });
    return { eventId };
  }

  async join(eventId: string, memberId: string): Promise<JoinOutcome> {
    const event = await this.repo.getById(eventId);
    if (!event) throw new AppError(ERROR_CODES.NOT_FOUND, 'Event not found', 404);
    if (event.status !== 'active') {
      throw new AppError(ERROR_CODES.REGISTRATION_CLOSED, 'Registration for this event is closed', 409);
    }
    return this.repo.join(eventId, memberId);
  }

  async withdraw(eventId: string, memberId: string): Promise<void> {
    const { promotedMemberId } = await this.repo.withdraw(eventId, memberId);
    if (promotedMemberId) {
      await this.bus.publish(EVENTS.PARTICIPANT_PROMOTED, { eventId, memberId: promotedMemberId });
    }
  }

  async cancel(eventId: string, requesterId: string): Promise<void> {
    const event = await this.repo.getById(eventId);
    if (!event) throw new AppError(ERROR_CODES.NOT_FOUND, 'Event not found', 404);
    this.requireOrganiser(event.organiser_id, requesterId);
    await this.repo.cancel(eventId);
    await this.bus.publish(EVENTS.EVENT_CANCELLED, { eventId });
  }

  async edit(
    eventId: string,
    requesterId: string,
    fields: { title?: string; description?: string; locationDetails?: string | null },
    now: Date = new Date(),
  ): Promise<{ changedFields: string[] }> {
    const event = await this.repo.getById(eventId);
    if (!event) throw new AppError(ERROR_CODES.NOT_FOUND, 'Event not found', 404);
    this.requireOrganiser(event.organiser_id, requesterId);

    if (!isEditAllowed(Date.parse(event.start_at), now.getTime())) {
      throw new AppError(ERROR_CODES.EDIT_WINDOW_CLOSED, 'The event can no longer be edited (within 24h of start)', 409);
    }
    const changedFields = await this.repo.updateFields(eventId, fields);
    if (changedFields.length > 0) {
      await this.bus.publish(EVENTS.EVENT_UPDATED, { eventId, changedFields });
    }
    return { changedFields };
  }

  async getWithCounts(eventId: string): Promise<{ event: Record<string, unknown>; confirmed: number; waitlisted: number }> {
    const event = await this.repo.getById(eventId);
    if (!event) throw new AppError(ERROR_CODES.NOT_FOUND, 'Event not found', 404);
    const counts = await this.repo.counts(eventId);
    return { event, confirmed: counts.confirmed, waitlisted: counts.waitlisted };
  }

  /**
   * Transition a passed event's status: active->in_progress once start passes,
   * in_progress->completed once end passes. Publishes event.completed on
   * completion. Intended to be called by the scheduled job (Req 7.10/7.11).
   */
  async advanceStatus(eventId: string, now: Date = new Date()): Promise<string> {
    const event = await this.repo.getById(eventId);
    if (!event) throw new AppError(ERROR_CODES.NOT_FOUND, 'Event not found', 404);
    const nowMs = now.getTime();
    let status = event.status;
    if (status === 'active' && nowMs >= Date.parse(event.start_at)) {
      status = 'in_progress';
      await this.repo.setStatus(eventId, status);
    }
    if (status === 'in_progress' && nowMs >= Date.parse(event.end_at)) {
      status = 'completed';
      await this.repo.setStatus(eventId, status);
      await this.bus.publish(EVENTS.EVENT_COMPLETED, { eventId, organiserId: event.organiser_id });
    }
    return status;
  }

  private requireOrganiser(organiserId: string, requesterId: string): void {
    if (organiserId !== requesterId) {
      throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Only the organiser may perform this action', 403);
    }
  }
}
