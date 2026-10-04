# Billing System Architecture & Entitlements Engine

**Canonical Specification:** Sections 38, 56, 72, 73, 74, 75, 116 of `specifications/01_ENGINEERING_SPEC.md` & Prompt 22 of `specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md`  
**Lifecycle State:** `VERIFIED`  
**Package:** `@platform/contracts`, `@platform/domain`, `@platform/database`, `@platform/integrations`, `apps/api`

---

## 1. Overview & Core Architectural Principles

The Billing System governs subscription management, plan entitlements, usage metering, and payment event processing for the Multichannel Inventory Control Platform.

### Core Architectural Laws (Prompt 22 & Sections 72–75):
1. **Internal Entitlements Authority:** Entitlements and quotas are defined and evaluated authoritatively on the server. Frontend components must NEVER contain hard-coded business rules, plan quotas, or feature gating.
2. **Never Trust Frontend Redirects:** Stripe Checkout and Customer Portal redirects are never treated as proof of payment or entitlement grants. Entitlement state is updated solely upon processing cryptographically verified webhook events.
3. **MANDATORY INVARIANT GATE (Section 75 & Prompt 22):**
   > *"Never abruptly disable critical inventory synchronization because a merchant crossed a soft usage threshold."*
   Operations critical to stock accuracy and overselling prevention (`INVENTORY_SYNC`, `SYNC_OPERATION`, `READ_BACK_VERIFICATION`, `INVENTORY_MUTATION`, `RECONCILIATION_CORRECTION`, `ORDER_RESERVATION`) ALWAYS proceed without interruption, regardless of usage percentage.
4. **Append-Only Auditability:** All material billing lifecycle events (plan upgrades, downgrades, cancellations, and payment failures) emit immutable audit records with `actorType: "WEBHOOK"`.

---

## 2. Canonical Plans & Internal Entitlements Store

Plan tiers, quotas, and feature flags are defined in `@platform/contracts/src/billing.ts` and evaluated by `@platform/domain/src/billing-service.ts`:

### 2.1 Canonical Plan Matrix

| Metric / Feature | Starter ($29/mo) | Growth ($79/mo) | Scale ($199/mo) | Enterprise (Custom) |
|:---|:---:|:---:|:---:|:---:|
| **Monthly Orders** | 500 | 2,500 | 10,000 | Unlimited (-1) |
| **Channels** | 2 | 10 | 25 | Unlimited (-1) |
| **Warehouses** | 1 | 10 | 25 | Unlimited (-1) |
| **Users** | 2 | 10 | 25 | Unlimited (-1) |
| **API Calls / Min** | 60 | 300 | 1,000 | Unlimited (-1) |
| **Automations** | 100 | 1,000 | 10,000 | Unlimited (-1) |
| **Storage (MB)** | 500 | 2,500 | 10,000 | Unlimited (-1) |
| **Audit Export** | ❌ | ✅ | ✅ | ✅ |
| **Advanced Reconciliation** | ❌ | ✅ | ✅ | ✅ |
| **Webhooks** | ✅ | ✅ | ✅ | ✅ |
| **AI Insights** | ❌ | ✅ | ✅ | ✅ |
| **Priority Support** | ❌ | ❌ | ✅ | ✅ |

---

## 3. The Billing Pipeline

The platform follows a unidirectional pipeline from payment provider to authorization enforcement:

```
Stripe API / Webhook
        │
        ▼
[HMAC-SHA256 Signature Verification] (crypto.timingSafeEqual & 300s tolerance)
        │
        ▼
[Verified Stripe Billing Event]
        │
        ▼
[Billing Domain State Machine] (ALLOWED_SUBSCRIPTION_TRANSITIONS)
        │
        ▼
[Internal Subscription & Entitlements Store] (SubscriptionRow & UsageRecordRow)
        │
        ▼
[Authorization & Quota Enforcement] (assertOperationPermitted)
```

---

## 4. Stripe Webhook Signature Verification

Webhook integrity is enforced in `@platform/integrations/src/stripe.ts` using `verifyStripeWebhookSignature`:

- **HMAC-SHA256 Validation:** Computes HMAC of `${timestamp}.${rawPayload}` using the configured webhook secret.
- **Timing Attack Defense:** Compares calculated hash with `v1` signatures using `crypto.timingSafeEqual`.
- **Replay Attack Defense:** Compares header timestamp `t` with current system time. Rejects payloads where `|now - timestamp| > 300` seconds with `BillingWebhookSignatureError`.
- **Tampering Detection:** Any alteration of the JSON payload or forged header results in immediate HTTP 400 Bad Request (`INVALID_WEBHOOK_SIGNATURE`).

---

## 5. The 8 Canonical Billing Scenarios (Prompt 22 & Section 116)

All 8 scenarios are fully verified in `tests/phase21-billing.test.ts`:

1. **New Subscription Creation:**
   - Ingests `checkout.session.completed` or `customer.subscription.created`.
   - Binds `stripe_customer_id`, initializes plan tier, sets `status: ACTIVE`.
2. **Payment Success:**
   - Ingests `invoice.paid`.
   - Confirms `status: ACTIVE` and resets billing period.
3. **Payment Failure:**
   - Ingests `invoice.payment_failed`.
   - Transitions state machine to `status: PAST_DUE` with audit logging.
4. **Plan Upgrade (Starter → Growth):**
   - Ingests `customer.subscription.updated`.
   - Immediately increases limits (e.g. 500 → 2,500 orders) and enables `auditExport`.
   - Emits `BILLING_PLAN_CHANGED` audit record.
5. **Plan Downgrade (Scale → Growth):**
   - Ingests `customer.subscription.updated`.
   - Adjusts limits downward to match new tier without data loss.
6. **Cancellation:**
   - Scheduled cancellation sets `cancel_at_period_end: true` while preserving access until expiration.
   - Immediate cancellation (`customer.subscription.deleted`) transitions status to `CANCELED`.
   - Emits `BILLING_SUBSCRIPTION_CANCELLED` audit record.
7. **Reactivation:**
   - Ingests `customer.subscription.created` for previously canceled customer.
   - Transitions status from `CANCELED` back to `ACTIVE`, clearing cancellation timestamps.
8. **Threshold Enforcement across 7 Metrics:**
   - Evaluates usage against canonical limits across:
     - `MONTHLY_ORDERS`
     - `CHANNELS`
     - `WAREHOUSES`
     - `USERS`
     - `API_CALLS`
     - `AUTOMATION_EXECUTIONS`
     - `STORAGE_MB`

---

## 6. Usage Metering & Threshold Severity Levels

Threshold calculation follows Section 75:

```ts
export function calculateThresholdLevel(current: number, limit: number): ThresholdLevel {
  if (limit <= 0) return "NORMAL"; // Unlimited
  const percentage = (current / limit) * 100;
  if (percentage >= 120) return "HARD_LIMIT";
  if (percentage >= 100) return "WARNING";
  if (percentage >= 80) return "INFO";
  return "NORMAL";
}
```

- **< 80%:** `NORMAL` (Standard operations continue).
- **80% - 99%:** `INFO` (Advisory banners and non-blocking notifications).
- **100% - 119%:** `WARNING` (Urgent warnings, upgrade prompts; inventory sync continues).
- **>= 120%:** `HARD_LIMIT` (Discretionary additions blocked; inventory sync protected).

---

## 7. The Critical Invariant: Protection of Inventory Synchronization

To prevent stock desynchronization and channel overselling:

```ts
export function assertOperationPermitted(
  action: string,
  metric: UsageMetricType,
  current: number,
  limit: number
): void {
  if (limit <= 0) return;

  const isCriticalSyncOperation =
    action === "INVENTORY_SYNC" ||
    action === "SYNC_OPERATION" ||
    action === "READ_BACK_VERIFICATION" ||
    action === "INVENTORY_MUTATION" ||
    action === "RECONCILIATION_CORRECTION" ||
    action === "ORDER_RESERVATION";

  if (isCriticalSyncOperation) {
    // Critical sync operations always proceed to protect inventory correctness
    return;
  }

  const isDiscretionaryResourceCreation =
    metric === "CHANNELS" ||
    metric === "WAREHOUSES" ||
    metric === "USERS";

  if (isDiscretionaryResourceCreation && current >= limit) {
    throw new PlanLimitExceededError(metric, current, limit, { action });
  }

  if (current >= limit * 1.2) {
    throw new PlanLimitExceededError(metric, current, limit, { action, hardCap: limit * 1.2 });
  }
}
```

---

## 8. REST API Endpoints & RBAC Matrix

| Endpoint | Method | Permission | Allowed Roles | Description |
|:---|:---:|:---:|:---:|:---|
| `/billing/subscription` | `GET` | `billing:read` | `OWNER`, `ADMIN`, `MANAGER`, `VIEWER` | Returns current subscription and usage metrics |
| `/billing/checkout` | `POST` | `billing:manage` | `OWNER`, `ADMIN` | Creates Stripe Checkout Session for plan upgrade |
| `/billing/portal` | `POST` | `billing:manage` | `OWNER`, `ADMIN` | Creates Stripe Customer Portal Session for billing settings |
| `/webhooks/stripe` | `POST` | None (HMAC) | Stripe Webhook Service | Machine-to-machine event ingestion with signature verification |

---

## 9. Verification Evidence

- **Phase 21 Dedicated Test Suite:** [`tests/phase21-billing.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase21-billing.test.ts)
  - **Tests Passed:** 29 / 29
  - **Suites:** 8
  - **Duration:** ~145 ms
- **Global Regression Suite (`npm test`):**
  - **Total Tests:** 457 / 457 Passed (0 Failed, 0 Skipped)
  - **Suites:** 174
- **Monorepo Compilation & Typecheck:**
  - `npm run typecheck`: Exit code 0 across all 13 packages and apps.
  - `npm run build`: Exit code 0 across all 13 packages and apps.
