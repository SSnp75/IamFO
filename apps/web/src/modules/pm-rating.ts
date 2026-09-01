import { AppError, ERROR_CODES } from '@iamfriendof/shared';
import { PmRatingService } from '@iamfriendof/pm-rating';
import { json, type Router } from '../http/router';
import type { AppModule, ModuleDeps } from '../module-types';

/** HTTP adapter for the PM Rating module. Registers the event.completed consumer. */
export const pmRatingModule: AppModule = {
  name: 'pm-rating',
  register(router: Router, deps: ModuleDeps): void {
    const service = new PmRatingService(deps.db, deps.bus);
    service.registerConsumers();

    router.get('/members/:id/pm-score', async (_req, ctx) => {
      const view = await service.getScore(ctx.params.id!);
      return json(view, 200, ctx.correlationId);
    });

    router.post('/members/:id/pm-score/self-assessment', async (req, ctx) => {
      requireSelf(ctx.memberId, ctx.params.id!);
      const body = (await safeJson(req)) as { responses?: unknown };
      const responses = Array.isArray(body?.responses)
        ? body.responses.map((r) => ({
            questionId: Number((r as { questionId?: unknown }).questionId ?? 0),
            score: Number((r as { score?: unknown }).score ?? 0),
          }))
        : [];
      await service.submitSelfAssessment(ctx.params.id!, responses);
      return json({ submitted: true }, 200, ctx.correlationId);
    }, { auth: true });

    router.post('/ratings', async (req, ctx) => {
      const body = (await safeJson(req)) as { eventId?: unknown; rating?: unknown; comment?: unknown };
      await service.submitPeerRating({
        eventId: typeof body?.eventId === 'string' ? body.eventId : '',
        raterId: ctx.memberId!,
        rating: Number(body?.rating ?? 0),
        comment: typeof body?.comment === 'string' ? body.comment : null,
      });
      return json({ submitted: true }, 201, ctx.correlationId);
    }, { auth: true });

    router.get('/members/:id/pm-score/audit', async (_req, ctx) => {
      requireSelf(ctx.memberId, ctx.params.id!);
      const audit = await service.getAudit(ctx.params.id!);
      return json({ audit }, 200, ctx.correlationId);
    }, { auth: true });
  },
};

function requireSelf(authedId: string | undefined, targetId: string): void {
  if (!authedId || authedId !== targetId) {
    throw new AppError(ERROR_CODES.UNAUTHORIZED, 'You may only access your own PM data', 403);
  }
}

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
