import { AppError, ERROR_CODES, type SerialisedError } from '@iamfriendof/shared';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

/** Per-request context passed to handlers, populated by middleware. */
export interface RequestContext {
  correlationId: string;
  /** Authenticated member id, set by the auth middleware for protected routes. */
  memberId?: string;
  /** Path parameters extracted from the matched route pattern. */
  params: Record<string, string>;
  /** Parsed URL for convenience. */
  url: URL;
}

export type Handler = (req: Request, ctx: RequestContext) => Response | Promise<Response>;

interface Route {
  method: HttpMethod;
  /** Pattern like '/members/:id/profile'. */
  pattern: string;
  segments: string[];
  handler: Handler;
  /** Whether this route requires a valid session. */
  auth: boolean;
}

/**
 * Minimal, dependency-free router that runs on the Cloudflare Workers runtime
 * (no Express, which is not Workers-compatible). Supports `:param` segments.
 */
export class Router {
  private readonly routes: Route[] = [];

  add(method: HttpMethod, pattern: string, handler: Handler, opts: { auth?: boolean } = {}): this {
    this.routes.push({
      method,
      pattern,
      segments: splitPath(pattern),
      handler,
      auth: opts.auth ?? false,
    });
    return this;
  }

  get(pattern: string, handler: Handler, opts?: { auth?: boolean }): this {
    return this.add('GET', pattern, handler, opts);
  }
  post(pattern: string, handler: Handler, opts?: { auth?: boolean }): this {
    return this.add('POST', pattern, handler, opts);
  }
  put(pattern: string, handler: Handler, opts?: { auth?: boolean }): this {
    return this.add('PUT', pattern, handler, opts);
  }
  delete(pattern: string, handler: Handler, opts?: { auth?: boolean }): this {
    return this.add('DELETE', pattern, handler, opts);
  }

  /** Find a route matching method + path; returns the route and extracted params. */
  match(method: string, pathname: string): { route: Route; params: Record<string, string> } | undefined {
    const reqSegments = splitPath(pathname);
    for (const route of this.routes) {
      if (route.method !== method) continue;
      const params = matchSegments(route.segments, reqSegments);
      if (params) return { route, params };
    }
    return undefined;
  }
}

function splitPath(path: string): string[] {
  return path.split('/').filter((s) => s.length > 0);
}

function matchSegments(routeSegs: string[], reqSegs: string[]): Record<string, string> | undefined {
  if (routeSegs.length !== reqSegs.length) return undefined;
  const params: Record<string, string> = {};
  for (let i = 0; i < routeSegs.length; i++) {
    const r = routeSegs[i]!;
    const v = reqSegs[i]!;
    if (r.startsWith(':')) {
      params[r.slice(1)] = decodeURIComponent(v);
    } else if (r !== v) {
      return undefined;
    }
  }
  return params;
}

/** JSON response helper that always sets content-type and correlation id. */
export function json(body: unknown, status = 200, correlationId?: string): Response {
  const headers: Record<string, string> = { 'content-type': 'application/json; charset=utf-8' };
  if (correlationId) headers['x-correlation-id'] = correlationId;
  return new Response(JSON.stringify(body), { status, headers });
}

/** Convert any thrown value into a structured JSON error response. */
export function errorResponse(err: unknown, correlationId: string): Response {
  if (AppError.isAppError(err)) {
    return json(err.toJSON(), err.httpStatus, correlationId);
  }
  const body: SerialisedError = {
    error: { code: ERROR_CODES.INTERNAL_ERROR, message: 'An unexpected error occurred' },
  };
  return json(body, 500, correlationId);
}
