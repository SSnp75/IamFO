import { CommentService } from '@iamfriendof/comment';
import { json, type Router } from '../http/router';
import type { AppModule, ModuleDeps } from '../module-types';

/** HTTP adapter for the Comment module. */
export const commentModule: AppModule = {
  name: 'comment',
  register(router: Router, deps: ModuleDeps): void {
    const service = new CommentService(deps.db, deps.bus);

    router.post('/comments', async (req, ctx) => {
      const body = (await safeJson(req)) as {
        targetType?: unknown;
        targetId?: unknown;
        parentId?: unknown;
        body?: unknown;
      };
      const targetType = body?.targetType === 'profile' ? 'profile' : 'event';
      const result = await service.create({
        authorId: ctx.memberId!,
        targetType,
        targetId: typeof body?.targetId === 'string' ? body.targetId : '',
        parentId: typeof body?.parentId === 'string' ? body.parentId : null,
        body: typeof body?.body === 'string' ? body.body : '',
      });
      return json(result, 201, ctx.correlationId);
    }, { auth: true });

    router.delete('/comments/:id', async (_req, ctx) => {
      await service.deleteOwn(ctx.params.id!, ctx.memberId!);
      return json({ deleted: true }, 200, ctx.correlationId);
    }, { auth: true });

    router.post('/comments/:id/reports', async (_req, ctx) => {
      const result = await service.report(ctx.params.id!, ctx.memberId!);
      return json(result, 201, ctx.correlationId);
    }, { auth: true });

    router.get('/events/:id/comments', async (_req, ctx) => {
      const comments = await service.listForTarget('event', ctx.params.id!);
      return json({ comments }, 200, ctx.correlationId);
    });

    router.get('/members/:id/comments', async (_req, ctx) => {
      const comments = await service.listForTarget('profile', ctx.params.id!);
      return json({ comments }, 200, ctx.correlationId);
    });
  },
};

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
