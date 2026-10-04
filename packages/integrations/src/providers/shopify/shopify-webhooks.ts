/**
 * Shopify Webhook Manager & Deduplication Utilities
 * Canonical Specifications: Section 36 of 01_ENGINEERING_SPEC.md & Prompt 14
 */

import crypto from "node:crypto";
import {
  WebhookRequest,
  NormalizedWebhookEvent,
  WebhookRegistrationConfig,
  WebhookRegistrationResult,
} from "../../adapter.js";
import { ShopifyGraphQLClient } from "./shopify-client.js";

export interface DeduplicationOptions {
  ttlMs?: number; // default: 1 hour
}

/**
 * In-memory deduplicator tracking X-Shopify-Webhook-Id headers with TTL cleanup.
 */
export class ShopifyWebhookDeduplicator {
  private readonly processedIds = new Map<string, number>();
  private readonly ttlMs: number;

  constructor(options: DeduplicationOptions = {}) {
    this.ttlMs = options.ttlMs ?? 3600 * 1000;
  }

  /**
   * Checks whether a webhook ID has already been processed within the TTL window.
   * If not already seen, records it and returns false (not a duplicate).
   * If seen, returns true (duplicate).
   */
  isDuplicate(webhookId: string): boolean {
    if (!webhookId) return false;
    this.cleanup();
    if (this.processedIds.has(webhookId)) {
      return true;
    }
    this.processedIds.set(webhookId, Date.now());
    return false;
  }

  private cleanup(): void {
    const cutoff = Date.now() - this.ttlMs;
    for (const [id, timestamp] of this.processedIds.entries()) {
      if (timestamp < cutoff) {
        this.processedIds.delete(id);
      }
    }
  }

  clear(): void {
    this.processedIds.clear();
  }
}

/**
 * Extracts and verifies HMAC-SHA256 signature for Shopify webhooks.
 */
export function verifyShopifyWebhookHmac(
  request: WebhookRequest,
  apiSecret: string
): boolean {
  if (!apiSecret) return false;

  const hmacHeader =
    request.headers["x-shopify-hmac-sha256"] ||
    request.headers["X-Shopify-Hmac-Sha256"];

  if (!hmacHeader) return false;

  const headerStr = (Array.isArray(hmacHeader) ? hmacHeader[0] : hmacHeader) ?? "";
  if (!headerStr) return false;

  const bodyStr =
    typeof request.rawBody === "string"
      ? request.rawBody
      : Buffer.isBuffer(request.rawBody)
      ? request.rawBody.toString("utf8")
      : JSON.stringify(request.rawBody);

  const calculated = crypto
    .createHmac("sha256", apiSecret)
    .update(bodyStr, "utf8")
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(calculated, "base64"),
      Buffer.from(headerStr, "base64")
    );
  } catch {
    return false;
  }
}

/**
 * Parses a Shopify webhook request into the canonical NormalizedWebhookEvent structure.
 */
export function parseShopifyWebhook(request: WebhookRequest): NormalizedWebhookEvent {
  const topicHeader =
    request.headers["x-shopify-topic"] ||
    request.headers["X-Shopify-Topic"] ||
    request.topic ||
    "unknown";
  const topic = (Array.isArray(topicHeader) ? topicHeader[0] : topicHeader) ?? "unknown";

  const webhookIdHeader =
    request.headers["x-shopify-webhook-id"] ||
    request.headers["X-Shopify-Webhook-Id"];
  const webhookId =
    (Array.isArray(webhookIdHeader) ? webhookIdHeader[0] : webhookIdHeader) ||
    crypto.randomUUID();

  let payload: Record<string, unknown> = {};
  if (typeof request.rawBody === "string") {
    try {
      payload = JSON.parse(request.rawBody);
    } catch {
      payload = { raw: request.rawBody };
    }
  } else if (Buffer.isBuffer(request.rawBody)) {
    try {
      payload = JSON.parse(request.rawBody.toString("utf8"));
    } catch {
      payload = { raw: request.rawBody.toString("utf8") };
    }
  } else if (typeof request.rawBody === "object" && request.rawBody !== null) {
    payload = request.rawBody as Record<string, unknown>;
  }

  let eventType: NormalizedWebhookEvent["eventType"] = "UNKNOWN";
  const lowerTopic = topic.toLowerCase();

  if (lowerTopic === "orders/create") eventType = "ORDER_CREATED";
  else if (lowerTopic === "orders/updated") eventType = "ORDER_UPDATED";
  else if (lowerTopic === "orders/cancelled") eventType = "ORDER_CANCELLED";
  else if (lowerTopic === "inventory_levels/update") eventType = "INVENTORY_CHANGED";
  else if (lowerTopic === "products/update" || lowerTopic === "products/create") eventType = "PRODUCT_UPDATED";
  else if (lowerTopic === "app/uninstalled") eventType = "APP_UNINSTALLED";

  return {
    id: webhookId,
    provider: "SHOPIFY",
    topic,
    eventType,
    payload,
    receivedAt: request.timestamp ?? new Date(),
  };
}

/**
 * Registers webhook subscriptions using Shopify Admin GraphQL API.
 */
export async function registerShopifyWebhooks(
  client: ShopifyGraphQLClient,
  config: WebhookRegistrationConfig
): Promise<WebhookRegistrationResult> {
  const mutation = `
    mutation RegisterWebhook($topic: WebhookSubscriptionTopic!, $subscription: WebhookSubscriptionInput!) {
      webhookSubscriptionCreate(topic: $topic, webhookSubscription: $subscription) {
        userErrors {
          field
          message
        }
        webhookSubscription {
          id
          topic
          endpoint {
            __typename
            ... on WebhookHttpEndpoint {
              callbackUrl
            }
          }
        }
      }
    }
  `;

  const registeredTopics: string[] = [];
  const webhookIds: string[] = [];

  for (const topic of config.topics) {
    // Convert e.g. "orders/create" to "ORDERS_CREATE" for GraphQL enum
    const gqlTopic = topic.toUpperCase().replace("/", "_");
    try {
      const response = await client.request<{
        webhookSubscriptionCreate: {
          webhookSubscription?: { id: string; topic: string };
          userErrors?: Array<{ field: string[]; message: string }>;
        };
      }>({
        query: mutation,
        variables: {
          topic: gqlTopic,
          subscription: {
            callbackUrl: config.callbackUrl,
            format: "JSON",
          },
        },
      });

      const sub = response.data?.webhookSubscriptionCreate?.webhookSubscription;
      if (sub?.id) {
        registeredTopics.push(topic);
        webhookIds.push(sub.id);
      }
    } catch {
      // Continue trying other topics
    }
  }

  return {
    success: registeredTopics.length > 0,
    registeredTopics,
    webhookIds,
  };
}
