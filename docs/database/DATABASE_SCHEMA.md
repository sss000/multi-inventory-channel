# Database Schema Specification — Multichannel Inventory Control Platform

## 1. Architectural Overview & Design Invariants

The database layer runs on **Supabase PostgreSQL 17** with multi-tenant isolation enforced at two defense layers:
1. **Server-Side Application Layer**: Strictly enforces tenant boundaries (`organization_id`) and transactional consistency for all domain writes.
2. **PostgreSQL Row Level Security (RLS)**: Defense-in-depth security model ensuring authenticated database sessions cannot read or write data across organizational boundaries.

### Fundamental Invariants
- **UUID Identifiers**: Every entity uses UUID primary keys generated via `gen_random_uuid()`.
- **Tenant Isolation**: Every tenant-scoped entity carries a direct `organization_id` foreign key with an `ON DELETE CASCADE` relationship to `organizations(id)` (or transitive isolation for sub-line items like `order_items` and `purchase_order_items`).
- **No Direct Inventory Mutations via REST**: Core inventory mutations MUST NOT depend on the auto-generated Supabase REST API; all mutations flow through the server-side domain transaction boundary.
- **Inventory Balance Invariant**:
  $$\text{available} = \text{on\_hand} - \text{reserved} - \text{safety\_stock} - \text{damaged} - \text{quarantined} - \text{allocated}$$
- **Immutable Audit & Event Logs**: `inventory_events` and `audit_logs` are strictly append-only.

---

## 2. Core Entities (25 Canonical Tables)

| Entity Name | Description | Tenant Key | Critical Constraints |
| :--- | :--- | :--- | :--- |
| `organizations` | Multi-tenant merchant accounts | `id` | `slug` UNIQUE |
| `users` | Application user profiles | — | `email` UNIQUE |
| `roles` | RBAC roles (system global + custom) | `organization_id` (nullable) | UNIQUE(organization_id, name) |
| `memberships` | User-to-Organization role assignments | `organization_id` | UNIQUE(organization_id, user_id) |
| `products` | Top-level catalog products | `organization_id` | Foreign key to `organizations` |
| `skus` | Stock Keeping Units (tenant-scoped) | `organization_id` | UNIQUE(organization_id, code) |
| `product_variants` | Sellable product variations | `organization_id` | Foreign keys to `products`, `skus` |
| `channels` | Global provider registry | — | `provider` UNIQUE |
| `channel_accounts` | Connected merchant channel credentials | `organization_id` | UNIQUE(organization_id, channel_id, external_account_id) |
| `channel_product_mappings` | Mapping of internal SKUs to external channel items | `organization_id` | UNIQUE(organization_id, channel_account_id, external_product_id, external_variant_id) |
| `warehouses` | Physical, 3PL, and virtual fulfillment locations | `organization_id` | Foreign key to `organizations` |
| `inventory_balances` | Real-time inventory balances per SKU & location | `organization_id` | UNIQUE(organization_id, sku_id, warehouse_id), non-negative checks |
| `inventory_reservations` | Allocated order reservations | `organization_id` | Foreign keys to `skus`, `warehouses`, `orders` |
| `orders` | Normalized multichannel customer orders | `organization_id` | UNIQUE(organization_id, channel_account_id, external_order_id) |
| `order_items` | Individual line items within orders | Transitive | `quantity > 0` CHECK |
| `inventory_events` | Immutable inventory ledger event stream | `organization_id` | `idempotency_key` UNIQUE |
| `returns` | Multichannel order returns | `organization_id` | UNIQUE(organization_id, external_return_id) |
| `suppliers` | External vendors and purchase suppliers | `organization_id` | Foreign key to `organizations` |
| `purchase_orders` | Incoming stock procurement orders | `organization_id` | Foreign keys to `suppliers` |
| `purchase_order_items` | Line items for purchase orders | Transitive | `ordered_quantity > 0` CHECK |
| `sync_jobs` | Outbound channel inventory sync queue | `organization_id` | `idempotency_key` UNIQUE |
| `reconciliation_runs` | Periodic or on-demand channel truth reconciliation | `organization_id` | Foreign key to `channel_accounts` |
| `reconciliation_results` | SKU-level discrepancy analysis records | Transitive | Discrepancy classifications |
| `exceptions` | Operational and synchronization exception inbox | `organization_id` | Severity, status, root-cause metadata |
| `audit_logs` | Immutable audit trail for material system events | `organization_id` | Correlation ID, actor details |

---

## 3. Concurrency Control & Mutation Boundaries

To eliminate race conditions (e.g. overselling the final unit across two simultaneous checkout flows):
1. **Server/Domain Isolation**: Outbound updates and reservations run inside `withTransactionBoundary`.
2. **Optimistic Locking**: `inventory_balances` carries a `version` integer incremented on every mutation. Before writing, services assert the expected version.
3. **Pessimistic Locking Option**: High-concurrency operations execute `SELECT ... FOR UPDATE` on `inventory_balances` rows within an active database transaction.

---

## 4. Row Level Security (RLS) Model

All tables in the schema have RLS enabled via `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`.

- **Helper Function**:
  ```sql
  CREATE OR REPLACE FUNCTION current_user_organization_ids()
  RETURNS SETOF UUID AS $$
      SELECT organization_id FROM memberships WHERE user_id = auth.uid();
  $$ LANGUAGE sql STABLE SECURITY DEFINER;
  ```
- **Policy Pattern**:
  Authenticated users are granted `SELECT` / `ALL` access strictly where `organization_id IN (SELECT current_user_organization_ids())`.
- **System Bypass**:
  Internal domain services connect via the Supabase secret `service_role` key, which holds PostgreSQL `BYPASSRLS` privileges for backend orchestration.
