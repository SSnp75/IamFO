# Phase 0 Stack (No-Cost Launch)

This document records the free-tier providers used for the $0 launch, their
limits, and the signals that indicate it is time to consider a paid phase. All
providers can be provisioned with a GitHub login and require no payment card.

## Providers

| Concern | Provider | Free-tier limit (approx, verify at signup) | Notes |
|---------|----------|--------------------------------------------|-------|
| Source + CI/CD | GitHub + GitHub Actions | 2,000 Actions min/mo (private); unlimited for public | Deploy on push to `main` |
| Hosting / compute | Cloudflare Workers | 100,000 requests/day; 10 ms CPU/request | Global edge, built-in CDN |
| Static site | Cloudflare Pages | Unlimited requests; 500 builds/mo | Frontend assets |
| Database | Neon Postgres | ~0.5 GB storage; autosuspend (scale to zero) | Single DB, all schemas |
| Search | PostgreSQL full-text (in Neon) | n/a (uses DB) | GIN + tsvector; no OpenSearch |
| Object storage | Cloudflare R2 | 10 GB storage; zero egress fees | Profile images |
| CDN | Cloudflare (included) | Generous | Serves R2 + static assets |
| Email | Resend | ~3,000 emails/mo, 100/day | Verification + notifications |
| Sessions | JWT (HS256) + Postgres | n/a | No Redis |
| Rate limiting | In-memory / Cloudflare + Postgres | n/a | No Redis |
| Async work | In-process bus + Cloudflare Cron | Cron every 5 min | No broker |

Total mandatory cost: **$0**.

## Provisioning checklist (GitHub login only)

1. Create the GitHub repo and push this project; enable Actions.
2. Sign in to **Neon** with GitHub, create a project, copy the connection string.
3. Sign in to **Cloudflare** with GitHub; create a Workers project bound to the repo; create an R2 bucket `iamfriendof-media`.
4. Sign in to **Resend** with GitHub, create an API key.
5. Add GitHub repo secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
6. Set Worker secrets once: `wrangler secret put JWT_SECRET`, `wrangler secret put DATABASE_URL`, `wrangler secret put EMAIL_API_KEY`.

## DEPLOY_PHASE flag

The `DEPLOY_PHASE` env var selects infrastructure implementations behind stable
interfaces:

- `0` (default): in-process event bus, Postgres full-text search, JWT + DB/edge
  rate limiting. No broker, no Redis, no OpenSearch.
- `1` / `2`: swap in managed cache, read replicas, a broker, and OpenSearch as
  those tasks (23.x) are implemented — behind the same `MessageBus`,
  `RateLimitStore`, and search interfaces, so business logic does not change.

## Phase transition triggers (owner-decided, never automatic)

Move toward Phase 1/2 when any of these is regularly hit. The platform surfaces
the signal; upgrading is a manual decision (Requirement 15.7).

| Signal | Review threshold |
|--------|------------------|
| Neon storage | > ~70% of free limit |
| Neon compute / cold starts | Autosuspend wake latency hurting UX |
| Workers requests | Approaching 100k/day |
| Search latency | p95 search > 2 s under real load |
| Async delay | Notification delivery drifting past Req 11 windows (60 s / 5 min) |
| Email volume | Approaching Resend free monthly cap |

See `design.md` -> "Deployment and Cost Phasing" for the full Phase 1 and Phase 2
target topologies and the migration path.
