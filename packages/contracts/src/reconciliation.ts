import { z } from "zod";

/**
 * Reconciliation API and Domain Contracts
 * Canonical Specification: Sections 29, 30, 31, 53 of 01_ENGINEERING_SPEC.md & Prompt 19
 */

export const ReconciliationStatusSchema = z.enum(["RUNNING", "COMPLETED", "FAILED"]);
export type ReconciliationStatus = z.infer<typeof ReconciliationStatusSchema>;

export const ReconciliationClassificationSchema = z.enum([
  "MATCH",
  "MINOR_DIFFERENCE",
  "MATERIAL_DIFFERENCE",
  "MISSING_EXTERNAL",
  "MISSING_INTERNAL",
  "STALE_EXTERNAL",
  "UNKNOWN",
]);
export type ReconciliationClassification = z.infer<typeof ReconciliationClassificationSchema>;

export const ReconciliationResultStatusSchema = z.enum([
  "PENDING",
  "AUTO_RESOLVED",
  "MANUALLY_RESOLVED",
  "IGNORED",
]);
export type ReconciliationResultStatus = z.infer<typeof ReconciliationResultStatusSchema>;

export const DiscrepancyCauseSchema = z.enum([
  "DELAYED_UPDATE",
  "EXTERNAL_ORDER",
  "CANCELLATION",
  "RETURN",
  "MANUAL_MARKETPLACE_ADJUSTMENT",
  "WAREHOUSE_ADJUSTMENT",
  "MAPPING_ERROR",
  "STALE_CACHE",
  "SYNCHRONIZATION_FAILURE",
  "CHANNEL_SPECIFIC_LOGIC",
  "NONE",
  "UNKNOWN_CAUSE",
]);
export type DiscrepancyCause = z.infer<typeof DiscrepancyCauseSchema>;

export const SourceOfTruthSchema = z.enum([
  "INTERNAL_LEDGER",
  "EXTERNAL_CHANNEL",
  "UNKNOWN",
]);
export type SourceOfTruth = z.infer<typeof SourceOfTruthSchema>;

export const CorrectionDirectionSchema = z.enum([
  "ADJUST_INTERNAL_LEDGER",
  "PUSH_TO_CHANNEL",
  "REQUIRES_APPROVAL",
  "NO_ACTION",
]);
export type CorrectionDirection = z.infer<typeof CorrectionDirectionSchema>;

export const ReconciliationPolicySchema = z.object({
  minorDifferenceThreshold: z.number().int().nonnegative().default(2),
  allowAutoReconcileMinor: z.boolean().default(true),
  autoReconcileMaxDelta: z.number().int().nonnegative().default(1),
  staleThresholdMs: z.number().int().positive().default(300_000), // 5 minutes default
  requireApprovalForMaterial: z.boolean().default(true),
  defaultSourceOfTruth: SourceOfTruthSchema.default("INTERNAL_LEDGER"),
});
export type ReconciliationPolicyDto = z.infer<typeof ReconciliationPolicySchema>;

export const ReconciliationResultDtoSchema = z.object({
  id: z.string(),
  reconciliationRunId: z.string(),
  skuId: z.string(),
  internalQuantity: z.number().int(),
  externalQuantity: z.number().int(),
  difference: z.number().int(),
  classification: ReconciliationClassificationSchema,
  discrepancyCause: DiscrepancyCauseSchema.optional(),
  sourceOfTruth: SourceOfTruthSchema.optional(),
  correctionDirection: CorrectionDirectionSchema.optional(),
  recommendedAction: z.string().nullable().optional(),
  status: ReconciliationResultStatusSchema,
  createdAt: z.string(),
  resolvedAt: z.string().nullable().optional(),
  resolvedBy: z.string().nullable().optional(),
  evidence: z.record(z.unknown()).optional(),
});
export type ReconciliationResultDto = z.infer<typeof ReconciliationResultDtoSchema>;

export const ReconciliationRunDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  channelAccountId: z.string(),
  warehouseId: z.string().nullable().optional(),
  status: ReconciliationStatusSchema,
  startedAt: z.string(),
  completedAt: z.string().nullable().optional(),
  totalEvaluated: z.number().int().optional(),
  matchedCount: z.number().int().optional(),
  discrepancyCount: z.number().int().optional(),
  createdAt: z.string(),
  results: z.array(ReconciliationResultDtoSchema).optional(),
});
export type ReconciliationRunDto = z.infer<typeof ReconciliationRunDtoSchema>;

export const StartReconciliationRunRequestSchema = z.object({
  channelAccountId: z.string().uuid(),
  warehouseId: z.string().uuid().optional(),
  skuIds: z.array(z.string()).optional(),
  policy: ReconciliationPolicySchema.partial().optional(),
  sourceOfTruth: SourceOfTruthSchema.optional(),
});
export type StartReconciliationRunRequest = z.infer<typeof StartReconciliationRunRequestSchema>;

export const ReconciliationRunQuerySchema = z.object({
  channelAccountId: z.string().uuid().optional(),
  status: ReconciliationStatusSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(250).default(50),
});
export type ReconciliationRunQuery = z.infer<typeof ReconciliationRunQuerySchema>;

export const ApproveReconciliationResultRequestSchema = z.object({
  correctionDirection: CorrectionDirectionSchema.optional(),
  targetQuantity: z.number().int().optional(),
  warehouseId: z.string().uuid().optional(),
  reason: z.string().optional(),
});
export type ApproveReconciliationResultRequest = z.infer<typeof ApproveReconciliationResultRequestSchema>;

export const RejectReconciliationResultRequestSchema = z.object({
  reason: z.string().optional(),
});
export type RejectReconciliationResultRequest = z.infer<typeof RejectReconciliationResultRequestSchema>;
