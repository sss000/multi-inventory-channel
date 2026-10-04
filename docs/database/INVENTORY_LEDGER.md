# Inventory Ledger & Transactional Integrity

**Canonical Specifications:** `00_MASTER_ORCHESTRATION.md`, `01_ENGINEERING_SPEC.md` (Sections 15, 16, 27)  
**Sequential Prompts:** Prompt 08 (Phase 7: Inventory Ledger)  
**Package:** `@platform/database` (`packages/database/src/ledger.ts`)  
**Status:** `VERIFIED`

---

## 1. Overview & Core Integrity Rules

The Inventory Ledger is the platform's core integrity subsystem. It governs physical on-hand quantities, reservations, allocations, and immutable event auditing across all warehouses.

### Core Non-Negotiable Invariants:
1. **Dynamic Available Derivation**: Available inventory is **never** stored as an independently editable column. Storing available independently causes drift, race conditions, and phantom stock.
   $$\text{available} = \text{on\_hand} - \text{reserved} - \text{safety\_stock} - \text{damaged} - \text{quarantined} - \text{allocated}$$
2. **Double-Entry Auditability**: Every balance mutation produces an immutable `inventory_events` record with before/after state captures, actor attribution, source tracking, and correlation IDs.
3. **Strict Non-Negative Bounds**: Database check constraints and domain validators reject any mutation that reduces `on_hand`, `reserved`, `allocated`, `damaged`, `quarantined`, or `safety_stock` below zero.
4. **Idempotency Guarantee**: Requests specifying an `idempotency_key` never apply duplicate mutations to inventory balances.

---

## 2. Database Schema

### `inventory_balances`
One record per `organization_id + sku_id + warehouse_id`:
```sql
CREATE TABLE inventory_balances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
    on_hand INTEGER NOT NULL DEFAULT 0 CHECK (on_hand >= 0),
    reserved INTEGER NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    allocated INTEGER NOT NULL DEFAULT 0 CHECK (allocated >= 0),
    damaged INTEGER NOT NULL DEFAULT 0 CHECK (damaged >= 0),
    quarantined INTEGER NOT NULL DEFAULT 0 CHECK (quarantined >= 0),
    in_transit INTEGER NOT NULL DEFAULT 0 CHECK (in_transit >= 0),
    incoming INTEGER NOT NULL DEFAULT 0 CHECK (incoming >= 0),
    safety_stock INTEGER NOT NULL DEFAULT 0 CHECK (safety_stock >= 0),
    version INTEGER NOT NULL DEFAULT 1 CHECK (version >= 1),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(organization_id, sku_id, warehouse_id)
);
```

### `inventory_events`
Immutable audit log recording every inventory state transition:
```sql
CREATE TABLE inventory_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    sku_id UUID NOT NULL REFERENCES skus(id) ON DELETE RESTRICT,
    warehouse_id UUID NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
    event_type inventory_event_type NOT NULL,
    quantity_delta INTEGER NOT NULL,
    source_type inventory_source_type NOT NULL,
    source_id TEXT NOT NULL,
    order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
    reservation_id UUID REFERENCES inventory_reservations(id) ON DELETE SET NULL,
    before_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    after_state JSONB NOT NULL DEFAULT '{}'::jsonb,
    idempotency_key TEXT UNIQUE,
    correlation_id UUID NOT NULL,
    actor_type actor_type NOT NULL,
    actor_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## 3. Supported Mutation Operations

`InventoryLedgerService` provides transactional methods for all business events:

| Operation | Purpose | Balance State Transition | Emitted Event |
| :--- | :--- | :--- | :--- |
| **`recordInitialImport`** | Initial baseline stock ingestion | Sets `on_hand`, `safety_stock`, `version = 1` | `INITIAL_IMPORT` |
| **`recordPurchaseReceipt`** | Supplier delivery arrival | Increments `on_hand += Q`, decrements `incoming` | `PURCHASE_RECEIPT` |
| **`recordManualAdjustment`** | Inventory correction (+ or -) | Adjusts `on_hand += \Delta`, rejects negative stock | `MANUAL_ADJUSTMENT` |
| **`recordRecount`** | Warehouse physical cycle count | Sets `on_hand = physicalCount`, computes delta | `RECOUNT` |
| **`recordDamage`** | Defective stock segregation | Increments `damaged += Q`, decreases sellable | `DAMAGE` |
| **`recordWarehouseTransfer`**| Multi-warehouse transfer | Atomic source debit (`-Q`) and destination credit (`+Q`) | `WAREHOUSE_TRANSFER` (x2) |
| **`recordReconciliationCorrection`** | Discrepancy alignment | Adjusts `on_hand += \Delta` per marketplace audit | `RECONCILIATION` |
| **`reserveInventory`** | Order placement | Increments `reserved += Q`, decreases available | `ORDER_RESERVATION` |
| **`releaseReservation`** | Order cancellation | Decrements `reserved -= Q`, restores available | `ORDER_RELEASE` |
| **`fulfillReservation`** | Order shipment | Decrements `on_hand -= Q` and `reserved -= Q` | `ORDER_FULFILLMENT` |

---

## 4. Concurrency Control & The Critical Concurrency Test

Under high-volume ecommerce conditions (e.g. flash sales, multi-channel simultaneous orders), multiple transactions attempt to claim stock concurrently.

### Concurrency Mechanisms:
1. **Balance-Key Serialization**: `withBalanceLock(orgId, skuId, warehouseId)` serializes mutations targeting the same SKU-warehouse balance, ensuring transactions evaluate real-time available stock.
2. **Multi-Key Deadlock Prevention**: `withMultiLock` sorts balance keys lexicographically before acquisition, preventing circular wait deadlocks during warehouse transfers.
3. **Optimistic Locking**: Every mutation increments `version`. Updates verify `version` against the expected state.

### Critical Concurrency Acceptance Gate:
```
Transaction A: Reserve 1 unit on SKU (Available = 1)  ──┐
                                                        ├─► Handled concurrently
Transaction B: Reserve 1 unit on SKU (Available = 1)  ──┘
```
**Expected & Verified Result:**
1. Transaction A acquires the balance lock first. It reads `available = 1`, increments `reserved` to 1 (`available` drops to 0), increments `version`, and succeeds.
2. Transaction B acquires the balance lock second. It reads `available = 0`. Since `0 < 1`, it immediately fails with `InsufficientInventoryError`.
3. **Final balance state**: `on_hand = 1`, `reserved = 1`, `available = 0`.
4. **Invariant**: Stock is **never oversold or driven negative** by concurrent race conditions.

---

## 5. Verification Evidence

- **Automated Acceptance Suite**: [`tests/phase7-inventory-ledger.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase7-inventory-ledger.test.ts)
  - 17 tests passed across 7 test suites.
  - Critical concurrency test with 2 simultaneous transactions: passed (1 success, 1 failure).
  - High-contention race test with 10 simultaneous transactions for 3 remaining units: passed (exactly 3 successes, 7 failures).
  - Idempotency deduplication: passed.
  - Atomic multi-warehouse transfer: passed.
- **Repository Regression Suite**: **132 passing tests across 48 test suites with 0 failures** (`npm test`).
- **Type Checking**: Clean (`npm run typecheck` passes with code 0).
- **Build**: Clean (`npm run build` passes with code 0).
