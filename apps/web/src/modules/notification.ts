import { AppError, ERROR_CODES } from '@iamfriendof/shared';
import { NotificationService } from '@iamfriendof/notification';
import { json, type Router } from '../http/router';
import type { AppModule, ModuleDeps } from '../module-types';

/** HTTP adapter for the Notification module. Registers domain-event consumers. */
export const notificationModule: AppModule = {
  name: 'notification',
  register(router: Router, deps: ModuleDeps): void {
    const service = new NotificationService(deps.db, deps.bus);
    service.registerConsumers();

    router.get('/members/:id/notifications', async (_req, ctx) => {
      requireSelf(ctx.memberId, ctx.params.id!);
      const result = await service.getNotifications(ctx.params.id!);
      return json(result, 200, ctx.correlationId);
    }, { auth: true });

    router.put('/notifications/:id/read', async (_req, ctx) => {
      await service.markRead(ctx.params.id!, ctx.memberId!);
      return json({ read: true }, 200, ctx.correlationId);
    }, { auth: true });

    router.put('/members/:id/notification-preferences', async (req, ctx) => {
      requireSelf(ctx.memberId, ctx.params.id!);
      const body = (await safeJson(req)) as { disabledTypes?: unknown };
      const disabled = Array.isArray(body?.disabledTypes) ? body.disabledTypes.map(String) : [];
      await service.updatePreferences(ctx.params.id!, disabled);
      return json({ updated: true }, 200, ctx.correlationId);
    }, { auth: true });
  },
};

function requireSelf(authedId: string | undefined, targetId: string): void {
  if (!authedId || authedId !== targetId) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'You may only access your own notifications', 403);
  }
}

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
