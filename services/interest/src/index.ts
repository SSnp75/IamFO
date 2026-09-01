import {
  AppError,
  ERROR_CODES,
  EVENTS,
  type Db,
  type MessageBus,
} from '@iamfriendof/shared';
import { InterestRepository, type InterestAreaRow } from './repository';
import { assertValidSelection, assertValidCustomLabel } from './validation';

export { interestMigrations } from './migrations';
export * from './validation';

export class InterestService {
  private readonly repo: InterestRepository;
  constructor(private readonly db: Db, private readonly bus: MessageBus) {
    this.repo = new InterestRepository(db);
  }

  async listInterests(): Promise<InterestAreaRow[]> {
    return this.repo.listApproved();
  }

  async getMemberInterests(memberId: string): Promise<number[]> {
    return this.repo.getMemberInterests(memberId);
  }

  /**
   * Set a member's interest selections. Validates the count (1–10), then that
   * every id refers to an existing approved area, then persists and publishes
   * member.updated (used to refresh search/recommendations).
   */
  async setMemberInterests(memberId: string, interestIds: number[]): Promise<void> {
    assertValidSelection(interestIds);
    const unique = [...new Set(interestIds)];
    const existing = await this.repo.existingApprovedIds(unique);
    if (existing.length !== unique.length) {
      throw new AppError(
        ERROR_CODES.INTEREST_SELECTION_INVALID,
        'One or more selected interest areas do not exist',
        422,
      );
    }
    await this.repo.setMemberInterests(memberId, unique);
    await this.bus.publish(EVENTS.MEMBER_UPDATED, { memberId });
  }

  /** Submit a custom interest label for platform review. */
  async submitCustomInterest(memberId: string, label: string): Promise<{ requestId: number }> {
    assertValidCustomLabel(label);
    const requestId = await this.repo.submitCustomRequest(memberId, label);
    return { requestId };
  }
}
