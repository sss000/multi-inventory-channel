/**
 * Webhook Event Normalizer
 * Specifications: Section 44 of 01_ENGINEERING_SPEC.md & Prompt 18 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 */

import crypto from "node:crypto";
import {
  NormalizedEvent,
  CanonicalEventType,
  OrderCreated,
  OrderUpdated,
  OrderCancelled,
  InventoryChanged,
  ProductChanged,
  ListingChanged,
  ReturnCreated,
  ReturnUpdated,
  IntegrationChanged,
} from "@platform/contracts";

export class MalformedPayloadError extends Error {
  readonly httpStatus = 400;
  readonly provider: string;
  readonly details?: Record<string, unknown>;

  constructor(message: string, provider: string, details?: Record<string, unknown>) {
    super(`Malformed webhook payload for provider '${provider}': ${message}`);
    this.name = "MalformedPayloadError";
    this.provider = provider;
    this.details = details;
  }
}

export interface NormalizationContext {
  eventId?: string;
  correlationId?: string;
  organizationId?: string;
  provider: string;
  accountId: string;
  providerEventId?: string;
  headers?: Record<string, string | string[] | undefined>;
  receivedAt?: Date;
  topic?: string;
}

/**
 * Normalizes raw channel webhook payloads into canonical NormalizedEvent instances.
 */
export class WebhookNormalizer {
  /**
   * Main entry point to normalize raw body or parsed JSON object into canonical NormalizedEvent.
   */
  normalize(
    rawInput: string | Buffer | Record<string, unknown>,
    context: NormalizationContext
  ): NormalizedEvent {
    const { provider, accountId } = context;
    if (!provider) {
      throw new MalformedPayloadError("Missing provider in normalization context", "UNKNOWN");
    }

    let raw: Record<string, unknown>;
    if (typeof rawInput === "string") {
      const trimmed = rawInput.trim();
      if (!trimmed) {
        throw new MalformedPayloadError("Empty payload received", provider);
      }
      try {
        raw = JSON.parse(trimmed);
      } catch (err: any) {
        throw new MalformedPayloadError(`Invalid JSON: ${err.message}`, provider, {
          rawSnippet: trimmed.slice(0, 100),
        });
      }
    } else if (Buffer.isBuffer(rawInput)) {
      const str = rawInput.toString("utf8").trim();
      if (!str) {
        throw new MalformedPayloadError("Empty Buffer payload received", provider);
      }
      try {
        raw = JSON.parse(str);
      } catch (err: any) {
        throw new MalformedPayloadError(`Invalid JSON Buffer: ${err.message}`, provider);
      }
    } else if (typeof rawInput === "object" && rawInput !== null) {
      raw = rawInput;
    } else {
      throw new MalformedPayloadError("Unsupported raw input type", provider);
    }

    const eventId = context.eventId ?? crypto.randomUUID();
    const correlationId = context.correlationId ?? crypto.randomUUID();
    const receivedAt = (context.receivedAt ?? new Date()).toISOString();
    const headers = context.headers ?? {};

    // Determine provider event ID
    const providerEventId =
      context.providerEventId ||
      this.extractHeader(headers, [
        "x-shopify-webhook-id",
        "x-amz-sns-message-id",
        "x-amzn-requestid",
        "x-event-id",
      ]) ||
      (raw.id as string) ||
      (raw.event_id as string) ||
      (raw.eventId as string) ||
      eventId;

    // Detect topic from header or context
    const topic = (
      context.topic ||
      this.extractHeader(headers, [
        "x-shopify-topic",
        "x-amz-sns-topic-arn",
        "x-event-type",
      ]) ||
      (raw.event_type as string) ||
      (raw.topic as string) ||
      ""
    ).toLowerCase();

    const upperProvider = provider.toUpperCase();

    if (upperProvider === "SHOPIFY") {
      return this.normalizeShopify(raw, topic, {
        eventId,
        correlationId,
        organizationId: context.organizationId,
        provider: upperProvider,
        accountId,
        providerEventId,
        receivedAt,
      });
    }

    if (upperProvider === "AMAZON") {
      return this.normalizeAmazon(raw, topic, {
        eventId,
        correlationId,
        organizationId: context.organizationId,
        provider: upperProvider,
        accountId,
        providerEventId,
        receivedAt,
      });
    }

    // Generic fallback or direct canonical event
    return this.normalizeGeneric(raw, topic, {
      eventId,
      correlationId,
      organizationId: context.organizationId,
      provider: upperProvider,
      accountId,
      providerEventId,
      receivedAt,
    });
  }

  // --------------------------------------------------------------------------
  // Shopify Normalization
  // --------------------------------------------------------------------------
  private normalizeShopify(
    raw: Record<string, unknown>,
    topic: string,
    meta: {
      eventId: string;
      correlationId: string;
      organizationId?: string;
      provider: string;
      accountId: string;
      providerEventId: string;
      receivedAt: string;
    }
  ): NormalizedEvent {
    const occurredAt = (raw.updated_at || raw.created_at || meta.receivedAt) as string;

    // 1. OrderCreated: "orders/create"
    if (topic === "orders/create") {
      const lineItems = Array.isArray(raw.line_items)
        ? raw.line_items.map((li: any) => ({
            external_line_id: String(li.id ?? li.line_item_id ?? crypto.randomUUID()),
            sku: String(li.sku || "UNMAPPED"),
            quantity: Number(li.quantity ?? 1),
            unit_price: Number(li.price ?? 0),
          }))
        : [];

      const orderEvent: OrderCreated = {
        event_id: meta.eventId,
        provider: meta.provider,
        provider_account_id: meta.accountId,
        provider_event_id: meta.providerEventId,
        event_type: "OrderCreated",
        occurred_at: occurredAt,
        received_at: meta.receivedAt,
        correlation_id: meta.correlationId,
        organization_id: meta.organizationId,
        payload: {
          order_id: String(raw.id ?? ""),
          order_number: String(raw.order_number ?? raw.name ?? raw.id ?? ""),
          currency: String(raw.currency ?? "USD"),
          total_amount: Number(raw.total_price ?? raw.total_amount ?? 0),
          line_items: lineItems,
          customer: raw.customer ? (raw.customer as any) : undefined,
          shipping_address: raw.shipping_address ? (raw.shipping_address as any) : undefined,
          raw,
        },
      };
      return orderEvent;
    }

    // 2. OrderUpdated: "orders/updated"
    if (topic === "orders/updated") {
      const orderUpdated: OrderUpdated = {
        event_id: meta.eventId,
        provider: meta.provider,
        provider_account_id: meta.accountId,
        provider_event_id: meta.providerEventId,
        event_type: "OrderUpdated",
        occurred_at: occurredAt,
        received_at: meta.receivedAt,
        correlation_id: meta.correlationId,
        organization_id: meta.organizationId,
        payload: {
          order_id: String(raw.id ?? ""),
          order_number: raw.order_number ? String(raw.order_number) : undefined,
          status: String(raw.financial_status ?? "OPEN"),
          fulfillment_status: String(raw.fulfillment_status ?? "UNFULFILLED"),
          payment_status: String(raw.financial_status ?? "PENDING"),
          raw,
        },
      };
      return orderUpdated;
    }

    // 3. OrderCancelled: "orders/cancelled"
    if (topic === "orders/cancelled") {
      const orderCancelled: OrderCancelled = {
        event_id: meta.eventId,
        provider: meta.provider,
        provider_account_id: meta.accountId,
        provider_event_id: meta.providerEventId,
        event_type: "OrderCancelled",
        occurred_at: (raw.cancelled_at || occurredAt) as string,
        received_at: meta.receivedAt,
        correlation_id: meta.correlationId,
        organization_id: meta.organizationId,
        payload: {
          order_id: String(raw.id ?? ""),
          order_number: raw.order_number ? String(raw.order_number) : undefined,
          reason: String(raw.cancel_reason ?? "Customer requested"),
          cancelled_at: (raw.cancelled_at || occurredAt) as string,
          raw,
        },
      };
      return orderCancelled;
    }

    // 4. InventoryChanged: "inventory_levels/update"
    if (topic === "inventory_levels/update" || topic === "inventory_items/update") {
      const inventoryEvent: InventoryChanged = {
        event_id: meta.eventId,
        provider: meta.provider,
        provider_account_id: meta.accountId,
        provider_event_id: meta.providerEventId,
        event_type: "InventoryChanged",
        occurred_at: occurredAt,
        received_at: meta.receivedAt,
        correlation_id: meta.correlationId,
        organization_id: meta.organizationId,
        payload: {
          sku: String(raw.sku ?? raw.inventory_item_id ?? "UNKNOWN_SKU"),
          quantity: Number(raw.available ?? raw.quantity ?? 0),
          location_id: raw.location_id ? String(raw.location_id) : undefined,
          available: Number(raw.available ?? 0),
          fulfillment_channel: "SELLER",
          raw,
        },
      };
      return inventoryEvent;
    }

    // 5. ProductChanged: "products/update" or "products/create"
    if (topic === "products/update" || topic === "products/create") {
      const variants = Array.isArray(raw.variants)
        ? raw.variants.map((v: any) => ({
            variant_id: String(v.id),
            sku: String(v.sku || ""),
            price: Number(v.price ?? 0),
          }))
        : [];

      const productEvent: ProductChanged = {
        event_id: meta.eventId,
        provider: meta.provider,
        provider_account_id: meta.accountId,
        provider_event_id: meta.providerEventId,
        event_type: "ProductChanged",
        occurred_at: occurredAt,
        received_at: meta.receivedAt,
        correlation_id: meta.correlationId,
        organization_id: meta.organizationId,
        payload: {
          product_id: String(raw.id ?? ""),
          title: String(raw.title ?? ""),
          status: String(raw.status ?? "ACTIVE"),
          variants,
          raw,
        },
      };
      return productEvent;
    }

    // 7. ReturnCreated: "refunds/create" or "returns/create"
    if (topic === "refunds/create" || topic === "returns/create") {
      const returnEvent: ReturnCreated = {
        event_id: meta.eventId,
        provider: meta.provider,
        provider_account_id: meta.accountId,
        provider_event_id: meta.providerEventId,
        event_type: "ReturnCreated",
        occurred_at: occurredAt,
        received_at: meta.receivedAt,
        correlation_id: meta.correlationId,
        organization_id: meta.organizationId,
        payload: {
          return_id: String(raw.id ?? crypto.randomUUID()),
          order_id: String(raw.order_id ?? ""),
          status: "REQUESTED",
          reason: String(raw.note ?? "Return requested"),
          items: Array.isArray(raw.refund_line_items)
            ? raw.refund_line_items.map((r: any) => ({
                sku: String(r.line_item?.sku ?? ""),
                quantity: Number(r.quantity ?? 1),
                reason: String(r.restock_type ?? ""),
              }))
            : [],
          raw,
        },
      };
      return returnEvent;
    }

    // 9. IntegrationChanged: "app/uninstalled"
    if (topic === "app/uninstalled") {
      const integrationEvent: IntegrationChanged = {
        event_id: meta.eventId,
        provider: meta.provider,
        provider_account_id: meta.accountId,
        provider_event_id: meta.providerEventId,
        event_type: "IntegrationChanged",
        occurred_at: occurredAt,
        received_at: meta.receivedAt,
        correlation_id: meta.correlationId,
        organization_id: meta.organizationId,
        payload: {
          action: "UNINSTALLED",
          status: "DISCONNECTED",
          reason: "Shopify store uninstalled application",
          raw,
        },
      };
      return integrationEvent;
    }

    // Fallback to generic
    return this.normalizeGeneric(raw, topic, meta);
  }

  // --------------------------------------------------------------------------
  // Amazon Normalization
  // --------------------------------------------------------------------------
  private normalizeAmazon(
    raw: Record<string, unknown>,
    topic: string,
    meta: {
      eventId: string;
      correlationId: string;
      organizationId?: string;
      provider: string;
      accountId: string;
      providerEventId: string;
      receivedAt: string;
    }
  ): NormalizedEvent {
    // Unpack SNS wrapper if present
    let data = raw;
    if (typeof raw.Message === "string") {
      try {
        data = JSON.parse(raw.Message);
      } catch {
        data = raw;
      }
    }

    const notifType = String(
      data.notificationType ||
        raw.notificationType ||
        data.NotificationType ||
        topic
    ).toUpperCase();

    const occurredAt = (data.eventTime || data.Timestamp || meta.receivedAt) as string;

    // Amazon ORDER_CHANGE
    if (notifType.includes("ORDER_CHANGE") || notifType === "ORDER_CHANGE") {
      const orderPayload = (data.payload || data) as any;
      const orderStatus = String(orderPayload.orderStatus || orderPayload.OrderStatus || "PENDING");

      if (orderStatus.toUpperCase() === "CANCELED") {
        const cancelEvent: OrderCancelled = {
          event_id: meta.eventId,
          provider: meta.provider,
          provider_account_id: meta.accountId,
          provider_event_id: meta.providerEventId,
          event_type: "OrderCancelled",
          occurred_at: occurredAt,
          received_at: meta.receivedAt,
          correlation_id: meta.correlationId,
          organization_id: meta.organizationId,
          payload: {
            order_id: String(orderPayload.amazonOrderId || orderPayload.AmazonOrderId || ""),
            reason: "Cancelled by Amazon buyer or seller",
            cancelled_at: occurredAt,
            raw: data,
          },
        };
        return cancelEvent;
      }

      if (orderStatus.toUpperCase() === "PENDING" || orderStatus.toUpperCase() === "UNSHIPPED") {
        const orderCreated: OrderCreated = {
          event_id: meta.eventId,
          provider: meta.provider,
          provider_account_id: meta.accountId,
          provider_event_id: meta.providerEventId,
          event_type: "OrderCreated",
          occurred_at: occurredAt,
          received_at: meta.receivedAt,
          correlation_id: meta.correlationId,
          organization_id: meta.organizationId,
          payload: {
            order_id: String(orderPayload.amazonOrderId || orderPayload.AmazonOrderId || ""),
            order_number: String(orderPayload.amazonOrderId || orderPayload.AmazonOrderId || ""),
            currency: String(orderPayload.orderTotal?.currencyCode || "USD"),
            total_amount: Number(orderPayload.orderTotal?.amount || 0),
            line_items: Array.isArray(orderPayload.orderItems)
              ? orderPayload.orderItems.map((item: any) => ({
                  external_line_id: String(item.orderItemId || crypto.randomUUID()),
                  sku: String(item.sellerSKU || item.asin || "UNKNOWN_SKU"),
                  quantity: Number(item.quantityOrdered || 1),
                  unit_price: Number(item.itemPrice?.amount || 0),
                }))
              : [],
            raw: data,
          },
        };
        return orderCreated;
      }

      const orderUpdated: OrderUpdated = {
        event_id: meta.eventId,
        provider: meta.provider,
        provider_account_id: meta.accountId,
        provider_event_id: meta.providerEventId,
        event_type: "OrderUpdated",
        occurred_at: occurredAt,
        received_at: meta.receivedAt,
        correlation_id: meta.correlationId,
        organization_id: meta.organizationId,
        payload: {
          order_id: String(orderPayload.amazonOrderId || orderPayload.AmazonOrderId || ""),
          status: orderStatus,
          fulfillment_status: String(orderPayload.fulfillmentChannel || "MFN"),
          raw: data,
        },
      };
      return orderUpdated;
    }

    // Amazon INVENTORY_AVAILABILITY_CHANGES or FBA
    if (
      notifType.includes("INVENTORY") ||
      notifType.includes("FBA_INVENTORY") ||
      notifType === "FBA_INVENTORY_AVAILABILITY_CHANGES"
    ) {
      const invPayload = (data.payload || data) as any;
      const isFba = notifType.includes("FBA");

      const invEvent: InventoryChanged = {
        event_id: meta.eventId,
        provider: meta.provider,
        provider_account_id: meta.accountId,
        provider_event_id: meta.providerEventId,
        event_type: "InventoryChanged",
        occurred_at: occurredAt,
        received_at: meta.receivedAt,
        correlation_id: meta.correlationId,
        organization_id: meta.organizationId,
        payload: {
          sku: String(invPayload.sellerSKU || invPayload.sku || invPayload.asin || "UNKNOWN_SKU"),
          quantity: Number(invPayload.fulfillableQuantity ?? invPayload.quantity ?? 0),
          available: Number(invPayload.fulfillableQuantity ?? invPayload.quantity ?? 0),
          on_hand: Number(invPayload.totalQuantity ?? invPayload.fulfillableQuantity ?? 0),
          fulfillment_channel: isFba ? "FBA" : "SELLER",
          raw: data,
        },
      };
      return invEvent;
    }

    // Amazon PRICING / LISTING_CHANGE
    if (notifType.includes("LISTING") || notifType.includes("PRICING")) {
      const listPayload = (data.payload || data) as any;
      const listingEvent: ListingChanged = {
        event_id: meta.eventId,
        provider: meta.provider,
        provider_account_id: meta.accountId,
        provider_event_id: meta.providerEventId,
        event_type: "ListingChanged",
        occurred_at: occurredAt,
        received_at: meta.receivedAt,
        correlation_id: meta.correlationId,
        organization_id: meta.organizationId,
        payload: {
          listing_id: String(listPayload.listingId || listPayload.asin || meta.providerEventId),
          sku: String(listPayload.sellerSKU || listPayload.sku || ""),
          status: String(listPayload.status || "ACTIVE"),
          price: listPayload.price ? Number(listPayload.price) : undefined,
          channel_product_id: String(listPayload.asin || ""),
          raw: data,
        },
      };
      return listingEvent;
    }

    return this.normalizeGeneric(data, topic, meta);
  }

  // --------------------------------------------------------------------------
  // Generic / Direct Canonical Normalization
  // --------------------------------------------------------------------------
  private normalizeGeneric(
    raw: Record<string, unknown>,
    topic: string,
    meta: {
      eventId: string;
      correlationId: string;
      organizationId?: string;
      provider: string;
      accountId: string;
      providerEventId: string;
      receivedAt: string;
    }
  ): NormalizedEvent {
    const occurredAt = (raw.occurred_at || raw.occurredAt || raw.timestamp || meta.receivedAt) as string;

    // Detect target canonical event type
    const candidateType = (
      raw.event_type ||
      raw.eventType ||
      topic ||
      "OrderCreated"
    ) as string;

    const normalizedType = this.mapToCanonicalType(candidateType);
    const payload = (raw.payload && typeof raw.payload === "object" ? raw.payload : raw) as Record<string, unknown>;

    const baseEvent: any = {
      event_id: meta.eventId,
      provider: meta.provider,
      provider_account_id: meta.accountId,
      provider_event_id: meta.providerEventId,
      event_type: normalizedType,
      occurred_at: occurredAt,
      received_at: meta.receivedAt,
      correlation_id: meta.correlationId,
      organization_id: meta.organizationId,
      payload,
    };

    return baseEvent as NormalizedEvent;
  }

  /**
   * Maps an arbitrary type string to one of the 9 canonical event types.
   */
  mapToCanonicalType(typeStr: string): CanonicalEventType {
    const lower = typeStr.toLowerCase().replace(/[-_ ]/g, "");

    if (lower.includes("ordercreated") || lower === "ordercreate" || lower === "orderscreate") {
      return "OrderCreated";
    }
    if (lower.includes("orderupdated") || lower === "orderupdate" || lower === "ordersupdated") {
      return "OrderUpdated";
    }
    if (lower.includes("ordercancelled") || lower.includes("ordercanceled") || lower === "ordercancel") {
      return "OrderCancelled";
    }
    if (lower.includes("inventorychanged") || lower.includes("inventoryupdate") || lower.includes("inventory")) {
      return "InventoryChanged";
    }
    if (lower.includes("productchanged") || lower.includes("productupdated") || lower.includes("product")) {
      return "ProductChanged";
    }
    if (lower.includes("listingchanged") || lower.includes("listingupdated") || lower.includes("listing")) {
      return "ListingChanged";
    }
    if (lower.includes("returncreated") || lower.includes("returncreate") || lower.includes("refund")) {
      return "ReturnCreated";
    }
    if (lower.includes("returnupdated") || lower.includes("returnupdate")) {
      return "ReturnUpdated";
    }
    if (
      lower.includes("integrationchanged") ||
      lower.includes("appuninstalled") ||
      lower.includes("channelstatus")
    ) {
      return "IntegrationChanged";
    }

    return "OrderCreated";
  }

  private extractHeader(
    headers: Record<string, string | string[] | undefined>,
    names: string[]
  ): string | undefined {
    const lowerHeaders = new Map<string, string>();
    for (const [k, v] of Object.entries(headers)) {
      if (v !== undefined) {
        const headerVal = Array.isArray(v) ? v[0] : v;
        if (headerVal !== undefined) {
          lowerHeaders.set(k.toLowerCase(), headerVal);
        }
      }
    }

    for (const name of names) {
      const val = lowerHeaders.get(name.toLowerCase());
      if (val) return val;
    }
    return undefined;
  }
}
