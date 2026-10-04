/**
 * Channel Adapter Contracts & Types
 * Canonical Specifications: Section 35, 42 of 01_ENGINEERING_SPEC.md & Prompt 13
 */

import { ChannelProvider } from "@platform/domain";
import { NormalizedEvent } from "./events.js";

export type { ChannelProvider, NormalizedEvent };

/**
 * Provider Health State conforming strictly to Section 42 of 01_ENGINEERING_SPEC.md:
 * CONNECTED | DEGRADED | AUTH_REQUIRED | RATE_LIMITED | ERROR | DISCONNECTED
 */
export type ProviderHealthState =
  | "CONNECTED"
  | "DEGRADED"
  | "AUTH_REQUIRED"
  | "RATE_LIMITED"
  | "ERROR"
  | "DISCONNECTED";

/**
 * Explicit capabilities declared by channel adapters.
 * Prevents pretending a provider supports functionality that it does not actually support.
 */
export interface ChannelCapabilities {
  readonly provider: ChannelProvider;
  readonly supportsWebhooks: boolean;
  readonly supportsImmediateReadBack: boolean;
  readonly supportsBulkInventory: boolean;
  readonly supportsBatchOrders: boolean;
  readonly supportsDeltaInventory: boolean;
  readonly supportsMultiLocation: boolean;
  readonly supportsFulfillmentTracking: boolean;
  readonly supportsAsyncFeeds: boolean;
  readonly supportsFba?: boolean;
  readonly supportsShipNodes?: boolean;
  readonly supportsGraphQLAdmin?: boolean;
  readonly rateLimits: {
    readonly requestsPerSecond: number;
    readonly burst: number;
    readonly concurrencyLimit?: number;
  };
  readonly customCapabilities?: Readonly<Record<string, boolean | string | number>>;
}

/**
 * Common Authentication Result
 */
export interface AuthResult {
  success: boolean;
  provider: ChannelProvider;
  accountId?: string;
  expiresAt?: Date;
  scopes?: string[];
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Common External Account Entity
 */
export interface ExternalAccount {
  id: string;
  provider: ChannelProvider;
  name: string;
  email?: string;
  currency: string;
  country?: string;
  status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "UNKNOWN";
  raw?: Record<string, unknown>;
}

/**
 * Common External Product Variant
 */
export interface ExternalVariant {
  id: string;
  productId: string;
  sku: string;
  title?: string;
  price?: number;
  currency?: string;
  inventoryItemId?: string;
  barcode?: string;
  raw?: Record<string, unknown>;
}

/**
 * Common External Product Entity
 */
export interface ExternalProduct {
  id: string;
  provider: ChannelProvider;
  title: string;
  description?: string;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  variants: ExternalVariant[];
  createdAt?: Date;
  updatedAt?: Date;
  raw?: Record<string, unknown>;
}

/**
 * Pagination Wrapper
 */
export interface Page<T> {
  items: T[];
  nextCursor?: string;
  hasMore: boolean;
  totalCount?: number;
}

/**
 * Query parameters for fetching external channel orders
 */
export interface ExternalOrderQuery {
  since?: Date;
  until?: Date;
  status?: string;
  limit?: number;
  cursor?: string;
}

export type ChannelOrderQuery = ExternalOrderQuery;

/**
 * External Order Line Item
 */
export interface ExternalOrderItem {
  id: string;
  externalSku: string;
  externalProductId?: string;
  externalVariantId?: string;
  quantity: number;
  unitPrice: number;
  title?: string;
  raw?: Record<string, unknown>;
}

/**
 * External Order Entity
 */
export interface ExternalOrder {
  id: string;
  provider: ChannelProvider;
  orderNumber: string;
  status: string;
  totalPrice: number;
  currency: string;
  items: ExternalOrderItem[];
  placedAt: Date;
  updatedAt?: Date;
  fulfillmentStatus?: string;
  raw?: Record<string, unknown>;
}

/**
 * Query for retrieving channel inventory
 */
export interface InventoryQuery {
  sku: string;
  locationId?: string;
  fulfillmentChannel?: "SELLER" | "FBA" | "DEFAULT";
}

/**
 * External Inventory Level Snapshot conforming to Section 121 of 01_ENGINEERING_SPEC.md.
 * Tracks explicit freshness timestamps: observedAt, receivedAt, verifiedAt.
 */
export interface ExternalInventory {
  sku: string;
  quantity: number;
  locationId?: string;
  updatedAt: Date;
  observedAt?: Date;
  receivedAt?: Date;
  verifiedAt?: Date | null;
  fulfillmentChannel?: "SELLER" | "FBA" | "DEFAULT";
  raw?: Record<string, unknown>;
}

/**
 * Payload for updating channel inventory
 */
export interface InventoryUpdate {
  sku: string;
  quantity: number;
  locationId?: string;
  fulfillmentChannel?: "SELLER" | "FBA" | "DEFAULT";
  idempotencyKey?: string;
}

/**
 * Result of an inventory update operation
 */
export interface UpdateResult {
  success: boolean;
  sku: string;
  acknowledged: boolean;
  transactionId?: string;
  timestamp: Date;
  submittedAt?: Date;
  acknowledgedAt?: Date;
  error?: string;
  status: "ACKNOWLEDGED" | "FAILED";
  httpStatus?: number;
  retryAfterMs?: number;
}

/**
 * Configuration for registering webhooks with a provider
 */
export interface WebhookRegistrationConfig {
  topics: string[];
  callbackUrl: string;
  secret?: string;
}

/**
 * Result of registering webhooks
 */
export interface WebhookRegistrationResult {
  success: boolean;
  registeredTopics: string[];
  webhookIds?: string[];
  error?: string;
}

/**
 * Inbound webhook HTTP request shape for verification and parsing
 */
export interface WebhookRequest {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string | Buffer;
  topic?: string;
  timestamp?: Date;
}

/**
 * Normalized channel event parsed from webhook or notification
 */
export interface NormalizedWebhookEvent {
  id: string;
  provider: ChannelProvider;
  topic: string;
  eventType:
    | "ORDER_CREATED"
    | "ORDER_UPDATED"
    | "ORDER_CANCELLED"
    | "INVENTORY_CHANGED"
    | "PRODUCT_UPDATED"
    | "APP_UNINSTALLED"
    | "UNKNOWN";
  payload: Record<string, unknown>;
  receivedAt: Date;
}

/**
 * Provider Health Status conforming to Section 42 of 01_ENGINEERING_SPEC.md
 */
export interface HealthStatus {
  status: ProviderHealthState;
  provider: ChannelProvider;
  latencyMs?: number;
  message?: string;
  lastChecked: Date;
  rateLimitHeadroom?: number;
}

/**
 * Adapter credentials bag
 */
export type AdapterCredentials = Record<string, unknown>;
