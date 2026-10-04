import { z } from "zod";
import { CorrectionDirectionSchema } from "./reconciliation.js";

/**
 * Exception Management API and Domain Contracts
 * Canonical Specification: Sections 32, 33, 34, 52 of 01_ENGINEERING_SPEC.md & Prompt 20
 */

export const ExceptionTypeSchema = z.enum([
  "INVENTORY_MISMATCH",
  "SYNC_FAILURE",
  "AUTHENTICATION_FAILURE",
  "MISSING_MAPPING",
  "DUPLICATE_MAPPING",
  "NEGATIVE_INVENTORY",
  "ORDER_IMPORT_FAILURE",
  "ORDER_UNMAPPED_SKU",
  "RATE_LIMIT",
  "PROVIDER_OUTAGE",
  "STALE_DATA",
]);
export type ExceptionType = z.infer<typeof ExceptionTypeSchema>;

export const ExceptionSeveritySchema = z.enum([
  "CRITICAL",
  "HIGH",
  "MEDIUM",
  "LOW",
  "INFO",
]);
export type ExceptionSeverity = z.infer<typeof ExceptionSeveritySchema>;

export const ExceptionStatusSchema = z.enum([
  "OPEN",
  "INVESTIGATING",
  "ACTION_REQUIRED",
  "RESOLVING",
  "RESOLVED",
  "IGNORED",
]);
export type ExceptionStatus = z.infer<typeof ExceptionStatusSchema>;

/**
 * Diagnostic Explanation Structure answering the 6 mandatory questions:
 * 1. WHAT HAPPENED?
 * 2. WHY?
 * 3. WHAT IS AFFECTED?
 * 4. WHAT DID THE SYSTEM TRY?
 * 5. WHAT HAPPENS NEXT?
 * 6. WHAT CAN I DO?
 */
export const DiagnosticExplanationSchema = z.object({
  whatHappened: z.string(),
  why: z.string(),
  whatIsAffected: z.string(),
  whatDidSystemTry: z.string(),
  whatHappensNext: z.string(),
  whatCanIDo: z.string(),
});
export type DiagnosticExplanation = z.infer<typeof DiagnosticExplanationSchema>;

export const CreateExceptionRequestSchema = z.object({
  type: ExceptionTypeSchema,
  severity: ExceptionSeveritySchema.optional(),
  entityType: z.string().min(1, "entityType is required"),
  entityId: z.string().min(1, "entityId is required"),
  title: z.string().min(1, "title is required"),
  description: z.string().min(1, "description is required"),
  rootCause: z.record(z.unknown()).optional(),
  recommendedAction: z.record(z.unknown()).optional(),
  automatable: z.boolean().optional(),
  diagnostic: DiagnosticExplanationSchema.optional(),
});
export type CreateExceptionRequest = z.infer<typeof CreateExceptionRequestSchema>;

export const ResolveExceptionRequestSchema = z.object({
  notes: z.string().optional(),
  reason: z.string().optional(),
});
export type ResolveExceptionRequest = z.infer<typeof ResolveExceptionRequestSchema>;

export const IgnoreExceptionRequestSchema = z.object({
  reason: z.string().optional(),
});
export type IgnoreExceptionRequest = z.infer<typeof IgnoreExceptionRequestSchema>;

export const RetryExceptionRequestSchema = z.object({
  idempotencyKey: z.string().optional(),
  reason: z.string().optional(),
});
export type RetryExceptionRequest = z.infer<typeof RetryExceptionRequestSchema>;

export const ReconcileExceptionRequestSchema = z.object({
  correctionDirection: CorrectionDirectionSchema.optional(),
  targetQuantity: z.number().int().min(0).optional(),
  warehouseId: z.string().uuid().optional(),
  notes: z.string().optional(),
  reason: z.string().optional(),
});
export type ReconcileExceptionRequest = z.infer<typeof ReconcileExceptionRequestSchema>;

export const ExceptionQuerySchema = z.object({
  status: ExceptionStatusSchema.optional(),
  severity: ExceptionSeveritySchema.optional(),
  type: ExceptionTypeSchema.optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(250).default(50),
});
export type ExceptionQuery = z.infer<typeof ExceptionQuerySchema>;

export const ExceptionDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  type: ExceptionTypeSchema,
  severity: ExceptionSeveritySchema,
  status: ExceptionStatusSchema,
  entityType: z.string(),
  entityId: z.string(),
  title: z.string(),
  description: z.string(),
  rootCause: z.record(z.unknown()),
  recommendedAction: z.record(z.unknown()),
  diagnostic: DiagnosticExplanationSchema,
  automatable: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable().optional(),
  resolvedBy: z.string().nullable().optional(),
});
export type ExceptionDto = z.infer<typeof ExceptionDtoSchema>;
