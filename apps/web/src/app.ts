import {
  JwtSessions,
  RateLimiter,
  InMemoryRateLimitStore,
  InProcessBus,
  PgDb,
  AppError,
  ERROR_CODES,
  type Db,
  type MessageBus,
} from '@iamfriendof/shared';
import { AuthenticationService } from '@iamfriendof/authentication';
import { loadConfig, type EnvBag, type AppConfig } from './config';
import { Router, json, errorResponse, type RequestContext } from './http/router';
import { createModules, type ModuleDeps } from './modules';
import { migrate } from './bootstrap';
import { INDEX_HTML, STYLES_CSS, APP_JS } from './static/assets';

/** Static frontend assets served for non-API GET routes. */
const STATIC_ASSETS: Record<string, { body: string; contentType: string }> = {
  '/': { body: INDEX_HTML, contentType: 'text/html; charset=utf-8' },
  '/index.html': { body: INDEX_HTML, contentType: 'text/html; charset=utf-8' },
  '/styles.css': { body: STYLES_CSS, contentType: 'text/css; charset=utf-8' },
  '/app.js': { body: APP_JS, contentType: 'application/javascript; charset=utf-8' },
};

/** Everything the request handler needs, assembled once per worker instance. */
export interface App {
  config: AppConfig;
  router: Router;
  sessions: JwtSessions;
  rateLimiter: RateLimiter;
  bus: MessageBus;
  db: Db;
  handle(req: Request): Promise<Response>;
  /** Apply pending DB migrations. Call once at startup. */
  migrate(): Promise<string[]>;
}

/** Optional dependency overrides, used by tests to inject fakes. */
export interface AppOverrides {
  db?: Db;
  bus?: MessageBus;
}

/**
 * Assemble the Phase 0 modular monolith: build shared dependencies, register
 * every module's routes on one router, and expose a single request handler that
 * applies the gateway middleware chain (correlation id -> rate limit -> auth ->
 * route). This is the in-process equivalent of the API Gateway + service fleet.
 */
export function createApp(env: EnvBag, overrides: AppOverrides = {}): App {
  const config = loadConfig(env);
  const sessions = new JwtSessions(config.jwtSecret);
  // Phase 0 default limiter: in-memory (per instance). A Postgres-backed store
  // implements the same RateLimitStore interface for cross-instance limiting.
  const rateLimiter = new RateLimiter(
    new InMemoryRateLimitStore(),
    config.rateLimitPerMinute,
    60_000,
  );
  const bus: MessageBus = overrides.bus ?? new InProcessBus();
  const db: Db = overrides.db ?? new PgDb({ writeUrl: config.databaseUrl });

  const router = new Router();
  // Health endpoint is always available and unauthenticated.
  router.get('/health', (_req, ctx) =>
    json({ status: 'ok', phase: config.deployPhase, correlationId: ctx.correlationId }, 200, ctx.correlationId),
  );

  const deps: ModuleDeps = { config, bus, db, sessions };
  for (const mod of createModules()) {
    mod.register(router, deps);
  }

  // Auth service instance used by the gateway to enforce session revocation
  // (verify + revoked_sessions check). Shares the same db/bus/sessions.
  const authService = new AuthenticationService(db, bus, sessions);

  async function handle(req: Request): Promise<Response> {
    const correlationId = req.headers.get('x-correlation-id') ?? crypto.randomUUID();
    const url = new URL(req.url);

    try {
      // 1. Rate limit by client IP (Cloudflare provides cf-connecting-ip).
      const clientIp =
        req.headers.get('cf-connecting-ip') ??
        req.headers.get('x-forwarded-for') ??
        'unknown';
      const rl = await rateLimiter.check(`ip:${clientIp}`);
      if (!rl.allowed) {
        throw new AppError(
          ERROR_CODES.RATE_LIMITED,
          'Too many requests',
          429,
          { retryAfterSeconds: rl.retryAfterSeconds },
        );
      }

      // 2. Static frontend: serve embedded assets for GET requests that are not
      //    API routes. API paths are checked first so they always win.
      if (req.method === 'GET' && !router.match('GET', url.pathname)) {
        const asset = STATIC_ASSETS[url.pathname];
        if (asset) {
          return new Response(asset.body, {
            status: 200,
            headers: { 'content-type': asset.contentType, 'x-correlation-id': correlationId },
          });
        }
      }

      // 3. Route match.
      const matched = router.match(req.method, url.pathname);
      if (!matched) {
        throw new AppError(ERROR_CODES.NOT_FOUND, 'Resource not found', 404);
      }

      const ctx: RequestContext = { correlationId, params: matched.params, url };

      // 4. Auth for protected routes: verify JWT signature + expiry AND confirm
      //    the session has not been revoked (logout / lock) via revoked_sessions.
      if (matched.route.auth) {
        const auth = req.headers.get('authorization') ?? '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        if (!token) {
          throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Missing bearer token', 401);
        }
        const { memberId } = await authService.validateSession(token);
        ctx.memberId = memberId;
      }

      // 5. Dispatch.
      return await matched.route.handler(req, ctx);
    } catch (err) {
      return errorResponse(err, correlationId);
    }
  }

  return {
    config,
    router,
    sessions,
    rateLimiter,
    bus,
    db,
    handle,
    migrate: () => migrate(db),
  };
}
