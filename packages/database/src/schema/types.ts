/**
 * Database Schema Types for Multichannel Inventory Control Platform
 * Canonical Specification: Section 10-22, 29, 32, 68 of 01_ENGINEERING_SPEC.md & Prompt 04 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 */

// ==========================================
// 1. ENUMS & CONSTANTS
// ==========================================

export type OrganizationStatus = "ACTIVE" | "SUSPENDED" | "PENDING";
export type UserStatus = "ACTIVE" | "INVITED" | "SUSPENDED";
export type ProductStatus = "ACTIVE" | "DRAFT" | "ARCHIVED";
export type SkuStatus = "ACTIVE" | "INACTIVE" | "DISCONTINUED";
export type ChannelProvider = "SHOPIFY" | "AMAZON" | "EBAY" | "WALMART";
export type ChannelAccountStatus = "ACTIVE" | "DISCONNECTED" | "ERROR" | "PAUSED";
export type MappingStatus = "ACTIVE" | "INACTIVE" | "CONFLICT" | "PENDING";
export type WarehouseType = "WAREHOUSE" | "RETAIL" | "THIRD_PARTY_LOGISTICS" | "VIRTUAL";
export type WarehouseStatus = "ACTIVE" | "INACTIVE" | "ARCHIVED";

export type InventoryEventType =
  | "INITIAL_IMPORT"
  | "PURCHASE_RECEIPT"
  | "ORDER_RESERVATION"
  | "ORDER_RELEASE"
  | "ORDER_FULFILLMENT"
  | "ORDER_CANCELLATION"
  | "RETURN_RECEIPT"
  | "MANUAL_ADJUSTMENT"
  | "WAREHOUSE_TRANSFER"
  | "DAMAGE"
  | "RECOUNT"
  | "RECONCILIATION"
  | "SYSTEM_CORRECTION";

export type InventorySourceType =
  | "ORDER"
  | "PURCHASE_ORDER"
  | "RETURN"
  | "MANUAL"
  | "SYNC"
  | "RECONCILIATION"
  | "SYSTEM";

export type ActorType = "USER" | "SYSTEM" | "CHANNEL" | "WEBHOOK";
export type ReservationStatus = "ACTIVE" | "RELEASED" | "FULFILLED" | "EXPIRED";
export type OrderStatus = "PENDING" | "PROCESSING" | "COMPLETED" | "CANCELLED" | "EXCEPTION";
export type PaymentStatus = "PENDING" | "PAID" | "REFUNDED" | "FAILED";
export type FulfillmentStatus = "UNFULFILLED" | "PARTIALLY_FULFILLED" | "FULFILLED";
export type ReturnStatus = "REQUESTED" | "APPROVED" | "RECEIVED" | "REJECTED" | "PROCESSED";
export type PurchaseOrderStatus = "DRAFT" | "SUBMITTED" | "PARTIALLY_RECEIVED" | "RECEIVED" | "CANCELLED";
export type SyncOperation = "UPDATE_INVENTORY" | "CREATE_MAPPING" | "UPDATE_LISTING";

export type SyncStatus =
  | "QUEUED"
  | "PROCESSING"
  | "SENT"
  | "ACKNOWLEDGED"
  | "VERIFYING"
  | "VERIFIED"
  | "RETRYING"
  | "FAILED"
  | "REQUIRES_ACTION"
  | "CONFLICT";

export type ReconciliationStatus = "RUNNING" | "COMPLETED" | "FAILED";

export type ReconciliationClassification =
  | "MATCH"
  | "MINOR_DIFFERENCE"
  | "MATERIAL_DIFFERENCE"
  | "MISSING_EXTERNAL"
  | "MISSING_INTERNAL"
  | "STALE_EXTERNAL"
  | "UNKNOWN";

export type ReconciliationResultStatus = "PENDING" | "AUTO_RESOLVED" | "MANUALLY_RESOLVED" | "IGNORED";

export type DiscrepancyCause =
  | "DELAYED_UPDATE"
  | "EXTERNAL_ORDER"
  | "CANCELLATION"
  | "RETURN"
  | "MANUAL_MARKETPLACE_ADJUSTMENT"
  | "WAREHOUSE_ADJUSTMENT"
  | "MAPPING_ERROR"
  | "STALE_CACHE"
  | "SYNCHRONIZATION_FAILURE"
  | "CHANNEL_SPECIFIC_LOGIC"
  | "NONE"
  | "UNKNOWN_CAUSE";

export type SourceOfTruth = "INTERNAL_LEDGER" | "EXTERNAL_CHANNEL" | "UNKNOWN";

export type CorrectionDirection =
  | "ADJUST_INTERNAL_LEDGER"
  | "PUSH_TO_CHANNEL"
  | "REQUIRES_APPROVAL"
  | "NO_ACTION";

export type ExceptionType =
  | "INVENTORY_MISMATCH"
  | "SYNC_FAILURE"
  | "AUTHENTICATION_FAILURE"
  | "MISSING_MAPPING"
  | "DUPLICATE_MAPPING"
  | "NEGATIVE_INVENTORY"
  | "ORDER_IMPORT_FAILURE"
  | "ORDER_UNMAPPED_SKU"
  | "RATE_LIMIT"
  | "PROVIDER_OUTAGE"
  | "STALE_DATA";

export type ExceptionSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type ExceptionStatus = "OPEN" | "INVESTIGATING" | "ACTION_REQUIRED" | "RESOLVING" | "RESOLVED" | "IGNORED";

// ==========================================
// 2. TABLE ROW INTERFACES
// ==========================================

export interface OrganizationRow {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  created_at: string;
  updated_at: string;
}

export interface UserRow {
  id: string;
  email: string;
  name: string;
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

export interface RoleRow {
  id: string;
  organization_id: string | null;
  name: string;
  permissions: string[];
  created_at: string;
  updated_at: string;
}

export interface MembershipRow {
  id: string;
  organization_id: string;
  user_id: string;
  role_id: string;
  created_at: string;
}

export interface ProductRow {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  brand: string | null;
  category: string | null;
  status: ProductStatus;
  external_metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface SkuRow {
  id: string;
  organization_id: string;
  code: string;
  barcode: string | null;
  status: SkuStatus;
  created_at: string;
  updated_at: string;
}

export interface ProductVariantRow {
  id: string;
  organization_id: string;
  product_id: string;
  sku_id: string;
  title: string;
  barcode: string | null;
  cost: number | null;
  price: number | null;
  weight: number | null;
  dimensions: Record<string, unknown>;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
}

export interface ChannelRow {
  id: string;
  provider: ChannelProvider;
  name: string;
  capabilities: Record<string, unknown>;
  created_at: string;
}

export interface ChannelAccountRow {
  id: string;
  organization_id: string;
  channel_id: string;
  display_name: string;
  status: ChannelAccountStatus;
  external_account_id: string;
  credential_reference: string;
  metadata: Record<string, unknown>;
  last_successful_sync_at: string | null;
  last_error_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChannelProductMappingRow {
  id: string;
  organization_id: string;
  channel_account_id: string;
  sku_id: string;
  external_product_id: string;
  external_variant_id: string | null;
  external_sku: string | null;
  external_identifier: Record<string, unknown>;
  status: MappingStatus;
  created_at: string;
  updated_at: string;
}

export interface WarehouseRow {
  id: string;
  organization_id: string;
  name: string;
  type: WarehouseType;
  address: Record<string, unknown>;
  status: WarehouseStatus;
  created_at: string;
  updated_at: string;
}

export interface InventoryBalanceRow {
  id: string;
  organization_id: string;
  sku_id: string;
  warehouse_id: string;
  on_hand: number;
  reserved: number;
  allocated: number;
  damaged: number;
  quarantined: number;
  in_transit: number;
  incoming: number;
  safety_stock: number;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface InventoryReservationRow {
  id: string;
  organization_id: string;
  sku_id: string;
  warehouse_id: string;
  order_id: string | null;
  quantity: number;
  status: ReservationStatus;
  created_at: string;
  released_at: string | null;
  fulfilled_at: string | null;
  expired_at?: string | null;
  idempotency_key?: string | null;
}

export interface OrderRow {
  id: string;
  organization_id: string;
  channel_account_id: string;
  external_order_id: string;
  order_number: string;
  status: OrderStatus;
  payment_status: PaymentStatus;
  fulfillment_status: FulfillmentStatus;
  currency: string;
  subtotal: number;
  tax: number;
  shipping: number;
  discount: number;
  total: number;
  customer: Record<string, unknown>;
  shipping_address: Record<string, unknown>;
  billing_address: Record<string, unknown>;
  ordered_at: string;
  imported_at: string;
  updated_at: string;
}

export interface OrderItemRow {
  id: string;
  order_id: string;
  sku_id: string | null;
  external_line_id: string;
  quantity: number;
  unit_price: number;
  discount: number;
  tax: number;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface OrderWithItemsRow extends OrderRow {
  items: OrderItemRow[];
}

export interface OrderEventRow {
  id: string;
  order_id: string;
  organization_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  actor_type: ActorType;
  actor_id: string | null;
  created_at: string;
}


export interface InventoryEventRow {
  id: string;
  organization_id: string;
  sku_id: string;
  warehouse_id: string;
  event_type: InventoryEventType;
  quantity_delta: number;
  source_type: InventorySourceType;
  source_id: string;
  order_id: string | null;
  reservation_id: string | null;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  idempotency_key: string | null;
  correlation_id: string;
  actor_type: ActorType;
  actor_id: string | null;
  created_at: string;
}

export interface ReturnRow {
  id: string;
  organization_id: string;
  order_id: string;
  external_return_id: string;
  status: ReturnStatus;
  reason: string | null;
  created_at: string;
  updated_at: string;
}

export interface SupplierRow {
  id: string;
  organization_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderRow {
  id: string;
  organization_id: string;
  supplier_id: string;
  status: PurchaseOrderStatus;
  ordered_at: string | null;
  expected_at: string | null;
  received_at: string | null;
  currency: string;
  total: number;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderItemRow {
  id: string;
  purchase_order_id: string;
  sku_id: string;
  ordered_quantity: number;
  received_quantity: number;
  unit_cost: number;
  created_at: string;
}

export interface SyncJobRow {
  id: string;
  organization_id: string;
  channel_account_id: string;
  sku_id: string;
  warehouse_id: string | null;
  operation: SyncOperation;
  target_quantity: number;
  status: SyncStatus;
  attempt_count: number;
  idempotency_key: string | null;
  correlation_id: string;
  queued_at: string;
  started_at: string | null;
  sent_at: string | null;
  acknowledged_at: string | null;
  verified_at: string | null;
  failed_at: string | null;
  last_error_code: string | null;
  last_error_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReconciliationRunRow {
  id: string;
  organization_id: string;
  channel_account_id: string;
  warehouse_id?: string | null;
  started_at: string;
  completed_at: string | null;
  status: ReconciliationStatus;
  total_evaluated?: number;
  matched_count?: number;
  discrepancy_count?: number;
  created_at: string;
}

export interface ReconciliationResultRow {
  id: string;
  reconciliation_run_id: string;
  sku_id: string;
  internal_quantity: number;
  external_quantity: number;
  difference: number;
  classification: ReconciliationClassification;
  discrepancy_cause?: DiscrepancyCause;
  source_of_truth?: SourceOfTruth;
  correction_direction?: CorrectionDirection;
  recommended_action: string | null;
  status: ReconciliationResultStatus;
  created_at: string;
  resolved_at: string | null;
  resolved_by?: string | null;
  evidence?: Record<string, unknown>;
}

export interface ExceptionRow {
  id: string;
  organization_id: string;
  type: ExceptionType;
  severity: ExceptionSeverity;
  status: ExceptionStatus;
  entity_type: string;
  entity_id: string;
  title: string;
  description: string;
  root_cause: Record<string, unknown>;
  recommended_action: Record<string, unknown>;
  diagnostic?: Record<string, unknown>;
  automatable: boolean;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
}

export interface AuditLogRow {
  id: string;
  organization_id: string;
  actor_type: ActorType;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string;
  before_state: Record<string, unknown> | null;
  after_state: Record<string, unknown> | null;
  reason: string | null;
  request_id: string | null;
  correlation_id: string;
  created_at: string;
}

// ==========================================
// 3. COMPLETE SUPABASE DATABASE INTERFACE
// ==========================================

export interface Database {
  public: {
    Tables: {
      organizations: {
        Row: OrganizationRow;
        Insert: Omit<OrganizationRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<OrganizationRow, "id">>;
      };
      users: {
        Row: UserRow;
        Insert: Omit<UserRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<UserRow, "id">>;
      };
      roles: {
        Row: RoleRow;
        Insert: Omit<RoleRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<RoleRow, "id">>;
      };
      memberships: {
        Row: MembershipRow;
        Insert: Omit<MembershipRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<MembershipRow, "id">>;
      };
      products: {
        Row: ProductRow;
        Insert: Omit<ProductRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ProductRow, "id">>;
      };
      skus: {
        Row: SkuRow;
        Insert: Omit<SkuRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<SkuRow, "id">>;
      };
      product_variants: {
        Row: ProductVariantRow;
        Insert: Omit<ProductVariantRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ProductVariantRow, "id">>;
      };
      channels: {
        Row: ChannelRow;
        Insert: Omit<ChannelRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ChannelRow, "id">>;
      };
      channel_accounts: {
        Row: ChannelAccountRow;
        Insert: Omit<ChannelAccountRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ChannelAccountRow, "id">>;
      };
      channel_product_mappings: {
        Row: ChannelProductMappingRow;
        Insert: Omit<ChannelProductMappingRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ChannelProductMappingRow, "id">>;
      };
      warehouses: {
        Row: WarehouseRow;
        Insert: Omit<WarehouseRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<WarehouseRow, "id">>;
      };
      inventory_balances: {
        Row: InventoryBalanceRow;
        Insert: Omit<InventoryBalanceRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<InventoryBalanceRow, "id">>;
      };
      inventory_reservations: {
        Row: InventoryReservationRow;
        Insert: Omit<InventoryReservationRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<InventoryReservationRow, "id">>;
      };
      orders: {
        Row: OrderRow;
        Insert: Omit<OrderRow, "id" | "imported_at" | "updated_at"> & {
          id?: string;
          imported_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<OrderRow, "id">>;
      };
      order_items: {
        Row: OrderItemRow;
        Insert: Omit<OrderItemRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<OrderItemRow, "id">>;
      };
      inventory_events: {
        Row: InventoryEventRow;
        Insert: Omit<InventoryEventRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<InventoryEventRow, "id">>;
      };
      returns: {
        Row: ReturnRow;
        Insert: Omit<ReturnRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ReturnRow, "id">>;
      };
      suppliers: {
        Row: SupplierRow;
        Insert: Omit<SupplierRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<SupplierRow, "id">>;
      };
      purchase_orders: {
        Row: PurchaseOrderRow;
        Insert: Omit<PurchaseOrderRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<PurchaseOrderRow, "id">>;
      };
      purchase_order_items: {
        Row: PurchaseOrderItemRow;
        Insert: Omit<PurchaseOrderItemRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<PurchaseOrderItemRow, "id">>;
      };
      sync_jobs: {
        Row: SyncJobRow;
        Insert: Omit<SyncJobRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<SyncJobRow, "id">>;
      };
      reconciliation_runs: {
        Row: ReconciliationRunRow;
        Insert: Omit<ReconciliationRunRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ReconciliationRunRow, "id">>;
      };
      reconciliation_results: {
        Row: ReconciliationResultRow;
        Insert: Omit<ReconciliationResultRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<ReconciliationResultRow, "id">>;
      };
      exceptions: {
        Row: ExceptionRow;
        Insert: Omit<ExceptionRow, "id" | "created_at" | "updated_at"> & {
          id?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Omit<ExceptionRow, "id">>;
      };
      audit_logs: {
        Row: AuditLogRow;
        Insert: Omit<AuditLogRow, "id" | "created_at"> & {
          id?: string;
          created_at?: string;
        };
        Update: Partial<Omit<AuditLogRow, "id">>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      current_user_organization_ids: {
        Args: Record<string, never>;
        Returns: string[];
      };
    };
    Enums: {
      organization_status: OrganizationStatus;
      user_status: UserStatus;
      product_status: ProductStatus;
      sku_status: SkuStatus;
      channel_provider: ChannelProvider;
      channel_account_status: ChannelAccountStatus;
      mapping_status: MappingStatus;
      warehouse_type: WarehouseType;
      warehouse_status: WarehouseStatus;
      inventory_event_type: InventoryEventType;
      inventory_source_type: InventorySourceType;
      actor_type: ActorType;
      reservation_status: ReservationStatus;
      order_status: OrderStatus;
      payment_status: PaymentStatus;
      fulfillment_status: FulfillmentStatus;
      return_status: ReturnStatus;
      purchase_order_status: PurchaseOrderStatus;
      sync_operation: SyncOperation;
      sync_status: SyncStatus;
      reconciliation_status: ReconciliationStatus;
      reconciliation_classification: ReconciliationClassification;
      reconciliation_result_status: ReconciliationResultStatus;
      exception_type: ExceptionType;
      exception_severity: ExceptionSeverity;
      exception_status: ExceptionStatus;
    };
  };
}
