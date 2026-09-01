import { EventService } from '@iamfriendof/event';
import { json, type Router } from '../http/router';
import type { AppModule, ModuleDeps } from '../module-types';

/** HTTP adapter for the Event module. */
export const eventModule: AppModule = {
  name: 'event',
  register(router: Router, deps: ModuleDeps): void {
    const service = new EventService(deps.db, deps.bus);

    router.post('/events', async (req, ctx) => {
      const b = (await safeJson(req)) as Record<string, unknown>;
      const result = await service.create({
        organiserId: ctx.memberId!,
        title: str(b.title),
        description: str(b.description),
        locationDetails: typeof b.locationDetails === 'string' ? b.locationDetails : null,
        startAt: str(b.startAt),
        endAt: str(b.endAt),
        maxParticipants: b.maxParticipants === undefined ? undefined : Number(b.maxParticipants),
        interestIds: Array.isArray(b.interestIds) ? b.interestIds.map(Number) : [],
      });
      return json(result, 201, ctx.correlationId);
    }, { auth: true });

    router.get('/events/:id', async (_req, ctx) => {
      const result = await service.getWithCounts(ctx.params.id!);
      return json(result, 200, ctx.correlationId);
    });

    router.put('/events/:id', async (req, ctx) => {
      const b = (await safeJson(req)) as Record<string, unknown>;
      const result = await service.edit(ctx.params.id!, ctx.memberId!, {
        title: typeof b.title === 'string' ? b.title : undefined,
        description: typeof b.description === 'string' ? b.description : undefined,
        locationDetails: typeof b.locationDetails === 'string' ? b.locationDetails : undefined,
      });
      return json(result, 200, ctx.correlationId);
    }, { auth: true });

    router.delete('/events/:id', async (_req, ctx) => {
      await service.cancel(ctx.params.id!, ctx.memberId!);
      return json({ cancelled: true }, 200, ctx.correlationId);
    }, { auth: true });

    router.post('/events/:id/participants', async (_req, ctx) => {
      const outcome = await service.join(ctx.params.id!, ctx.memberId!);
      return json(outcome, 200, ctx.correlationId);
    }, { auth: true });

    router.delete('/events/:id/participants/:memberId', async (_req, ctx) => {
      await service.withdraw(ctx.params.id!, ctx.params.memberId!);
      return json({ withdrawn: true }, 200, ctx.correlationId);
    }, { auth: true });
  },
};

function str(v: unknown): string {
  return typeof v === 'string' ? v : '';
}

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
