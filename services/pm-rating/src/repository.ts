import type { Db, Row } from '@iamfriendof/shared';

export interface PmScoreRow extends Row {
  member_id: string;
  score: string | null;
  events_organised: number;
  completion_rate: string | null;
  avg_peer_rating: string | null;
  pending_update: boolean;
}

export interface OrganiserStats {
  eventsOrganised: number;
  completionRate: number | null;
  avgPeerRating: number | null;
}

export class PmRatingRepository {
  constructor(private readonly db: Db) {}

  /** Aggregate an organiser's scoring inputs from events + peer ratings. */
  async getOrganiserStats(organiserId: string): Promise<OrganiserStats> {
    const events = await this.db.queryRead<{ total: string; completed: string }>(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'completed') AS completed,
         COUNT(*) AS total
       FROM events WHERE organiser_id = $1`,
      [organiserId],
    );
    const total = Number(events.rows[0]?.total ?? 0);
    const completed = Number(events.rows[0]?.completed ?? 0);

    const ratings = await this.db.queryRead<{ avg: string | null }>(
      `SELECT AVG(numeric_rating) AS avg FROM peer_ratings WHERE organiser_id = $1`,
      [organiserId],
    );
    const avg = ratings.rows[0]?.avg;

    return {
      eventsOrganised: completed,
      completionRate: total === 0 ? null : completed / total,
      avgPeerRating: avg === null || avg === undefined ? null : Number(avg),
    };
  }

  async getSelfAssessmentScore(memberId: string): Promise<number | null> {
    const res = await this.db.queryRead<{ responses: unknown }>(
      'SELECT responses FROM self_assessments WHERE member_id = $1 ORDER BY submitted_at DESC LIMIT 1',
      [memberId],
    );
    const row = res.rows[0];
    if (!row) return null;
    // responses is an array of {questionId, score(1-5)}; average -> 0..100.
    const responses = row.responses as Array<{ score: number }>;
    if (!Array.isArray(responses) || responses.length === 0) return null;
    const avg = responses.reduce((s, r) => s + (Number(r.score) || 0), 0) / responses.length;
    return ((avg - 1) / 4) * 100;
  }

  async upsertScore(memberId: string, fields: {
    score: number | null;
    eventsOrganised: number;
    completionRate: number | null;
    avgPeerRating: number | null;
  }): Promise<void> {
    await this.db.queryWrite(
      `INSERT INTO pm_scores (member_id, score, events_organised, completion_rate, avg_peer_rating, pending_update, last_calculated_at)
       VALUES ($1, $2, $3, $4, $5, FALSE, NOW())
       ON CONFLICT (member_id) DO UPDATE SET
         score = EXCLUDED.score,
         events_organised = EXCLUDED.events_organised,
         completion_rate = EXCLUDED.completion_rate,
         avg_peer_rating = EXCLUDED.avg_peer_rating,
         pending_update = FALSE,
         last_calculated_at = NOW()`,
      [memberId, fields.score, fields.eventsOrganised, fields.completionRate, fields.avgPeerRating],
    );
  }

  async getScore(memberId: string): Promise<PmScoreRow | undefined> {
    const res = await this.db.queryRead<PmScoreRow>('SELECT * FROM pm_scores WHERE member_id = $1', [memberId]);
    return res.rows[0];
  }

  async getEventEnd(eventId: string): Promise<{ endAtMs: number; organiserId: string } | undefined> {
    const res = await this.db.queryRead<{ end_at: string; organiser_id: string }>(
      'SELECT end_at, organiser_id FROM events WHERE id = $1',
      [eventId],
    );
    const row = res.rows[0];
    if (!row) return undefined;
    return { endAtMs: Date.parse(row.end_at), organiserId: row.organiser_id };
  }

  async insertPeerRating(input: {
    eventId: string;
    raterId: string;
    organiserId: string;
    rating: number;
    comment: string | null;
    commentStatus: 'published' | 'pending';
  }): Promise<void> {
    await this.db.queryWrite(
      `INSERT INTO peer_ratings (event_id, rater_id, organiser_id, numeric_rating, written_comment, comment_moderation_status)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (event_id, rater_id) DO NOTHING`,
      [input.eventId, input.raterId, input.organiserId, input.rating, input.comment, input.commentStatus],
    );
  }

  async insertSelfAssessment(memberId: string, responses: unknown): Promise<void> {
    await this.db.queryWrite('INSERT INTO self_assessments (member_id, responses) VALUES ($1, $2)', [
      memberId,
      JSON.stringify(responses),
    ]);
  }

  async addAudit(memberId: string, inputType: string, inputValue: string, contributorId: string): Promise<void> {
    await this.db.queryWrite(
      'INSERT INTO pm_score_audit (member_id, input_type, input_value, contributor_id) VALUES ($1, $2, $3, $4)',
      [memberId, inputType, inputValue, contributorId],
    );
  }

  async getAudit(memberId: string): Promise<Row[]> {
    const res = await this.db.queryRead(
      'SELECT input_type, input_value, contributor_id, recorded_at FROM pm_score_audit WHERE member_id = $1 ORDER BY recorded_at DESC',
      [memberId],
    );
    return res.rows;
  }
}
