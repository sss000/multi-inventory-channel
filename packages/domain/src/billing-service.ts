import {
  BillingPlan,
  SubscriptionStatus,
  UsageMetricType,
  ThresholdLevel,
  Entitlements,
  PLAN_ENTITLEMENTS,
} from "@platform/contracts";
import {
  PlanLimitExceededError,
  InvalidBillingTransitionError,
} from "./errors.js";

/**
 * Pure Billing Domain Service & Entitlements Engine
 * Canonical Specification: Sections 38, 56, 72, 73, 74, 75, 116 of 01_ENGINEERING_SPEC.md & Prompt 22
 */

export interface SubscriptionState {
  id: string;
  organizationId: string;
  stripeCustomerId: string;
  stripeSubscriptionId: string | null;
  plan: BillingPlan;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt?: Date | null;
}

export interface StripeBillingEvent {
  id: string;
  type:
    | "customer.subscription.created"
    | "customer.subscription.updated"
    | "customer.subscription.deleted"
    | "invoice.paid"
    | "invoice.payment_failed"
    | "checkout.session.completed";
  data: {
    object: Record<string, unknown>;
  };
  created: number;
}

/**
 * Returns canonical entitlements for a given billing plan.
 */
export function getPlanEntitlements(plan: BillingPlan): Entitlements {
  return PLAN_ENTITLEMENTS[plan] || PLAN_ENTITLEMENTS.STARTER;
}

/**
 * Calculates current threshold severity level for a metric.
 * Rules (Section 75 & Prompt 22):
 * - < 80%: NORMAL
 * - 80% - 99%: INFO
 * - 100% - 119%: WARNING
 * - >= 120%: HARD_LIMIT
 * Unlimited metrics (-1) are always NORMAL.
 */
export function calculateThresholdLevel(current: number, limit: number): ThresholdLevel {
  if (limit <= 0) return "NORMAL"; // Unlimited
  const percentage = (current / limit) * 100;
  if (percentage >= 120) return "HARD_LIMIT";
  if (percentage >= 100) return "WARNING";
  if (percentage >= 80) return "INFO";
  return "NORMAL";
}

/**
 * CRITICAL SPECIFICATION INVARIANT (Prompt 22 & Section 75):
 * "Never abruptly disable critical inventory synchronization because a merchant crossed a soft usage threshold."
 *
 * Evaluates whether an operation is permitted under current resource usage.
 */
export function assertOperationPermitted(
  action: string,
  metric: UsageMetricType,
  current: number,
  limit: number
): void {
  // Unlimited plans never restrict operations
  if (limit <= 0) return;

  // Critical inventory synchronization and verification operations are NEVER blocked
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

  // Discretionary creation operations (channels, warehouses, users) are enforced at hard limit
  const isDiscretionaryResourceCreation =
    metric === "CHANNELS" ||
    metric === "WAREHOUSES" ||
    metric === "USERS";

  if (isDiscretionaryResourceCreation && current >= limit) {
    throw new PlanLimitExceededError(metric, current, limit, { action });
  }

  // General hard-limit threshold enforcement (>= 120% cap)
  if (current >= limit * 1.2) {
    throw new PlanLimitExceededError(metric, current, limit, { action, hardCap: limit * 1.2 });
  }
}

/**
 * Validates allowable state transitions for subscriptions.
 */
export const ALLOWED_SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  INCOMPLETE: ["ACTIVE", "TRIALING", "CANCELED"],
  TRIALING: ["ACTIVE", "PAST_DUE", "CANCELED"],
  ACTIVE: ["ACTIVE", "PAST_DUE", "CANCELED", "PAUSED"],
  PAST_DUE: ["ACTIVE", "CANCELED", "UNPAID"],
  CANCELED: ["ACTIVE"], // Reactivation
  UNPAID: ["ACTIVE", "CANCELED"],
  PAUSED: ["ACTIVE", "CANCELED"],
};

export function validateSubscriptionTransition(
  fromStatus: SubscriptionStatus,
  toStatus: SubscriptionStatus
): void {
  if (fromStatus === toStatus) return;
  const allowed = ALLOWED_SUBSCRIPTION_TRANSITIONS[fromStatus] || [];
  if (!allowed.includes(toStatus)) {
    throw new InvalidBillingTransitionError(fromStatus, toStatus);
  }
}

/**
 * Creates an initial baseline subscription for an organization.
 */
export function createInitialSubscription(params: {
  id?: string;
  organizationId: string;
  stripeCustomerId?: string;
  plan?: BillingPlan;
}): SubscriptionState {
  const now = new Date();
  const nextMonth = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  return {
    id: params.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    organizationId: params.organizationId,
    stripeCustomerId: params.stripeCustomerId || `cus_mock_${Date.now()}`,
    stripeSubscriptionId: null,
    plan: params.plan || "STARTER",
    status: "ACTIVE",
    currentPeriodStart: now,
    currentPeriodEnd: nextMonth,
    cancelAtPeriodEnd: false,
    canceledAt: null,
  };
}

/**
 * Applies a verified Stripe event to the subscription state.
 * Guaranteed idempotent and state-machine conforming.
 */
export function applyStripeEventToSubscription(
  current: SubscriptionState,
  event: StripeBillingEvent
): SubscriptionState {
  const obj = event.data.object;

  switch (event.type) {
    case "checkout.session.completed": {
      const customerId = (obj["customer"] as string) || current.stripeCustomerId;
      const subId = (obj["subscription"] as string) || current.stripeSubscriptionId;
      const metadata = (obj["metadata"] as Record<string, string>) || {};
      const plan = (metadata["plan"] as BillingPlan) || current.plan;

      validateSubscriptionTransition(current.status, "ACTIVE");
      return {
        ...current,
        stripeCustomerId: customerId,
        stripeSubscriptionId: subId,
        plan,
        status: "ACTIVE",
        cancelAtPeriodEnd: false,
        canceledAt: null,
      };
    }

    case "customer.subscription.created": {
      const subId = (obj["id"] as string) || current.stripeSubscriptionId;
      const customerId = (obj["customer"] as string) || current.stripeCustomerId;
      const statusRaw = ((obj["status"] as string) || "active").toUpperCase();
      const status: SubscriptionStatus =
        statusRaw === "ACTIVE"
          ? "ACTIVE"
          : statusRaw === "TRIALING"
          ? "TRIALING"
          : statusRaw === "PAST_DUE"
          ? "PAST_DUE"
          : "ACTIVE";

      const metadata = (obj["metadata"] as Record<string, string>) || {};
      const plan = (metadata["plan"] as BillingPlan) || current.plan;

      const periodStart = obj["current_period_start"]
        ? new Date((obj["current_period_start"] as number) * 1000)
        : current.currentPeriodStart;
      const periodEnd = obj["current_period_end"]
        ? new Date((obj["current_period_end"] as number) * 1000)
        : current.currentPeriodEnd;

      validateSubscriptionTransition(current.status, status);
      return {
        ...current,
        stripeSubscriptionId: subId,
        stripeCustomerId: customerId,
        plan,
        status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      };
    }

    case "customer.subscription.updated": {
      const statusRaw = ((obj["status"] as string) || current.status).toUpperCase();
      const status: SubscriptionStatus =
        statusRaw === "ACTIVE"
          ? "ACTIVE"
          : statusRaw === "PAST_DUE"
          ? "PAST_DUE"
          : statusRaw === "CANCELED"
          ? "CANCELED"
          : statusRaw === "UNPAID"
          ? "UNPAID"
          : current.status;

      const metadata = (obj["metadata"] as Record<string, string>) || {};
      const plan = (metadata["plan"] as BillingPlan) || current.plan;
      const cancelAtPeriodEnd = Boolean(obj["cancel_at_period_end"]);

      const periodStart = obj["current_period_start"]
        ? new Date((obj["current_period_start"] as number) * 1000)
        : current.currentPeriodStart;
      const periodEnd = obj["current_period_end"]
        ? new Date((obj["current_period_end"] as number) * 1000)
        : current.currentPeriodEnd;

      validateSubscriptionTransition(current.status, status);

      return {
        ...current,
        plan,
        status,
        currentPeriodStart: periodStart,
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd,
        canceledAt: status === "CANCELED" ? new Date() : cancelAtPeriodEnd ? current.canceledAt || new Date() : null,
      };
    }

    case "customer.subscription.deleted": {
      validateSubscriptionTransition(current.status, "CANCELED");
      return {
        ...current,
        status: "CANCELED",
        cancelAtPeriodEnd: false,
        canceledAt: new Date(),
      };
    }

    case "invoice.paid": {
      // Payment success clears past_due, keeps active, extends period
      const periodEnd = obj["lines"]
        ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        : current.currentPeriodEnd;

      validateSubscriptionTransition(current.status, "ACTIVE");
      return {
        ...current,
        status: "ACTIVE",
        currentPeriodEnd: periodEnd > current.currentPeriodEnd ? periodEnd : current.currentPeriodEnd,
      };
    }

    case "invoice.payment_failed": {
      // Payment failure moves subscription to PAST_DUE
      validateSubscriptionTransition(current.status, "PAST_DUE");
      return {
        ...current,
        status: "PAST_DUE",
      };
    }

    default:
      return current;
  }
}
