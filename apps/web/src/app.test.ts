import { FakeDb } from '@iamfriendof/shared';
import { createApp, type App } from './app';
import type { EnvBag } from './config';

const baseEnv: EnvBag = {
  DEPLOY_PHASE: '0',
  JWT_SECRET: 'x'.repeat(40),
  DATABASE_URL: 'postgres://localhost/test',
  RATE_LIMIT_PER_MINUTE: '1000',
};

/** A FakeDb whose revocation check answers `revoked` (default false). */
function fakeDb(revoked = false): FakeDb {
  return new FakeDb().on('SELECT EXISTS(SELECT 1 FROM revoked_sessions', () => ({
    rows: [{ exists: revoked }],
    rowCount: 1,
  }));
}

function makeApp(overrides: EnvBag = {}, db: FakeDb = fakeDb()): App {
  return createApp({ ...baseEnv, ...overrides }, { db });
}

describe('Phase 0 app request handling', () => {
  it('serves /health with ok status and the deploy phase', async () => {
    const app = makeApp();
    const res = await app.handle(new Request('http://localhost/health'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string; phase: string };
    expect(body.status).toBe('ok');
    expect(body.phase).toBe('0');
    expect(res.headers.get('x-correlation-id')).toBeTruthy();
  });

  it('returns a structured 404 for unknown routes', async () => {
    const app = makeApp();
    const res = await app.handle(new Request('http://localhost/nope'));
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('NOT_FOUND');
  });

  it('rejects protected routes without a bearer token', async () => {
    const app = makeApp();
    // Register a throwaway protected route for the test.
    app.router.get('/protected', () => new Response('secret'), { auth: true });
    const res = await app.handle(new Request('http://localhost/protected'));
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('UNAUTHORIZED');
  });

  it('allows a protected route with a valid token', async () => {
    const app = makeApp();
    app.router.get('/protected', (_req, ctx) =>
      new Response(JSON.stringify({ memberId: ctx.memberId }), {
        headers: { 'content-type': 'application/json' },
      }),
      { auth: true },
    );
    const { token } = await app.sessions.issue('member-9');
    const res = await app.handle(
      new Request('http://localhost/protected', {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { memberId: string };
    expect(body.memberId).toBe('member-9');
  });

  it('rate limits once the per-window cap is exceeded', async () => {
    const app = makeApp({ RATE_LIMIT_PER_MINUTE: '2' });
    const req = () =>
      app.handle(new Request('http://localhost/health', { headers: { 'cf-connecting-ip': '1.2.3.4' } }));
    expect((await req()).status).toBe(200);
    expect((await req()).status).toBe(200);
    const third = await req();
    expect(third.status).toBe(429);
    const body = (await third.json()) as { error: { code: string } };
    expect(body.error.code).toBe('RATE_LIMITED');
  });

  it('propagates an incoming correlation id', async () => {
    const app = makeApp();
    const res = await app.handle(
      new Request('http://localhost/health', { headers: { 'x-correlation-id': 'corr-123' } }),
    );
    expect(res.headers.get('x-correlation-id')).toBe('corr-123');
  });

  it('rejects a revoked session at the gateway', async () => {
    const app = makeApp({}, fakeDb(true)); // revocation check returns true
    app.router.get('/protected', (_req, ctx) => new Response(ctx.memberId ?? ''), { auth: true });
    const { token } = await app.sessions.issue('member-9');
    const res = await app.handle(
      new Request('http://localhost/protected', { headers: { authorization: `Bearer ${token}` } }),
    );
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe('SESSION_EXPIRED');
  });
});
