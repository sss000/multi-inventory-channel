import { z } from "zod";

/**
 * Standard Pagination Request Parameters
 * Conforming to Prompt 24 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md:
 * Default page size: 50
 * Maximum page size: 250
 * Cursor and offset pagination support
 */
export const PaginationParamsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(250).default(50),
  cursor: z.string().optional(),
});

export type PaginationParams = z.infer<typeof PaginationParamsSchema>;

/**
 * Standard Pagination Metadata
 */
export const PaginationMetaSchema = z.object({
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative(),
  hasNext: z.boolean(),
  cursor: z.string().optional(),
  nextCursor: z.string().nullable().optional(),
});

export type PaginationMeta = z.infer<typeof PaginationMetaSchema>;

/**
 * Standard Success Response Envelope Schema
 * Format: { data: T, meta: { timestamp, correlationId?, requestId?, pagination? } }
 */
export const ApiResponseEnvelopeSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    data: dataSchema,
    meta: z
      .object({
        timestamp: z.string(),
        correlationId: z.string().optional(),
        requestId: z.string().optional(),
        pagination: PaginationMetaSchema.optional(),
      })
      .optional(),
  });

/**
 * Standard Error Response Envelope Schema
 * Format: { error: { code, message, correlationId?, requestId?, details? } }
 * Never exposes raw unhandled internal exceptions.
 */
export const ApiErrorEnvelopeSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    correlationId: z.string().optional(),
    requestId: z.string().optional(),
    details: z.unknown().optional(),
  }),
});

export type ApiErrorEnvelope = z.infer<typeof ApiErrorEnvelopeSchema>;

export const AdjustInventoryRequestSchema = z.object({
  skuId: z.string().uuid(),
  warehouseId: z.string().uuid(),
  quantityDelta: z.number().int(),
  reason: z.string().min(3),
  referenceId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export type AdjustInventoryRequest = z.infer<typeof AdjustInventoryRequestSchema>;
