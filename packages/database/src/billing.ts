import {
  BillingPlan,
  SubscriptionStatus,
  UsageMetricType,
  ThresholdLevel,
  Entitlements,
  SubscriptionDto,
  PLAN_ENTITLEMENTS,
  MetricUsageStatus,
} from "@platform/contracts";
import {
  getPlanEntitlements,
  calculateThresholdLevel,
  assertOperationPermitted,
  applyStripeEventToSubscription,
  createInitialSubscription,
  SubscriptionState,
  StripeBillingEvent,
  SubscriptionNotFoundError,
  TenantAccessDeniedError,
} from "@platform/domain";
import { AuditDatabaseService } from "./audit.js";

/**
 * Billing Database Repository, Persistence & Usage Metering Service
 * Canonical Specification: Sections 38, 56, 72, 73, 74, 75, 116 of 01_ENGINEERING_SPEC.md & Prompt 22
 */

export interface SubscriptionRow {
  id: string;
  organization_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string | null;
  plan: BillingPlan;
  status: SubscriptionStatus;
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  canceled_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface UsageRecordRow {
  id: string;
  organization_id: string;
  metric: UsageMetricType;
  quantity: number;
  period_start: string;
  period_end: string;
  recorded_at: string;
  metadata?: Record<string, unknown> | null;
}

export interface BillingRepository {
  getSubscription(organizationId: string): Promise<SubscriptionRow | null>;
  getSubscriptionByStripeCustomerId(customerId: string): Promise<SubscriptionRow | null>;
  saveSubscription(sub: SubscriptionRow): Promise<void>;
  recordUsage(record: UsageRecordRow): Promise<void>;
  getUsageForPeriod(
    organizationId: string,
    metric: UsageMetricType,
    periodStart?: string,
    periodEnd?: string
  ): Promise<number>;
  getAllUsageForPeriod(
    organizationId: string,
    periodStart?: string,
    periodEnd?: string
  ): Promise<Record<UsageMetricType, number>>;
}

export class InMemoryBillingRepository implements BillingRepository {
  private subscriptions = new Map<string, SubscriptionRow>();
  private usageRecords: UsageRecordRow[] = [];

  async getSubscription(organizationId: string): Promise<SubscriptionRow | null> {
    const sub = this.subscriptions.get(organizationId);
    return sub ? { ...sub } : null;
  }

  async getSubscriptionByStripeCustomerId(customerId: string): Promise<SubscriptionRow | null> {
    for (const sub of this.subscriptions.values()) {
      if (sub.stripe_customer_id === customerId) {
        return { ...sub };
      }
    }
    return null;
  }

  async saveSubscription(sub: SubscriptionRow): Promise<void> {
    this.subscriptions.set(sub.organization_id, {
      ...sub,
      updated_at: new Date().toISOString(),
    });
  }

  async recordUsage(record: UsageRecordRow): Promise<void> {
    this.usageRecords.push({ ...record });
  }

  async getUsageForPeriod(
    organizationId: string,
    metric: UsageMetricType,
    periodStart?: string,
    periodEnd?: string
  ): Promise<number> {
    const startTime = periodStart ? new Date(periodStart).getTime() : 0;
    const endTime = periodEnd ? new Date(periodEnd).getTime() : Infinity;

    return this.usageRecords
      .filter((r) => r.organization_id === organizationId && r.metric === metric)
      .filter((r) => {
        const time = new Date(r.recorded_at).getTime();
        return time >= startTime && time <= endTime;
      })
      .reduce((sum, r) => sum + r.quantity, 0);
  }

  async getAllUsageForPeriod(
    organizationId: string,
    periodStart?: string,
    periodEnd?: string
  ): Promise<Record<UsageMetricType, number>> {
    const metrics: UsageMetricType[] = [
      "MONTHLY_ORDERS",
      "CHANNELS",
      "WAREHOUSES",
      "USERS",
      "API_CALLS",
      "AUTOMATION_EXECUTIONS",
      "STORAGE_MB",
    ];

    const result: Partial<Record<UsageMetricType, number>> = {};
    for (const m of metrics) {
      result[m] = await this.getUsageForPeriod(organizationId, m, periodStart, periodEnd);
    }
    return result as Record<UsageMetricType, number>;
  }
}

/**
 * Transforms database subscription and usage map into full external SubscriptionDto.
 */
export function toSubscriptionDto(
  sub: SubscriptionRow,
  usageMap: Record<UsageMetricType, number>
): SubscriptionDto {
  const entitlements = getPlanEntitlements(sub.plan);

  const metricLimits: Record<UsageMetricType, number> = {
    MONTHLY_ORDERS: entitlements.maxMonthlyOrders,
    CHANNELS: entitlements.maxChannels,
    WAREHOUSES: entitlements.maxWarehouses,
    USERS: entitlements.maxUsers,
    API_CALLS: entitlements.maxApiCallsPerMin,
    AUTOMATION_EXECUTIONS: entitlements.maxAutomations,
    STORAGE_MB: entitlements.maxStorageMb,
  };

  const usageStatusMap: Partial<Record<UsageMetricType, MetricUsageStatus>> = {};

  for (const [m, limit] of Object.entries(metricLimits) as [UsageMetricType, number][]) {
    const current = usageMap[m] || 0;
    const percentage = limit > 0 ? (current / limit) * 100 : 0;
    const threshold = calculateThresholdLevel(current, limit);

    usageStatusMap[m] = {
      current,
      limit,
      percentage: Number(percentage.toFixed(1)),
      threshold,
    };
  }

  return {
    id: sub.id,
    organizationId: sub.organization_id,
    stripeCustomerId: sub.stripe_customer_id,
    stripeSubscriptionId: sub.stripe_subscription_id,
    plan: sub.plan,
    status: sub.status,
    currentPeriodStart: sub.current_period_start,
    currentPeriodEnd: sub.current_period_end,
    cancelAtPeriodEnd: sub.cancel_at_period_end,
    canceledAt: sub.canceled_at,
    entitlements,
    usage: usageStatusMap as Record<UsageMetricType, MetricUsageStatus>,
  };
}

/**
 * High-Level Billing Database Service
 */
export class BillingDatabaseService {
  constructor(
    private readonly repository: BillingRepository = new InMemoryBillingRepository(),
    private readonly auditService?: AuditDatabaseService
  ) {}

  getRepository(): BillingRepository {
    return this.repository;
  }

  async getSubscription(organizationId: string): Promise<SubscriptionDto | null> {
    const sub = await this.repository.getSubscription(organizationId);
    if (!sub) return null;

    const usage = await this.repository.getAllUsageForPeriod(
      organizationId,
      sub.current_period_start,
      sub.current_period_end
    );

    return toSubscriptionDto(sub, usage);
  }

  async getOrCreateSubscription(
    organizationId: string,
    stripeCustomerId?: string,
    plan: BillingPlan = "STARTER"
  ): Promise<SubscriptionDto> {
    let sub = await this.repository.getSubscription(organizationId);
    if (!sub) {
      const initial = createInitialSubscription({
        organizationId,
        stripeCustomerId,
        plan,
      });

      const row: SubscriptionRow = {
        id: initial.id,
        organization_id: initial.organizationId,
        stripe_customer_id: initial.stripeCustomerId,
        stripe_subscription_id: initial.stripeSubscriptionId,
        plan: initial.plan,
        status: initial.status,
        current_period_start: initial.currentPeriodStart.toISOString(),
        current_period_end: initial.currentPeriodEnd.toISOString(),
        cancel_at_period_end: initial.cancelAtPeriodEnd,
        canceled_at: initial.canceledAt ? initial.canceledAt.toISOString() : null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await this.repository.saveSubscription(row);
      sub = row;
    }

    const usage = await this.repository.getAllUsageForPeriod(
      organizationId,
      sub.current_period_start,
      sub.current_period_end
    );

    return toSubscriptionDto(sub, usage);
  }

  async recordUsage(params: {
    organizationId: string;
    metric: UsageMetricType;
    quantityDelta: number;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const sub = await this.repository.getSubscription(params.organizationId);
    const periodStart = sub ? sub.current_period_start : new Date().toISOString();
    const periodEnd = sub ? sub.current_period_end : new Date().toISOString();

    await this.repository.recordUsage({
      id: `usage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      metric: params.metric,
      quantity: params.quantityDelta,
      period_start: periodStart,
      period_end: periodEnd,
      recorded_at: new Date().toISOString(),
      metadata: params.metadata || null,
    });
  }

  /**
   * Enforces Section 75 plan rules while preserving critical inventory synchronization.
   */
  async checkOperationAllowed(
    organizationId: string,
    action: string,
    metric: UsageMetricType
  ): Promise<{ allowed: boolean; threshold: ThresholdLevel }> {
    const sub = await this.getOrCreateSubscription(organizationId);
    const metricStatus = sub.usage[metric] || { current: 0, limit: -1, threshold: "NORMAL" };

    assertOperationPermitted(action, metric, metricStatus.current, metricStatus.limit);
    return { allowed: true, threshold: metricStatus.threshold };
  }

  /**
   * Processes a verified Stripe billing event and updates internal entitlement state.
   */
  async handleStripeEvent(
    event: StripeBillingEvent,
    correlationId: string = `corr_stripe_${Date.now()}`
  ): Promise<SubscriptionDto> {
    const obj = event.data.object;
    const customerId = (obj["customer"] as string) || (obj["id"] as string);
    const metadata = (obj["metadata"] as Record<string, string>) || {};
    const orgIdFromMetadata = metadata["organizationId"] || metadata["organization_id"];

    let subRow: SubscriptionRow | null = null;
    if (orgIdFromMetadata) {
      subRow = await this.repository.getSubscription(orgIdFromMetadata);
    }
    if (!subRow && customerId) {
      subRow = await this.repository.getSubscriptionByStripeCustomerId(customerId);
    }

    if (!subRow) {
      if (!orgIdFromMetadata) {
        throw new SubscriptionNotFoundError(`Unknown organization for Stripe customer '${customerId}'.`);
      }
      // Create initial subscription state for new customer checkout
      const initial = createInitialSubscription({
        organizationId: orgIdFromMetadata,
        stripeCustomerId: customerId,
      });
      subRow = {
        id: initial.id,
        organization_id: initial.organizationId,
        stripe_customer_id: initial.stripeCustomerId,
        stripe_subscription_id: initial.stripeSubscriptionId,
        plan: initial.plan,
        status: initial.status,
        current_period_start: initial.currentPeriodStart.toISOString(),
        current_period_end: initial.currentPeriodEnd.toISOString(),
        cancel_at_period_end: initial.cancelAtPeriodEnd,
        canceled_at: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
    }

    const beforeState: SubscriptionState = {
      id: subRow.id,
      organizationId: subRow.organization_id,
      stripeCustomerId: subRow.stripe_customer_id,
      stripeSubscriptionId: subRow.stripe_subscription_id,
      plan: subRow.plan,
      status: subRow.status,
      currentPeriodStart: new Date(subRow.current_period_start),
      currentPeriodEnd: new Date(subRow.current_period_end),
      cancelAtPeriodEnd: subRow.cancel_at_period_end,
      canceledAt: subRow.canceled_at ? new Date(subRow.canceled_at) : null,
    };

    const updatedState = applyStripeEventToSubscription(beforeState, event);

    const updatedRow: SubscriptionRow = {
      ...subRow,
      stripe_customer_id: updatedState.stripeCustomerId,
      stripe_subscription_id: updatedState.stripeSubscriptionId,
      plan: updatedState.plan,
      status: updatedState.status,
      current_period_start: updatedState.currentPeriodStart.toISOString(),
      current_period_end: updatedState.currentPeriodEnd.toISOString(),
      cancel_at_period_end: updatedState.cancelAtPeriodEnd,
      canceled_at: updatedState.canceledAt ? updatedState.canceledAt.toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    await this.repository.saveSubscription(updatedRow);

    // Audit log integration
    if (this.auditService) {
      await this.auditService.recordBillingAction({
        organizationId: updatedRow.organization_id,
        actorType: "WEBHOOK",
        action:
          updatedState.plan !== beforeState.plan
            ? "BILLING_PLAN_CHANGED"
            : updatedState.status === "CANCELED"
            ? "BILLING_SUBSCRIPTION_CANCELLED"
            : "BILLING_PAYMENT_METHOD_UPDATED",
        billingId: updatedRow.id,
        beforeState: { plan: beforeState.plan, status: beforeState.status },
        afterState: { plan: updatedState.plan, status: updatedState.status },
        reason: `Processed Stripe webhook event '${event.type}'`,
        correlationId,
      });
    }

    const usage = await this.repository.getAllUsageForPeriod(
      updatedRow.organization_id,
      updatedRow.current_period_start,
      updatedRow.current_period_end
    );

    return toSubscriptionDto(updatedRow, usage);
  }
}
