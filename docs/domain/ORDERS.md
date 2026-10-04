# Orders Domain Subsystem & Lifecycle Architecture

## 1. Overview & Authority
The Orders subsystem is the primary ingestion boundary for external commercial activity across channels (Shopify, Amazon, eBay, Walmart). It bridges channel sales with internal inventory control, reservations, and exceptions.

**Governing Specifications:**
- `specifications/01_ENGINEERING_SPEC.md` (Sections 18, 19, 50)
- `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md` (Prompt 10: Phase 9 — Orders)
- Current Canonical Lifecycle State: `VERIFIED`

---

## 2. External Order Identity & Idempotency
Orders originate from multiple disparate external channels. To prevent duplication or phantom mutations across concurrent webhooks and synchronization polling jobs:

External order uniqueness is strictly defined by the triplet:
$$\text{External Order Identity} = (\text{organization\_id}, \text{channel\_account\_id}, \text{external\_order\_id})$$

```sql
UNIQUE(organization_id, channel_account_id, external_order_id)
```

### Idempotency Behavior
When an order creation or import request arrives for an existing triplet:
1. The existing order and its line items are retrieved.
2. Associated reservations are loaded.
3. The response is returned with `isDuplicate: true` and status code 200 OK.
4. **Guarantees:** No duplicate rows are created, no line items are duplicated, and no duplicate inventory reservations or ledger debits occur.

---

## 3. Unmapped SKU Invariant (Critical Integrity Gate)

### Core Invariant
> If an order item cannot be mapped to an internal SKU, **DO NOT silently reduce inventory**. Instead, create an `ORDER_UNMAPPED_SKU` exception.

### Ingestion Flow for Line Items:
```text
For each order line item:
  ├─ 1. Attempt SKU resolution by internal skuId or channel SKU code.
  ├─ 2. If SKU mapped:
  │      ├─ Set item.sku_id = resolvedSku.id
  │      └─ Queue for inventory reservation.
  └─ 3. If SKU unmapped:
         ├─ Set item.sku_id = NULL
         ├─ DO NOT decrement inventory or create phantom reservation
         ├─ Create DomainException(type = "ORDER_UNMAPPED_SKU", severity = "MEDIUM")
         ├─ Record exception in database with rootCause and recommendedAction
         ├─ Set Order status = "EXCEPTION"
         └─ Emit ORDER_UNMAPPED_SKU order event
```

---

## 4. Reservation Association & Inventory Integration
For all items with valid mapped SKUs:
1. When `autoReserve` is enabled (default `true`) and `warehouseId` is specified, `ReservationService.reserve(...)` is invoked.
2. The resulting `inventory_reservations` row is explicitly linked to the order via foreign key:
   $$\text{inventory\_reservations.order\_id} = \text{orders.id}$$
3. Sellable available inventory in the inventory ledger is atomically reduced:
   $$\text{available} = \text{on\_hand} - \text{reserved} - \text{safety\_stock} - \text{damaged} - \text{quarantined} - \text{allocated}$$
4. An `ORDER_RESERVATION_CREATED` event is recorded on the order.

---

## 5. Cancellation Lifecycle & Reservation Release

When an order is cancelled via `cancelOrder` / `POST /orders/:id/cancel`:
1. Order status is updated to `CANCELLED`.
2. All associated reservations with status `ACTIVE` are identified.
3. For each active reservation, `ReservationService.release(...)` is executed:
   - Reservation status transitions from `ACTIVE` to `RELEASED`.
   - Reserved quantity is deducted from the balance, restoring sellable available inventory.
   - Immutable `ORDER_RELEASE` event is written to `inventory_events`.
4. Order events `ORDER_CANCELLED` and `ORDER_RESERVATION_RELEASED` are recorded.
5. Cancellation of an already cancelled order is idempotent.
6. Cancellation of a `COMPLETED` order is strictly rejected with `OrderInvariantError`.

---

## 6. Tenant Isolation & Security
- **Server-Side Tenant Enforcement:** The tenant context is extracted exclusively from verified session tokens (`TenantContext`), never from client input.
- **Cross-Tenant Access Denial:** Attempting to query, inspect, or cancel an order belonging to Organization A with a token for Organization B immediately throws `TenantAccessDeniedError`, returning HTTP 403 `FORBIDDEN`.
- **Role-Based Access Control:**
  - `orders:read` is required for `GET /orders`, `GET /orders/:id`, `GET /orders/:id/events`, `GET /orders/:id/reservations`.
  - `orders:write` is required for `POST /orders` and `POST /orders/:id/cancel`.
  - Roles lacking these permissions (e.g. `VIEWER` attempting `POST /orders`) are rejected with HTTP 403 `FORBIDDEN`.

---

## 7. REST API Endpoints
All endpoints return predictable envelopes conforming to `ApiResponseEnvelope<T>`:

| Method | Endpoint | Required Permission | Description |
|---|---|---|---|
| `GET` | `/orders` | `orders:read` | List orders with pagination and filtering by `status` / `channelAccountId`. |
| `GET` | `/orders/:id` | `orders:read` | Retrieve single order by ID with line items. |
| `POST` | `/orders` | `orders:write` | Ingest external order with items and reservation association. Returns 201 Created (or 200 OK if duplicate). |
| `POST` | `/orders/:id/cancel` | `orders:write` | Cancel order and release active reservations back to stock. |
| `GET` | `/orders/:id/events` | `orders:read` | Retrieve immutable audit event history for the order. |
| `GET` | `/orders/:id/reservations` | `orders:read` | Retrieve all reservations linked to this order. |

---

## 8. Automated Verification Evidence
Verified by test suite [`tests/phase9-orders.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase9-orders.test.ts):
- 18 automated tests passing across 8 test suites.
- Duplicate external order idempotency verified.
- Unmapped SKU exception generation and non-reduction invariant verified.
- Reservation association and inventory ledger balance reduction verified.
- Order cancellation and full reservation release verified.
- Cross-tenant isolation gate verified (403 FORBIDDEN).
- RBAC permissions gate verified.
