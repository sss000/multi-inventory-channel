/**
 * Canonical Normalized Events
 * Specifications: Section 44 of 01_ENGINEERING_SPEC.md & Prompt 18 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 */

import { z } from "zod";

export type CanonicalEventType =
  | "OrderCreated"
  | "OrderUpdated"
  | "OrderCancelled"
  | "InventoryChanged"
  | "ProductChanged"
  | "ListingChanged"
  | "ReturnCreated"
  | "ReturnUpdated"
  | "IntegrationChanged";

export type NormalizedEventType =
  | CanonicalEventType
  | "ORDER_CREATED"
  | "ORDER_UPDATED"
  | "ORDER_CANCELLED"
  | "INVENTORY_CHANGED"
  | "PRODUCT_UPDATED"
  | "APP_UNINSTALLED";

/**
 * Base properties required by Prompt 18 & Section 44:
 * event_id, provider, provider_account_id, provider_event_id, event_type, occurred_at, received_at, payload, correlation_id
 */
export interface BaseNormalizedEvent<TType extends NormalizedEventType = NormalizedEventType, TPayload = Record<string, unknown>> {
  readonly event_id: string;
  readonly provider: string;
  readonly provider_account_id: string;
  readonly provider_event_id: string;
  readonly event_type: TType;
  readonly occurred_at: string;
  readonly received_at: string;
  readonly payload: TPayload;
  readonly correlation_id: string;
  readonly organization_id?: string;
  readonly version?: number | string;

  // CamelCase accessors for backward-compatibility
  readonly eventId?: string;
  readonly organizationId?: string;
  readonly channelId?: string;
  readonly providerAccountId?: string;
  readonly providerEventId?: string;
  readonly eventType?: TType;
  readonly occurredAt?: string;
  readonly receivedAt?: string;
  readonly correlationId?: string;
  readonly idempotencyKey?: string;
}

// 1. OrderCreated
export interface OrderCreatedPayload {
  order_id: string;
  order_number: string;
  currency: string;
  total_amount: number;
  line_items: Array<{
    external_line_id: string;
    sku: string;
    quantity: number;
    unit_price: number;
  }>;
  customer?: {
    id?: string;
    email?: string;
    name?: string;
  };
  shipping_address?: Record<string, unknown>;
  [key: string]: unknown;
}

export type OrderCreated = BaseNormalizedEvent<"OrderCreated" | "ORDER_CREATED", OrderCreatedPayload>;

// 2. OrderUpdated
export interface OrderUpdatedPayload {
  order_id: string;
  order_number?: string;
  status?: string;
  fulfillment_status?: string;
  payment_status?: string;
  line_items?: Array<{
    external_line_id: string;
    sku: string;
    quantity: number;
  }>;
  [key: string]: unknown;
}

export type OrderUpdated = BaseNormalizedEvent<"OrderUpdated" | "ORDER_UPDATED", OrderUpdatedPayload>;

// 3. OrderCancelled
export interface OrderCancelledPayload {
  order_id: string;
  order_number?: string;
  reason?: string;
  cancelled_at?: string;
  [key: string]: unknown;
}

export type OrderCancelled = BaseNormalizedEvent<"OrderCancelled" | "ORDER_CANCELLED", OrderCancelledPayload>;

// 4. InventoryChanged
export interface InventoryChangedPayload {
  sku: string;
  quantity: number;
  location_id?: string;
  fulfillment_channel?: "SELLER" | "FBA" | "DEFAULT" | string;
  available?: number;
  on_hand?: number;
  previous_quantity?: number;
  delta?: number;
  [key: string]: unknown;
}

export type InventoryChanged = BaseNormalizedEvent<"InventoryChanged" | "INVENTORY_CHANGED", InventoryChangedPayload>;

// 5. ProductChanged
export interface ProductChangedPayload {
  product_id: string;
  title?: string;
  status?: string;
  variants?: Array<{
    variant_id: string;
    sku: string;
    price?: number;
  }>;
  [key: string]: unknown;
}

export type ProductChanged = BaseNormalizedEvent<"ProductChanged" | "PRODUCT_UPDATED", ProductChangedPayload>;

// 6. ListingChanged
export interface ListingChangedPayload {
  listing_id: string;
  sku: string;
  channel_product_id?: string;
  status?: string;
  price?: number;
  [key: string]: unknown;
}

export type ListingChanged = BaseNormalizedEvent<"ListingChanged", ListingChangedPayload>;

// 7. ReturnCreated
export interface ReturnCreatedPayload {
  return_id: string;
  order_id: string;
  status?: string;
  reason?: string;
  items: Array<{
    sku: string;
    quantity: number;
    reason?: string;
  }>;
  [key: string]: unknown;
}

export type ReturnCreated = BaseNormalizedEvent<"ReturnCreated", ReturnCreatedPayload>;

// 8. ReturnUpdated
export interface ReturnUpdatedPayload {
  return_id: string;
  order_id?: string;
  status: string;
  received_items?: Array<{
    sku: string;
    quantity: number;
  }>;
  [key: string]: unknown;
}

export type ReturnUpdated = BaseNormalizedEvent<"ReturnUpdated", ReturnUpdatedPayload>;

// 9. IntegrationChanged
export interface IntegrationChangedPayload {
  action: "CONNECTED" | "DISCONNECTED" | "CREDENTIALS_EXPIRED" | "WEBHOOK_HEALTH_DEGRADED" | "APP_UNINSTALLED" | string;
  status?: string;
  reason?: string;
  [key: string]: unknown;
}

export type IntegrationChanged = BaseNormalizedEvent<"IntegrationChanged" | "APP_UNINSTALLED", IntegrationChangedPayload>;

/**
 * Union of all 9 canonical Normalized Events (Section 44)
 */
export type NormalizedEvent =
  | OrderCreated
  | OrderUpdated
  | OrderCancelled
  | InventoryChanged
  | ProductChanged
  | ListingChanged
  | ReturnCreated
  | ReturnUpdated
  | IntegrationChanged;

/**
 * Zod validation schema for NormalizedEvent
 */
export const NormalizedEventSchema = z.object({
  event_id: z.string(),
  provider: z.string(),
  provider_account_id: z.string(),
  provider_event_id: z.string(),
  event_type: z.string(),
  occurred_at: z.string(),
  received_at: z.string(),
  payload: z.record(z.unknown()),
  correlation_id: z.string(),
  organization_id: z.string().optional(),
  version: z.union([z.number(), z.string()]).optional(),

  // Optional camelCase aliases for backward-compatibility
  eventId: z.string().optional(),
  organizationId: z.string().optional(),
  channelId: z.string().optional(),
  eventType: z.string().optional(),
  occurredAt: z.string().optional(),
  receivedAt: z.string().optional(),
  idempotencyKey: z.string().optional(),
  correlationId: z.string().optional()
});
