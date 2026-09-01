import { EVENTS, type Db, type MessageBus } from '@iamfriendof/shared';
import { NotificationRepository, type NotificationRow } from './repository';
import { InMemoryEmailSender, type EmailSender } from './emailSender';

export { notificationMigrations } from './migrations';
export * from './emailSender';

/** Notification type identifiers (also used as preference opt-out keys). */
export const NOTIFICATION_TYPES = {
  COMMENT_POSTED: 'comment_posted',
  EVENT_CHANGED: 'event_changed',
  EVENT_CANCELLED: 'event_cancelled',
  WAITLIST_PROMOTED: 'waitlist_promoted',
  PM_SCORE_UPDATED: 'pm_score_updated',
  ACCOUNT_LOCKED: 'account_locked',
  VERIFICATION: 'verification',
} as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[keyof typeof NOTIFICATION_TYPES];

export interface NotificationView {
  id: string;
  type: string;
  summary: string;
  isRead: boolean;
  triggeredAt: string;
  deliveryFailed: boolean;
}

export class NotificationService {
  private readonly repo: NotificationRepository;
  constructor(
    private readonly db: Db,
    private readonly bus: MessageBus,
    private readonly email: EmailSender = new InMemoryEmailSender(),
  ) {
    this.repo = new NotificationRepository(db);
  }

  /**
   * Deliver a notification: skip if the member has opted out of the type;
   * otherwise persist the in-platform notification and attempt email delivery,
   * retrying once on failure and marking delivery_failed if the retry fails
   * (Requirement 11.4, 11.7).
   */
  async deliver(input: {
    memberId: string;
    type: NotificationType;
    summary: string;
    triggeredAt?: Date;
    sendEmail?: boolean;
  }): Promise<{ delivered: boolean; notificationId?: string }> {
    const disabled = await this.repo.getDisabledTypes(input.memberId);
    if (disabled.includes(input.type)) {
      return { delivered: false };
    }

    const triggeredAt = input.triggeredAt ?? new Date();
    const notificationId = await this.repo.insert({
      memberId: input.memberId,
      type: input.type,
      summary: input.summary,
      triggeredAt,
      deliveryFailed: false,
    });

    if (input.sendEmail) {
      const to = await this.repo.getMemberEmail(input.memberId);
      if (to) {
        const ok = await this.sendEmailWithRetry(to, input.summary);
        if (!ok) await this.repo.markDeliveryFailed(notificationId);
      }
    }
    return { delivered: true, notificationId };
  }

  private async sendEmailWithRetry(to: string, summary: string): Promise<boolean> {
    try {
      await this.email.send(to, 'IamFriendof notification', summary);
      return true;
    } catch {
      // Retry once (Requirement 11.7).
      try {
        await this.email.send(to, 'IamFriendof notification', summary);
        return true;
      } catch {
        return false;
      }
    }
  }

  async getNotifications(memberId: string): Promise<{ notifications: NotificationView[]; unreadCount: number }> {
    const rows = await this.repo.listRecent(memberId);
    const unreadCount = await this.repo.unreadCount(memberId);
    return { notifications: rows.map(toView), unreadCount };
  }

  async markRead(id: string, memberId: string): Promise<void> {
    await this.repo.markRead(id, memberId);
  }

  async updatePreferences(memberId: string, disabledTypes: string[]): Promise<void> {
    await this.repo.setPreferences(memberId, disabledTypes);
  }

  /** Subscribe to the domain events that produce notifications (Req 11.3). */
  registerConsumers(): void {
    this.bus.subscribe(EVENTS.PARTICIPANT_PROMOTED, async (e) => {
      await this.deliver({
        memberId: e.payload.memberId,
        type: NOTIFICATION_TYPES.WAITLIST_PROMOTED,
        summary: 'You have been promoted from the waiting list to a confirmed participant.',
        triggeredAt: new Date(e.occurredAt),
        sendEmail: true,
      });
    });

    this.bus.subscribe(EVENTS.PM_SCORE_UPDATED, async (e) => {
      await this.deliver({
        memberId: e.payload.memberId,
        type: NOTIFICATION_TYPES.PM_SCORE_UPDATED,
        summary: 'Your project management score has been updated.',
        triggeredAt: new Date(e.occurredAt),
      });
    });

    this.bus.subscribe(EVENTS.MEMBER_ACCOUNT_LOCKED, async (e) => {
      await this.deliver({
        memberId: e.payload.memberId,
        type: NOTIFICATION_TYPES.ACCOUNT_LOCKED,
        summary: 'Your account was temporarily locked after multiple failed login attempts.',
        triggeredAt: new Date(e.occurredAt),
        sendEmail: true,
      });
    });

    this.bus.subscribe(EVENTS.MEMBER_REGISTERED, async (e) => {
      // Verification email is keyed off the token; send email only (no in-app row needed pre-verification).
      const to = e.payload.email;
      await this.sendEmailWithRetry(
        to,
        `Please verify your account. Verification token: ${e.payload.verificationToken}`,
      );
    });
  }
}

function toView(row: NotificationRow): NotificationView {
  return {
    id: row.id,
    type: row.type,
    summary: row.summary,
    isRead: row.is_read,
    triggeredAt: row.triggered_at,
    deliveryFailed: row.delivery_failed,
  };
}
