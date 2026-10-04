# Redis Infrastructure

## Durable Background Queue & Cache: Redis + BullMQ

As mandated by `AGENTS.md` and `specifications/01_ENGINEERING_SPEC.md` (Section 5 & 212):
- **Role:** Asynchronous background job processing, durable rate limiting, and synchronization orchestration.
- **Library:** `ioredis` connection driver with `bullmq` queue management.
- **Invariant:** Redis is strictly an asynchronous job queue and transient cache. It MUST NEVER be used as the authoritative store for inventory truth.
- **Connection Configuration:** Configured via `REDIS_URL` or `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`.
