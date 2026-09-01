import { AppError, ERROR_CODES } from '@iamfriendof/shared';
import { InterestService } from '@iamfriendof/interest';
import { json, type Router } from '../http/router';
import type { AppModule, ModuleDeps } from '../module-types';

/** HTTP adapter for the Interest module. */
export const interestModule: AppModule = {
  name: 'interest',
  register(router: Router, deps: ModuleDeps): void {
    const service = new InterestService(deps.db, deps.bus);

    router.get('/interests', async (_req, ctx) => {
      const interests = await service.listInterests();
      return json({ interests }, 200, ctx.correlationId);
    });

    router.put('/members/:id/interests', async (req, ctx) => {
      requireSelf(ctx.memberId, ctx.params.id!);
      const body = (await safeJson(req)) as { interestIds?: unknown };
      const ids = Array.isArray(body?.interestIds) ? body.interestIds.map(Number) : [];
      await service.setMemberInterests(ctx.params.id!, ids);
      return json({ saved: true }, 200, ctx.correlationId);
    }, { auth: true });

    router.post('/interests/requests', async (req, ctx) => {
      const body = (await safeJson(req)) as { label?: unknown };
      const label = typeof body?.label === 'string' ? body.label : '';
      const result = await service.submitCustomInterest(ctx.memberId!, label);
      return json(result, 201, ctx.correlationId);
    }, { auth: true });
  },
};

function requireSelf(authedId: string | undefined, targetId: string): void {
  if (!authedId || authedId !== targetId) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'You may only modify your own interests', 403);
  }
}

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
