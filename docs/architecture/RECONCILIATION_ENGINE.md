# Reconciliation Engine Architecture & Specification

## 1. Overview & Authority
The Reconciliation Engine is the platform's core discrepancy detection, root-cause analysis, and safe correction subsystem. It audits internal inventory balances against external sales channel inventories (Shopify, Amazon SP-API, eBay, Walmart), identifies divergences, determines deterministic causes, and executes safe corrections or routes to operator approval.

**Governing Specifications:**
- `specifications/01_ENGINEERING_SPEC.md` (Sections 29, 30, 31, 53)
- `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md` (Prompt 19: Phase 18 — Reconciliation Engine)
- Current Canonical Lifecycle State: `VERIFIED`

---

## 2. Discrepancy Classification Taxonomy

All comparisons between internal inventory balances and external channel snapshots evaluate to one of 7 canonical classifications:

```
                          ┌─────────────┐
                          │   Compare   │
                          │ Q_int, Q_ext│
                          └──────┬──────┘
                                 │
         ┌───────────────┬───────┴────────┬───────────────┐
         ▼               ▼                ▼               ▼
     [MATCH]    [MINOR_DIFFERENCE] [MATERIAL_DIFF] [STALE_EXTERNAL]
   (diff == 0)   (|diff| <= minor)  (|diff| > minor) (age > TTL & !=)
         │
         ├───────────────────────┐
         ▼                       ▼
 [MISSING_EXTERNAL]      [MISSING_INTERNAL]      [UNKNOWN]
 (int exists, ext=null)  (ext exists, int=null)  (int=null, ext=null)
```

| Classification | Meaning | Criteria | Safe Auto-Reconciliation? |
| :--- | :--- | :--- | :---: |
| `MATCH` | Quantities are perfectly aligned. | `externalQuantity === internalQuantity` (difference 0) | Yes (`NO_ACTION`) |
| `MINOR_DIFFERENCE` | Difference is within configurable threshold. | `0 < \|difference\| <= minorDifferenceThreshold` | Yes (if delta <= autoMaxDelta & no competing events) |
| `MATERIAL_DIFFERENCE` | Difference exceeds minor threshold. | `\|difference\| > minorDifferenceThreshold` | **Strictly Forbidden** (`REQUIRES_APPROVAL`) |
| `MISSING_EXTERNAL` | SKU exists in internal catalog but missing on channel. | `internalQuantity !== null && externalQuantity === null` | **Strictly Forbidden** (`REQUIRES_APPROVAL`) |
| `MISSING_INTERNAL` | SKU reported by channel but unmapped internally. | `internalQuantity === null && externalQuantity !== null` | **Strictly Forbidden** (`REQUIRES_APPROVAL`) |
| `STALE_EXTERNAL` | External snapshot timestamp exceeds TTL freshness. | Snapshot age > `staleThresholdMs` (default 5m) & diff != 0 | **Strictly Forbidden** (Refresh snapshot first) |
| `UNKNOWN` | Both counts missing / corrupted. | Both null / undefined | **Strictly Forbidden** (`REQUIRES_APPROVAL`) |

---

## 3. Deterministic Causes Evaluation (Prompt 19)

The reconciliation engine **must not automatically assume the external channel is wrong** (Section 30). It deterministically inspects historical and active events before AI or heuristic analysis across 10 deterministic causes:

1. **`DELAYED_UPDATE`**: An outbound synchronization job was recently transmitted or acknowledged and is still propagating across channel caches/event queues.
2. **`EXTERNAL_ORDER`**: Channel reported a lower count due to recent external orders pending import or ledger reservation.
3. **`CANCELLATION`**: Recent order cancellation restored stock on marketplace or internal ledger.
4. **`RETURN`**: Recent return receipt or RMA processed into inventory.
5. **`MANUAL_MARKETPLACE_ADJUSTMENT`**: Merchant manually updated inventory on channel portal (e.g. Seller Central).
6. **`WAREHOUSE_ADJUSTMENT`**: Physical warehouse cycle recount or damage event adjusted internal balance.
7. **`MAPPING_ERROR`**: Unmapped external listing or mismatched SKU identifiers.
8. **`STALE_CACHE`**: External API returned cached snapshot exceeding freshness window.
9. **`SYNCHRONIZATION_FAILURE`**: Discrepancy corresponds to a recent failed or conflicted synchronization job.
10. **`CHANNEL_SPECIFIC_LOGIC`**: Marketplace applied fulfillment channel isolation (e.g. Amazon FBA vs MFN) or buffer reservation.

---

## 4. CRITICAL MUTATION RULE (Mandatory Invariant)

### The Invariant
> **A detected external discrepancy must NOT by itself mutate the internal inventory ledger.**

```
Detect Discrepancy
       ↓
    Classify
       ↓
 Gather Evidence
       ↓
Determine Source of Truth
       ↓
Determine Safe Correction Direction
       ↓
Approval Required?
  ├── Yes ──► [REQUIRES_APPROVAL] (Pending Operator Review)
  └── No (Safe Auto-Reconcile Criteria Met)
       ↓
Perform Transactional Mutation (if Ledger authority)
       ↓
Synchronize Channel (if Internal authority)
       ↓
Verify External State
       ↓
Audit Trail Recorded
```

### Automatic Correction Criteria (Section 31)
Automatic correction is permitted **only** when ALL of the following criteria are met:
1. **Known Mapping**: SKU is validly mapped between internal catalog and external listing (neither `MISSING_INTERNAL` nor `MISSING_EXTERNAL`).
2. **Known Source of Truth**: Clear authority established (`INTERNAL_LEDGER` for standard warehouse, `EXTERNAL_CHANNEL` for FBA/3PL nodes).
3. **No Unresolved Competing Events**: No pending sync jobs in flight (`QUEUED`, `PROCESSING`, `SENT`, `VERIFYING`) and no failed sync jobs in conflict.
4. **Permitted Quantity Delta**: Absolute difference is $\le \text{autoReconcileMaxDelta}$ (default: 1 unit).
5. **No Manual Lock**: No manual freeze, reconciliation lock, or legal hold on the SKU/warehouse balance.
6. **No High-Risk State**: Classification is neither `MATERIAL_DIFFERENCE`, `STALE_EXTERNAL`, nor `UNKNOWN`.

If any criterion fails, status remains `PENDING` with direction `REQUIRES_APPROVAL`.

---

## 5. Correction Directions

- **`PUSH_TO_CHANNEL`**: Internal ledger is the source of truth; safe correction pushes target quantity to external marketplace adapter via `pushInventoryLevel` and verifies via `verifyInventoryLevel`.
- **`ADJUST_INTERNAL_LEDGER`**: External channel is authoritative (e.g. FBA warehouse); safe correction records an immutable `recordReconciliationCorrection` on `InventoryLedgerService`.
- **`REQUIRES_APPROVAL`**: Discrepancy requires manual operator investigation, recount, or approval.
- **`NO_ACTION`**: Quantities match (`MATCH`).

---

## 6. REST API Endpoints & RBAC (Section 53)

All endpoints enforce tenant isolation via server-side session token context and check RBAC permissions:

| Method | Endpoint | Permission | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/reconciliation/run` | `reconciliation:write` | Initiates a reconciliation run against a channel account. Returns 201 Created. |
| `GET` | `/reconciliation/runs` | `reconciliation:read` | Lists reconciliation runs for tenant with pagination & status filters. |
| `GET` | `/reconciliation/runs/:id` | `reconciliation:read` | Retrieves details and item results for a specific run. |
| `GET` | `/reconciliation/results/:id` | `reconciliation:read` | Retrieves a single reconciliation result record. |
| `POST` | `/reconciliation/results/:id/approve` | `reconciliation:write` | Approves resolution, executing ledger mutation or channel sync. |
| `POST` | `/reconciliation/results/:id/reject` | `reconciliation:write` | Rejects/ignores discrepancy, transitioning status to `IGNORED`. |

---

## 7. Verification Evidence
Verified by test suite [`tests/phase18-reconciliation.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase18-reconciliation.test.ts) covering 33 test cases:
- Full classification coverage across all 7 discrepancy types.
- Deterministic cause evaluation across all 10 causes.
- Critical mutation rule preventing unauthorized ledger writes on discrepancy detection.
- Safe auto-reconciliation execution for both internal and external sources of truth.
- Manual approval and rejection workflows with idempotency and audit logs.
- Multi-tenant isolation boundary protection.
- Section 53 REST API endpoints with RBAC enforcement (`VIEWER` blocked from write operations).
