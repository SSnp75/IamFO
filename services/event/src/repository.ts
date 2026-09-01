import type { Db, Row, TxClient } from '@iamfriendof/shared';

export interface EventRow extends Row {
  id: string;
  organiser_id: string;
  title: string;
  description: string;
  location_details: string | null;
  start_at: string;
  end_at: string;
  max_participants: number;
  status: string;
}

export type JoinOutcome =
  | { status: 'confirmed' }
  | { status: 'waitlisted'; position: number }
  | { status: 'already_joined' };

export class EventRepository {
  constructor(private readonly db: Db) {}

  async create(input: {
    organiserId: string;
    title: string;
    description: string;
    locationDetails: string | null;
    startAt: Date;
    endAt: Date;
    maxParticipants: number;
    interestIds: number[];
  }): Promise<string> {
    return this.db.transaction(async (tx) => {
      const ev = await tx.query<{ id: string }>(
        `INSERT INTO events (organiser_id, title, description, location_details, start_at, end_at, max_participants)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          input.organiserId,
          input.title,
          input.description,
          input.locationDetails,
          input.startAt.toISOString(),
          input.endAt.toISOString(),
          input.maxParticipants,
        ],
      );
      const eventId = ev.rows[0]!.id;
      for (const interestId of input.interestIds) {
        await tx.query(
          'INSERT INTO event_interest_tags (event_id, interest_area_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [eventId, interestId],
        );
      }
      return eventId;
    });
  }

  async getById(eventId: string): Promise<EventRow | undefined> {
    const res = await this.db.queryRead<EventRow>('SELECT * FROM events WHERE id = $1', [eventId]);
    return res.rows[0];
  }

  /**
   * Atomically join an event: lock the event row, count confirmed participants,
   * and insert as confirmed if capacity remains, else waitlisted with the next
   * position. Returns the outcome. (Requirement 7.5)
   */
  async join(eventId: string, memberId: string): Promise<JoinOutcome> {
    return this.db.transaction(async (tx) => {
      // Lock the event row to serialise concurrent joins.
      const ev = await tx.query<{ max_participants: number; status: string }>(
        'SELECT max_participants, status FROM events WHERE id = $1 FOR UPDATE',
        [eventId],
      );
      const event = ev.rows[0];
      if (!event) throw new Error('event not found');

      const existing = await tx.query<{ status: string }>(
        'SELECT status FROM event_participants WHERE event_id = $1 AND member_id = $2',
        [eventId, memberId],
      );
      if (existing.rows[0] && existing.rows[0].status !== 'withdrawn') {
        return { status: 'already_joined' };
      }

      const confirmedCount = await this.countConfirmed(tx, eventId);
      if (confirmedCount < event.max_participants) {
        await this.upsertParticipant(tx, eventId, memberId, 'confirmed', null);
        return { status: 'confirmed' };
      }
      const position = await this.nextWaitlistPosition(tx, eventId);
      await this.upsertParticipant(tx, eventId, memberId, 'waitlisted', position);
      return { status: 'waitlisted', position };
    });
  }

  /**
   * Withdraw a participant; if they were confirmed, promote the first waitlisted
   * member to confirmed. Returns the promoted member id (if any). (Req 7.6)
   */
  async withdraw(eventId: string, memberId: string): Promise<{ promotedMemberId: string | null }> {
    return this.db.transaction(async (tx) => {
      await tx.query('SELECT id FROM events WHERE id = $1 FOR UPDATE', [eventId]);
      const cur = await tx.query<{ status: string }>(
        'SELECT status FROM event_participants WHERE event_id = $1 AND member_id = $2',
        [eventId, memberId],
      );
      const wasConfirmed = cur.rows[0]?.status === 'confirmed';
      await tx.query(
        "UPDATE event_participants SET status = 'withdrawn', waitlist_position = NULL WHERE event_id = $1 AND member_id = $2",
        [eventId, memberId],
      );
      if (!wasConfirmed) return { promotedMemberId: null };

      // Promote the earliest waitlisted member.
      const next = await tx.query<{ member_id: string }>(
        `SELECT member_id FROM event_participants
         WHERE event_id = $1 AND status = 'waitlisted'
         ORDER BY waitlist_position ASC NULLS LAST, joined_at ASC
         LIMIT 1 FOR UPDATE`,
        [eventId],
      );
      const promoted = next.rows[0];
      if (!promoted) return { promotedMemberId: null };
      await tx.query(
        "UPDATE event_participants SET status = 'confirmed', waitlist_position = NULL WHERE event_id = $1 AND member_id = $2",
        [eventId, promoted.member_id],
      );
      return { promotedMemberId: promoted.member_id };
    });
  }

  async cancel(eventId: string): Promise<void> {
    await this.db.queryWrite("UPDATE events SET status = 'cancelled', updated_at = NOW() WHERE id = $1", [eventId]);
  }

  async updateFields(eventId: string, fields: { title?: string; description?: string; locationDetails?: string | null }): Promise<string[]> {
    const changed: string[] = [];
    const sets: string[] = [];
    const params: unknown[] = [eventId];
    if (fields.title !== undefined) {
      params.push(fields.title);
      sets.push(`title = $${params.length}`);
      changed.push('title');
    }
    if (fields.description !== undefined) {
      params.push(fields.description);
      sets.push(`description = $${params.length}`);
      changed.push('description');
    }
    if (fields.locationDetails !== undefined) {
      params.push(fields.locationDetails);
      sets.push(`location_details = $${params.length}`);
      changed.push('locationDetails');
    }
    if (sets.length > 0) {
      await this.db.queryWrite(
        `UPDATE events SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $1`,
        params,
      );
    }
    return changed;
  }

  async setStatus(eventId: string, status: string): Promise<void> {
    await this.db.queryWrite('UPDATE events SET status = $2, updated_at = NOW() WHERE id = $1', [eventId, status]);
  }

  async counts(eventId: string): Promise<{ confirmed: number; waitlisted: number }> {
    const res = await this.db.queryRead<{ status: string; count: string }>(
      `SELECT status, COUNT(*) AS count FROM event_participants
       WHERE event_id = $1 AND status IN ('confirmed','waitlisted') GROUP BY status`,
      [eventId],
    );
    let confirmed = 0;
    let waitlisted = 0;
    for (const r of res.rows) {
      if (r.status === 'confirmed') confirmed = Number(r.count);
      if (r.status === 'waitlisted') waitlisted = Number(r.count);
    }
    return { confirmed, waitlisted };
  }

  private async countConfirmed(tx: TxClient, eventId: string): Promise<number> {
    const res = await tx.query<{ count: string }>(
      "SELECT COUNT(*) AS count FROM event_participants WHERE event_id = $1 AND status = 'confirmed'",
      [eventId],
    );
    return Number(res.rows[0]?.count ?? 0);
  }

  private async nextWaitlistPosition(tx: TxClient, eventId: string): Promise<number> {
    const res = await tx.query<{ max: number | null }>(
      "SELECT MAX(waitlist_position) AS max FROM event_participants WHERE event_id = $1 AND status = 'waitlisted'",
      [eventId],
    );
    return (res.rows[0]?.max ?? 0) + 1;
  }

  private async upsertParticipant(
    tx: TxClient,
    eventId: string,
    memberId: string,
    status: string,
    position: number | null,
  ): Promise<void> {
    await tx.query(
      `INSERT INTO event_participants (event_id, member_id, status, waitlist_position)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (event_id, member_id)
       DO UPDATE SET status = EXCLUDED.status, waitlist_position = EXCLUDED.waitlist_position, joined_at = NOW()`,
      [eventId, memberId, status, position],
    );
  }
}
