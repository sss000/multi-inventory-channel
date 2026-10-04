# Health, Readiness, and Liveness Checks Runbook

## Overview

The platform implements multi-tier health and readiness probes to satisfy container orchestrators (Kubernetes / Docker Compose), internal monitoring agents, and developer diagnostic workflows.

## API Health Endpoints (`apps/api`)

| Endpoint | Type | Purpose | Dependencies Checked |
|---|---|---|---|
| `GET /health` | Basic Ping | High-frequency container ping | Process state only |
| `GET /health/live` | Liveness | Kubernetes Liveness Probe | Event loop responsiveness, memory usage |
| `GET /health/ready` | Readiness | Kubernetes Readiness Probe | Postgres TCP, Redis PING, Auth API, Storage API, Environment |
| `GET /health/supabase` | Component Probe | Deep Supabase diagnostics | Supabase Postgres, Supabase Auth, Supabase Storage |
| `GET /health/redis` | Component Probe | Deep Redis diagnostics | TCP socket connect + Redis `*1\r\n$4\r\nPING\r\n` -> `+PONG` |
| `GET /api/v1/status` | Application API | Operational status envelope | Tenancy model, version, correlation ID |

## Security Invariants for Health Probes

1. **Zero Secret Leakage:**
   - Database connection strings, Supabase secret keys, Redis passwords, and tokens are NEVER exposed in health payloads.
   - Payloads only expose sanitized hostnames, ports, HTTP status codes, and latency in milliseconds.
2. **Actual Dependency Verification:**
   - A health check claiming "healthy" for a database or Redis must execute an actual network connection or query. Merely verifying that an environment variable is populated is treated as `unconfigured`, not `healthy`.
3. **HTTP Status Codes:**
   - `200 OK`: All checked dependencies are operational (`READY` / `healthy`).
   - `503 Service Unavailable`: One or more critical dependencies failed or timed out (`NOT_READY` / `unhealthy`).

## Worker Health Probes (`apps/worker`)

The background worker exposes programmatic health reporting:
```typescript
import { startWorker } from "@platform/worker";

const worker = startWorker();
const report = await worker.checkHealth();
console.log(report.status); // "healthy" | "unhealthy"
```
Verifies active connectivity to both Redis and Supabase Postgres.
