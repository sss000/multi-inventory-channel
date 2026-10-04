/**
 * Core Domain Entities and Interfaces
 * Canonical Specification: 01_ENGINEERING_SPEC.md & Prompt 07 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * Pure TypeScript — Zero external framework or database dependencies.
 */
export type UUID = string;
export type OrganizationId = UUID;
export type UserId = UUID;
export type ProductId = UUID;
export type SkuId = UUID;
export type ProductVariantId = UUID;
export type ChannelId = UUID;
export type ChannelAccountId = UUID;
export type ChannelMappingId = UUID;
export type WarehouseId = UUID;
export type InventoryBalanceId = UUID;
export type ReservationId = UUID;
export type AllocationId = UUID;
export type InventoryEventId = UUID;
export type OrderId = UUID;
export type OrderItemId = UUID;
export type ReturnId = UUID;
export type SupplierId = UUID;
export type PurchaseOrderId = UUID;
export type PurchaseOrderItemId = UUID;
export type SyncJobId = UUID;
export type ReconciliationRunId = UUID;
export type ReconciliationResultId = UUID;
export type ExceptionId = UUID;
export type AuditLogId = UUID;
/**
 * Trust States — Canonically defined in 00_MASTER_ORCHESTRATION.md
 */
export type TrustState = "LIVE" | "VERIFIED" | "STALE" | "CONFLICT" | "UNKNOWN";
/**
 * Asynchronous Synchronization States — Section 24 of 01_ENGINEERING_SPEC.md
 */
export type SyncState = "QUEUED" | "PROCESSING" | "SENT" | "ACKNOWLEDGED" | "VERIFYING" | "VERIFIED" | "RETRYING" | "FAILED" | "REQUIRES_ACTION" | "CONFLICT";
export type SyncOperation = "UPDATE_INVENTORY" | "CREATE_MAPPING" | "UPDATE_LISTING";
/**
 * Outbound Synchronization Verification Stages — Section 121, 140 of 01_ENGINEERING_SPEC.md & Prompt 15
 */
export type VerificationStage = "REQUEST_SUBMITTED" | "REQUEST_ACKNOWLEDGED" | "VERIFICATION_PENDING" | "VERIFIED" | "CONFLICT" | "FAILED";
/**
 * External Inventory Freshness Record — Section 121 of 01_ENGINEERING_SPEC.md
 */
export interface FreshnessRecord {
    observedAt: Date;
    receivedAt: Date;
    verifiedAt?: Date | null;
    stalenessMs: number;
    isStale: boolean;
    trustState: TrustState;
}
/**
 * Canonical Sync Error Classifications — Section 25 of 01_ENGINEERING_SPEC.md & Prompt 12
 */
export type SyncErrorClassification = "TRANSIENT" | "RATE_LIMIT" | "AUTHENTICATION" | "VALIDATION" | "NOT_FOUND" | "CONFLICT" | "UNKNOWN";
export type ChannelProvider = "SHOPIFY" | "AMAZON" | "EBAY" | "WALMART";
export type ReservationStatus = "ACTIVE" | "RELEASED" | "FULFILLED" | "EXPIRED";
export type AllocationStatus = "ACTIVE" | "RELEASED" | "FULFILLED";
export type InventoryEventType = "INITIAL_IMPORT" | "PURCHASE_RECEIPT" | "ORDER_RESERVATION" | "ORDER_ALLOCATION" | "ORDER_RELEASE" | "ORDER_FULFILLMENT" | "ORDER_CANCELLATION" | "RETURN_RECEIPT" | "MANUAL_ADJUSTMENT" | "WAREHOUSE_TRANSFER" | "DAMAGE" | "RECOUNT" | "RECONCILIATION" | "SYSTEM_CORRECTION";
export type InventorySourceType = "ORDER" | "PURCHASE_ORDER" | "RETURN" | "MANUAL" | "SYNC" | "RECONCILIATION" | "SYSTEM";
export type ActorType = "USER" | "SYSTEM" | "CHANNEL" | "WEBHOOK";
export type ReconciliationClassification = "MATCH" | "MINOR_DIFFERENCE" | "MATERIAL_DIFFERENCE" | "MISSING_EXTERNAL" | "MISSING_INTERNAL" | "STALE_EXTERNAL" | "UNKNOWN";
export type ReconciliationResultStatus = "PENDING" | "AUTO_RESOLVED" | "MANUALLY_RESOLVED" | "IGNORED";
export type DiscrepancyCause = "DELAYED_UPDATE" | "EXTERNAL_ORDER" | "CANCELLATION" | "RETURN" | "MANUAL_MARKETPLACE_ADJUSTMENT" | "WAREHOUSE_ADJUSTMENT" | "MAPPING_ERROR" | "STALE_CACHE" | "SYNCHRONIZATION_FAILURE" | "CHANNEL_SPECIFIC_LOGIC" | "NONE" | "UNKNOWN_CAUSE";
export type SourceOfTruth = "INTERNAL_LEDGER" | "EXTERNAL_CHANNEL" | "UNKNOWN";
export type CorrectionDirection = "ADJUST_INTERNAL_LEDGER" | "PUSH_TO_CHANNEL" | "REQUIRES_APPROVAL" | "NO_ACTION";
export type ExceptionType = "INVENTORY_MISMATCH" | "SYNC_FAILURE" | "AUTHENTICATION_FAILURE" | "MISSING_MAPPING" | "DUPLICATE_MAPPING" | "NEGATIVE_INVENTORY" | "ORDER_IMPORT_FAILURE" | "ORDER_UNMAPPED_SKU" | "RATE_LIMIT" | "PROVIDER_OUTAGE" | "STALE_DATA";
export type ExceptionSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type ExceptionStatus = "OPEN" | "INVESTIGATING" | "ACTION_REQUIRED" | "RESOLVING" | "RESOLVED" | "IGNORED";
export interface Organization {
    id: OrganizationId;
    name: string;
    slug: string;
    status: "ACTIVE" | "SUSPENDED" | "PENDING";
    createdAt: Date;
    updatedAt: Date;
}
export interface User {
    id: UserId;
    email: string;
    name: string;
    status: "ACTIVE" | "INVITED" | "SUSPENDED";
    createdAt: Date;
    updatedAt: Date;
}
export interface Product {
    id: ProductId;
    organizationId: OrganizationId;
    title: string;
    description?: string;
    brand?: string;
    category?: string;
    status: "ACTIVE" | "DRAFT" | "ARCHIVED";
    externalMetadata: Record<string, unknown>;
    createdAt: Date;
    updatedAt: Date;
}
export interface Sku {
    id: SkuId;
    organizationId: OrganizationId;
    code: string;
    barcode?: string;
    status: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
    createdAt: Date;
    updatedAt: Date;
}
export interface ProductVariant {
    id: ProductVariantId;
    organizationId: OrganizationId;
    productId: ProductId;
    skuId: SkuId;
    title: string;
    barcode?: string;
    cost?: number;
    price?: number;
    weight?: number;
    dimensions: Record<string, unknown>;
    status: "ACTIVE" | "DRAFT" | "ARCHIVED";
    createdAt: Date;
    updatedAt: Date;
}
export interface Channel {
    id: ChannelId;
    provider: ChannelProvider;
    name: string;
    capabilities: Record<string, unknown>;
    createdAt: Date;
}
export interface ChannelAccount {
    id: ChannelAccountId;
    organizationId: OrganizationId;
    channelId: ChannelId;
    displayName: string;
    status: "ACTIVE" | "DISCONNECTED" | "ERROR" | "PAUSED";
    externalAccountId: string;
    credentialReference: string;
    metadata: Record<string, unknown>;
    lastSuccessfulSyncAt?: Date;
    lastErrorAt?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export interface ChannelProductMapping {
    id: ChannelMappingId;
    organizationId: OrganizationId;
    channelAccountId: ChannelAccountId;
    skuId: SkuId;
    externalProductId: string;
    externalVariantId?: string;
    externalSku?: string;
    externalIdentifier: Record<string, unknown>;
    status: "ACTIVE" | "INACTIVE" | "CONFLICT" | "PENDING";
    createdAt: Date;
    updatedAt: Date;
}
export interface Warehouse {
    id: WarehouseId;
    organizationId: OrganizationId;
    name: string;
    type: "WAREHOUSE" | "RETAIL" | "THIRD_PARTY_LOGISTICS" | "VIRTUAL";
    address: Record<string, unknown>;
    status: "ACTIVE" | "INACTIVE" | "ARCHIVED";
    createdAt: Date;
    updatedAt: Date;
}
export interface InventoryBalance {
    id: InventoryBalanceId;
    organizationId: OrganizationId;
    skuId: SkuId;
    warehouseId: WarehouseId;
    onHand: number;
    reserved: number;
    allocated: number;
    damaged: number;
    quarantined: number;
    inTransit: number;
    incoming: number;
    safetyStock: number;
    version: number;
    available: number;
    createdAt: Date;
    updatedAt: Date;
}
export interface InventoryReservation {
    id: ReservationId;
    organizationId: OrganizationId;
    skuId: SkuId;
    warehouseId: WarehouseId;
    orderId?: OrderId;
    quantity: number;
    status: ReservationStatus;
    createdAt: Date;
    releasedAt?: Date;
    fulfilledAt?: Date;
    expiredAt?: Date;
    idempotencyKey?: string;
}
export interface InventoryAllocation {
    id: AllocationId;
    organizationId: OrganizationId;
    skuId: SkuId;
    warehouseId: WarehouseId;
    orderId?: OrderId;
    reservationId?: ReservationId;
    quantity: number;
    status: AllocationStatus;
    createdAt: Date;
    releasedAt?: Date;
    fulfilledAt?: Date;
}
export type LedgerEntry = InventoryDomainEvent | {
    id: UUID;
    organizationId: OrganizationId;
    skuId: SkuId;
    warehouseId: WarehouseId;
    eventType: string;
    quantityDelta: number;
    reason?: string;
    actorId?: string;
    createdAt: Date;
    [key: string]: unknown;
};
export interface InventoryDomainEvent {
    id: InventoryEventId;
    organizationId: OrganizationId;
    skuId: SkuId;
    warehouseId: WarehouseId;
    eventType: InventoryEventType;
    quantityDelta: number;
    sourceType: InventorySourceType;
    sourceId: string;
    orderId?: OrderId;
    reservationId?: ReservationId;
    beforeState: Record<string, unknown>;
    afterState: Record<string, unknown>;
    idempotencyKey?: string;
    correlationId: UUID;
    actorType: ActorType;
    actorId?: UserId;
    createdAt: Date;
}
export interface Order {
    id: OrderId;
    organizationId: OrganizationId;
    channelAccountId: ChannelAccountId;
    externalOrderId: string;
    orderNumber: string;
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED" | "EXCEPTION";
    paymentStatus: "PENDING" | "PAID" | "REFUNDED" | "FAILED";
    fulfillmentStatus: "UNFULFILLED" | "PARTIALLY_FULFILLED" | "FULFILLED";
    currency: string;
    subtotal: number;
    tax: number;
    shipping: number;
    discount: number;
    total: number;
    customer: Record<string, unknown>;
    shippingAddress: Record<string, unknown>;
    billingAddress: Record<string, unknown>;
    orderedAt: Date;
    importedAt: Date;
    updatedAt: Date;
}
export interface OrderItem {
    id: OrderItemId;
    orderId: OrderId;
    skuId?: SkuId;
    externalLineId: string;
    quantity: number;
    unitPrice: number;
    discount: number;
    tax: number;
    metadata: Record<string, unknown>;
    createdAt: Date;
}
export interface OrderWithItems extends Order {
    items: OrderItem[];
}
export type OrderEventType = "ORDER_IMPORTED" | "ORDER_CREATED" | "ORDER_UPDATED" | "ORDER_CANCELLED" | "ORDER_FULFILLED" | "ORDER_UNMAPPED_SKU" | "ORDER_RESERVATION_CREATED" | "ORDER_RESERVATION_RELEASED";
export interface OrderEvent {
    id: string;
    orderId: OrderId;
    organizationId: OrganizationId;
    eventType: OrderEventType;
    payload: Record<string, unknown>;
    actorType: "USER" | "SYSTEM" | "WEBHOOK";
    actorId?: UserId;
    createdAt: Date;
}
export interface Return {
    id: ReturnId;
    organizationId: OrganizationId;
    orderId: OrderId;
    externalReturnId: string;
    status: "REQUESTED" | "APPROVED" | "RECEIVED" | "REJECTED" | "PROCESSED";
    reason?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface SyncJob {
    id: SyncJobId;
    organizationId: OrganizationId;
    channelAccountId: ChannelAccountId;
    skuId: SkuId;
    warehouseId?: WarehouseId;
    operation: SyncOperation;
    targetQuantity: number;
    status: SyncState;
    attemptCount: number;
    idempotencyKey?: string;
    correlationId: UUID;
    queuedAt: Date;
    startedAt?: Date;
    sentAt?: Date;
    acknowledgedAt?: Date;
    verifiedAt?: Date;
    failedAt?: Date;
    lastErrorCode?: string;
    lastErrorMessage?: string;
    createdAt: Date;
    updatedAt: Date;
}
export interface ReconciliationResult {
    id: ReconciliationResultId;
    reconciliationRunId: ReconciliationRunId;
    skuId: SkuId;
    internalQuantity: number;
    externalQuantity: number;
    difference: number;
    classification: ReconciliationClassification;
    discrepancyCause?: DiscrepancyCause;
    sourceOfTruth?: SourceOfTruth;
    correctionDirection?: CorrectionDirection;
    recommendedAction?: string;
    status: ReconciliationResultStatus;
    createdAt: Date;
    resolvedAt?: Date;
    resolvedBy?: UserId;
    evidence?: Record<string, unknown>;
}
export interface DiagnosticExplanation {
    whatHappened: string;
    why: string;
    whatIsAffected: string;
    whatDidSystemTry: string;
    whatHappensNext: string;
    whatCanIDo: string;
}
export interface DomainException {
    id: ExceptionId;
    organizationId: OrganizationId;
    type: ExceptionType;
    severity: ExceptionSeverity;
    status: ExceptionStatus;
    entityType: string;
    entityId: string;
    title: string;
    description: string;
    rootCause: Record<string, unknown>;
    recommendedAction: Record<string, unknown>;
    diagnostic?: DiagnosticExplanation;
    automatable: boolean;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt?: Date;
    resolvedBy?: UserId;
}
export interface AuditRecord {
    id: AuditLogId;
    organizationId: OrganizationId;
    actorType: ActorType;
    actorId?: UserId;
    action: string;
    entityType: string;
    entityId: string;
    beforeState?: Record<string, unknown>;
    afterState?: Record<string, unknown>;
    reason?: string;
    requestId?: string;
    correlationId: UUID;
    createdAt: Date;
}
export interface ReconciliationRun {
    id: ReconciliationRunId;
    organizationId: OrganizationId;
    channelAccountId: ChannelAccountId;
    warehouseId?: WarehouseId;
    status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
    totalEvaluated: number;
    matchedCount: number;
    discrepancyCount: number;
    startedAt?: Date;
    completedAt?: Date;
    createdAt: Date;
}
export interface Supplier {
    id: SupplierId;
    organizationId: OrganizationId;
    name: string;
    contactEmail?: string;
    contactPhone?: string;
    leadTimeDays: number;
    status: "ACTIVE" | "INACTIVE";
    createdAt: Date;
    updatedAt: Date;
}
export interface PurchaseOrder {
    id: PurchaseOrderId;
    organizationId: OrganizationId;
    supplierId: SupplierId;
    warehouseId: WarehouseId;
    poNumber: string;
    status: "DRAFT" | "SUBMITTED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
    orderDate: Date;
    expectedArrivalDate?: Date;
    createdAt: Date;
    updatedAt: Date;
}
export interface PurchaseOrderItem {
    id: PurchaseOrderItemId;
    purchaseOrderId: PurchaseOrderId;
    skuId: SkuId;
    quantityOrdered: number;
    quantityReceived: number;
    unitCost: number;
    status: "PENDING" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
    createdAt: Date;
}
export interface AnalyticsSnapshot {
    organizationId: OrganizationId;
    date: string;
    totalSkus: number;
    totalOnHand: number;
    totalReserved: number;
    totalAllocated: number;
    totalAvailable: number;
    openDiscrepancies: number;
    unresolvedExceptions: number;
    calculatedAt: Date;
}
export interface AIDiscrepancyInsight {
    organizationId: OrganizationId;
    skuId: SkuId;
    predictedCause: string;
    confidence: number;
    suggestedAction: string;
    explanation: string;
    generatedAt: Date;
}
//# sourceMappingURL=types.d.ts.map