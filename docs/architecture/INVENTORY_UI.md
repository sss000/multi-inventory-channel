# Multichannel Inventory UI & Dynamic Channel Controls Architecture

**Canonical References:**
- `specifications/00_MASTER_ORCHESTRATION.md`: Section 12 (Frontend & User Experience Standards)
- `specifications/01_ENGINEERING_SPEC.md`: Section 59 (Inventory Control UI & Query Models)
- `specifications/03_FRONTEND_SPEC.md`: Section 14 (Inventory Table) & Section 15 (SKU Detail View)
- `specifications/04_HUMAN_UX_SPEC.md`: Section 8 (Operational Clarity & Discrepancy Workflows)
- `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md`: Prompt 27 (Phase 26: Inventory UI)

---

## 1. Executive Architecture Overview

The Inventory Control UI provides merchants with real-time, explainable, and multi-warehouse visibility across all connected sales channels. It is engineered with strict invariants ensuring data honesty, ledger mathematical consistency, and explicit trust semantics:

```
+---------------------------------------------------------------------------------------------------------+
|                                    MERCHANT WEB PORTAL (/app/inventory)                                 |
+---------------------------------------------------------------------------------------------------------+
| [Filters: SKU | Product | Warehouse | Channel | Status | [Chip: Low Stock] [Chip: Channel Mismatch] ]   |
+---------------------------------------------------------------------------------------------------------+
| INVENTORY TABLE                                                                                         |
| +-----+---------+-----------+---------+----------+-----------+-------------+------------+--------+----+ |
| | SKU | Product | Warehouse | On Hand | Reserved | Available | Shopify US  | Amazon FBA | Status | .. | |
| +-----+---------+-----------+---------+----------+-----------+-------------+------------+--------+----+ |
| | ... | ...     | ...       | 42      | 4        | 33 (Safe) | 33 (Verif)  | 35 (Conf!) | CONFL. | [>]| |
| +-----+---------+-----------+---------+----------+-----------+-------------+------------+--------+----+ |
+---------------------------------------------------------------------------------------------------------+
                                                               | (Click Inspect SKU)
                                                               v
+---------------------------------------------------------------------------------------------------------+
| SKU DETAIL DRAWER (8 Canonical Sections)                                                                |
| 1. Summary: Available = On Hand (42) - Reserved (4) - Safety (5) - Allocated (0) = 33                   |
| 2. Inventory by Warehouse: wh-1 (Main FC): 42 On Hand, 4 Reserved, 33 Available                        |
| 3. Inventory by Channel: Shopify (33 match), Amazon (35 mismatch: +2 discrepancy)                      |
| 4. Synchronization History: Shopify Feed (VERIFIED), Amazon Feed (CONFLICT)                            |
| 5. Exceptions & Discrepancies: EXC-01 (High Severity: Marketplace reported 35 units, expected 33)       |
| 6. Explainable Timeline (Causal Traversal): PO Inbound -> Order Reserve -> Feed Sync -> Discrepancy    |
| 7. Active Orders & Reservations: ORD-1042 (4 units reserved for Alice Smith)                            |
| 8. Immutable Audit Trail: Trace ID, Actor (System / User), Cryptographic Correlation ID                 |
+---------------------------------------------------------------------------------------------------------+
```

---

## 2. Core Invariants & Governance Rules

### Invariant 1: Dynamic Connected Channel Columns (Anti-Fabrication Guarantee)
- Channel columns rendered in the table and detail drawers are dynamically projected based solely on **ACTIVE** merchant integrations.
- **Strict Mandatory Invariant:** The system strictly does **NOT** present eBay, Walmart, or any other provider as operational channels when those integrations are not actively configured and enabled.
- Fabricated or placeholder provider columns are prohibited.

### Invariant 2: Sellable Available Derivation
- Available inventory is never an editable database column. It is dynamically derived from authoritative ledger balances:
  $$\text{available} = \text{on\_hand} - \text{reserved} - \text{safety\_stock} - \text{allocated} - \text{damaged} - \text{quarantined}$$
- The SKU Detail Drawer prominently displays this exact arithmetic equation for merchant trust and explainability.

### Invariant 3: Explicit Status Semantics
The table renders one of 5 canonical trust states:
1. `LIVE`: Up-to-date and actively verified via bidirectional channel feeds.
2. `VERIFIED`: Reconciled and acknowledged with matching read-back verification.
3. `STALE`: Out of sync threshold or pending scheduled background reconciliation.
4. `CONFLICT`: Discrepancy detected between internal ledger and external provider count.
5. `UNKNOWN`: Integration disconnected or unmapped SKU state.

### Invariant 4: Provider Verification Guarantee
- Data that has merely been submitted, queued, or acknowledged by an external API is **never** presented with a green success badge (`#10b981`).
- `PENDING` states use amber warning tokens (`#f59e0b`).
- `IN_PROGRESS` states use cyan active tokens (`#06b6d4`).
- Only verified, read-back-confirmed stock uses green verification styling.

---

## 3. Server-Side Filtering & Pagination API

### `GET /inventory/table`
Returns paginated, multi-tenant inventory rows with dynamic connected channel columns:

```json
{
  "data": {
    "items": [
      {
        "sku": "WIRELESS-HEADSET-BLK",
        "productId": "WIRELESS-HEADSET-BLK",
        "productTitle": "Pro Noise-Cancelling Wireless Headphones (Black)",
        "warehouseId": "wh-1",
        "warehouseName": "Main Fulfillment Center",
        "onHand": 42,
        "reserved": 4,
        "allocated": 0,
        "safetyStock": 5,
        "damaged": 0,
        "quarantined": 0,
        "available": 33,
        "status": "CONFLICT",
        "channelQuantities": {
          "int-shopify-1": {
            "channelAccountId": "int-shopify-1",
            "provider": "SHOPIFY",
            "channelDisplayName": "Shopify Store US",
            "externalQuantity": 33,
            "internalQuantity": 33,
            "difference": 0,
            "syncState": "VERIFIED",
            "lastVerifiedAt": "2026-10-04T18:50:00Z",
            "isOperational": true
          }
        },
        "lastVerifiedAt": "2026-10-04T18:50:00Z",
        "hasMismatch": true
      }
    ],
    "connectedChannels": [
      {
        "id": "int-shopify-1",
        "provider": "SHOPIFY",
        "displayName": "Shopify Store US",
        "status": "ACTIVE",
        "isEnabled": true
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 50,
      "total": 3,
      "totalPages": 1,
      "hasNext": false,
      "hasPrev": false
    }
  }
}
```

#### Query Parameters:
| Parameter | Type | Description |
|-----------|------|-------------|
| `sku` | `string` | Case-insensitive substring match on SKU code. |
| `product` | `string` | Case-insensitive substring match on Product Title. |
| `warehouse` | `string` | Filter to specific warehouse ID (`wh-1`, `wh-2`). |
| `channel` | `string` | Filter to items associated with specific channel ID. |
| `lowStock` | `boolean` | When `true`, filters to items where $available \le safety\_stock$ or $available \le 10$. |
| `mismatch` | `boolean` | When `true`, filters to items with channel discrepancies. |
| `syncState` | `string` | Filter to specific trust status (`LIVE`, `VERIFIED`, `STALE`, `CONFLICT`, `UNKNOWN`). |
| `page` | `integer` | 1-based page number (default: 1). |
| `limit` | `integer` | Records per page (default: 50, max: 100). |

---

## 4. SKU Detail Drawer (8 Canonical Sections)

When an operator clicks **Inspect** or navigates with `?skuDetail=<SKU>`, the UI renders the comprehensive 8-section inspection panel:

1. **Summary & Equation:**
   - SKU, Product Title, Brand, Category, Barcode.
   - Authoritative Formula equation callout:
     $$Available (33) = OnHand (42) - Reserved (4) - Safety (5) - Allocated (0) - Damaged (0) - Quarantined (0)$$
2. **Inventory by Warehouse:**
   - Table of warehouse balances breakdown (On Hand, Reserved, Available, Safety Stock, Reorder Point).
3. **Inventory by Channel:**
   - Channel breakdown comparing internal ledger quantity against external marketplace reported count, highlighting variance and sync state.
4. **Synchronization History:**
   - Recent channel feeds with job IDs, channel accounts, operations (`PUSH_DELTA`, `FULL_SYNC`), attempt count, and verification status.
5. **Exceptions & Discrepancies:**
   - Open exception tickets with severity badges (`CRITICAL`, `HIGH`, `MEDIUM`, `LOW`), discrepancy difference, and suggested remediation actions.
6. **Explainable Inventory Timeline (Causal Traversal):**
   - Event chain with backward/forward causality links (`causalChain`), quantity delta, before/after states, actor attribution (`SYSTEM`, `USER`), and correlation IDs.
7. **Active Orders & Reservations:**
   - Pending customer reservations (`ORDER_RESERVATION`) with order number, customer name, quantity reserved, and expiration TTL.
8. **Immutable Audit Trail:**
   - Cryptographically traceable audit log of configuration, adjustment, and reconciliation actions on this SKU.

---

## 5. Accessibility (WCAG 2.1 AA) & Responsive Layout

- **Landmarks:** Screen-reader accessible `<div class="table-scroll-wrapper" role="region" aria-label="Multichannel Inventory Data Table" tabindex="0">`.
- **Keyboard Traversal:** Table headers include explicit `scope="col"`, inputs have matching `<label for="...">`, filter buttons have `aria-pressed`, and drawer overlay supports `Escape` key and close focus management.
- **Contrast & Token Discipline:** Uses curated CSS tokens (`--color-surface`, `--color-status-verified`, `--color-status-conflict`, `--color-status-stale`) with high-contrast text ratios exceeding 4.5:1.
- **Scroll Handling:** Fluid desktop layout with sticky headers and responsive horizontal scrolling on narrow viewports.

---

## 6. Verification Evidence

- **Unit & Integration Suite:** [`tests/phase26-inventory-ui.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase26-inventory-ui.test.ts)
  - 16/16 tests passing in 436ms.
- **Full Monorepo Suite:**
  - 584/584 tests passing across 209 suites.
  - Typecheck: 0 errors across 13 monorepo workspaces.
