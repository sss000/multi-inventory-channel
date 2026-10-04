/**
 * Inventory API Contracts & Types
 * Canonical Specification: Section 49 of 01_ENGINEERING_SPEC.md & Prompt 24
 */

import { z } from "zod";
import { PaginationParamsSchema } from "./api.js";

export const InventoryBalanceDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  skuId: z.string(),
  warehouseId: z.string(),
  onHand: z.number().int(),
  allocated: z.number().int(),
  reserved: z.number().int(),
  safetyStock: z.number().int(),
  damaged: z.number().int(),
  quarantined: z.number().int(),
  available: z.number().int(),
  version: z.number().int(),
  updatedAt: z.string(),
});

export type InventoryBalanceDto = z.infer<typeof InventoryBalanceDtoSchema>;

export const InventoryTimelineEventDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  skuId: z.string(),
  warehouseId: z.string().nullable().optional(),
  eventType: z.string(),
  quantityDelta: z.number().int(),
  beforeOnHand: z.number().int(),
  afterOnHand: z.number().int(),
  beforeAvailable: z.number().int(),
  afterAvailable: z.number().int(),
  sourceType: z.string(),
  actorType: z.string(),
  actorId: z.string().nullable().optional(),
  correlationId: z.string(),
  idempotencyKey: z.string().nullable().optional(),
  reason: z.string().nullable().optional(),
  createdAt: z.string(),
});

export type InventoryTimelineEventDto = z.infer<typeof InventoryTimelineEventDtoSchema>;

export const InventoryAdjustmentRequestSchema = z.object({
  skuId: z.string(),
  warehouseId: z.string(),
  quantityDelta: z.number().int(),
  reason: z.string().min(3, "Reason must be at least 3 characters"),
  idempotencyKey: z.string().optional(),
});

export type InventoryAdjustmentRequest = z.infer<typeof InventoryAdjustmentRequestSchema>;

export const InventoryReconcileRequestSchema = z.object({
  skuId: z.string(),
  warehouseId: z.string().optional(),
  channelAccountId: z.string().optional(),
  reason: z.string().min(3).optional(),
});

export type InventoryReconcileRequest = z.infer<typeof InventoryReconcileRequestSchema>;

export const InventoryConflictDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  skuId: z.string(),
  warehouseId: z.string().nullable().optional(),
  channelAccountId: z.string().nullable().optional(),
  internalQuantity: z.number().int(),
  externalQuantity: z.number().int(),
  difference: z.number().int(),
  status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED"]),
  detectedAt: z.string(),
});

export type InventoryConflictDto = z.infer<typeof InventoryConflictDtoSchema>;

export const InventoryQuerySchema = PaginationParamsSchema.extend({
  skuId: z.string().optional(),
  warehouseId: z.string().optional(),
});

export type InventoryBalanceQuery = z.infer<typeof InventoryQuerySchema>;

// ==========================================
// INVENTORY TABLE & DYNAMIC CHANNELS (Prompt 27)
// ==========================================

export const ConnectedChannelColumnDtoSchema = z.object({
  id: z.string(),
  provider: z.string(),
  displayName: z.string(),
  status: z.enum(["ACTIVE", "DISCONNECTED", "ERROR", "PAUSED"]),
  isEnabled: z.boolean(),
});

export type ConnectedChannelColumnDto = z.infer<typeof ConnectedChannelColumnDtoSchema>;

export const InventoryChannelQuantityDtoSchema = z.object({
  channelAccountId: z.string(),
  provider: z.string(),
  channelDisplayName: z.string(),
  externalQuantity: z.number().int(),
  internalQuantity: z.number().int(),
  difference: z.number().int(),
  syncState: z.enum(["LIVE", "VERIFIED", "STALE", "CONFLICT", "UNKNOWN"]),
  lastVerifiedAt: z.string().nullable().optional(),
  isOperational: z.boolean().default(true),
});

export type InventoryChannelQuantityDto = z.infer<typeof InventoryChannelQuantityDtoSchema>;

export const InventoryTableRowDtoSchema = z.object({
  sku: z.string(),
  productId: z.string().optional(),
  productTitle: z.string(),
  warehouseId: z.string(),
  warehouseName: z.string(),
  onHand: z.number().int(),
  reserved: z.number().int(),
  allocated: z.number().int().default(0),
  safetyStock: z.number().int().default(0),
  damaged: z.number().int().default(0),
  quarantined: z.number().int().default(0),
  available: z.number().int(),
  status: z.enum(["LIVE", "VERIFIED", "STALE", "CONFLICT", "UNKNOWN"]),
  channelQuantities: z.record(z.string(), InventoryChannelQuantityDtoSchema),
  lastVerifiedAt: z.string().nullable().optional(),
  hasMismatch: z.boolean().default(false),
  isLowStock: z.boolean().default(false),
});

export type InventoryTableRowDto = z.infer<typeof InventoryTableRowDtoSchema>;

export const InventoryTableQuerySchema = PaginationParamsSchema.extend({
  channel: z.string().optional(),
  warehouse: z.string().optional(),
  lowStock: z.enum(["true", "false", "all"]).optional(),
  mismatch: z.enum(["true", "false", "all"]).optional(),
  syncState: z.enum(["LIVE", "VERIFIED", "STALE", "CONFLICT", "UNKNOWN", "all"]).optional(),
  product: z.string().optional(),
  sku: z.string().optional(),
  sortBy: z.enum(["sku", "productTitle", "warehouseName", "onHand", "reserved", "available", "status"]).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(),
});

export type InventoryTableQuery = z.infer<typeof InventoryTableQuerySchema>;

export const InventoryTableResponseDtoSchema = z.object({
  items: z.array(InventoryTableRowDtoSchema),
  connectedChannels: z.array(ConnectedChannelColumnDtoSchema),
  warehouses: z.array(z.object({ id: z.string(), name: z.string() })),
  pagination: z.object({
    page: z.number().int(),
    limit: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
});

export type InventoryTableResponseDto = z.infer<typeof InventoryTableResponseDtoSchema>;

// ==========================================
// SKU DETAIL CONTRACTS (8 Canonical Sections)
// ==========================================

export const SkuSummarySectionDtoSchema = z.object({
  sku: z.string(),
  productId: z.string().optional(),
  productTitle: z.string(),
  brand: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  barcode: z.string().nullable().optional(),
  status: z.string(),
  trustState: z.enum(["LIVE", "VERIFIED", "STALE", "CONFLICT", "UNKNOWN"]),
  totalOnHand: z.number().int(),
  totalReserved: z.number().int(),
  totalAllocated: z.number().int(),
  totalSafetyStock: z.number().int(),
  totalDamaged: z.number().int(),
  totalQuarantined: z.number().int(),
  totalAvailable: z.number().int(),
  sellableFormulaEquation: z.string(),
});

export type SkuSummarySectionDto = z.infer<typeof SkuSummarySectionDtoSchema>;

export const SkuWarehouseBalanceDtoSchema = z.object({
  warehouseId: z.string(),
  warehouseName: z.string(),
  locationCode: z.string().optional(),
  onHand: z.number().int(),
  reserved: z.number().int(),
  allocated: z.number().int(),
  available: z.number().int(),
  safetyStock: z.number().int(),
  updatedAt: z.string(),
});

export type SkuWarehouseBalanceDto = z.infer<typeof SkuWarehouseBalanceDtoSchema>;

export const SkuChannelBalanceDtoSchema = z.object({
  channelAccountId: z.string(),
  provider: z.string(),
  channelDisplayName: z.string(),
  currentQuantity: z.number().int(),
  internalQuantity: z.number().int(),
  difference: z.number().int(),
  syncState: z.enum(["LIVE", "VERIFIED", "STALE", "CONFLICT", "UNKNOWN"]),
  lastVerifiedAt: z.string().nullable().optional(),
  isOperational: z.boolean(),
});

export type SkuChannelBalanceDto = z.infer<typeof SkuChannelBalanceDtoSchema>;

export const SkuSyncHistoryDtoSchema = z.object({
  jobId: z.string(),
  channel: z.string(),
  provider: z.string(),
  direction: z.enum(["OUTBOUND", "INBOUND"]),
  operation: z.string(),
  status: z.enum(["QUEUED", "PROCESSING", "SENT", "ACKNOWLEDGED", "VERIFYING", "VERIFIED", "RETRYING", "FAILED", "REQUIRES_ACTION", "CONFLICT"]),
  quantitySent: z.number().int().optional(),
  verifiedQuantity: z.number().int().optional(),
  latencyMs: z.number().optional(),
  timestamp: z.string(),
  errorDetails: z.string().nullable().optional(),
});

export type SkuSyncHistoryDto = z.infer<typeof SkuSyncHistoryDtoSchema>;

export const SkuExceptionDtoSchema = z.object({
  id: z.string(),
  severity: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  type: z.string(),
  title: z.string(),
  difference: z.number().int().optional(),
  channel: z.string().optional(),
  status: z.enum(["OPEN", "INVESTIGATING", "RESOLVED", "IGNORED"]),
  suggestedAction: z.string().optional(),
  createdAt: z.string(),
});

export type SkuExceptionDto = z.infer<typeof SkuExceptionDtoSchema>;

export const SkuExplainableTimelineEventDtoSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  title: z.string(),
  eventType: z.string(),
  quantityDelta: z.number().int(),
  beforeOnHand: z.number().int(),
  afterOnHand: z.number().int(),
  beforeAvailable: z.number().int(),
  afterAvailable: z.number().int(),
  channelOrWarehouse: z.string(),
  actor: z.string(),
  actorType: z.string(),
  reason: z.string().nullable().optional(),
  correlationId: z.string(),
  causalChain: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type SkuExplainableTimelineEventDto = z.infer<typeof SkuExplainableTimelineEventDtoSchema>;

export const SkuOrderReservationDtoSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  channel: z.string(),
  customer: z.string().optional(),
  status: z.string(),
  quantityReserved: z.number().int(),
  reservedAt: z.string(),
});

export type SkuOrderReservationDto = z.infer<typeof SkuOrderReservationDtoSchema>;

export const SkuAuditEntryDtoSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  actor: z.string(),
  action: z.string(),
  entityType: z.string(),
  entityId: z.string(),
  beforeState: z.record(z.unknown()).nullable().optional(),
  afterState: z.record(z.unknown()).nullable().optional(),
  reason: z.string().nullable().optional(),
  correlationId: z.string(),
});

export type SkuAuditEntryDto = z.infer<typeof SkuAuditEntryDtoSchema>;

export const SkuDetailDtoSchema = z.object({
  // 1. Summary
  summary: SkuSummarySectionDtoSchema,
  // 2. Inventory by Warehouse
  inventoryByWarehouse: z.array(SkuWarehouseBalanceDtoSchema),
  // 3. Inventory by Channel
  inventoryByChannel: z.array(SkuChannelBalanceDtoSchema),
  // 4. Synchronization
  synchronization: z.array(SkuSyncHistoryDtoSchema),
  // 5. Exceptions
  exceptions: z.array(SkuExceptionDtoSchema),
  // 6. Timeline (explainable)
  timeline: z.array(SkuExplainableTimelineEventDtoSchema),
  // 7. Orders
  orders: z.array(SkuOrderReservationDtoSchema),
  // 8. Audit
  audit: z.array(SkuAuditEntryDtoSchema),
});

export type SkuDetailDto = z.infer<typeof SkuDetailDtoSchema>;
