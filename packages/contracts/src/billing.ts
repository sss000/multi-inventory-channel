import { z } from "zod";

/**
 * Billing & Subscription Contracts
 * Canonical Specification: Sections 38, 56, 72, 73, 74, 75, 116 of 01_ENGINEERING_SPEC.md & Prompt 22
 */

export const BillingPlanSchema = z.enum(["STARTER", "GROWTH", "SCALE", "ENTERPRISE"]);
export type BillingPlan = z.infer<typeof BillingPlanSchema>;

export const SubscriptionStatusSchema = z.enum([
  "INCOMPLETE",
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELED",
  "UNPAID",
  "PAUSED",
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

export const UsageMetricTypeSchema = z.enum([
  "MONTHLY_ORDERS",
  "CHANNELS",
  "WAREHOUSES",
  "USERS",
  "API_CALLS",
  "AUTOMATION_EXECUTIONS",
  "STORAGE_MB",
]);
export type UsageMetricType = z.infer<typeof UsageMetricTypeSchema>;

export const ThresholdLevelSchema = z.enum(["NORMAL", "INFO", "WARNING", "HARD_LIMIT"]);
export type ThresholdLevel = z.infer<typeof ThresholdLevelSchema>;

/**
 * Plan Entitlements Structure
 * Stored internally; never hard-coded in frontend components.
 */
export const EntitlementsSchema = z.object({
  maxMonthlyOrders: z.number().int(),
  maxChannels: z.number().int(),
  maxWarehouses: z.number().int(),
  maxUsers: z.number().int(),
  maxApiCallsPerMin: z.number().int(),
  maxAutomations: z.number().int(),
  maxStorageMb: z.number().int(),
  features: z.object({
    auditExport: z.boolean(),
    advancedReconciliation: z.boolean(),
    webhooks: z.boolean(),
    aiInsights: z.boolean(),
    prioritySupport: z.boolean(),
  }),
});
export type Entitlements = z.infer<typeof EntitlementsSchema>;

/**
 * Standard Canonical Plan Entitlements Matrix
 */
export const PLAN_ENTITLEMENTS: Record<BillingPlan, Entitlements> = {
  STARTER: {
    maxMonthlyOrders: 500,
    maxChannels: 2,
    maxWarehouses: 1,
    maxUsers: 2,
    maxApiCallsPerMin: 60,
    maxAutomations: 100,
    maxStorageMb: 500,
    features: {
      auditExport: false,
      advancedReconciliation: false,
      webhooks: true,
      aiInsights: false,
      prioritySupport: false,
    },
  },
  GROWTH: {
    maxMonthlyOrders: 2500,
    maxChannels: 10,
    maxWarehouses: 10,
    maxUsers: 10,
    maxApiCallsPerMin: 300,
    maxAutomations: 1000,
    maxStorageMb: 2500,
    features: {
      auditExport: true,
      advancedReconciliation: true,
      webhooks: true,
      aiInsights: true,
      prioritySupport: false,
    },
  },
  SCALE: {
    maxMonthlyOrders: 10000,
    maxChannels: 25,
    maxWarehouses: 25,
    maxUsers: 25,
    maxApiCallsPerMin: 1000,
    maxAutomations: 10000,
    maxStorageMb: 10000,
    features: {
      auditExport: true,
      advancedReconciliation: true,
      webhooks: true,
      aiInsights: true,
      prioritySupport: true,
    },
  },
  ENTERPRISE: {
    maxMonthlyOrders: -1, // Unlimited
    maxChannels: -1,
    maxWarehouses: -1,
    maxUsers: -1,
    maxApiCallsPerMin: -1,
    maxAutomations: -1,
    maxStorageMb: -1,
    features: {
      auditExport: true,
      advancedReconciliation: true,
      webhooks: true,
      aiInsights: true,
      prioritySupport: true,
    },
  },
};

/**
 * Canonical Pricing (Section 72)
 */
export const PLAN_PRICING: Record<BillingPlan, { monthlyPriceCents: number; currency: string; name: string }> = {
  STARTER: { monthlyPriceCents: 2900, currency: "usd", name: "Starter" },
  GROWTH: { monthlyPriceCents: 7900, currency: "usd", name: "Growth" },
  SCALE: { monthlyPriceCents: 19900, currency: "usd", name: "Scale" },
  ENTERPRISE: { monthlyPriceCents: 0, currency: "usd", name: "Enterprise (Custom)" },
};

/**
 * Metric Usage Status Structure
 */
export const MetricUsageStatusSchema = z.object({
  current: z.number().nonnegative(),
  limit: z.number(),
  percentage: z.number().nonnegative(),
  threshold: ThresholdLevelSchema,
});
export type MetricUsageStatus = z.infer<typeof MetricUsageStatusSchema>;

/**
 * Subscription Data Transfer Object
 */
export const SubscriptionDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  stripeCustomerId: z.string(),
  stripeSubscriptionId: z.string().nullable(),
  plan: BillingPlanSchema,
  status: SubscriptionStatusSchema,
  currentPeriodStart: z.string(),
  currentPeriodEnd: z.string(),
  cancelAtPeriodEnd: z.boolean(),
  canceledAt: z.string().nullable(),
  entitlements: EntitlementsSchema,
  usage: z.record(UsageMetricTypeSchema, MetricUsageStatusSchema),
});
export type SubscriptionDto = z.infer<typeof SubscriptionDtoSchema>;

/**
 * Request to create a Stripe Checkout Session
 */
export const CreateCheckoutSessionRequestSchema = z.object({
  plan: BillingPlanSchema,
  successUrl: z.string().url().optional(),
  cancelUrl: z.string().url().optional(),
});
export type CreateCheckoutSessionRequest = z.infer<typeof CreateCheckoutSessionRequestSchema>;

export const CreateCheckoutSessionResponseSchema = z.object({
  sessionId: z.string(),
  url: z.string().url(),
});
export type CreateCheckoutSessionResponse = z.infer<typeof CreateCheckoutSessionResponseSchema>;

/**
 * Request to create a Stripe Customer Portal Session
 */
export const CreatePortalSessionRequestSchema = z.object({
  returnUrl: z.string().url().optional(),
});
export type CreatePortalSessionRequest = z.infer<typeof CreatePortalSessionRequestSchema>;

export const CreatePortalSessionResponseSchema = z.object({
  url: z.string().url(),
});
export type CreatePortalSessionResponse = z.infer<typeof CreatePortalSessionResponseSchema>;

/**
 * Usage Record Ingestion
 */
export const RecordUsageRequestSchema = z.object({
  metric: UsageMetricTypeSchema,
  quantityDelta: z.number().positive(),
  metadata: z.record(z.unknown()).optional(),
});
export type RecordUsageRequest = z.infer<typeof RecordUsageRequestSchema>;
