import { z } from "zod";

export const SyncStateSchema = z.enum([
  "QUEUED",
  "PROCESSING",
  "SENT",
  "ACKNOWLEDGED",
  "VERIFYING",
  "VERIFIED",
  "RETRYING",
  "FAILED",
  "REQUIRES_ACTION",
  "CONFLICT",
]);
export type SyncState = z.infer<typeof SyncStateSchema>;

export const SyncOperationSchema = z.enum([
  "UPDATE_INVENTORY",
  "CREATE_MAPPING",
  "UPDATE_LISTING",
]);
export type SyncOperation = z.infer<typeof SyncOperationSchema>;

export const SyncErrorClassificationSchema = z.enum([
  "TRANSIENT",
  "RATE_LIMIT",
  "AUTHENTICATION",
  "VALIDATION",
  "NOT_FOUND",
  "CONFLICT",
  "UNKNOWN",
]);
export type SyncErrorClassification = z.infer<typeof SyncErrorClassificationSchema>;

export const SyncJobDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  channelAccountId: z.string(),
  skuId: z.string(),
  warehouseId: z.string().nullable().optional(),
  operation: SyncOperationSchema,
  targetQuantity: z.number().int(),
  status: SyncStateSchema,
  attemptCount: z.number().int().min(0),
  idempotencyKey: z.string().nullable().optional(),
  correlationId: z.string(),
  queuedAt: z.string(),
  startedAt: z.string().nullable().optional(),
  sentAt: z.string().nullable().optional(),
  acknowledgedAt: z.string().nullable().optional(),
  verifiedAt: z.string().nullable().optional(),
  failedAt: z.string().nullable().optional(),
  lastErrorCode: z.string().nullable().optional(),
  lastErrorMessage: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SyncJobDto = z.infer<typeof SyncJobDtoSchema>;

export const CreateSyncJobRequestSchema = z.object({
  channelAccountId: z.string().uuid(),
  skuId: z.string().min(1),
  warehouseId: z.string().uuid().optional(),
  operation: SyncOperationSchema.default("UPDATE_INVENTORY"),
  targetQuantity: z.number().int().min(0),
  idempotencyKey: z.string().min(1).optional(),
  correlationId: z.string().uuid().optional(),
});
export type CreateSyncJobRequest = z.infer<typeof CreateSyncJobRequestSchema>;

export const SyncJobFilterSchema = z.object({
  channelAccountId: z.string().optional(),
  skuId: z.string().optional(),
  status: SyncStateSchema.optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type SyncJobFilter = z.infer<typeof SyncJobFilterSchema>;

export const RetrySyncJobRequestSchema = z.object({
  force: z.boolean().default(false),
});
export type RetrySyncJobRequest = z.infer<typeof RetrySyncJobRequestSchema>;

// ==========================================
// CANONICAL VERIFICATION & FRESHNESS LIFECYCLE
// Sections 121, 122, 140 of 01_ENGINEERING_SPEC.md & Prompt 15
// ==========================================

/**
 * Explicit verification stages distinguished during outbound synchronization
 */
export const VerificationStageSchema = z.enum([
  "REQUEST_SUBMITTED",
  "REQUEST_ACKNOWLEDGED",
  "VERIFICATION_PENDING",
  "VERIFIED",
  "CONFLICT",
  "FAILED",
]);
export type VerificationStage = z.infer<typeof VerificationStageSchema>;

/**
 * Trust states for product inventory conforming to Section 122
 */
export const TrustStateSchema = z.enum([
  "LIVE",
  "VERIFIED",
  "STALE",
  "CONFLICT",
  "UNKNOWN",
]);
export type TrustState = z.infer<typeof TrustStateSchema>;

/**
 * Freshness timestamps and metadata conforming to Section 121
 */
export const FreshnessMetadataSchema = z.object({
  observedAt: z.string(), // When external channel quantity was observed
  receivedAt: z.string(), // When platform received the observation
  verifiedAt: z.string().nullable().optional(), // When verification succeeded
  stalenessMs: z.number().int().min(0),
  isStale: z.boolean(),
  displayStatus: z.string(), // e.g. "Last verified 42 seconds ago."
});
export type FreshnessMetadata = z.infer<typeof FreshnessMetadataSchema>;

/**
 * User-facing representation and semantics for each verification stage
 */
export interface VerificationStageInfo {
  stage: VerificationStage;
  label: string;
  description: string;
  isTerminal: boolean;
  isSuccess: boolean;
  trustState: TrustState;
}

/**
 * Resolves structured UI/UX and domain info for a given verification stage
 */
export function getVerificationStageInfo(
  stage: VerificationStage,
  context?: {
    actualQuantity?: number;
    expectedQuantity?: number;
    lastVerifiedAt?: Date | string;
  }
): VerificationStageInfo {
  switch (stage) {
    case "REQUEST_SUBMITTED":
      return {
        stage: "REQUEST_SUBMITTED",
        label: "Request Submitted",
        description: "Update request submitted to external channel.",
        isTerminal: false,
        isSuccess: false,
        trustState: "UNKNOWN",
      };
    case "REQUEST_ACKNOWLEDGED":
      return {
        stage: "REQUEST_ACKNOWLEDGED",
        label: "Request Acknowledged",
        description: "Channel accepted update request. Verification pending.",
        isTerminal: false,
        isSuccess: false,
        trustState: "UNKNOWN",
      };
    case "VERIFICATION_PENDING":
      return {
        stage: "VERIFICATION_PENDING",
        label: "Verification Pending",
        description: "Update submitted. Verification pending.",
        isTerminal: false,
        isSuccess: false,
        trustState: "UNKNOWN",
      };
    case "VERIFIED":
      return {
        stage: "VERIFIED",
        label: "Verified",
        description:
          context?.actualQuantity !== undefined
            ? `Last verified state: ${context.actualQuantity} units.`
            : "Inventory level verified on channel.",
        isTerminal: true,
        isSuccess: true,
        trustState: "VERIFIED",
      };
    case "CONFLICT":
      return {
        stage: "CONFLICT",
        label: "Conflict",
        description:
          context?.expectedQuantity !== undefined && context?.actualQuantity !== undefined
            ? `Quantity mismatch: expected ${context.expectedQuantity}, channel reported ${context.actualQuantity}.`
            : "Channel reported unexpected inventory quantity. Reconciliation required.",
        isTerminal: true,
        isSuccess: false,
        trustState: "CONFLICT",
      };
    case "FAILED":
      return {
        stage: "FAILED",
        label: "Failed",
        description: "Inventory update or verification failed.",
        isTerminal: true,
        isSuccess: false,
        trustState: "UNKNOWN",
      };
  }
}

/**
 * Evaluates external quantity freshness against staleness threshold (default 5 minutes).
 */
export function evaluateFreshness(
  observedAt: Date | string,
  options?: {
    thresholdMs?: number;
    receivedAt?: Date | string;
    verifiedAt?: Date | string | null;
    now?: Date;
  }
): FreshnessMetadata {
  const now = options?.now || new Date();
  const observedDate = typeof observedAt === "string" ? new Date(observedAt) : observedAt;
  const receivedDate = options?.receivedAt
    ? typeof options.receivedAt === "string"
      ? new Date(options.receivedAt)
      : options.receivedAt
    : now;
  const verifiedDate = options?.verifiedAt
    ? typeof options.verifiedAt === "string"
      ? new Date(options.verifiedAt)
      : options.verifiedAt
    : null;

  const thresholdMs = options?.thresholdMs ?? 5 * 60 * 1000; // 5 minutes default
  const stalenessMs = Math.max(0, now.getTime() - observedDate.getTime());
  const isStale = stalenessMs > thresholdMs;

  return {
    observedAt: observedDate.toISOString(),
    receivedAt: receivedDate.toISOString(),
    verifiedAt: verifiedDate ? verifiedDate.toISOString() : null,
    stalenessMs,
    isStale,
    displayStatus: formatFreshnessDisplay(observedDate, now),
  };
}

/**
 * Formats canonical human-readable freshness strings matching Section 121 / 02_PRODUCT_DESIGN_SPEC.md.
 */
export function formatFreshnessDisplay(
  timestamp: Date | string,
  now: Date = new Date(),
  label: "verified" | "observed" = "observed"
): string {
  const date = typeof timestamp === "string" ? new Date(timestamp) : timestamp;
  const elapsedSec = Math.floor(Math.max(0, now.getTime() - date.getTime()) / 1000);

  const prefix = label === "verified" ? "Last verified" : "Observed";

  if (elapsedSec < 60) {
    return `${prefix} ${elapsedSec} seconds ago.`;
  }
  const minutes = Math.floor(elapsedSec / 60);
  if (minutes < 60) {
    return `${prefix} ${minutes} ${minutes === 1 ? "minute" : "minutes"} ago.`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${prefix} ${hours} ${hours === 1 ? "hour" : "hours"} ago.`;
  }
  const days = Math.floor(hours / 24);
  return `${prefix} ${days} ${days === 1 ? "day" : "days"} ago.`;
}
