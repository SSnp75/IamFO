import { createApp } from './app';
import type { EnvBag } from './config';

/**
 * Cloudflare Workers entry point. The `env` binding carries secrets/vars.
 * The app is created lazily on first request and cached per instance.
 */
let cached: ReturnType<typeof createApp> | undefined;

let migrated = false;

export default {
  async fetch(request: Request, env: EnvBag): Promise<Response> {
    if (!cached) cached = createApp(env);
    // Run migrations once per instance on first request (idempotent).
    if (!migrated) {
      migrated = true;
      try {
        await cached.migrate();
      } catch (err) {
        // Do not crash the instance if migrations fail; log and continue so
        // health checks still work and the error is visible.
        // eslint-disable-next-line no-console
        console.error('[startup] migration failed', err);
      }
    }
    return cached.handle(request);
  },
};

/**
 * Local development entry point (Node via `tsx`). Only runs when executed
 * directly, not when imported by the Workers runtime. Uses Node's built-in
 * http server so no extra dependency is needed.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isNodeMain = typeof (globalThis as any).process !== 'undefined'
  && (globalThis as any).process?.argv?.[1]?.includes('main');

if (isNodeMain) {
  // Dynamic imports so the Workers bundle never pulls in Node builtins.
  void (async () => {
    const { createServer } = await import('node:http');
    const app = createApp(process.env as EnvBag);
    const port = Number(process.env.PORT ?? '8787');

    // Apply migrations before accepting traffic locally.
    try {
      const applied = await app.migrate();
      // eslint-disable-next-line no-console
      console.log(`[startup] migrations applied: ${applied.length ? applied.join(', ') : 'none'}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[startup] migration failed', err);
    }

    const server = createServer(async (nodeReq, nodeRes) => {
      const chunks: Buffer[] = [];
      for await (const chunk of nodeReq) chunks.push(chunk as Buffer);
      const body = chunks.length ? Buffer.concat(chunks) : undefined;

      const request = new Request(`http://localhost:${port}${nodeReq.url ?? '/'}`, {
        method: nodeReq.method,
        headers: nodeReq.headers as Record<string, string>,
        body: nodeReq.method === 'GET' || nodeReq.method === 'HEAD' ? undefined : body,
      });

      const response = await app.handle(request);
      nodeRes.statusCode = response.status;
      response.headers.forEach((value, key) => nodeRes.setHeader(key, value));
      const text = await response.text();
      nodeRes.end(text);
    });

    server.listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`IamFriendof (Phase 0) listening on http://localhost:${port}`);
    });
  })();
}
