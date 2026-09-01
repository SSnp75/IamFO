import { SearchService } from '@iamfriendof/search';
import { json, type Router } from '../http/router';
import type { AppModule, ModuleDeps } from '../module-types';

/** HTTP adapter for the Search module. Registers index-refresh consumers. */
export const searchModule: AppModule = {
  name: 'search',
  register(router: Router, deps: ModuleDeps): void {
    const service = new SearchService(deps.db, deps.bus);
    service.registerConsumers();

    router.get('/search/members', async (_req, ctx) => {
      const q = ctx.url.searchParams.get('q') ?? '';
      const results = await service.searchMembers(q);
      return json({ results }, 200, ctx.correlationId);
    }, { auth: true });

    router.get('/search/events', async (_req, ctx) => {
      const q = ctx.url.searchParams.get('q') ?? '';
      const results = await service.searchEvents(q);
      return json({ results }, 200, ctx.correlationId);
    });
  },
};
