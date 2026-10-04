/**
 * Amazon SP-API Types and Capabilities
 * Canonical Specifications: Section 38, 39 of 01_ENGINEERING_SPEC.md & Prompt 15, 16
 * 
 * Rules:
 * 1. For every SP-API model used, use currently supported API version; reject deprecated versions (e.g. Orders v0).
 * 2. Section 39 Fulfillment Channel Isolation:
 *    Explicitly distinguish seller-fulfilled inventory (MFN) from FBA inventory.
 *    Prioritize seller-fulfilled for MVP. Never silently mix FBA and seller-fulfilled quantities.
 * 3. Document required authorization role/scope, marketplace/region applicability, PII requirements,
 *    throttling behavior, and retry semantics.
 */

import { ChannelCapabilities } from "../../adapter.js";
import { ProviderValidationError } from "../../errors/provider-error.js";

// ==========================================
// 1. SUPPORTED API VERSIONS & DEPRECATION GUARD
// ==========================================

export const SP_API_SUPPORTED_VERSIONS = {
  ORDERS: "2024-06-01",
  LISTINGS_ITEMS: "2021-08-01",
  FBA_INVENTORY: "v1",
  FEEDS: "2021-06-30",
  NOTIFICATIONS: "v1",
  SELLERS: "v1",
} as const;

export const SP_API_DEPRECATED_VERSIONS = [
  "orders/v0",
  "inventory/v1",
] as const;

/**
 * Validates that an SP-API operation is not targeting a deprecated endpoint version.
 */
export function assertNotDeprecatedSpApiVersion(operation: string, version: string): void {
  const normalized = `${operation}/${version}`.toLowerCase();
  if (SP_API_DEPRECATED_VERSIONS.some((d) => normalized.includes(d.toLowerCase()))) {
    throw new ProviderValidationError(
      "AMAZON",
      `Deprecated SP-API version detected: '${operation} ${version}' is deprecated and prohibited by platform policy. Supported versions: Orders 2024-06-01, Listings 2021-08-01.`
    );
  }
}

// ==========================================
// 2. REGIONS & MARKETPLACE IDENTIFIERS
// ==========================================

export type AmazonRegion = "NA" | "EU" | "FE";

export interface AmazonMarketplace {
  id: string;
  name: string;
  countryCode: string;
  region: AmazonRegion;
  currencyCode: string;
  defaultFbaChannelCode: string;
}

export const AMAZON_MARKETPLACES: Record<string, AmazonMarketplace> = {
  // North America
  ATVPDKIKX0DER: {
    id: "ATVPDKIKX0DER",
    name: "Amazon.com (United States)",
    countryCode: "US",
    region: "NA",
    currencyCode: "USD",
    defaultFbaChannelCode: "AMAZON_NA",
  },
  A2EUQ1WTGCTBG2: {
    id: "A2EUQ1WTGCTBG2",
    name: "Amazon.ca (Canada)",
    countryCode: "CA",
    region: "NA",
    currencyCode: "CAD",
    defaultFbaChannelCode: "AMAZON_NA",
  },
  A1AM78C64UM0Y8: {
    id: "A1AM78C64UM0Y8",
    name: "Amazon.com.mx (Mexico)",
    countryCode: "MX",
    region: "NA",
    currencyCode: "MXN",
    defaultFbaChannelCode: "AMAZON_NA",
  },
  // Europe
  A1F83G8C2ARO7P: {
    id: "A1F83G8C2ARO7P",
    name: "Amazon.co.uk (United Kingdom)",
    countryCode: "GB",
    region: "EU",
    currencyCode: "GBP",
    defaultFbaChannelCode: "AMAZON_EU",
  },
  A1PA6795UKMFR9: {
    id: "A1PA6795UKMFR9",
    name: "Amazon.de (Germany)",
    countryCode: "DE",
    region: "EU",
    currencyCode: "EUR",
    defaultFbaChannelCode: "AMAZON_EU",
  },
  A13V1IB3VIYZZH: {
    id: "A13V1IB3VIYZZH",
    name: "Amazon.fr (France)",
    countryCode: "FR",
    region: "EU",
    currencyCode: "EUR",
    defaultFbaChannelCode: "AMAZON_EU",
  },
  APJ6JRA9NG5V4: {
    id: "APJ6JRA9NG5V4",
    name: "Amazon.it (Italy)",
    countryCode: "IT",
    region: "EU",
    currencyCode: "EUR",
    defaultFbaChannelCode: "AMAZON_EU",
  },
  A1RKKUPIHCS9HS: {
    id: "A1RKKUPIHCS9HS",
    name: "Amazon.es (Spain)",
    countryCode: "ES",
    region: "EU",
    currencyCode: "EUR",
    defaultFbaChannelCode: "AMAZON_EU",
  },
  // Far East
  A1VC38T7YXB528: {
    id: "A1VC38T7YXB528",
    name: "Amazon.co.jp (Japan)",
    countryCode: "JP",
    region: "FE",
    currencyCode: "JPY",
    defaultFbaChannelCode: "AMAZON_JP",
  },
  A39IBJ37TRP1C6: {
    id: "A39IBJ37TRP1C6",
    name: "Amazon.com.au (Australia)",
    countryCode: "AU",
    region: "FE",
    currencyCode: "AUD",
    defaultFbaChannelCode: "AMAZON_FE",
  },
};

export const AMAZON_REGION_ENDPOINTS: Record<AmazonRegion, string> = {
  NA: "https://sellingpartnerapi-na.amazon.com",
  EU: "https://sellingpartnerapi-eu.amazon.com",
  FE: "https://sellingpartnerapi-fe.amazon.com",
};

export const AMAZON_LWA_TOKEN_ENDPOINT = "https://api.amazon.com/auth/o2/token";

// ==========================================
// 3. SECTION 39 FULFILLMENT CHANNEL ISOLATION
// ==========================================

export type AmazonFulfillmentChannel = "MFN" | "FBA";

export const MFN_FULFILLMENT_CODE = "DEFAULT";
export const FBA_FULFILLMENT_CODES = [
  "AMAZON_NA",
  "AMAZON_EU",
  "AMAZON_JP",
  "AMAZON_FE",
  "AMAZON_DEFAULT",
] as const;

export interface AmazonInventoryContext {
  fulfillmentChannel: AmazonFulfillmentChannel;
  fulfillmentChannelCode: string;
  sku: string;
  quantity: number;
  marketplaceId: string;
  fbaBreakdown?: {
    fulfillableQuantity: number;
    inboundWorkingQuantity: number;
    inboundShippedQuantity: number;
    inboundReceivingQuantity: number;
    reservedQuantity: number;
    unfulfillableQuantity: number;
  };
}

// ==========================================
// 4. CREDENTIALS & LWA TOKEN SCHEMAS
// ==========================================

export interface AmazonCredentials {
  sellerId: string;
  marketplaceId: string;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  region?: AmazonRegion;
  roleArn?: string;
}

export interface AmazonLwaTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

export interface CachedLwaToken {
  accessToken: string;
  expiresAt: number; // epoch ms
}

// ==========================================
// 5. SP-API ERROR ENVELOPES & RESPONSES
// ==========================================

export interface AmazonSpApiError {
  code: string;
  message: string;
  details?: string;
}

export interface AmazonSpApiResponse<T = unknown> {
  payload?: T;
  errors?: AmazonSpApiError[];
  pagination?: {
    nextToken?: string;
  };
}

// Listings Items API models
export interface AmazonListingItemPatch {
  op: "add" | "replace" | "delete";
  path: string;
  value: Array<Record<string, unknown>>;
}

export interface AmazonListingsItemPatchRequest {
  productType: string;
  patches: AmazonListingItemPatch[];
}

export interface AmazonListingsItemResponse {
  sku: string;
  status: "ACCEPTED" | "INVALID";
  submissionId: string;
  issues?: Array<{
    code: string;
    message: string;
    severity: "ERROR" | "WARNING";
  }>;
}

// Orders API models (v2024-06-01 conforming)
export interface AmazonOrderAddress {
  StateOrRegion?: string;
  PostalCode?: string;
  City?: string;
  CountryCode: string;
}

export interface AmazonOrderItem {
  OrderItemId: string;
  SellerSKU: string;
  Title?: string;
  QuantityOrdered: number;
  QuantityShipped?: number;
  ItemPrice?: {
    CurrencyCode: string;
    Amount: string;
  };
}

export interface AmazonOrder {
  AmazonOrderId: string;
  SellerOrderId?: string;
  PurchaseDate: string;
  LastUpdateDate: string;
  OrderStatus: "Pending" | "Unshipped" | "PartiallyShipped" | "Shipped" | "Canceled" | "Unfulfillable";
  FulfillmentChannel: "MFN" | "AFN"; // AFN = Amazon Fulfillment Network (FBA)
  SalesChannel?: string;
  OrderTotal?: {
    CurrencyCode: string;
    Amount: string;
  };
  NumberOfItemsShipped: number;
  NumberOfItemsUnshipped: number;
  ShippingAddress?: AmazonOrderAddress;
}

// FBA Inventory Summaries API
export interface AmazonFbaInventorySummary {
  asin?: string;
  fnSku?: string;
  sellerSku: string;
  condition?: string;
  inventoryDetails?: {
    fulfillableQuantity: number;
    inboundWorkingQuantity: number;
    inboundShippedQuantity: number;
    inboundReceivingQuantity: number;
    reservedQuantity: {
      totalReservedQuantity: number;
      pendingCustomerOrderQuantity: number;
      pendingTransshipmentQuantity: number;
      fcProcessingQuantity: number;
    };
    unfulfillableQuantity: {
      totalUnfulfillableQuantity: number;
      customerDamagedQuantity: number;
      warehouseDamagedQuantity: number;
      distributorDamagedQuantity: number;
      carrierDamagedQuantity: number;
      defectiveQuantity: number;
      expiredQuantity: number;
    };
  };
}

// SQS / EventBridge Notification Payloads
export interface AmazonNotificationPayload {
  NotificationType:
    | "ORDER_CHANGE"
    | "LISTINGS_ITEM_STATUS_CHANGE"
    | "FBA_INVENTORY_AVAILABILITY_CHANGE"
    | "ANY_OFFER_CHANGED";
  NotificationVersion: string;
  PayloadVersion: string;
  EventTime: string;
  NotificationMetadata: {
    NotificationId: string;
    ApplicationId: string;
    SubscriptionId: string;
    PublishTime: string;
  };
  Payload: Record<string, unknown>;
}

// ==========================================
// 6. OPERATION DOCUMENTATION & METADATA
// ==========================================

export interface SpApiOperationMetadata {
  operation: string;
  endpoint: string;
  apiVersion: string;
  requiredRole: string;
  requiredScope: string;
  supportedRegions: string[];
  requiresPii: boolean;
  regionApplicability?: "ALL" | "REGIONAL";
  piiRequirement?: "NONE" | "RESTRICTED_DATA_TOKEN" | "BUYER_INFO";
  throttling: {
    rate: number;
    requestsPerSecond: number;
    burst: number;
  };
  retrySemantics: {
    description: string;
    retryableHttpCodes: number[];
  };
}

const standardRetry = {
  description: "Retry on 429 RequestThrottled and 503 ServiceUnavailable with exponential backoff and jitter",
  retryableHttpCodes: [429, 500, 503],
};

export const SP_API_OPERATIONS_CATALOG: Record<string, SpApiOperationMetadata> = {
  AUTHENTICATE: {
    operation: "LWA Token Exchange",
    endpoint: "https://api.amazon.com/auth/o2/token",
    apiVersion: "v1",
    requiredRole: "sellingpartnerapi::notifications or app credentials",
    requiredScope: "sellingpartnerapi::notifications",
    supportedRegions: ["NA", "EU", "FE"],
    requiresPii: false,
    regionApplicability: "ALL",
    piiRequirement: "NONE",
    throttling: { rate: 5, requestsPerSecond: 5, burst: 10 },
    retrySemantics: standardRetry,
  },
  GET_PARTICIPATIONS: {
    operation: "Marketplace Participations",
    endpoint: "/sellers/v1/marketplaceParticipations",
    apiVersion: "v1",
    requiredRole: "Selling Partner Insights or Pricing",
    requiredScope: "sellingpartnerapi::sellers",
    supportedRegions: ["NA", "EU", "FE"],
    requiresPii: false,
    regionApplicability: "ALL",
    piiRequirement: "NONE",
    throttling: { rate: 0.016, requestsPerSecond: 0.016, burst: 15 },
    retrySemantics: standardRetry,
  },
  GET_ACCOUNT: {
    operation: "Marketplace Participations",
    endpoint: "/sellers/v1/marketplaceParticipations",
    apiVersion: "v1",
    requiredRole: "Selling Partner Insights or Pricing",
    requiredScope: "sellingpartnerapi::sellers",
    supportedRegions: ["NA", "EU", "FE"],
    requiresPii: false,
    regionApplicability: "ALL",
    piiRequirement: "NONE",
    throttling: { rate: 0.016, requestsPerSecond: 0.016, burst: 15 },
    retrySemantics: standardRetry,
  },
  GET_ORDERS: {
    operation: "Get Orders",
    endpoint: "/orders/2024-06-01/orders",
    apiVersion: "2024-06-01",
    requiredRole: "Direct-to-Consumer Shipping / Orders",
    requiredScope: "sellingpartnerapi::orders",
    supportedRegions: ["NA", "EU", "FE"],
    requiresPii: true,
    regionApplicability: "REGIONAL",
    piiRequirement: "RESTRICTED_DATA_TOKEN",
    throttling: { rate: 0.5, requestsPerSecond: 0.5, burst: 30 },
    retrySemantics: standardRetry,
  },
  LIST_ORDERS: {
    operation: "Get Orders",
    endpoint: "/orders/2024-06-01/orders",
    apiVersion: "2024-06-01",
    requiredRole: "Direct-to-Consumer Shipping / Orders",
    requiredScope: "sellingpartnerapi::orders",
    supportedRegions: ["NA", "EU", "FE"],
    requiresPii: true,
    regionApplicability: "REGIONAL",
    piiRequirement: "RESTRICTED_DATA_TOKEN",
    throttling: { rate: 0.5, requestsPerSecond: 0.5, burst: 30 },
    retrySemantics: standardRetry,
  },
  GET_ORDER_ITEMS: {
    operation: "Get Order Items",
    endpoint: "/orders/2024-06-01/orders/{orderId}/orderItems",
    apiVersion: "2024-06-01",
    requiredRole: "Direct-to-Consumer Shipping / Orders",
    requiredScope: "sellingpartnerapi::orders",
    supportedRegions: ["NA", "EU", "FE"],
    requiresPii: true,
    regionApplicability: "REGIONAL",
    piiRequirement: "RESTRICTED_DATA_TOKEN",
    throttling: { rate: 0.5, requestsPerSecond: 0.5, burst: 30 },
    retrySemantics: standardRetry,
  },
  GET_LISTINGS_ITEM: {
    operation: "Get Listings Item",
    endpoint: "/listings/2021-08-01/items/{sellerId}/{sku}",
    apiVersion: "2021-08-01",
    requiredRole: "Pricing / Inventory / Listings",
    requiredScope: "sellingpartnerapi::listings_items",
    supportedRegions: ["NA", "EU", "FE"],
    requiresPii: false,
    regionApplicability: "REGIONAL",
    piiRequirement: "NONE",
    throttling: { rate: 5, requestsPerSecond: 5, burst: 10 },
    retrySemantics: standardRetry,
  },
  GET_INVENTORY: {
    operation: "Listings Items & FBA Summaries",
    endpoint: "/listings/2021-08-01/items/{sellerId}/{sku} & /fba/inventory/v1/summaries",
    apiVersion: "2021-08-01",
    requiredRole: "Pricing / Inventory",
    requiredScope: "sellingpartnerapi::listings_items",
    supportedRegions: ["NA", "EU", "FE"],
    requiresPii: false,
    regionApplicability: "REGIONAL",
    piiRequirement: "NONE",
    throttling: { rate: 5, requestsPerSecond: 5, burst: 10 },
    retrySemantics: standardRetry,
  },
  PATCH_LISTINGS_ITEM: {
    operation: "Patch Listings Item",
    endpoint: "/listings/2021-08-01/items/{sellerId}/{sku}",
    apiVersion: "2021-08-01",
    requiredRole: "Pricing / Inventory / Listings",
    requiredScope: "sellingpartnerapi::listings_items",
    supportedRegions: ["NA", "EU", "FE"],
    requiresPii: false,
    regionApplicability: "REGIONAL",
    piiRequirement: "NONE",
    throttling: { rate: 5, requestsPerSecond: 5, burst: 10 },
    retrySemantics: standardRetry,
  },
  UPDATE_INVENTORY: {
    operation: "Patch Listings Item",
    endpoint: "/listings/2021-08-01/items/{sellerId}/{sku}",
    apiVersion: "2021-08-01",
    requiredRole: "Pricing / Inventory",
    requiredScope: "sellingpartnerapi::listings_items",
    supportedRegions: ["NA", "EU", "FE"],
    requiresPii: false,
    regionApplicability: "REGIONAL",
    piiRequirement: "NONE",
    throttling: { rate: 5, requestsPerSecond: 5, burst: 10 },
    retrySemantics: standardRetry,
  },
  GET_FBA_INVENTORY_SUMMARIES: {
    operation: "Get FBA Inventory Summaries",
    endpoint: "/fba/inventory/v1/summaries",
    apiVersion: "v1",
    requiredRole: "Fulfillment by Amazon / Inventory",
    requiredScope: "sellingpartnerapi::fba_inventory",
    supportedRegions: ["NA", "EU", "FE"],
    requiresPii: false,
    regionApplicability: "REGIONAL",
    piiRequirement: "NONE",
    throttling: { rate: 5, requestsPerSecond: 5, burst: 10 },
    retrySemantics: standardRetry,
  },
  CREATE_FEED: {
    operation: "Create Feed",
    endpoint: "/feeds/2021-06-30/feeds",
    apiVersion: "2021-06-30",
    requiredRole: "Feeds",
    requiredScope: "sellingpartnerapi::feeds",
    supportedRegions: ["NA", "EU", "FE"],
    requiresPii: false,
    regionApplicability: "REGIONAL",
    piiRequirement: "NONE",
    throttling: { rate: 0.0083, requestsPerSecond: 0.0083, burst: 1 },
    retrySemantics: standardRetry,
  },
  GET_FEED: {
    operation: "Get Feed",
    endpoint: "/feeds/2021-06-30/feeds/{feedId}",
    apiVersion: "2021-06-30",
    requiredRole: "Feeds",
    requiredScope: "sellingpartnerapi::feeds",
    supportedRegions: ["NA", "EU", "FE"],
    requiresPii: false,
    regionApplicability: "REGIONAL",
    piiRequirement: "NONE",
    throttling: { rate: 2, requestsPerSecond: 2, burst: 15 },
    retrySemantics: standardRetry,
  },
  NOTIFICATIONS: {
    operation: "SQS Notification Processing",
    endpoint: "AWS SQS / EventBridge Ingestion",
    apiVersion: "v1",
    requiredRole: "Notifications API Subscription",
    requiredScope: "sellingpartnerapi::notifications",
    supportedRegions: ["NA", "EU", "FE"],
    requiresPii: false,
    regionApplicability: "REGIONAL",
    piiRequirement: "NONE",
    throttling: { rate: 10, requestsPerSecond: 10, burst: 50 },
    retrySemantics: standardRetry,
  },
};

// ==========================================
// 7. CAPABILITIES DECLARATION
// ==========================================

export const AMAZON_CAPABILITIES: ChannelCapabilities = {
  provider: "AMAZON",
  supportsWebhooks: false, // Amazon uses SQS/EventBridge notifications, not standard HTTP webhooks
  supportsImmediateReadBack: false, // SP-API inventory is eventually consistent
  supportsBulkInventory: true, // SP-API Feeds API
  supportsBatchOrders: true,
  supportsDeltaInventory: false,
  supportsMultiLocation: false, // Fulfilled from merchant warehouse vs Amazon fulfillment centers
  supportsFulfillmentTracking: true,
  supportsAsyncFeeds: true,
  supportsFba: true, // Isolated fulfillment context per Section 39
  rateLimits: {
    requestsPerSecond: 0.5,
    burst: 10,
    concurrencyLimit: 2,
  },
  customCapabilities: {
    spApiFeeds: true,
    fbaInventoryIsolation: true,
    sqsNotifications: true,
    supportedOrdersVersion: SP_API_SUPPORTED_VERSIONS.ORDERS,
    supportedListingsVersion: SP_API_SUPPORTED_VERSIONS.LISTINGS_ITEMS,
    supportedFbaVersion: SP_API_SUPPORTED_VERSIONS.FBA_INVENTORY,
  },
};
