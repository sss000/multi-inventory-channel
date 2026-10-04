# Multichannel Inventory Control Platform — Project Governance

This project is governed by the specification package in `/specifications`.

## Authority

The following documents form one coordinated contract:

1. `specifications/00_MASTER_ORCHESTRATION.md`
2. `specifications/01_ENGINEERING_SPEC.md`
3. `specifications/02_PRODUCT_DESIGN_SPEC.md`
4. `specifications/03_FRONTEND_SPEC.md`
5. `specifications/04_HUMAN_UX_SPEC.md`
6. `specifications/05_VALIDATION_GATE.md`
7. `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md`

Read and follow the Master Orchestration document first.

The five canonical specifications remain authoritative for their respective domains.

The Sequential Prompt Pack is an execution layer and must not override the specifications.

## Mandatory rules

- Do not silently weaken, remove, reinterpret, or replace requirements.
- Do not invent unsupported provider capabilities.
- Do not create fake production functionality.
- Do not use mock data as production functionality.
- Do not claim functionality is verified without evidence.
- Do not claim production readiness without satisfying the applicable production gates.
- Never make the frontend the authority for security, tenancy, permissions, billing, or inventory truth.
- Never mutate inventory outside the inventory domain.
- Never treat a queued operation as completed.
- Never treat an acknowledged external write as verified until the required read-back verification succeeds.
- Never silently hide conflicts or material partial failures.
- Never silently fall back to fabricated provider data.
- Preserve tenant isolation.
- Preserve auditability of material mutations.
- Preserve idempotency and concurrency guarantees.
- Follow the canonical implementation dependency order.

## Supabase architecture

The project uses:

- Supabase PostgreSQL for the primary relational database.
- Supabase Auth for authentication and identity authentication infrastructure.
- Supabase Storage for object/file storage where specified.
- PostgreSQL RLS for appropriate database-level tenant protection.
- Redis + BullMQ for durable background jobs and synchronization workloads.
- Node.js/TypeScript/NestJS or the specified equivalent backend architecture.
- Next.js/React/TypeScript frontend architecture.
- Stripe Billing.
- OpenTelemetry-compatible observability.

Do not replace Redis/BullMQ with Supabase services merely because Supabase is present.

Do not move domain truth into client-side Supabase calls.

The backend/domain layer remains authoritative for inventory mutations and business rules.

## Canonical lifecycle

Use:

SPECIFIED
→ IMPLEMENTED
→ VERIFIED
→ USER-VALIDATED
→ PRODUCTION-READY

For purely technical components where human validation does not apply, USER-VALIDATED may be NOT APPLICABLE.

Never use DONE, COMPLETE, or FINISHED as a substitute for the canonical lifecycle.

## Implementation behavior

Before implementing a major subsystem:

1. Read the relevant section of the Master Orchestration document.
2. Read the applicable source specifications.
3. Identify dependencies.
4. Identify permissions and security requirements.
5. Identify required states and failure states.
6. Implement the required domain/API behavior.
7. Implement tests.
8. Implement the frontend where applicable.
9. Validate the implementation.
10. Record evidence.
11. Only then advance the lifecycle state.

If a genuine conflict exists between specifications:

STOP.

Do not choose an interpretation silently.

Document the conflict, identify the conflicting requirements, and request resolution.