import { EVENTS, type Db, type MessageBus } from '@iamfriendof/shared';
import { SearchRepository, type EventSearchRow } from './repository';
import {
  assertValidQueryLength,
  excludePrivate,
  rankMembers,
  type MemberCandidate,
} from './ranking';

export { searchMigrations } from './migrations';
export * from './ranking';

export interface MemberSearchResult {
  memberId: string;
  displayName: string;
}

export class SearchService {
  private readonly repo: SearchRepository;
  constructor(private readonly db: Db, private readonly bus: MessageBus) {
    this.repo = new SearchRepository(db);
  }

  /**
   * Search members: validate query length, fetch FTS candidates, exclude private
   * profiles (non-connected view), rank exact-above-partial with alpha tiebreak.
   */
  async searchMembers(query: string): Promise<MemberSearchResult[]> {
    assertValidQueryLength(query);
    const candidates = await this.repo.searchMembers(query);
    const ranked = rankMembers(query, excludePrivate(candidates));
    return ranked.map((c) => ({ memberId: c.memberId, displayName: c.displayName }));
  }

  async searchEvents(query: string): Promise<EventSearchRow[]> {
    assertValidQueryLength(query);
    return this.repo.searchEvents(query);
  }

  /** Rebuild a member's index row by reading their current profile data. */
  async reindexMember(memberId: string): Promise<void> {
    const res = await this.db.queryRead<{
      display_name: string;
      is_private: boolean;
      skills_text: string | null;
      interests_text: string | null;
    }>(
      `SELECT
         (m.first_name || ' ' || m.last_name) AS display_name,
         m.is_private,
         (SELECT string_agg(skill_name, ' ') FROM member_skills s WHERE s.member_id = m.id) AS skills_text,
         (SELECT string_agg(ia.name, ' ')
            FROM member_interests mi JOIN interest_areas ia ON ia.id = mi.interest_area_id
            WHERE mi.member_id = m.id) AS interests_text
       FROM members m WHERE m.id = $1`,
      [memberId],
    );
    const row = res.rows[0];
    if (!row) return;
    await this.repo.upsertMember({
      memberId,
      displayName: row.display_name,
      isPrivate: row.is_private,
      skillsText: row.skills_text ?? '',
      interestsText: row.interests_text ?? '',
    });
  }

  /** Rebuild an event's index row by reading its current data. */
  async reindexEvent(eventId: string): Promise<void> {
    const res = await this.db.queryRead<{
      title: string;
      description: string;
      start_at: string;
      interests_text: string | null;
    }>(
      `SELECT e.title, e.description, e.start_at,
         (SELECT string_agg(ia.name, ' ')
            FROM event_interest_tags eit JOIN interest_areas ia ON ia.id = eit.interest_area_id
            WHERE eit.event_id = e.id) AS interests_text
       FROM events e WHERE e.id = $1`,
      [eventId],
    );
    const row = res.rows[0];
    if (!row) return;
    await this.repo.upsertEvent({
      eventId,
      title: row.title,
      description: row.description,
      interestsText: row.interests_text ?? '',
      startAt: row.start_at,
    });
  }

  /** Subscribe to member/event changes to keep the search index fresh (Req 10). */
  registerConsumers(): void {
    this.bus.subscribe(EVENTS.MEMBER_UPDATED, async (e) => {
      await this.reindexMember(e.payload.memberId);
    });
    this.bus.subscribe(EVENTS.EVENT_CREATED, async (e) => {
      await this.reindexEvent(e.payload.eventId);
    });
    this.bus.subscribe(EVENTS.EVENT_UPDATED, async (e) => {
      await this.reindexEvent(e.payload.eventId);
    });
  }
}

// Re-export the candidate type for consumers.
export type { MemberCandidate };
