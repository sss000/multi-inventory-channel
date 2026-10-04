import { z } from "zod";

export const OrderStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "CANCELLED",
  "EXCEPTION",
]);
export type OrderStatus = z.infer<typeof OrderStatusSchema>;

export const PaymentStatusSchema = z.enum([
  "PENDING",
  "PAID",
  "REFUNDED",
  "FAILED",
]);
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const FulfillmentStatusSchema = z.enum([
  "UNFULFILLED",
  "PARTIALLY_FULFILLED",
  "FULFILLED",
]);
export type FulfillmentStatus = z.infer<typeof FulfillmentStatusSchema>;

export const OrderItemDtoSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  skuId: z.string().nullable().optional(),
  externalLineId: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().min(0).default(0),
  discount: z.number().min(0).default(0),
  tax: z.number().min(0).default(0),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string(),
});
export type OrderItemDto = z.infer<typeof OrderItemDtoSchema>;

export const OrderDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  channelAccountId: z.string(),
  externalOrderId: z.string(),
  orderNumber: z.string(),
  status: OrderStatusSchema,
  paymentStatus: PaymentStatusSchema,
  fulfillmentStatus: FulfillmentStatusSchema,
  currency: z.string().default("USD"),
  subtotal: z.number().default(0),
  tax: z.number().default(0),
  shipping: z.number().default(0),
  discount: z.number().default(0),
  total: z.number().default(0),
  customer: z.record(z.unknown()).default({}),
  shippingAddress: z.record(z.unknown()).default({}),
  billingAddress: z.record(z.unknown()).default({}),
  orderedAt: z.string(),
  importedAt: z.string(),
  updatedAt: z.string(),
  items: z.array(OrderItemDtoSchema).optional(),
});
export type OrderDto = z.infer<typeof OrderDtoSchema>;

export const OrderEventDtoSchema = z.object({
  id: z.string(),
  orderId: z.string(),
  organizationId: z.string(),
  eventType: z.string(),
  payload: z.record(z.unknown()).default({}),
  actorType: z.string(),
  actorId: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type OrderEventDto = z.infer<typeof OrderEventDtoSchema>;

export const ImportOrderItemRequestSchema = z.object({
  externalLineId: z.string().min(1),
  sku: z.string().optional(),
  skuId: z.string().optional(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().min(0).default(0),
  discount: z.number().min(0).default(0),
  tax: z.number().min(0).default(0),
  metadata: z.record(z.unknown()).default({}),
});
export type ImportOrderItemRequest = z.infer<typeof ImportOrderItemRequestSchema>;

export const ImportOrderRequestSchema = z.object({
  organizationId: z.string().optional(),
  channelAccountId: z.string().min(1),
  externalOrderId: z.string().min(1),
  orderNumber: z.string().min(1),
  currency: z.string().default("USD"),
  subtotal: z.number().min(0).default(0),
  tax: z.number().min(0).default(0),
  shipping: z.number().min(0).default(0),
  discount: z.number().min(0).default(0),
  total: z.number().min(0).default(0),
  customer: z.record(z.unknown()).default({}),
  shippingAddress: z.record(z.unknown()).default({}),
  billingAddress: z.record(z.unknown()).default({}),
  orderedAt: z.string(),
  items: z.array(ImportOrderItemRequestSchema).min(1),
  autoReserve: z.boolean().default(true),
  warehouseId: z.string().optional(),
  idempotencyKey: z.string().optional(),
});
export type ImportOrderRequest = z.infer<typeof ImportOrderRequestSchema>;

export const CancelOrderRequestSchema = z.object({
  reason: z.string().optional(),
});
export type CancelOrderRequest = z.infer<typeof CancelOrderRequestSchema>;

export const OrderQuerySchema = z.object({
  status: OrderStatusSchema.optional(),
  channelAccountId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(250).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type OrderQuery = z.infer<typeof OrderQuerySchema>;
