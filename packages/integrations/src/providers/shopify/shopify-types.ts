/**
 * Shopify Provider Types and Capabilities
 * Canonical Specifications: Section 36, 37 of 01_ENGINEERING_SPEC.md & Prompt 13, 14
 */

import { ChannelCapabilities } from "../../adapter.js";

/**
 * Supported stable Shopify Admin GraphQL API versions.
 * Unstable, release-candidate, and deprecated versions are strictly prohibited in production.
 */
export const SHOPIFY_STABLE_API_VERSIONS = [
  "2024-10",
  "2025-01",
  "2025-04",
] as const;

export type ShopifyApiVersion = (typeof SHOPIFY_STABLE_API_VERSIONS)[number];

export const SHOPIFY_DEFAULT_API_VERSION: ShopifyApiVersion = "2025-01";

/**
 * Minimum required scopes for multichannel inventory control platform.
 */
export const SHOPIFY_REQUIRED_SCOPES = [
  "read_products",
  "write_products",
  "read_inventory",
  "write_inventory",
  "read_orders",
  "read_locations",
] as const;

export interface ShopifyCredentials {
  shopDomain: string; // e.g. "my-brand.myshopify.com"
  accessToken?: string;
  apiVersion?: string;
  apiKey?: string;
  apiSecret?: string;
}

export interface ShopifyOAuthInstallParams {
  shop: string;
  clientId: string;
  redirectUri: string;
  scopes?: string[];
  state?: string;
}

export interface ShopifyOAuthCallbackParams {
  code: string;
  hmac: string;
  shop: string;
  state: string;
  timestamp: string;
}

export interface ShopifyTokenResponse {
  access_token: string;
  scope: string;
}

/**
 * Shopify GraphQL Error response shape
 */
export interface ShopifyGraphQLError {
  message: string;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
  extensions?: {
    code?: string;
    cost?: {
      requestedQueryCost: number;
      actualQueryCost?: number;
      throttleStatus?: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
    [key: string]: unknown;
  };
}

export interface ShopifyUserError {
  field?: string[];
  message: string;
  code?: string;
}

export interface ShopifyGraphQLResponse<T = unknown> {
  data?: T;
  errors?: ShopifyGraphQLError[];
  extensions?: {
    cost?: {
      requestedQueryCost: number;
      actualQueryCost?: number;
      throttleStatus?: {
        maximumAvailable: number;
        currentlyAvailable: number;
        restoreRate: number;
      };
    };
  };
}

/**
 * Shopify Domain Entity Types
 * Explicitly distinguishing Product, Variant, InventoryItem, Location per Section 37.
 */
export interface ShopifyProductNode {
  id: string; // gid://shopify/Product/12345
  title: string;
  descriptionHtml?: string;
  status: "ACTIVE" | "ARCHIVED" | "DRAFT";
  createdAt: string;
  updatedAt: string;
  variants?: {
    nodes: ShopifyVariantNode[];
  };
}

export interface ShopifyVariantNode {
  id: string; // gid://shopify/ProductVariant/67890
  productId?: string;
  title: string;
  sku: string;
  price: string;
  barcode?: string;
  inventoryItem: {
    id: string; // gid://shopify/InventoryItem/111213
  };
}

export interface ShopifyLocationNode {
  id: string; // gid://shopify/Location/444555
  name: string;
  isActive: boolean;
}

export interface ShopifyInventoryLevelNode {
  id: string;
  location: {
    id: string;
  };
  quantities: Array<{
    name: "available" | "on_hand" | "committed" | "reserved";
    quantity: number;
  }>;
}

export interface ShopifyOrderLineItemNode {
  id: string;
  sku?: string;
  quantity: number;
  title: string;
  variant?: {
    id: string;
    product?: {
      id: string;
    };
  };
  originalUnitPriceSet?: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
}

export interface ShopifyOrderNode {
  id: string; // gid://shopify/Order/98765
  name: string;
  createdAt: string;
  updatedAt: string;
  displayFinancialStatus?: string;
  displayFulfillmentStatus?: string;
  totalPriceSet?: {
    shopMoney: {
      amount: string;
      currencyCode: string;
    };
  };
  lineItems: {
    nodes: ShopifyOrderLineItemNode[];
  };
}

export const SHOPIFY_CAPABILITIES: ChannelCapabilities = {
  provider: "SHOPIFY",
  supportsWebhooks: true,
  supportsImmediateReadBack: true,
  supportsBulkInventory: false,
  supportsBatchOrders: true,
  supportsDeltaInventory: true,
  supportsMultiLocation: true,
  supportsFulfillmentTracking: true,
  supportsAsyncFeeds: false,
  supportsGraphQLAdmin: true,
  rateLimits: {
    requestsPerSecond: 2, // Leaky bucket (GraphQL point-based 50/s restore)
    burst: 40,
    concurrencyLimit: 4,
  },
  customCapabilities: {
    graphqlAdmin: true,
    inventoryItemMapping: true,
    multiLocationInventory: true,
    stableApiVersion: SHOPIFY_DEFAULT_API_VERSION,
  },
};
