import { BillingPlan, SubscriptionStatus, UsageMetricType, ThresholdLevel, Entitlements } from "@platform/contracts";
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
    type: "customer.subscription.created" | "customer.subscription.updated" | "customer.subscription.deleted" | "invoice.paid" | "invoice.payment_failed" | "checkout.session.completed";
    data: {
        object: Record<string, unknown>;
    };
    created: number;
}
/**
 * Returns canonical entitlements for a given billing plan.
 */
export declare function getPlanEntitlements(plan: BillingPlan): Entitlements;
/**
 * Calculates current threshold severity level for a metric.
 * Rules (Section 75 & Prompt 22):
 * - < 80%: NORMAL
 * - 80% - 99%: INFO
 * - 100% - 119%: WARNING
 * - >= 120%: HARD_LIMIT
 * Unlimited metrics (-1) are always NORMAL.
 */
export declare function calculateThresholdLevel(current: number, limit: number): ThresholdLevel;
/**
 * CRITICAL SPECIFICATION INVARIANT (Prompt 22 & Section 75):
 * "Never abruptly disable critical inventory synchronization because a merchant crossed a soft usage threshold."
 *
 * Evaluates whether an operation is permitted under current resource usage.
 */
export declare function assertOperationPermitted(action: string, metric: UsageMetricType, current: number, limit: number): void;
/**
 * Validates allowable state transitions for subscriptions.
 */
export declare const ALLOWED_SUBSCRIPTION_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]>;
export declare function validateSubscriptionTransition(fromStatus: SubscriptionStatus, toStatus: SubscriptionStatus): void;
/**
 * Creates an initial baseline subscription for an organization.
 */
export declare function createInitialSubscription(params: {
    id?: string;
    organizationId: string;
    stripeCustomerId?: string;
    plan?: BillingPlan;
}): SubscriptionState;
/**
 * Applies a verified Stripe event to the subscription state.
 * Guaranteed idempotent and state-machine conforming.
 */
export declare function applyStripeEventToSubscription(current: SubscriptionState, event: StripeBillingEvent): SubscriptionState;
//# sourceMappingURL=billing-service.d.ts.map