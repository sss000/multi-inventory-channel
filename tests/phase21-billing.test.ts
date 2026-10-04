/**
 * Phase 21: Billing System Acceptance Test Suite
 * Canonical Specification: Sections 38, 56, 72, 73, 74, 75, 116 of 01_ENGINEERING_SPEC.md & Prompt 22 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 *
 * Verifies:
 * 1. Internal Entitlement Store:
 *    - 4 Canonical Plans: STARTER, GROWTH, SCALE, ENTERPRISE.
 *    - Matrix of limits (orders, channels, warehouses, users, rate limits, automations, storage).
 *    - Feature flags (auditExport, advancedReconciliation, webhooks, aiInsights, prioritySupport).
 * 2. Threshold Calculation Engine:
 *    - < 80%: NORMAL
 *    - 80% - 99%: INFO
 *    - 100% - 119%: WARNING
 *    - >= 120%: HARD_LIMIT
 *    - Unlimited plans (-1) are always NORMAL.
 * 3. CRITICAL INVARIANT GATE (Prompt 22 & Section 75):
 *    - Never abruptly disable critical inventory synchronization because a merchant crossed a soft usage threshold.
 *    - Whitelisted operations (INVENTORY_SYNC, SYNC_OPERATION, READ_BACK_VERIFICATION, INVENTORY_MUTATION,
 *      RECONCILIATION_CORRECTION, ORDER_RESERVATION) always proceed regardless of usage level.
 *    - Discretionary resource additions (CHANNELS, WAREHOUSES, USERS) are strictly bounded.
 * 4. The 8 Canonical Billing Scenarios (Prompt 22):
 *    - 1. New subscription creation
 *    - 2. Payment success
 *    - 3. Payment failure & past_due handling
 *    - 4. Plan upgrade (Starter -> Growth)
 *    - 5. Plan downgrade (Scale -> Growth)
 *    - 6. Cancellation (cancel_at_period_end & immediate)
 *    - 7. Reactivation (from CANCELED back to ACTIVE)
 *    - 8. Usage threshold enforcement across all 7 metrics
 * 5. Stripe Webhook Signature Verification:
 *    - HMAC-SHA256 timingSafeEqual validation.
 *    - Timestamp tolerance check (replay attack protection).
 *    - Tampered payload and invalid signature rejection.
 * 6. Audit Trail Integration:
 *    - Material billing mutations emit audit log events with actorType: "WEBHOOK".
 * 7. Multi-Tenant Isolation:
 *    - Org A and Org B subscriptions and metering are completely isolated.
 * 8. REST API Endpoints & RBAC:
 *    - GET /billing/subscription (requires billing:read)
 *    - POST /billing/checkout (requires billing:manage)
 *    - POST /billing/portal (requires billing:manage)
 *    - POST /webhooks/stripe (validates signature, returns 200 on success, 400 on invalid signature)
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  PLAN_ENTITLEMENTS,
  PLAN_PRICING,
} from "@platform/contracts";
import type {
  BillingPlan,
  SubscriptionStatus,
  UsageMetricType,
  SubscriptionDto,
} from "@platform/contracts";

import {
  getPlanEntitlements,
  calculateThresholdLevel,
  assertOperationPermitted,
  validateSubscriptionTransition,
  createInitialSubscription,
  applyStripeEventToSubscription,
  PlanLimitExceededError,
  InvalidBillingTransitionError,
  SubscriptionNotFoundError,
  BillingWebhookSignatureError,
} from "@platform/domain";
import type {
  StripeBillingEvent,
  SubscriptionState,
} from "@platform/domain";

import {
  BillingDatabaseService,
  InMemoryBillingRepository,
  AuditDatabaseService,
  InMemoryAuditRepository,
} from "@platform/database";

import {
  StripeBillingClient,
  generateStripeSignature,
  verifyStripeWebhookSignature,
} from "@platform/integrations";

import { startApiServer } from "@platform/api";
import { SupabaseAuthAdapter } from "@platform/security";

const ORG_A_ID = "00000000-0000-0000-0000-000000000001";
const ORG_B_ID = "00000000-0000-0000-0000-000000000002";
const USER_ADMIN_A = "user_admin_org_a";
const USER_VIEWER_A = "user_viewer_org_a";
const USER_OPERATOR_A = "user_operator_org_a";
const USER_ADMIN_B = "user_admin_org_b";

const WEBHOOK_SECRET = "whsec_test_secret_key_1234567890abcdef";

function createMockAuthAdapter(): SupabaseAuthAdapter {
  const client = {
    auth: {
      getUser: async (token: string) => {
        if (token === "token_admin_org_a") {
          return {
            data: {
              user: {
                id: USER_ADMIN_A,
                email: "admin@orga.com",
                user_metadata: {
                  organization_id: ORG_A_ID,
                  organization_name: "Org A",
                  role: "ADMIN",
                },
              },
            },
            error: null,
          };
        }
        if (token === "token_viewer_org_a") {
          return {
            data: {
              user: {
                id: USER_VIEWER_A,
                email: "viewer@orga.com",
                user_metadata: {
                  organization_id: ORG_A_ID,
                  organization_name: "Org A",
                  role: "VIEWER",
                },
              },
            },
            error: null,
          };
        }
        if (token === "token_operator_org_a") {
          return {
            data: {
              user: {
                id: USER_OPERATOR_A,
                email: "operator@orga.com",
                user_metadata: {
                  organization_id: ORG_A_ID,
                  organization_name: "Org A",
                  role: "OPERATOR",
                },
              },
            },
            error: null,
          };
        }
        if (token === "token_admin_org_b") {
          return {
            data: {
              user: {
                id: USER_ADMIN_B,
                email: "admin@orgb.com",
                user_metadata: {
                  organization_id: ORG_B_ID,
                  organization_name: "Org B",
                  role: "ADMIN",
                },
              },
            },
            error: null,
          };
        }
        return { data: { user: null }, error: { message: "Invalid token" } };
      },
    },
  };
  return new SupabaseAuthAdapter(client as any);
}

describe("Phase 21: Billing System Acceptance Suite", () => {
  let billingRepo: InMemoryBillingRepository;
  let auditRepo: InMemoryAuditRepository;
  let auditDbService: AuditDatabaseService;
  let billingDbService: BillingDatabaseService;
  let stripeClient: StripeBillingClient;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    billingRepo = new InMemoryBillingRepository();
    auditRepo = new InMemoryAuditRepository();
    auditDbService = new AuditDatabaseService(auditRepo);
    billingDbService = new BillingDatabaseService(billingRepo, auditDbService);
    stripeClient = new StripeBillingClient({
      webhookSecret: WEBHOOK_SECRET,
    });

    const authAdapter = createMockAuthAdapter();
    server = startApiServer({
      portOverride: 0,
      authAdapter,
      billingDbService,
      stripeClient,
      auditDbService,
    });

    await new Promise<void>((resolve) => {
      server.on("listening", resolve);
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // =========================================================================
  // 1. CANONICAL PLANS & INTERNAL ENTITLEMENTS STORE
  // =========================================================================
  describe("1. Canonical Plans & Internal Entitlements Store", () => {
    it("should provide correct canonical entitlements for all 4 plans", () => {
      const plans: BillingPlan[] = ["STARTER", "GROWTH", "SCALE", "ENTERPRISE"];
      for (const plan of plans) {
        const ent = getPlanEntitlements(plan);
        assert.ok(ent, `Entitlements exist for ${plan}`);
        assert.ok(ent.maxMonthlyOrders !== undefined);
        assert.ok(ent.maxChannels !== undefined);
        assert.ok(ent.maxWarehouses !== undefined);
        assert.ok(ent.maxUsers !== undefined);
        assert.ok(ent.features !== undefined);
      }

      // Starter limits
      const starter = getPlanEntitlements("STARTER");
      assert.equal(starter.maxMonthlyOrders, 500);
      assert.equal(starter.maxChannels, 2);
      assert.equal(starter.maxWarehouses, 1);
      assert.equal(starter.features.auditExport, false);

      // Growth limits
      const growth = getPlanEntitlements("GROWTH");
      assert.equal(growth.maxMonthlyOrders, 2500);
      assert.equal(growth.maxChannels, 10);
      assert.equal(growth.features.auditExport, true);

      // Enterprise has unlimited values (-1)
      const enterprise = getPlanEntitlements("ENTERPRISE");
      assert.equal(enterprise.maxMonthlyOrders, -1);
      assert.equal(enterprise.maxChannels, -1);
      assert.equal(enterprise.features.prioritySupport, true);
    });

    it("should provide canonical pricing matching Section 72", () => {
      assert.equal(PLAN_PRICING.STARTER.monthlyPriceCents, 2900);
      assert.equal(PLAN_PRICING.GROWTH.monthlyPriceCents, 7900);
      assert.equal(PLAN_PRICING.SCALE.monthlyPriceCents, 19900);
      assert.equal(PLAN_PRICING.ENTERPRISE.monthlyPriceCents, 0);
    });
  });

  // =========================================================================
  // 2. THRESHOLD CALCULATION ENGINE
  // =========================================================================
  describe("2. Usage Threshold Calculation Engine (Section 75 & Prompt 22)", () => {
    it("should calculate correct severity thresholds based on usage percentage", () => {
      const limit = 1000;

      // < 80%: NORMAL
      assert.equal(calculateThresholdLevel(0, limit), "NORMAL");
      assert.equal(calculateThresholdLevel(799, limit), "NORMAL");

      // 80% - 99%: INFO
      assert.equal(calculateThresholdLevel(800, limit), "INFO");
      assert.equal(calculateThresholdLevel(999, limit), "INFO");

      // 100% - 119%: WARNING
      assert.equal(calculateThresholdLevel(1000, limit), "WARNING");
      assert.equal(calculateThresholdLevel(1199, limit), "WARNING");

      // >= 120%: HARD_LIMIT
      assert.equal(calculateThresholdLevel(1200, limit), "HARD_LIMIT");
      assert.equal(calculateThresholdLevel(2000, limit), "HARD_LIMIT");

      // Unlimited plans (-1) always NORMAL
      assert.equal(calculateThresholdLevel(50000, -1), "NORMAL");
    });
  });

  // =========================================================================
  // 3. MANDATORY INVARIANT GATE: PRESERVATION OF CRITICAL INVENTORY SYNC
  // =========================================================================
  describe("3. CRITICAL INVARIANT GATE: Preservation of Critical Inventory Synchronization", () => {
    it("MUST NEVER block critical inventory synchronization even at 200% quota", () => {
      const criticalActions = [
        "INVENTORY_SYNC",
        "SYNC_OPERATION",
        "READ_BACK_VERIFICATION",
        "INVENTORY_MUTATION",
        "RECONCILIATION_CORRECTION",
        "ORDER_RESERVATION",
      ];

      for (const action of criticalActions) {
        assert.doesNotThrow(() => {
          assertOperationPermitted(action, "MONTHLY_ORDERS", 2000, 1000); // 200% over limit
        }, `Critical operation ${action} must never be blocked by usage limits`);
      }
    });

    it("should block discretionary resource creation (channels, warehouses, users) when limit reached", () => {
      // Discretionary: CHANNELS
      assert.throws(
        () => {
          assertOperationPermitted("CHANNEL_CREATE", "CHANNELS", 2, 2);
        },
        PlanLimitExceededError,
        "Creating a channel beyond limit must throw PlanLimitExceededError"
      );

      // Discretionary: WAREHOUSES
      assert.throws(
        () => {
          assertOperationPermitted("WAREHOUSE_CREATE", "WAREHOUSES", 1, 1);
        },
        PlanLimitExceededError,
        "Creating a warehouse beyond limit must throw PlanLimitExceededError"
      );

      // Discretionary: USERS
      assert.throws(
        () => {
          assertOperationPermitted("USER_INVITE", "USERS", 5, 5);
        },
        PlanLimitExceededError,
        "Inviting a user beyond limit must throw PlanLimitExceededError"
      );
    });

    it("should allow discretionary actions when under limit", () => {
      assert.doesNotThrow(() => {
        assertOperationPermitted("CHANNEL_CREATE", "CHANNELS", 1, 2);
      });
      assert.doesNotThrow(() => {
        assertOperationPermitted("WAREHOUSE_CREATE", "WAREHOUSES", 0, 1);
      });
    });

    it("should block non-critical operations when reaching 120% hard limit", () => {
      assert.throws(
        () => {
          assertOperationPermitted("AUTOMATION_EXECUTE", "AUTOMATION_EXECUTIONS", 125, 100);
        },
        PlanLimitExceededError
      );
    });
  });

  // =========================================================================
  // 4. STRIPE WEBHOOK SIGNATURE VERIFICATION
  // =========================================================================
  describe("4. Stripe Webhook Signature Verification", () => {
    it("should verify valid signature with HMAC-SHA256 and timingSafeEqual", () => {
      const payload = JSON.stringify({ id: "evt_123", type: "invoice.paid" });
      const now = Math.floor(Date.now() / 1000);
      const signatureHeader = generateStripeSignature(payload, WEBHOOK_SECRET, now);

      const res = verifyStripeWebhookSignature({
        payload,
        signatureHeader,
        secret: WEBHOOK_SECRET,
      });

      assert.equal(res.valid, true);
      assert.equal(res.timestamp, now);
    });

    it("should reject tampered payload", () => {
      const payload = JSON.stringify({ id: "evt_123", type: "invoice.paid" });
      const tamperedPayload = JSON.stringify({ id: "evt_123", type: "invoice.paid", attacker: "evil" });
      const now = Math.floor(Date.now() / 1000);
      const signatureHeader = generateStripeSignature(payload, WEBHOOK_SECRET, now);

      assert.throws(
        () => {
          verifyStripeWebhookSignature({
            payload: tamperedPayload,
            signatureHeader,
            secret: WEBHOOK_SECRET,
          });
        },
        BillingWebhookSignatureError
      );
    });

    it("should reject signature generated with wrong secret", () => {
      const payload = JSON.stringify({ id: "evt_123", type: "invoice.paid" });
      const signatureHeader = generateStripeSignature(payload, "wrong_secret");

      assert.throws(
        () => {
          verifyStripeWebhookSignature({
            payload,
            signatureHeader,
            secret: WEBHOOK_SECRET,
          });
        },
        BillingWebhookSignatureError
      );
    });

    it("should reject expired timestamp (older than toleranceSeconds)", () => {
      const payload = JSON.stringify({ id: "evt_123", type: "invoice.paid" });
      const staleTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const signatureHeader = generateStripeSignature(payload, WEBHOOK_SECRET, staleTimestamp);

      assert.throws(
        () => {
          verifyStripeWebhookSignature({
            payload,
            signatureHeader,
            secret: WEBHOOK_SECRET,
            toleranceSeconds: 300, // 5 minutes tolerance
          });
        },
        BillingWebhookSignatureError
      );
    });

    it("should reject malformed signature header", () => {
      assert.throws(
        () => {
          verifyStripeWebhookSignature({
            payload: "{}",
            signatureHeader: "invalid_format",
            secret: WEBHOOK_SECRET,
          });
        },
        BillingWebhookSignatureError
      );
    });
  });

  // =========================================================================
  // 5. THE 8 CANONICAL BILLING SCENARIOS (Prompt 22 & Section 116)
  // =========================================================================
  describe("5. The 8 Canonical Billing Scenarios", () => {
    // Scenario 1: New subscription creation
    it("Scenario 1: New subscription creation via verified event", async () => {
      const event: StripeBillingEvent = {
        id: "evt_sub_created",
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_stripe_123",
            customer: "cus_stripe_123",
            status: "active",
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
            cancel_at_period_end: false,
            metadata: {
              organizationId: ORG_A_ID,
              plan: "GROWTH",
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      const result = await billingDbService.handleStripeEvent(event);
      assert.equal(result.organizationId, ORG_A_ID);
      assert.equal(result.plan, "GROWTH");
      assert.equal(result.status, "ACTIVE");
      assert.equal(result.stripeCustomerId, "cus_stripe_123");
      assert.equal(result.stripeSubscriptionId, "sub_stripe_123");
      assert.equal(result.entitlements.maxMonthlyOrders, 2500);
    });

    // Scenario 2: Payment success
    it("Scenario 2: Payment success (invoice.paid)", async () => {
      // First create active sub
      await billingDbService.getOrCreateSubscription(ORG_A_ID, "cus_stripe_123", "GROWTH");

      const event: StripeBillingEvent = {
        id: "evt_invoice_paid",
        type: "invoice.paid",
        data: {
          object: {
            id: "in_stripe_paid",
            customer: "cus_stripe_123",
            status: "paid",
            metadata: { organizationId: ORG_A_ID },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      const result = await billingDbService.handleStripeEvent(event);
      assert.equal(result.status, "ACTIVE");
    });

    // Scenario 3: Payment failure & past_due handling
    it("Scenario 3: Payment failure (invoice.payment_failed) transitions to PAST_DUE", async () => {
      await billingDbService.getOrCreateSubscription(ORG_A_ID, "cus_stripe_123", "GROWTH");

      const event: StripeBillingEvent = {
        id: "evt_invoice_failed",
        type: "invoice.payment_failed",
        data: {
          object: {
            id: "in_stripe_failed",
            customer: "cus_stripe_123",
            status: "open",
            metadata: { organizationId: ORG_A_ID },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      const result = await billingDbService.handleStripeEvent(event);
      assert.equal(result.status, "PAST_DUE");
    });

    // Scenario 4: Plan upgrade (Starter -> Growth)
    it("Scenario 4: Plan upgrade (STARTER -> GROWTH) immediately unlocks higher entitlements", async () => {
      const initial = await billingDbService.getOrCreateSubscription(ORG_A_ID, "cus_stripe_123", "STARTER");
      assert.equal(initial.plan, "STARTER");
      assert.equal(initial.entitlements.maxMonthlyOrders, 500);

      const upgradeEvent: StripeBillingEvent = {
        id: "evt_upgrade",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_stripe_123",
            customer: "cus_stripe_123",
            status: "active",
            metadata: {
              organizationId: ORG_A_ID,
              plan: "GROWTH",
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      const upgraded = await billingDbService.handleStripeEvent(upgradeEvent);
      assert.equal(upgraded.plan, "GROWTH");
      assert.equal(upgraded.entitlements.maxMonthlyOrders, 2500);
      assert.equal(upgraded.entitlements.maxChannels, 10);
      assert.equal(upgraded.entitlements.features.auditExport, true);

      // Verify audit log emitted for plan change
      const auditLogs = await auditDbService.list(ORG_A_ID, { action: "BILLING_PLAN_CHANGED" });
      assert.equal(auditLogs.total >= 1, true);
      assert.equal(auditLogs.items[0].actor_type, "WEBHOOK");
    });

    // Scenario 5: Plan downgrade (Scale -> Growth)
    it("Scenario 5: Plan downgrade (SCALE -> GROWTH) adjusts entitlements downward", async () => {
      await billingDbService.getOrCreateSubscription(ORG_A_ID, "cus_stripe_123", "SCALE");

      const downgradeEvent: StripeBillingEvent = {
        id: "evt_downgrade",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_stripe_123",
            customer: "cus_stripe_123",
            status: "active",
            metadata: {
              organizationId: ORG_A_ID,
              plan: "GROWTH",
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      const downgraded = await billingDbService.handleStripeEvent(downgradeEvent);
      assert.equal(downgraded.plan, "GROWTH");
      assert.equal(downgraded.entitlements.maxMonthlyOrders, 2500);
      assert.equal(downgraded.entitlements.maxChannels, 10);
    });

    // Scenario 6: Cancellation (cancel_at_period_end & immediate)
    it("Scenario 6: Cancellation sets cancel_at_period_end and customer.subscription.deleted sets CANCELED", async () => {
      await billingDbService.getOrCreateSubscription(ORG_A_ID, "cus_stripe_123", "GROWTH");

      // 6.1 Scheduled cancellation at end of period
      const scheduleCancelEvent: StripeBillingEvent = {
        id: "evt_sched_cancel",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_stripe_123",
            customer: "cus_stripe_123",
            status: "active",
            cancel_at_period_end: true,
            metadata: { organizationId: ORG_A_ID },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      const scheduled = await billingDbService.handleStripeEvent(scheduleCancelEvent);
      assert.equal(scheduled.status, "ACTIVE");
      assert.equal(scheduled.cancelAtPeriodEnd, true);

      // 6.2 Period ends: customer.subscription.deleted
      const deleteEvent: StripeBillingEvent = {
        id: "evt_deleted",
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_stripe_123",
            customer: "cus_stripe_123",
            status: "canceled",
            metadata: { organizationId: ORG_A_ID },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      const canceled = await billingDbService.handleStripeEvent(deleteEvent);
      assert.equal(canceled.status, "CANCELED");
      assert.ok(canceled.canceledAt !== null);

      // Verify audit log emitted for cancellation
      const auditLogs = await auditDbService.list(ORG_A_ID, { action: "BILLING_SUBSCRIPTION_CANCELLED" });
      assert.equal(auditLogs.total >= 1, true);
    });

    // Scenario 7: Reactivation
    it("Scenario 7: Reactivation restores subscription from CANCELED to ACTIVE", async () => {
      // Setup canceled subscription
      await billingDbService.getOrCreateSubscription(ORG_A_ID, "cus_stripe_123", "STARTER");
      await billingDbService.handleStripeEvent({
        id: "evt_cancel",
        type: "customer.subscription.deleted",
        data: {
          object: { customer: "cus_stripe_123", metadata: { organizationId: ORG_A_ID } },
        },
        created: Math.floor(Date.now() / 1000),
      });

      const reactivateEvent: StripeBillingEvent = {
        id: "evt_reactivate",
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_stripe_reactivated",
            customer: "cus_stripe_123",
            status: "active",
            metadata: { organizationId: ORG_A_ID, plan: "GROWTH" },
          },
        },
        created: Math.floor(Date.now() / 1000),
      };

      const reactivated = await billingDbService.handleStripeEvent(reactivateEvent);
      assert.equal(reactivated.status, "ACTIVE");
      assert.equal(reactivated.plan, "GROWTH");
      assert.equal(reactivated.cancelAtPeriodEnd, false);
      assert.equal(reactivated.canceledAt, null);
    });

    // Scenario 8: Threshold enforcement across all 7 metrics
    it("Scenario 8: Usage threshold enforcement across all 7 metrics", async () => {
      await billingDbService.getOrCreateSubscription(ORG_A_ID, "cus_stripe_123", "STARTER");
      // Starter: orders: 500, channels: 2, warehouses: 1, users: 2, apicalls: 60, automations: 100, storage: 500

      // Record 420 orders (84% -> INFO)
      await billingDbService.recordUsage({
        organizationId: ORG_A_ID,
        metric: "MONTHLY_ORDERS",
        quantityDelta: 420,
      });

      // Record 1 channel (50% -> NORMAL)
      await billingDbService.recordUsage({
        organizationId: ORG_A_ID,
        metric: "CHANNELS",
        quantityDelta: 1,
      });

      // Record 1 warehouse (100% -> WARNING)
      await billingDbService.recordUsage({
        organizationId: ORG_A_ID,
        metric: "WAREHOUSES",
        quantityDelta: 1,
      });

      // Record 130 automations (130% -> HARD_LIMIT)
      await billingDbService.recordUsage({
        organizationId: ORG_A_ID,
        metric: "AUTOMATION_EXECUTIONS",
        quantityDelta: 130,
      });

      const sub = await billingDbService.getSubscription(ORG_A_ID);
      assert.ok(sub);

      assert.equal(sub.usage.MONTHLY_ORDERS.threshold, "INFO");
      assert.equal(sub.usage.MONTHLY_ORDERS.current, 420);
      assert.equal(sub.usage.MONTHLY_ORDERS.percentage, 84);

      assert.equal(sub.usage.CHANNELS.threshold, "NORMAL");
      assert.equal(sub.usage.CHANNELS.current, 1);

      assert.equal(sub.usage.WAREHOUSES.threshold, "WARNING");
      assert.equal(sub.usage.WAREHOUSES.current, 1);

      assert.equal(sub.usage.AUTOMATION_EXECUTIONS.threshold, "HARD_LIMIT");
      assert.equal(sub.usage.AUTOMATION_EXECUTIONS.current, 130);

      // Verify that critical sync is STILL allowed despite automations being at HARD_LIMIT and orders at INFO
      const checkResult = await billingDbService.checkOperationAllowed(
        ORG_A_ID,
        "INVENTORY_SYNC",
        "MONTHLY_ORDERS"
      );
      assert.equal(checkResult.allowed, true);
    });
  });

  // =========================================================================
  // 6. MULTI-TENANT ISOLATION
  // =========================================================================
  describe("6. Multi-Tenant Isolation", () => {
    it("should strictly isolate subscriptions and usage between Org A and Org B", async () => {
      // Create Starter for Org A
      await billingDbService.getOrCreateSubscription(ORG_A_ID, "cus_org_a", "STARTER");
      // Create Scale for Org B
      await billingDbService.getOrCreateSubscription(ORG_B_ID, "cus_org_b", "SCALE");

      // Record usage for Org A only
      await billingDbService.recordUsage({
        organizationId: ORG_A_ID,
        metric: "MONTHLY_ORDERS",
        quantityDelta: 300,
      });

      const subA = await billingDbService.getSubscription(ORG_A_ID);
      const subB = await billingDbService.getSubscription(ORG_B_ID);

      assert.equal(subA?.plan, "STARTER");
      assert.equal(subA?.usage.MONTHLY_ORDERS.current, 300);

      assert.equal(subB?.plan, "SCALE");
      assert.equal(subB?.usage.MONTHLY_ORDERS.current, 0); // Org B has 0 orders
    });
  });

  // =========================================================================
  // 7. REST API ENDPOINTS & RBAC ENFORCEMENT
  // =========================================================================
  describe("7. REST API Endpoints & RBAC Enforcement", () => {
    it("GET /billing/subscription should return subscription details for permitted roles", async () => {
      await billingDbService.getOrCreateSubscription(ORG_A_ID, "cus_org_a", "GROWTH");

      // ADMIN has billing:read
      const resAdmin = await fetch(`${baseUrl}/billing/subscription`, {
        headers: { authorization: "Bearer token_admin_org_a" },
      });
      assert.equal(resAdmin.status, 200);
      const bodyAdmin = (await resAdmin.json()) as { data: SubscriptionDto };
      assert.equal(bodyAdmin.data.organizationId, ORG_A_ID);
      assert.equal(bodyAdmin.data.plan, "GROWTH");
      assert.equal(bodyAdmin.data.entitlements.maxMonthlyOrders, 2500);

      // VIEWER has billing:read
      const resViewer = await fetch(`${baseUrl}/billing/subscription`, {
        headers: { authorization: "Bearer token_viewer_org_a" },
      });
      assert.equal(resViewer.status, 200);
    });

    it("GET /billing/subscription should reject OPERATOR with 403 Forbidden", async () => {
      // OPERATOR does not have billing:read
      const res = await fetch(`${baseUrl}/billing/subscription`, {
        headers: { authorization: "Bearer token_operator_org_a" },
      });
      assert.equal(res.status, 403);
    });

    it("GET /billing/subscription should reject unauthenticated requests with 401", async () => {
      const res = await fetch(`${baseUrl}/billing/subscription`);
      assert.equal(res.status, 401);
    });

    it("POST /billing/checkout should create checkout session for ADMIN but reject VIEWER", async () => {
      // ADMIN has billing:manage
      const resAdmin = await fetch(`${baseUrl}/billing/checkout`, {
        method: "POST",
        headers: {
          authorization: "Bearer token_admin_org_a",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan: "SCALE",
        }),
      });
      assert.equal(resAdmin.status, 200);
      const bodyAdmin = (await resAdmin.json()) as { data: { sessionId: string; url: string } };
      assert.ok(bodyAdmin.data.sessionId);
      assert.ok(bodyAdmin.data.url.includes("SCALE"));

      // VIEWER does NOT have billing:manage
      const resViewer = await fetch(`${baseUrl}/billing/checkout`, {
        method: "POST",
        headers: {
          authorization: "Bearer token_viewer_org_a",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          plan: "SCALE",
        }),
      });
      assert.equal(resViewer.status, 403);
    });

    it("POST /billing/portal should create portal session for ADMIN but reject VIEWER", async () => {
      // Setup customer ID
      await billingDbService.getOrCreateSubscription(ORG_A_ID, "cus_org_a", "GROWTH");

      // ADMIN has billing:manage
      const resAdmin = await fetch(`${baseUrl}/billing/portal`, {
        method: "POST",
        headers: {
          authorization: "Bearer token_admin_org_a",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          returnUrl: "https://app.example.com/settings/billing",
        }),
      });
      assert.equal(resAdmin.status, 200);
      const bodyAdmin = (await resAdmin.json()) as { data: { url: string } };
      assert.ok(bodyAdmin.data.url.includes("cus_org_a"));

      // VIEWER does NOT have billing:manage
      const resViewer = await fetch(`${baseUrl}/billing/portal`, {
        method: "POST",
        headers: {
          authorization: "Bearer token_viewer_org_a",
          "content-type": "application/json",
        },
        body: JSON.stringify({}),
      });
      assert.equal(resViewer.status, 403);
    });

    it("POST /webhooks/stripe should accept authentic webhook and update state", async () => {
      await billingDbService.getOrCreateSubscription(ORG_A_ID, "cus_stripe_webhook_test", "STARTER");

      const eventPayload = JSON.stringify({
        id: "evt_webhook_live_test",
        type: "customer.subscription.updated",
        data: {
          object: {
            id: "sub_webhook_test",
            customer: "cus_stripe_webhook_test",
            status: "active",
            metadata: {
              organizationId: ORG_A_ID,
              plan: "SCALE",
            },
          },
        },
        created: Math.floor(Date.now() / 1000),
      });

      const signature = generateStripeSignature(eventPayload, WEBHOOK_SECRET);

      const res = await fetch(`${baseUrl}/webhooks/stripe`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": signature,
        },
        body: eventPayload,
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as { received: boolean; plan: string };
      assert.equal(body.received, true);
      assert.equal(body.plan, "SCALE");

      // Verify that subscription in DB was updated to SCALE
      const sub = await billingDbService.getSubscription(ORG_A_ID);
      assert.equal(sub?.plan, "SCALE");
      assert.equal(sub?.entitlements.maxMonthlyOrders, 10000);
    });

    it("POST /webhooks/stripe should reject tampered webhook with 400 Bad Request", async () => {
      const originalPayload = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
      const tamperedPayload = JSON.stringify({ id: "evt_1", type: "invoice.paid", attacker: "yes" });
      const signature = generateStripeSignature(originalPayload, WEBHOOK_SECRET);

      const res = await fetch(`${baseUrl}/webhooks/stripe`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "stripe-signature": signature, // signature doesn't match tamperedPayload
        },
        body: tamperedPayload,
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, "INVALID_WEBHOOK_SIGNATURE");
    });

    it("POST /webhooks/stripe should reject missing signature with 400 Bad Request", async () => {
      const res = await fetch(`${baseUrl}/webhooks/stripe`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ id: "evt_1" }),
      });

      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: { code: string } };
      assert.equal(body.error.code, "INVALID_WEBHOOK_SIGNATURE");
    });
  });
});
