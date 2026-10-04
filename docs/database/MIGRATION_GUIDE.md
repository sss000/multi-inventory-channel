# Migration Guide — Supabase PostgreSQL Schema Management

## 1. Governance & Principles
- **Version Controlled**: All database schema changes MUST be authored as declarative SQL migration files in `supabase/migrations/`.
- **Reproducible**: Migrations must apply cleanly and deterministically to any fresh PostgreSQL database instance.
- **Never Dashboard Only**: Schema changes must NEVER be applied directly through the Supabase Dashboard without a corresponding versioned migration file.

## 2. Directory Layout
```
supabase/
├── config.toml           # Supabase CLI configuration
├── seed.sql              # Development baseline seeds (channels, system roles, demo org)
└── migrations/
    ├── 20260928000001_core_schema.sql         # 25 core entities, enums, indexes, triggers
    └── 20260928000002_row_level_security.sql   # Multi-tenant RLS policies
```

## 3. Local Development & Application Commands
- **Start Supabase local stack**:
  ```bash
  npx supabase start
  ```
- **Apply migrations to local database**:
  ```bash
  npx supabase db push
  ```
- **Reset local database & re-run all migrations from scratch**:
  ```bash
  npx supabase db reset
  ```
- **Create a new migration**:
  ```bash
  npx supabase migration new <migration_name>
  ```

## 4. CI/CD Validation Gate
Every automated CI pipeline runs `npm test`, executing `tests/phase3-database.test.ts` to verify:
- Migration naming conventions and syntax.
- All 25 canonical tables exist with matching primary keys and tenant boundaries.
- Unique constraints on business keys (e.g. `skus(organization_id, code)`).
- RLS enabled across all tenant tables.
