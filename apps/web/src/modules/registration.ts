import { RegistrationService } from '@iamfriendof/registration';
import { json, type Router } from '../http/router';
import type { AppModule, ModuleDeps } from '../module-types';

/**
 * HTTP adapter for the Registration module. Thin: it parses the request and
 * delegates to RegistrationService, which holds the business logic. Errors are
 * thrown as AppError and normalised centrally by the app's error handler.
 */
export const registrationModule: AppModule = {
  name: 'registration',
  register(router: Router, deps: ModuleDeps): void {
    const service = new RegistrationService(deps.db, deps.bus);

    router.post('/registrations', async (req, ctx) => {
      const body = await safeJson(req);
      const { memberId } = await service.register(body);
      return json({ memberId }, 201, ctx.correlationId);
    });

    router.post('/registrations/verify', async (req, ctx) => {
      const body = (await safeJson(req)) as { token?: unknown };
      const token = typeof body?.token === 'string' ? body.token : ctx.url.searchParams.get('token') ?? '';
      await service.verify(token);
      return json({ verified: true }, 200, ctx.correlationId);
    });

    router.post('/registrations/resend-verification', async (req, ctx) => {
      const body = (await safeJson(req)) as { email?: unknown };
      const email = typeof body?.email === 'string' ? body.email : '';
      await service.resend(email);
      // Always 202 to avoid revealing whether the email exists.
      return json({ accepted: true }, 202, ctx.correlationId);
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
