# Database Infrastructure

## Managed Platform: Supabase PostgreSQL

As mandated by `AGENTS.md` and `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md`:
- **Production & Staging:** Supabase PostgreSQL with connection pooling.
- **Local Development:** Supabase CLI local stack (`supabase start`) hosting local PostgreSQL, Auth, and Storage.
- **Security:** PostgreSQL Row Level Security (RLS) enabled on all tenant-scoped tables as defense-in-depth, alongside server-side authorization.

## Connection Modes
- **Pooled URL (`DATABASE_URL`):** Used by trusted server-side API (`apps/api`) and worker (`apps/worker`) processes via Supabase Connection Pooler (PgBouncer/Supavisor).
- **Direct URL (`DIRECT_URL`):** Used for database migrations, schema generation, and administrative DDL operations.
