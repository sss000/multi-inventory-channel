# Deployment Infrastructure

## Monorepo Deployment Targets

1. **`apps/web`**: Next.js user-facing storefront & merchant portal (SSR/SSG on Vercel or Node/Docker container).
2. **`apps/admin`**: Next.js internal operational and support portal.
3. **`apps/api`**: Node.js/NestJS REST application server (Docker container, horizontally scalable stateless service).
4. **`apps/worker`**: Node.js BullMQ asynchronous worker (Docker container, horizontally scalable background worker).

Environments:
- `development`: Local development stack (Supabase CLI, local Redis).
- `staging`: Staging Supabase project, hosted Redis cluster, staging external channel sandboxes.
- `production`: High-availability Supabase Postgres, managed Redis, production provider credentials.
