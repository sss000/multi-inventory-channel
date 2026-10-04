# Multichannel Inventory Control Platform — Progressive Onboarding Architecture

**Phase:** Phase 25 (Prompt 26)  
**Lifecycle State:** `VERIFIED`  
**Governing Documents:**  
- `specifications/00_MASTER_ORCHESTRATION.md`  
- `specifications/01_ENGINEERING_SPEC.md` (Sections 62, 63, 64)  
- `specifications/02_PRODUCT_DESIGN_SPEC.md` (Section 63)  
- `specifications/03_FRONTEND_SPEC.md` (Section 30)  
- `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md` (Prompt 26)  

---

## 1. Overview & System Purpose

The progressive merchant onboarding subsystem guides new merchants through configuring their multi-tenant organization, authenticating sales channels, importing existing catalog items, mapping SKUs, and performing the critical baseline inventory comparison before enabling live synchronization.

### The Canonical 9-Step Flow

```text
Create account (Step 1)
      ↓
Create organization (Step 2)
      ↓
Choose primary sales channel (Step 3)
      ↓
Connect channel (Step 4)
      ↓
Import catalog (Step 5)
      ↓
Map SKUs (Step 6)
      ↓
Validate inventory (Step 7)
      ↓
Enable synchronization (Step 8)
      ↓
Dashboard (Step 9)
```

Each step implements explicit progressive statuses:
- `COMPLETED`: Step verified and recorded.
- `CURRENT`: Actively in progress.
- `BLOCKED`: Cannot proceed until prerequisites are satisfied.
- `NEEDS_ATTENTION`: Action required (e.g. unconfirmed discrepancies).

---

## 2. CRITICAL INITIAL SYNC SAFETY GATE (Prompt 26 Invariant)

### The Problem

In naive inventory systems, connecting an external sales channel immediately triggers a blind bi-directional sync. If channel quantities differ from internal stock, catastrophic overwrites occur: listings can be zeroed out or oversold without merchant awareness.

### The Strict Safety Guarantee

**Outbound synchronization is NEVER enabled immediately upon channel connection.**

The platform enforces the non-bypassable sequence:

```text
IMPORT
  ↓
COMPARE
  ↓
SHOW DIFFERENCES
  ↓
USER CONFIRMS SOURCE OF TRUTH
  ↓
ENABLE OUTBOUND SYNC
```

### The Canonical Discrepancy Scenario (Prompt 26)

```text
Internal Ledger  = 20
Shopify          = 20
Amazon SP-API    = 18
```

1. **Detection & Reporting:**
   - The system detects that Amazon reports 18 units while Internal and Shopify report 20.
   - The inventory validation status transitions to `DIFFERENCES_FOUND`.
   - The step status transitions to `NEEDS_ATTENTION`.
   - `allConfirmed` is evaluated to `false`.

2. **Non-Silent Overwrite Guarantee:**
   - The platform strictly forbids silently pushing 20 units to Amazon or 18 units to Shopify.
   - Attempting to bypass this step or enable outbound sync throws `InitialSyncSafetyViolationError` (HTTP 400).

3. **Explicit Source-of-Truth Selection:**
   The merchant must select an authoritative source of truth for each discrepant SKU:
   - **`INTERNAL_LEDGER`:** The local ledger (20 units) is authoritative; downstream channels will be aligned.
   - **`CHANNEL` (e.g. Amazon):** The external channel balance (18 units) is authoritative; internal ledger and other channels align to it.
   - **`CUSTOM`:** The merchant performs a physical count (e.g. 22 units) and sets an explicit baseline.

4. **Confirmation Guardrail:**
   - Outbound synchronization requires an explicit affirmative user confirmation (`confirmed: true`).
   - Enabling outbound sync logs an immutable record in `audit_logs` (`INTEGRATION_CONNECTED` / `ONBOARDING`) capturing the authorized baseline.

---

## 3. Domain Model Architecture (`@platform/domain`)

### Onboarding State Machine & Service (`OnboardingService`)

- **State Persistence:** Preserves active progress, mappings, and difference resolution across sessions.
- **Catalog Preservation Invariant:** Unmapped external SKUs are never silently discarded. They are preserved in `skuMapping.mappings` with `status: "UNMAPPED"` or `"SUGGESTED"` for merchant review.
- **Discrepancy Invariant:** Discrepancy items require `confirmed: true` before `inventoryValidation.allConfirmed` evaluates to true.
- **Outbound Sync Invariant:** `enableOutboundSynchronization` throws `InitialSyncSafetyViolationError` if `inventoryValidation.allConfirmed === false` or `confirmation.confirmed !== true`.

---

## 4. REST API Endpoints (`apps/api`)

All routes conform to base path `/api/v1` and unversioned aliases with uniform response and error envelopes.

| Method | Endpoint | Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/onboarding/state` | `organization:read` | Returns active tenant onboarding session and step statuses. |
| `POST` | `/onboarding/choose-channel` | `organization:manage` | Step 3: Select primary sales channel (Shopify, Amazon, eBay, Walmart, Mock). |
| `POST` | `/onboarding/connect-channel` | `organization:manage` | Step 4: Authenticate and store channel credentials. |
| `POST` | `/onboarding/import-catalog` | `organization:manage` | Step 5: Ingest products and variants without discarding unmapped items. |
| `POST` | `/onboarding/map-skus` | `organization:manage` | Step 6: Submit SKU mappings to internal catalog. |
| `POST` | `/onboarding/validate-inventory` | `organization:manage` | Step 7a: Compare channel balances against internal ledger; detect conflicts. |
| `POST` | `/onboarding/resolve-discrepancy` | `organization:manage` | Step 7b: Explicitly choose source of truth for an individual SKU. |
| `POST` | `/onboarding/batch-resolve-discrepancies` | `organization:manage` | Step 7b: Batch resolve multiple discrepancies or apply global rule. |
| `POST` | `/onboarding/confirm-inventory` | `organization:manage` | Step 7c: Confirm all difference resolutions before proceeding. |
| `POST` | `/onboarding/enable-sync` | `organization:manage` | Step 8: **Initial Sync Safety Gate** — Enable outbound synchronization. |
| `POST` | `/onboarding/complete` | `organization:manage` | Step 9: Finalize onboarding and unlock platform dashboard. |
| `POST` | `/onboarding/reset` | `organization:manage` | Reset onboarding session to initial state for reconfiguration. |

---

## 5. UI Architecture & Components (`@platform/ui` & `apps/web`)

1. **`renderOnboardingStepper` (`@platform/ui`):**
   - Accessible progressive stepper (`<nav aria-label="Progressive Onboarding Steps">`, `<ol>`, `<li ... aria-current="step">`).
   - Semantic badges: `Completed` (green), `Current` (primary), `Needs Attention` (warning), `Pending` (neutral).
2. **`renderDiscrepancyTable` (`@platform/ui`):**
   - Side-by-side comparison table: SKU, product title, internal ledger, and channel columns.
   - Highlights discrepancies clearly (e.g. Internal = 20, Shopify = 20, Amazon = 18).
   - Source-of-truth select dropdown per SKU.
   - Prominent Initial Sync Safety Guarantee banner.
3. **`renderSyncConfirmationCard` (`@platform/ui`):**
   - Guardrail card that stays blocked until all discrepancies are resolved.
   - Explicit confirmation checkbox and authorization button.
4. **Web Portal Route (`apps/web`):**
   - `/app/onboarding` renders the full interactive 9-step wizard with query param navigation (`?step=...`).

---

## 6. Verification Evidence

The entire automated test suite (`tests/phase25-onboarding.test.ts`) executes and passes **21 out of 21 tests with 0 failures**:

1. **9-Step State Machine:** Verified progression, illegal transition rejections, provider validation, catalog import with unmapped SKU preservation, and SKU mapping.
2. **Initial Sync Safety Gate:** Verified detection of the Prompt 26 discrepancy (Internal = 20, Shopify = 20, Amazon = 18), non-silent overwrite guarantee, rejection of premature sync activation, explicit source-of-truth options, and confirmation requirements.
3. **REST API & RBAC:** Verified all 11 onboarding API endpoints, standard envelopes, and permission protection (`VIEWER` blocked with HTTP 403 `FORBIDDEN`).
4. **Multi-Tenant Isolation:** Verified Org A and Org B sessions remain strictly isolated.
5. **UI Rendering:** Verified stepper, discrepancy table, confirmation card, and `/app/onboarding` web route.
