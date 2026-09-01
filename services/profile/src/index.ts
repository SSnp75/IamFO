import {
  AppError,
  ERROR_CODES,
  EVENTS,
  DenyListModerationFilter,
  type Db,
  type MessageBus,
  type ModerationFilter,
} from '@iamfriendof/shared';
import { ProfileRepository, type ProfileRow, type PurposeRevision } from './repository';
import { assertValidPurpose, assertValidSkills } from './validation';

export { profileMigrations } from './migrations';
export * from './validation';

/** The publicly visible shape of a profile after applying the privacy filter. */
export interface PublicProfile {
  memberId: string;
  firstName: string;
  isPrivate: boolean;
  // Present only when public:
  lastName?: string;
  purposeStatement?: string | null;
  skills?: string[];
  profilePictureUrl?: string | null;
  profilePictureAlt?: string | null;
}

/**
 * Pure privacy filter (Requirement 3.8): a private profile exposes only first
 * name and (elsewhere) general interest areas; everything else is hidden.
 * Kept pure for straightforward testing.
 */
export function applyPrivacyFilter(profile: ProfileRow, skills: string[]): PublicProfile {
  if (profile.is_private) {
    return {
      memberId: profile.member_id,
      firstName: profile.first_name,
      isPrivate: true,
    };
  }
  return {
    memberId: profile.member_id,
    firstName: profile.first_name,
    isPrivate: false,
    lastName: profile.last_name,
    purposeStatement: profile.purpose_statement,
    skills,
    profilePictureUrl: profile.profile_picture_url,
    profilePictureAlt: profile.profile_picture_alt,
  };
}

export class ProfileService {
  private readonly repo: ProfileRepository;
  constructor(
    private readonly db: Db,
    private readonly bus: MessageBus,
    private readonly moderation: ModerationFilter = new DenyListModerationFilter(),
  ) {
    this.repo = new ProfileRepository(db);
  }

  async getPublicProfile(memberId: string): Promise<PublicProfile> {
    const profile = await this.repo.getProfile(memberId);
    if (!profile) {
      throw new AppError(ERROR_CODES.NOT_FOUND, 'Profile not found', 404);
    }
    const skills = profile.is_private ? [] : await this.repo.getSkills(memberId);
    return applyPrivacyFilter(profile, skills);
  }

  /**
   * Update the purpose statement. Validates length, runs moderation, and on a
   * flag holds the content (does not persist) and signals pending review.
   */
  async updatePurpose(memberId: string, statement: string): Promise<{ status: 'saved' | 'pending' }> {
    assertValidPurpose(statement);
    const verdict = await this.moderation.check(statement);
    if (verdict.flagged) {
      // Held for moderator review; not published (Req 12.3/12.4).
      return { status: 'pending' };
    }
    await this.repo.updatePurpose(memberId, statement);
    await this.bus.publish(EVENTS.MEMBER_UPDATED, { memberId });
    return { status: 'saved' };
  }

  async getPurposeHistory(memberId: string): Promise<PurposeRevision[]> {
    return this.repo.getPurposeHistory(memberId);
  }

  async updateSkills(memberId: string, skills: string[]): Promise<void> {
    assertValidSkills(skills);
    await this.repo.setSkills(memberId, skills);
    await this.bus.publish(EVENTS.MEMBER_UPDATED, { memberId });
  }

  async setPrivacy(memberId: string, isPrivate: boolean): Promise<void> {
    await this.repo.setPrivacy(memberId, isPrivate);
    await this.bus.publish(EVENTS.MEMBER_UPDATED, { memberId });
  }
}
