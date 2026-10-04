# Environment Setup Runbook

## Required Environment Variables

All services load and validate environment variables at startup via `@platform/config`.

### Client & Public Variables (Safe for Next.js Browser Bundles)

| Variable | Description | Example (Development) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public endpoint for Supabase API | `http://127.0.0.1:54321` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable (anon) key | `sb_publishable_dev_key...` |
| `NEXT_PUBLIC_APP_URL` | Public URL for the merchant web app | `http://localhost:3000` |
| `NEXT_PUBLIC_API_URL` | Public URL for the API backend | `http://localhost:4000` |

### Server-Only Variables (STRICTLY FORBIDDEN IN CLIENT CODE)

| Variable | Description | Example (Development) |
|---|---|---|
| `SUPABASE_SECRET_KEY` | Privileged Supabase secret key (service role) | `sb_secret_dev_key...` |
| `DATABASE_URL` | Pooled PostgreSQL connection string for API & Worker | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| `DIRECT_URL` | Direct PostgreSQL connection string for migrations | `postgresql://postgres:postgres@127.0.0.1:54322/postgres` |
| `REDIS_URL` | Redis connection URL for BullMQ | `redis://127.0.0.1:6379` |
| `REDIS_HOST` | Redis host (alternative to REDIS_URL) | `127.0.0.1` |
| `REDIS_PORT` | Redis port | `6379` |
| `STRIPE_SECRET_KEY` | Stripe API Secret Key | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe Webhook Signing Secret | `whsec_...` |
| `PORT` | HTTP port for API (default: 4000) or apps | `4000` |
| `NODE_ENV` | Application environment | `development` / `test` / `production` |

## Security Rules
1. Never commit `.env` or `.env.local` files containing secrets.
2. Only `.env.example` with safe, placeholder development values may be committed.
3. Server-only keys (`SUPABASE_SECRET_KEY`, `DATABASE_URL`, `STRIPE_SECRET_KEY`) must never be prefixed with `NEXT_PUBLIC_`.
