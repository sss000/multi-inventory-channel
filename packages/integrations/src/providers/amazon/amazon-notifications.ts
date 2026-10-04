/**
 * Amazon SQS / EventBridge Notification Processor
 * Canonical Specifications: Section 38, 43 of 01_ENGINEERING_SPEC.md & Prompt 16
 * 
 * Rules:
 * 1. Normalizes Amazon SP-API notifications (ORDER_CHANGE, LISTINGS_ITEM_STATUS_CHANGE,
 *    FBA_INVENTORY_AVAILABILITY_CHANGE) into canonical platform events.
 * 2. Implements NotificationId deduplication to reject duplicate event delivery.
 * 3. Section 39: FBA inventory notifications are explicitly tagged with fulfillmentChannel: "FBA".
 */

import { NormalizedWebhookEvent } from "@platform/contracts";
import { AmazonNotificationPayload } from "./amazon-types.js";

export class AmazonNotificationDeduplicator {
  private readonly processedIds = new Set<string>();
  private readonly idTimestamps = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(ttlMs: number = 24 * 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  isDuplicate(notificationId: string): boolean {
    this.cleanup();
    if (this.processedIds.has(notificationId)) {
      return true;
    }
    this.processedIds.add(notificationId);
    this.idTimestamps.set(notificationId, Date.now());
    return false;
  }

  record(notificationId: string): void {
    this.processedIds.add(notificationId);
    this.idTimestamps.set(notificationId, Date.now());
  }

  size(): number {
    return this.processedIds.size;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [id, ts] of this.idTimestamps.entries()) {
      if (now - ts > this.ttlMs) {
        this.processedIds.delete(id);
        this.idTimestamps.delete(id);
      }
    }
  }

  clear(): void {
    this.processedIds.clear();
    this.idTimestamps.clear();
  }
}

export interface ParsedAmazonNotification extends NormalizedWebhookEvent {
  notificationType: string;
  notificationId: string;
  sellerId?: string;
  amazonOrderId?: string;
  sku?: string;
  asin?: string;
  fulfillmentChannel?: string;
  quantity?: number;
}

/**
 * Normalizes an Amazon SP-API SQS/EventBridge notification payload.
 */
export function parseAmazonNotification(payload: AmazonNotificationPayload): ParsedAmazonNotification {
  const notificationId = payload.NotificationMetadata?.NotificationId || `amzn_notif_${Date.now()}`;
  const notificationType = payload.NotificationType;
  const eventTime = payload.EventTime ? new Date(payload.EventTime) : new Date();

  // Extract nested notification payload if present
  const innerPayload: Record<string, any> =
    (payload.Payload?.OrderChangeNotification ||
      payload.Payload?.ListingsItemStatusChangeNotification ||
      payload.Payload?.FbaInventoryAvailabilityChangeNotification ||
      payload.Payload ||
      {}) as Record<string, any>;

  let eventType: NormalizedWebhookEvent["eventType"] = "UNKNOWN";

  switch (notificationType) {
    case "ORDER_CHANGE": {
      const orderStatus = String(innerPayload.OrderStatus || "");
      if (orderStatus === "Canceled") {
        eventType = "ORDER_CANCELLED";
      } else if (orderStatus === "Pending" || orderStatus === "Unshipped") {
        eventType = "ORDER_CREATED";
      } else {
        eventType = "ORDER_UPDATED";
      }
      break;
    }

    case "LISTINGS_ITEM_STATUS_CHANGE":
      eventType = "PRODUCT_UPDATED";
      break;

    case "FBA_INVENTORY_AVAILABILITY_CHANGE":
      eventType = "INVENTORY_CHANGED";
      break;

    case "ANY_OFFER_CHANGED":
      eventType = "PRODUCT_UPDATED";
      break;

    default:
      eventType = "UNKNOWN";
      break;
  }

  const sellerId = innerPayload.SellerId || innerPayload.sellerId;
  const amazonOrderId = innerPayload.AmazonOrderId || innerPayload.amazonOrderId;
  const sku = innerPayload.Sku || innerPayload.SellerSku || innerPayload.sku || innerPayload.sellerSku;
  const asin = innerPayload.Asin || innerPayload.asin;
  const fulfillmentChannel =
    notificationType === "FBA_INVENTORY_AVAILABILITY_CHANGE"
      ? "FBA"
      : innerPayload.FulfillmentChannel || innerPayload.fulfillmentChannel || "DEFAULT";
  const quantity =
    innerPayload.FulfillableQuantity ??
    innerPayload.Quantity ??
    innerPayload.fulfillableQuantity ??
    innerPayload.quantity;

  return {
    id: notificationId,
    provider: "AMAZON",
    topic: notificationType,
    eventType,
    notificationType,
    notificationId,
    sellerId,
    amazonOrderId,
    sku,
    asin,
    fulfillmentChannel,
    quantity,
    payload: {
      ...payload.Payload,
      ...innerPayload,
      notificationId,
      eventTime: eventTime.toISOString(),
      fulfillmentChannel,
    },
    receivedAt: new Date(),
  };
}
