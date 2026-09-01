import { AuthenticationService } from '@iamfriendof/authentication';
import { json, type Router } from '../http/router';
import type { AppModule, ModuleDeps } from '../module-types';

/**
 * HTTP adapter for the Authentication module: login, logout, session check.
 * Business logic lives in AuthenticationService; this layer only translates
 * HTTP <-> service calls and lets AppError normalise failures.
 */
export const authenticationModule: AppModule = {
  name: 'authentication',
  register(router: Router, deps: ModuleDeps): void {
    const service = new AuthenticationService(deps.db, deps.bus, deps.sessions);

    router.post('/auth/login', async (req, ctx) => {
      const body = (await safeJson(req)) as { email?: unknown; password?: unknown };
      const email = typeof body?.email === 'string' ? body.email : '';
      const password = typeof body?.password === 'string' ? body.password : '';
      const result = await service.login(email, password);
      return json(
        { accessToken: result.accessToken, expiresIn: result.expiresIn },
        200,
        ctx.correlationId,
      );
    });

    router.post('/auth/logout', async (req, ctx) => {
      const auth = req.headers.get('authorization') ?? '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      await service.logout(token);
      return json({ loggedOut: true }, 200, ctx.correlationId);
    });

    router.get(
      '/auth/session',
      async (_req, ctx) => json({ memberId: ctx.memberId }, 200, ctx.correlationId),
      { auth: true },
    );
  },
};

async function safeJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}
