# Local Development Infrastructure Runbook

## Prerequisites
- Node.js >= 20 (Verified: Node.js v24.21.0)
- npm >= 10 (Verified: npm v11.19.0)
- Docker Desktop (Required for running local Supabase stack & Redis containers)

## Starting the Local Environment

### 1. Start the Local Supabase Stack
```bash
npx supabase start
```
This boots:
- Supabase Postgres: `postgresql://postgres:postgres@127.0.0.1:54322/postgres`
- Supabase Auth: `http://127.0.0.1:54321/auth/v1`
- Supabase Storage: `http://127.0.0.1:54321/storage/v1`
- Supabase Studio Dashboard: `http://127.0.0.1:54323`

### 2. Start Local Redis
Using Docker:
```bash
docker run -d --name platform-redis -p 6379:6379 -v $(pwd)/infrastructure/redis/redis.conf:/usr/local/etc/redis/redis.conf redis:7-alpine redis-server /usr/local/etc/redis/redis.conf
```
Or with full Docker Compose:
```bash
docker compose up -d redis
```

### 3. Start Application Services
```bash
# Build all workspaces
npm run build

# Start services individually or concurrently
npm run start --workspace=@platform/api     # Port 4000
npm run start --workspace=@platform/worker  # Background runner
npm run start --workspace=@platform/web     # Port 3000
npm run start --workspace=@platform/admin   # Port 3001
```

## Verifying Local Stack Health
See [docs/runbooks/HEALTH_CHECKS.md](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/docs/runbooks/HEALTH_CHECKS.md) for endpoint specifications and verification steps.
