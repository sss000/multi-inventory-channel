# Phase 24 Architecture: Authenticated Application UI Foundation

**Lifecycle State:** `VERIFIED`  
**Governing Documents:**  
- `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md` (Prompt 25: Application UI Foundation)  
- `specifications/03_FRONTEND_SPEC.md` (Sections 3, 4, 5, 6, 7, 9, 11, 12)  
- `specifications/04_HUMAN_UX_SPEC.md`  
- `AGENTS.md` & Production Web App Engineering Constitution

---

## 1. Overview & System Mission

Phase 24 establishes the authoritative, accessible, production-grade UI design system and component architecture for the Multichannel Inventory Control Platform. 

Per the governing contracts, the frontend is **never an independent source of truth**; it is a deterministic, observable projection of server-authoritative ledger state. The UI foundation enforces the primary interaction loop:
$$\text{STATE} \longrightarrow \text{CONTEXT} \longrightarrow \text{EVIDENCE} \longrightarrow \text{ACTION} \longrightarrow \text{RESULT} \longrightarrow \text{AUDIT}$$

---

## 2. Navigation Architecture & Feature-Flag Gating

### 2.1 MVP Production Navigation (Section 6.1 & Prompt 25)
The production sidebar serves 8 canonical MVP routes organized into logical functional groups:

| Group | Nav Item | Route | Required Permission | Description |
| :--- | :--- | :--- | :--- | :--- |
| **Core** | **Overview** | `/app/overview` | — | Executive operational KPI summary & health pulse |
| **Operations** | **Inventory** | `/app/inventory` | `inventory:read` | Ledger balances, allocations, safety stock, and recounts |
| **Operations** | **Orders** | `/app/orders` | `orders:read` | Inbound orders, line item allocations, reservations |
| **Operations** | **Products** | `/app/products` | `catalog:read` | Product catalog and channel SKU mappings |
| **Operations** | **Exceptions** | `/app/exceptions` | `reconciliation:read` | Discrepancy & drift inbox with diagnostic actions |
| **Platform** | **Integrations** | `/app/integrations` | `channels:read` | Channel accounts (Shopify, Amazon, Walmart, Custom) |
| **Admin** | **Settings** | `/app/settings` | `organization:manage` | Tenant settings, team members, and RBAC roles |
| **Admin** | **Billing** | `/app/billing` | `billing:read` | Subscription plans, quota gauges, Stripe portal |

### 2.2 Feature-Flagged Future Surfaces Gate
Prompt 25 explicitly mandates:
> *"V1/future surfaces such as: Warehouses, Purchasing, Reports, AI Assistant must remain feature-flagged and must not appear as operationally available when disabled."*

Implementation in `packages/ui/src/navigation.ts`:
- Flags: `warehouses_v1`, `purchasing_v1`, `reports_v1`, `ai_assistant_v1` default to `false`.
- Gating engine `getVisibleNavigationItems()` filters out disabled items from navigation.
- If requested in preview mode (`includeDisabledPreview: true`), items are rendered with `aria-disabled="true"`, `badge: "Preview"`, and cannot be operated.
- Server-side routes in `apps/web/src/index.ts` intercept attempts to access feature-flagged routes when disabled, returning an explicit HTTP 404 with a `FEATURE_FLAG_DISABLED` semantic explanation card.

---

## 3. Universal 6-State UI Handling (Prompt 25 & Section 12)

Every production component, data grid, and view handles all 6 semantic states without falling back to blank screens or unhandled exceptions:

```text
┌────────────────────────────────────────────────────────────────────────┐
│                        UNIVERSAL 6-STATE TAXONOMY                     │
├────────────────────┬───────────────────────────────────────────────────┤
│ 1. LOADING         │ Animated skeleton pulse, spinner, aria-busy=true  │
│ 2. EMPTY           │ Descriptive SVG illustration, guidance, and CTA   │
│ 3. SUCCESS         │ Verified green indicator, feedback, next steps    │
│ 4. ERROR           │ Error code, correlation ID, retry button, alert   │
│ 5. PARTIAL FAILURE │ Identifies which channels passed & which failed   │
│ 6. PERMISSION DENIED Missing permission code, admin elevation CTA     │
└────────────────────┴───────────────────────────────────────────────────┘
```

Implementation in `packages/ui/src/components/states.ts`:
- `renderUIState(config: UIStateConfig): string`
- `renderLoadingState(config)`
- `renderEmptyState(config)`
- `renderSuccessState(config)`
- `renderErrorState(config)`
- `renderPartialFailureState(config)`
- `renderPermissionDeniedState(config)`

---

## 4. Reusable Component Suite (All 13 Components)

All 13 components are exported from `@platform/ui`:

1. **`DataTable`** (`packages/ui/src/components/data-table.ts`):
   - Server-side pagination controls (default 50, maximum 250 items).
   - Column sorting, row selection checkboxes, row action buttons.
   - Embedded multi-state handling (`loading`, `empty`, `error`, `partial_failure`, `permission_denied`).
   - Sticky header and responsive table wrapping.

2. **`StatusBadge`** (`packages/ui/src/components/status-badge.ts`):
   - Maps domain status to semantic presentation using design tokens.
   - Trust states: `LIVE`, `VERIFIED`, `STALE`, `CONFLICT`, `UNKNOWN`.
   - Sync states: `SYNCED`, `IN_PROGRESS`, `PENDING`, `FAILED`.
   - Order lifecycles: `DRAFT`, `RESERVED`, `ALLOCATED`, `FULFILLED`, `CANCELLED`.
   - Exception severities: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.
   - Prohibits hard-coded ad-hoc colors.

3. **`MetricCard`** (`packages/ui/src/components/metric-card.ts`):
   - KPI metrics with value, trend delta (+/- percentage/units), trend label, trust badge, and loading skeleton.

4. **`ExceptionCard`** (`packages/ui/src/components/exception-card.ts`):
   - Border-accented card displaying severity badge, SKU, channel, correlation ID, suggested action, and resolution action buttons.

5. **`Timeline`** (`packages/ui/src/components/timeline.ts`):
   - Chronological ledger audit visualization with status-colored nodes, inventory delta pills (`+10 units`, `-2 units`), actor attribution, and causal payload inspection.

6. **`Drawer`** (`packages/ui/src/components/drawer.ts`):
   - Slide-out panel for deep SKU inspection and drawer filters. Includes `role="dialog"`, `aria-modal="true"`, header, scrollable body, and action footer.

7. **`Modal`** (`packages/ui/src/components/modal.ts`):
   - Accessible dialog overlay with backdrop blur, focus-trap attributes, and escape keyboard dismissal.

8. **`ConfirmDialog`** (`packages/ui/src/components/confirm-dialog.ts`):
   - Guardrail for dangerous operations (e.g. channel disconnect, recount overwrite) requiring explicit typed confirmation strings (Section 47).

9. **`EmptyState`** (`packages/ui/src/components/states.ts`):
   - Actionable empty state with SVG illustration, clear message, and primary button.

10. **`ErrorState`** (`packages/ui/src/components/states.ts`):
    - Diagnostic error display with error code, correlation ID, and retry button.

11. **`LoadingState`** (`packages/ui/src/components/states.ts`):
    - Animated skeleton pulse shimmer with `aria-busy="true"`.

12. **`IntegrationCard`** (`packages/ui/src/components/integration-card.ts`):
    - Channel connection management card with branded SVGs (Shopify, Amazon, Walmart, Custom), sync status badge, health telemetry, and mapped SKU counters.

13. **`InventoryCell`** (`packages/ui/src/components/inventory-cell.ts`):
    - Implements Section 9.1 & 14 invariant: Never renders available quantity as an isolated number. Always exposes the mathematical breakdown:
      $$\text{available} = \text{on\_hand} - \text{reserved} - \text{safety\_stock} - \text{allocated}$$
    - Displays trust state badge and freshness timestamp.

---

## 5. Application Shell & Visual Design System

### 5.1 Design Tokens (`packages/ui/src/tokens.ts`)
- **Theme Palette**: Deep dark theme (`--color-surface-bg: #090d16`, `--color-surface-card: rgba(17, 24, 39, 0.8)`) with light theme override (`[data-theme="light"]`).
- **Glassmorphism**: Backdrop blur (`backdrop-filter: blur(12px)`), subtle translucent borders (`rgba(255, 255, 255, 0.08)`), and soft layered elevation shadows.
- **Typography**: Inter for UI hierarchy and JetBrains Mono for SKUs, correlation IDs, and ledger hashes.
- **Trust States**: LIVE (`#06b6d4`), VERIFIED (`#10b981`), STALE (`#f59e0b`), CONFLICT (`#ef4444`), UNKNOWN (`#64748b`).

### 5.2 Shell Architecture (`apps/web/src/shell.ts`)
- **Topbar**: Stable across routes; includes Org Switcher, search command palette trigger (`⌘K`), system status pulse indicator, theme toggle button, notification bell with unread badge, and user avatar.
- **Sidebar**: Branded logo with neon glow, grouped navigation links, active page highlight, feature-flag badges, and immutable ledger active footer.
- **Breadcrumbs**: Pure hierarchical representation (`Overview / Inventory`), not a browser history mirror.

---

## 6. Automated Verification Evidence

The test suite [`tests/phase24-ui-foundation.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase24-ui-foundation.test.ts) executes 38 automated test cases covering:

1. **Navigation & Flags**:
   - All 8 MVP routes verified.
   - Gating verified: Warehouses, Purchasing, Reports, AI Assistant hidden by default.
   - RBAC permission filtering verified on navigation links.
2. **Universal 6 States**:
   - Verified HTML output and accessibility attributes for `loading`, `empty`, `success`, `error`, `partial_failure`, `permission_denied`.
3. **Reusable Components**:
   - Verified rendering for all 13 components: `DataTable`, `StatusBadge`, `MetricCard`, `ExceptionCard`, `Timeline`, `Drawer`, `Modal`, `ConfirmDialog`, `EmptyState`, `ErrorState`, `LoadingState`, `IntegrationCard`, `InventoryCell`.
4. **Web Server Probes**:
   - `GET /health` verified (200 OK with feature flag telemetry).
   - `GET /` redirects to `/app/overview`.
   - `GET /app/overview`, `/app/inventory`, `/app/exceptions`, `/app/orders`, `/app/integrations`, `/app/billing`, `/app/states-demo` verified (200 OK with full shell and components).
   - Gated route protection verified (`GET /app/warehouses`, `/purchasing`, `/reports`, `/ai-assistant` return 404 with `FEATURE_FLAG_DISABLED`).

**Monorepo Test Suite Result:**
- **547 tests passed across 194 test suites with 0 failures**.
- Clean typecheck (`tsc --noEmit`) across all 13 packages and apps.
