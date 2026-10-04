"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ALLOWED_SUBSCRIPTION_TRANSITIONS = void 0;
exports.getPlanEntitlements = getPlanEntitlements;
exports.calculateThresholdLevel = calculateThresholdLevel;
exports.assertOperationPermitted = assertOperationPermitted;
exports.validateSubscriptionTransition = validateSubscriptionTransition;
exports.createInitialSubscription = createInitialSubscription;
exports.applyStripeEventToSubscription = applyStripeEventToSubscription;
const contracts_1 = require("@platform/contracts");
const errors_js_1 = require("./errors.js");
/**
 * Returns canonical entitlements for a given billing plan.
 */
function getPlanEntitlements(plan) {
    return contracts_1.PLAN_ENTITLEMENTS[plan] || contracts_1.PLAN_ENTITLEMENTS.STARTER;
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
function calculateThresholdLevel(current, limit) {
    if (limit <= 0)
        return "NORMAL"; // Unlimited
    const percentage = (current / limit) * 100;
    if (percentage >= 120)
        return "HARD_LIMIT";
    if (percentage >= 100)
        return "WARNING";
    if (percentage >= 80)
        return "INFO";
    return "NORMAL";
}
/**
 * CRITICAL SPECIFICATION INVARIANT (Prompt 22 & Section 75):
 * "Never abruptly disable critical inventory synchronization because a merchant crossed a soft usage threshold."
 *
 * Evaluates whether an operation is permitted under current resource usage.
 */
function assertOperationPermitted(action, metric, current, limit) {
    // Unlimited plans never restrict operations
    if (limit <= 0)
        return;
    // Critical inventory synchronization and verification operations are NEVER blocked
    const isCriticalSyncOperation = action === "INVENTORY_SYNC" ||
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
    const isDiscretionaryResourceCreation = metric === "CHANNELS" ||
        metric === "WAREHOUSES" ||
        metric === "USERS";
    if (isDiscretionaryResourceCreation && current >= limit) {
        throw new errors_js_1.PlanLimitExceededError(metric, current, limit, { action });
    }
    // General hard-limit threshold enforcement (>= 120% cap)
    if (current >= limit * 1.2) {
        throw new errors_js_1.PlanLimitExceededError(metric, current, limit, { action, hardCap: limit * 1.2 });
    }
}
/**
 * Validates allowable state transitions for subscriptions.
 */
exports.ALLOWED_SUBSCRIPTION_TRANSITIONS = {
    INCOMPLETE: ["ACTIVE", "TRIALING", "CANCELED"],
    TRIALING: ["ACTIVE", "PAST_DUE", "CANCELED"],
    ACTIVE: ["ACTIVE", "PAST_DUE", "CANCELED", "PAUSED"],
    PAST_DUE: ["ACTIVE", "CANCELED", "UNPAID"],
    CANCELED: ["ACTIVE"], // Reactivation
    UNPAID: ["ACTIVE", "CANCELED"],
    PAUSED: ["ACTIVE", "CANCELED"],
};
function validateSubscriptionTransition(fromStatus, toStatus) {
    if (fromStatus === toStatus)
        return;
    const allowed = exports.ALLOWED_SUBSCRIPTION_TRANSITIONS[fromStatus] || [];
    if (!allowed.includes(toStatus)) {
        throw new errors_js_1.InvalidBillingTransitionError(fromStatus, toStatus);
    }
}
/**
 * Creates an initial baseline subscription for an organization.
 */
function createInitialSubscription(params) {
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
function applyStripeEventToSubscription(current, event) {
    const obj = event.data.object;
    switch (event.type) {
        case "checkout.session.completed": {
            const customerId = obj["customer"] || current.stripeCustomerId;
            const subId = obj["subscription"] || current.stripeSubscriptionId;
            const metadata = obj["metadata"] || {};
            const plan = metadata["plan"] || current.plan;
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
            const subId = obj["id"] || current.stripeSubscriptionId;
            const customerId = obj["customer"] || current.stripeCustomerId;
            const statusRaw = (obj["status"] || "active").toUpperCase();
            const status = statusRaw === "ACTIVE"
                ? "ACTIVE"
                : statusRaw === "TRIALING"
                    ? "TRIALING"
                    : statusRaw === "PAST_DUE"
                        ? "PAST_DUE"
                        : "ACTIVE";
            const metadata = obj["metadata"] || {};
            const plan = metadata["plan"] || current.plan;
            const periodStart = obj["current_period_start"]
                ? new Date(obj["current_period_start"] * 1000)
                : current.currentPeriodStart;
            const periodEnd = obj["current_period_end"]
                ? new Date(obj["current_period_end"] * 1000)
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
            const statusRaw = (obj["status"] || current.status).toUpperCase();
            const status = statusRaw === "ACTIVE"
                ? "ACTIVE"
                : statusRaw === "PAST_DUE"
                    ? "PAST_DUE"
                    : statusRaw === "CANCELED"
                        ? "CANCELED"
                        : statusRaw === "UNPAID"
                            ? "UNPAID"
                            : current.status;
            const metadata = obj["metadata"] || {};
            const plan = metadata["plan"] || current.plan;
            const cancelAtPeriodEnd = Boolean(obj["cancel_at_period_end"]);
            const periodStart = obj["current_period_start"]
                ? new Date(obj["current_period_start"] * 1000)
                : current.currentPeriodStart;
            const periodEnd = obj["current_period_end"]
                ? new Date(obj["current_period_end"] * 1000)
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
//# sourceMappingURL=billing-service.js.map