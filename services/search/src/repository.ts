import type { Db, Row } from '@iamfriendof/shared';
import type { MemberCandidate } from './ranking';

export interface MemberSearchRow extends Row {
  member_id: string;
  display_name: string;
  is_private: boolean;
}

export interface EventSearchRow extends Row {
  event_id: string;
  title: string;
  start_at: string | null;
}

export class SearchRepository {
  constructor(private readonly db: Db) {}

  async upsertMember(input: {
    memberId: string;
    displayName: string;
    isPrivate: boolean;
    skillsText: string;
    interestsText: string;
  }): Promise<void> {
    await this.db.queryWrite(
      `INSERT INTO member_search_index (member_id, display_name, is_private, skills_text, interests_text)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (member_id) DO UPDATE SET
         display_name = EXCLUDED.display_name,
         is_private = EXCLUDED.is_private,
         skills_text = EXCLUDED.skills_text,
         interests_text = EXCLUDED.interests_text`,
      [input.memberId, input.displayName, input.isPrivate, input.skillsText, input.interestsText],
    );
  }

  async upsertEvent(input: {
    eventId: string;
    title: string;
    description: string;
    interestsText: string;
    startAt: string | null;
  }): Promise<void> {
    await this.db.queryWrite(
      `INSERT INTO event_search_index (event_id, title, description, interests_text, start_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_id) DO UPDATE SET
         title = EXCLUDED.title,
         description = EXCLUDED.description,
         interests_text = EXCLUDED.interests_text,
         start_at = EXCLUDED.start_at`,
      [input.eventId, input.title, input.description, input.interestsText, input.startAt],
    );
  }

  /**
   * Full-text member search. Fetches candidate rows matching the query via the
   * tsvector GIN index; ranking + private exclusion are applied in memory by the
   * service (pure, tested by Properties 20/21). Capped at 500 rows (Req 10.2).
   */
  async searchMembers(query: string): Promise<MemberCandidate[]> {
    const res = await this.db.queryRead<MemberSearchRow>(
      `SELECT member_id, display_name, is_private
       FROM member_search_index
       WHERE search_vector @@ websearch_to_tsquery('english', $1)
          OR display_name ILIKE '%' || $1 || '%'
       LIMIT 500`,
      [query],
    );
    return res.rows.map((r) => ({
      memberId: r.member_id,
      displayName: r.display_name,
      isPrivate: r.is_private,
    }));
  }

  async searchEvents(query: string): Promise<EventSearchRow[]> {
    const res = await this.db.queryRead<EventSearchRow>(
      `SELECT event_id, title, start_at
       FROM event_search_index
       WHERE search_vector @@ websearch_to_tsquery('english', $1)
          OR title ILIKE '%' || $1 || '%'
       ORDER BY ts_rank(search_vector, websearch_to_tsquery('english', $1)) DESC, title ASC
       LIMIT 500`,
      [query],
    );
    return res.rows;
  }
}
