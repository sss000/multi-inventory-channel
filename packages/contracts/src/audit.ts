import { z } from "zod";

/**
 * Audit System API & Domain Contracts
 * Canonical Specification: Sections 35, 36, 68 of 01_ENGINEERING_SPEC.md & Prompt 21 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 */

export const AuditActorTypeSchema = z.enum(["USER", "SYSTEM", "CHANNEL", "WEBHOOK"]);
export type AuditActorType = z.infer<typeof AuditActorTypeSchema>;

/**
 * Standard material mutation audit action categories.
 */
export const AuditActionSchema = z.string();
export type AuditAction = string;

/**
 * Canonical Audit Log Data Transfer Object
 */
export const AuditLogDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  actorType: AuditActorTypeSchema,
  actorId: z.string().nullable(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  beforeState: z.record(z.unknown()).nullable(),
  afterState: z.record(z.unknown()).nullable(),
  reason: z.string().nullable(),
  requestId: z.string().nullable(),
  correlationId: z.string(),
  createdAt: z.string(),
});
export type AuditLogDto = z.infer<typeof AuditLogDtoSchema>;

/**
 * Query filters for searching audit logs.
 */
export const AuditLogFilterSchema = z.object({
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  action: z.string().optional(),
  actorType: AuditActorTypeSchema.optional(),
  actorId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  correlationId: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});
export type AuditLogFilter = z.infer<typeof AuditLogFilterSchema>;

/**
 * Acceptance Test Reconstruction Object (Section 114 & Prompt 21)
 * Given an inventory discrepancy or incident, an administrator must be able to reconstruct:
 * before, event, actor, reason, after, channel impact, synchronization result, resolution.
 */
export const ChannelImpactSchema = z.object({
  channelAccountId: z.string().optional(),
  channelName: z.string().optional(),
  previousChannelQuantity: z.number().optional(),
  targetChannelQuantity: z.number().optional(),
  status: z.string(),
});
export type ChannelImpact = z.infer<typeof ChannelImpactSchema>;

export const SynchronizationResultSchema = z.object({
  syncJobId: z.string().optional(),
  status: z.string(),
  verifiedAt: z.string().nullable().optional(),
  stage: z.string(),
});
export type SynchronizationResult = z.infer<typeof SynchronizationResultSchema>;

export const AuditResolutionSchema = z.object({
  status: z.string(),
  resolvedBy: z.string().nullable().optional(),
  resolvedAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});
export type AuditResolution = z.infer<typeof AuditResolutionSchema>;

export const AuditReconstructionSchema = z.object({
  entityType: z.string(),
  entityId: z.string(),
  correlationId: z.string(),
  timestamp: z.string(),
  before: z.record(z.unknown()).nullable(),
  event: z.string(),
  actor: z.object({
    type: AuditActorTypeSchema,
    id: z.string().nullable(),
  }),
  reason: z.string().nullable(),
  after: z.record(z.unknown()).nullable(),
  channelImpact: ChannelImpactSchema.nullable(),
  synchronizationResult: SynchronizationResultSchema.nullable(),
  resolution: AuditResolutionSchema.nullable(),
  timeline: z.array(AuditLogDtoSchema),
});
export type AuditReconstruction = z.infer<typeof AuditReconstructionSchema>;

/**
 * Export query schema for audit log downloads (JSON / CSV).
 */
export const AuditExportQuerySchema = AuditLogFilterSchema.extend({
  format: z.enum(["json", "csv"]).default("json"),
});
export type AuditExportQuery = z.infer<typeof AuditExportQuerySchema>;
