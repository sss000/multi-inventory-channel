# System Architecture Overview

## Core System Flow

The platform functions as an inventory truth and reconciliation engine:

```text
External Channels (Shopify, Amazon, eBay, Walmart)
        │
        ▼ (Webhooks / Inbound polling)
[ Provider Adapters (packages/integrations) ]
        │
        ▼
[ Normalized Events ]
        │
        ▼
[ Internal Inventory Ledger (packages/domain) ]
  - Immutable Event Log
  - Strict Ledger Balance Formula:
    available = on_hand - reserved - allocated + incoming
        │
        ▼
[ Orders & Reservations ]
        │
        ▼
[ Synchronization Orchestrator (apps/worker + BullMQ) ]
        │
        ▼
[ Verification Engine ]
  - Read-back verification (Ack != Verified)
        │
        ▼
[ Reconciliation Engine ]
  - Discrepancy detection & classification
        │
        ▼
[ Exception Management & Audit ]
```

## Supabase Managed Platform Integration

- **PostgreSQL Database:** Supabase Postgres provides the underlying ACID-compliant storage with connection pooling.
- **Row Level Security:** Defense-in-depth security layer ensuring multi-tenant isolation.
- **Supabase Auth:** Centralized identity and JWT management.
- **Supabase Storage:** S3-compatible managed object store for reports, inventory exports, and legacy migration uploads.
