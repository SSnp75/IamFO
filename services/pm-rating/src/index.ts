import {
  AppError,
  ERROR_CODES,
  EVENTS,
  DenyListModerationFilter,
  type Db,
  type MessageBus,
  type ModerationFilter,
} from '@iamfriendof/shared';
import { PmRatingRepository } from './repository';
import {
  computeScore,
  isPeerRatingWindowOpen,
  MIN_EVENTS_FOR_SCORE,
  type ScoreInputs,
} from './scoreCalculator';

export { pmRatingMigrations } from './migrations';
export * from './scoreCalculator';

export interface PmScoreView {
  memberId: string;
  score: number | null;
  display: 'score' | 'insufficient_data';
  eventsOrganised: number;
  completionRate: number | null;
  avgPeerRating: number | null;
}

export class PmRatingService {
  private readonly repo: PmRatingRepository;
  constructor(
    private readonly db: Db,
    private readonly bus: MessageBus,
    private readonly moderation: ModerationFilter = new DenyListModerationFilter(),
  ) {
    this.repo = new PmRatingRepository(db);
  }

  /** Recalculate and persist a member's PM score from current inputs. */
  async recalculate(memberId: string): Promise<number | null> {
    const stats = await this.repo.getOrganiserStats(memberId);
    const selfAssessmentScore = await this.repo.getSelfAssessmentScore(memberId);

    const inputs: ScoreInputs = {
      eventsOrganised: stats.eventsOrganised,
      completionRate: stats.completionRate,
      avgPeerRating: stats.avgPeerRating,
      selfAssessmentScore,
    };
    const { score } = computeScore(inputs);

    await this.repo.upsertScore(memberId, {
      score,
      eventsOrganised: stats.eventsOrganised,
      completionRate: stats.completionRate,
      avgPeerRating: stats.avgPeerRating,
    });
    await this.bus.publish(EVENTS.PM_SCORE_UPDATED, { memberId, newScore: score });
    return score;
  }

  /** Fetch a member's score view, showing "Insufficient Data" below the threshold. */
  async getScore(memberId: string): Promise<PmScoreView> {
    const row = await this.repo.getScore(memberId);
    const eventsOrganised = row ? row.events_organised : 0;
    const insufficient = eventsOrganised < MIN_EVENTS_FOR_SCORE;
    return {
      memberId,
      score: insufficient ? null : row?.score !== null && row?.score !== undefined ? Number(row.score) : null,
      display: insufficient ? 'insufficient_data' : 'score',
      eventsOrganised,
      completionRate: row?.completion_rate != null ? Number(row.completion_rate) : null,
      avgPeerRating: row?.avg_peer_rating != null ? Number(row.avg_peer_rating) : null,
    };
  }

  /**
   * Submit a peer rating for an event's organiser. Rejected if outside the
   * 14-day window. A flagged comment is held (comment_moderation_status=pending)
   * but the numeric rating is still recorded (Requirement 9.11).
   */
  async submitPeerRating(input: {
    eventId: string;
    raterId: string;
    rating: number;
    comment?: string | null;
    now?: Date;
  }): Promise<void> {
    if (input.rating < 1 || input.rating > 5 || !Number.isInteger(input.rating)) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Rating must be an integer from 1 to 5', 422);
    }
    const now = input.now ?? new Date();
    const event = await this.repo.getEventEnd(input.eventId);
    if (!event) throw new AppError(ERROR_CODES.NOT_FOUND, 'Event not found', 404);
    if (!isPeerRatingWindowOpen(event.endAtMs, now.getTime())) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'The 14-day rating window has closed', 422);
    }

    let commentStatus: 'published' | 'pending' = 'published';
    const comment = input.comment?.trim() ? input.comment : null;
    if (comment) {
      const verdict = await this.moderation.check(comment);
      if (verdict.flagged) commentStatus = 'pending';
    }

    await this.repo.insertPeerRating({
      eventId: input.eventId,
      raterId: input.raterId,
      organiserId: event.organiserId,
      rating: input.rating,
      comment,
      commentStatus,
    });
    await this.repo.addAudit(event.organiserId, 'peer_rating', String(input.rating), input.raterId);
    await this.recalculate(event.organiserId);
  }

  async submitSelfAssessment(memberId: string, responses: Array<{ questionId: number; score: number }>): Promise<void> {
    if (!Array.isArray(responses) || responses.length < 10 || responses.length > 20) {
      throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Self-assessment must have 10–20 responses', 422);
    }
    for (const r of responses) {
      if (r.score < 1 || r.score > 5) {
        throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Each response must be 1–5', 422);
      }
    }
    await this.repo.insertSelfAssessment(memberId, responses);
    await this.repo.addAudit(memberId, 'self_assessment', String(responses.length), memberId);
    await this.recalculate(memberId);
  }

  async getAudit(memberId: string): Promise<unknown[]> {
    return this.repo.getAudit(memberId);
  }

  /** Subscribe to event.completed to recalc the organiser's score (Req 9.2/9.10). */
  registerConsumers(): void {
    this.bus.subscribe(EVENTS.EVENT_COMPLETED, async (e) => {
      await this.repo.addAudit(e.payload.organiserId, 'event_completed', e.payload.eventId, e.payload.organiserId);
      await this.recalculate(e.payload.organiserId);
    });
  }
}
