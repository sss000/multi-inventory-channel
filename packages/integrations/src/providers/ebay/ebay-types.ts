/**
 * eBay Channel Types and Capabilities
 * Canonical Specifications: Section 40 of 01_ENGINEERING_SPEC.md & Prompt 13, 16
 */

import { ChannelCapabilities } from "../../adapter.js";

export interface EbayCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken?: string;
  environment: "SANDBOX" | "PRODUCTION";
  ruName?: string;
}

export interface EbayApiError {
  errorId: number;
  domain: string;
  subdomain?: string;
  category: "APPLICATION" | "BUSINESS" | "REQUEST" | "SYSTEM";
  message: string;
  longMessage?: string;
  parameters?: Array<{ name: string; value: string }>;
}

export const EBAY_CAPABILITIES: ChannelCapabilities = {
  provider: "EBAY",
  supportsWebhooks: false, // eBay uses Notification API / Push topics
  supportsImmediateReadBack: true,
  supportsBulkInventory: true,
  supportsBatchOrders: true,
  supportsDeltaInventory: true,
  supportsMultiLocation: true,
  supportsFulfillmentTracking: true,
  supportsAsyncFeeds: false,
  rateLimits: {
    requestsPerSecond: 5,
    burst: 15,
    concurrencyLimit: 3,
  },
  customCapabilities: {
    sandboxSupport: true,
    inventoryApi: true,
  },
};
