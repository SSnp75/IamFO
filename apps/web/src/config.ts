/**
 * Runtime configuration for the Phase 0 modular monolith.
 *
 * On Cloudflare Workers these come from the `env` binding; locally they come
 * from process.env. DEPLOY_PHASE selects Phase 0 stand-ins (in-process bus,
 * Postgres search, JWT/DB rate limiting) vs later paid-scale implementations.
 */
export interface AppConfig {
  deployPhase: '0' | '1' | '2';
  jwtSecret: string;
  databaseUrl: string;
  /** Requests allowed per IP per window. */
  rateLimitPerMinute: number;
  /** R2 / object storage public base URL for images (optional in Phase 0 dev). */
  mediaPublicBaseUrl?: string;
  /** Email provider API key (Resend/Brevo), optional in dev. */
  emailApiKey?: string;
}

/** Raw environment bag: Workers `env` or Node `process.env`. */
export type EnvBag = Record<string, string | undefined>;

const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me-please-32b';

export function loadConfig(env: EnvBag): AppConfig {
  const deployPhase = (env.DEPLOY_PHASE ?? '0') as AppConfig['deployPhase'];
  const jwtSecret = env.JWT_SECRET ?? (deployPhase === '0' ? DEV_JWT_SECRET : '');
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error('JWT_SECRET must be set to at least 32 characters');
  }
  return {
    deployPhase,
    jwtSecret,
    databaseUrl: env.DATABASE_URL ?? '',
    rateLimitPerMinute: Number(env.RATE_LIMIT_PER_MINUTE ?? '1000'),
    mediaPublicBaseUrl: env.MEDIA_PUBLIC_BASE_URL,
    emailApiKey: env.EMAIL_API_KEY,
  };
}
