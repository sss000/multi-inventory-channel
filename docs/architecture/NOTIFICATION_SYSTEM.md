# Notification System Architecture & Noise Reduction Engine

**Canonical Specification:** Section 76 of `specifications/01_ENGINEERING_SPEC.md` & Prompt 23 of `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md`  
**Lifecycle State:** `VERIFIED`  
**Package:** `@platform/contracts`, `@platform/domain`, `@platform/database`, `@platform/integrations`, `apps/api`

---

## 1. Overview & Core Mission

The Notification System delivers timely, actionable operational alerts to merchants across multichannel operations while actively preventing notification fatigue and alert spam.

### Core Architectural Laws (Prompt 23 & Section 76):
1. **The Noise Reduction Mandate:**
   > *"Do not notify users for every successful background operation."*
   Routine operations (e.g. routine sync completion, periodic inventory check, successful poll) are explicitly suppressed from notification creation.
2. **The Incident Deduplication Gate:**
   > *"Deduplicate repeated failures. For example, if 14 SKUs fail against the same provider over 20 minutes, prefer an incident summary rather than 14 identical emails."*
   Repeated failures within a sliding 20-minute window are aggregated into a single incident summary notification, preventing mailbox flooding while escalating severity appropriately.
3. **Preference Authority:** User and tenant preferences govern delivery channels (`IN_APP`, `EMAIL`), category subscription, and minimum severity threshold for email dispatches.

---

## 2. Delivery Channels (V1)

1. **In-App Notification Inbox (`IN_APP`):**
   - Stored in the notification repository with read/unread status, read timestamps, and dismissal support.
   - Fast badge count endpoint (`GET /notifications/unread-count`).
   - Deep-linking via optional `actionUrl` (e.g. directly to an unresolved reconciliation run or exception).
2. **Email Dispatch (`EMAIL`):**
   - Handled via `EmailDispatchProvider` interface with delivery status tracking (`PENDING`, `DELIVERED`, `FAILED`).
   - Mock transport (`MockEmailDispatchProvider`) provides deterministic delivery logging and failure simulation in testing environments.

---

## 3. The 7 Canonical Notification Categories

Section 76 and Prompt 23 strictly mandate 7 operational categories:

| Category | Typical Trigger | Default Severity | Action Link Destination |
|:---|:---|:---:|:---|
| **`CRITICAL_INVENTORY_CONFLICT`** | Severe channel discrepancy or oversell risk detected | `CRITICAL` | Discrepancy / Reconciliation View |
| **`INTEGRATION_AUTHENTICATION`** | Marketplace OAuth token expired, invalid API keys | `HIGH` | Channel Settings / Reconnect |
| **`REPEATED_SYNC_FAILURE`** | Multiple failed outbound sync attempts for a provider | `HIGH` / `CRITICAL` | Sync Jobs & Failure Diagnostics |
| **`LOW_STOCK`** | Available inventory falls below safety stock or reorder point | `MEDIUM` | Inventory Balances / Purchase Order |
| **`NEGATIVE_INVENTORY`** | On-hand or available inventory drops below zero | `CRITICAL` | Inventory Ledger Audit Trail |
| **`RECONCILIATION_REQUIRED`** | Periodic reconciliation run completes with unresolved differences | `HIGH` | Reconciliation Review Table |
| **`BILLING`** | Payment failed, past due subscription, or quota warning | `HIGH` / `CRITICAL` | Billing & Subscription Settings |

---

## 4. Intelligent Deduplication & Sliding Window Engine

```
Failure Event Arrival (e.g., SKU 1 fails on Shopify)
       │
       ▼
Check Routine Success Suppression ──[Is Routine Success?]──► SUPPRESS (No Notification)
       │
     [No]
       ▼
Generate Deterministic Incident Key: `${category}:${entityType}:${entityId}`
       │
       ▼
Query Active Incidents within Deduplication Window (20 Minutes)
       │
   ┌───┴─────────────────────────────────────────┐
   │                                             │
[Active Incident Exists]                [No Active Incident]
   │                                             │
   ▼                                             ▼
Aggregate into Incident Summary:        Create New Notification:
• Increment occurrenceCount             • Set status = UNREAD
• Append affected entity to metadata    • Evaluate user preferences
• Update summary title & message        • Dispatch initial email
• Escalate severity if repeated         • Save to repository
• Suppress repetitive email noise
```

---

## 5. Notification Preferences Engine

Preferences are persisted per organization and user (`NotificationPreferencesRow`):

- **Channel Toggles:** `inAppEnabled` (boolean), `emailEnabled` (boolean).
- **Category Matrix:** Toggles for each of the 7 canonical categories.
- **Minimum Email Severity:** `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.
  - e.g. If set to `HIGH`, low stock warnings (`MEDIUM`) are accessible in the in-app inbox but will never trigger email alerts.

---

## 6. REST API Endpoints & RBAC Matrix

| Endpoint | Method | Permission | Allowed Roles | Description |
|:---|:---:|:---:|:---:|:---|
| `/notifications` | `GET` | `notifications:read` | `OWNER`, `ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER` | List notifications with status/category/severity filters and pagination |
| `/notifications/unread-count` | `GET` | `notifications:read` | `OWNER`, `ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER` | Returns `{ unreadCount: N }` for UI badges |
| `/notifications/:id/read` | `PATCH` | `notifications:read` | `OWNER`, `ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER` | Marks a single notification as read |
| `/notifications/mark-all-read` | `POST` | `notifications:read` | `OWNER`, `ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER` | Marks all tenant notifications as read |
| `/notifications/:id` | `DELETE` | `notifications:manage` | `OWNER`, `ADMIN`, `MANAGER` | Dismisses a notification |
| `/notifications/preferences` | `GET` | `notifications:read` | `OWNER`, `ADMIN`, `MANAGER`, `OPERATOR`, `VIEWER` | Retrieves tenant/user notification preferences |
| `/notifications/preferences` | `PUT` | `notifications:manage` | `OWNER`, `ADMIN`, `MANAGER` | Updates channel toggles and category subscriptions |

---

## 7. Verification Evidence

- **Phase 22 Dedicated Test Suite:** [`tests/phase22-notifications.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase22-notifications.test.ts)
  - **Tests Passed:** 26 / 26
  - **Suites:** 8
  - **Duration:** ~178 ms
- **Global Regression Suite (`npm test`):**
  - **Total Tests:** 483 / 483 Passed (0 Failed across 182 suites).
- **Monorepo Build & Typecheck:**
  - `npm run typecheck`: Exit code 0 across all 13 monorepo workspaces.
  - `npm run build`: Exit code 0 across all 9 shared packages and 4 applications.
