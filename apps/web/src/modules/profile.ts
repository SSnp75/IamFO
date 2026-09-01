import { AppError, ERROR_CODES } from '@iamfriendof/shared';
import { ProfileService } from '@iamfriendof/profile';
import { json, type Router } from '../http/router';
import type { AppModule, ModuleDeps } from '../module-types';

/** HTTP adapter for the Profile module. */
export const profileModule: AppModule = {
  name: 'profile',
  register(router: Router, deps: ModuleDeps): void {
    const service = new ProfileService(deps.db, deps.bus);

    router.get('/members/:id/profile', async (_req, ctx) => {
      const profile = await service.getPublicProfile(ctx.params.id!);
      return json(profile, 200, ctx.correlationId);
    });

    router.put('/members/:id/profile', async (req, ctx) => {
      requireSelf(ctx.memberId, ctx.params.id!);
      const body = (await safeJson(req)) as { purposeStatement?: unknown; skills?: unknown };
      if (typeof body?.purposeStatement === 'string') {
        const result = await service.updatePurpose(ctx.params.id!, body.purposeStatement);
        if (Array.isArray(body?.skills)) {
          await service.updateSkills(ctx.params.id!, body.skills.map(String));
        }
        return json(result, 200, ctx.correlationId);
      }
      if (Array.isArray(body?.skills)) {
        await service.updateSkills(ctx.params.id!, body.skills.map(String));
        return json({ status: 'saved' }, 200, ctx.correlationId);
      }
      return json({ status: 'saved' }, 200, ctx.correlationId);
    }, { auth: true });

    router.put('/members/:id/privacy', async (req, ctx) => {
      requireSelf(ctx.memberId, ctx.params.id!);
      const body = (await safeJson(req)) as { isPrivate?: unknown };
      await service.setPrivacy(ctx.params.id!, Boolean(body?.isPrivate));
      return json({ isPrivate: Boolean(body?.isPrivate) }, 200, ctx.correlationId);
    }, { auth: true });

    router.get('/members/:id/purpose-history', async (_req, ctx) => {
      requireSelf(ctx.memberId, ctx.params.id!);
      const history = await service.getPurposeHistory(ctx.params.id!);
      return json({ revisions: history }, 200, ctx.correlationId);
    }, { auth: true });
  },
};

function requireSelf(authedId: string | undefined, targetId: string): void {
  if (!authedId || authedId !== targetId) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'You may only modify your own profile', 403);
  }
}

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
