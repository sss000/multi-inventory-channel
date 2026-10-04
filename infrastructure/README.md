# Platform Infrastructure

## Overview

This directory coordinates the local, staging, and production infrastructure for the Multichannel Inventory Control Platform.

### Components

1. **Supabase Local Development Stack (`supabase/`):**
   - Managed PostgreSQL database (port 54322, shadow port 54320).
   - Supabase Auth service (`http://127.0.0.1:54321/auth/v1`).
   - Supabase Storage service (`http://127.0.0.1:54321/storage/v1`).
   - Supabase Studio local dashboard (`http://127.0.0.1:54323`).
   - Managed via Supabase CLI: `npx supabase start` / `npx supabase stop`.

2. **Redis + BullMQ Queue Stack (`infrastructure/redis/`):**
   - Redis 7 with `maxmemory-policy noeviction` and AOF append-only persistence.
   - Hosts durable background queues for external channel synchronization, webhook ingestion, and reconciliation jobs.

3. **Containerized Multi-Service Deployment (`docker-compose.yml`):**
   - Reproducible orchestration for `redis`, `api`, `worker`, `web`, and `admin`.

4. **Health & Observability Infrastructure (`infrastructure/monitoring/`):**
   - Deep health, readiness, and liveness endpoints across all services.
