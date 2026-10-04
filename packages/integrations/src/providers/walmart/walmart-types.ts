/**
 * Walmart Marketplace Types and Capabilities
 * Canonical Specifications: Section 41 of 01_ENGINEERING_SPEC.md & Prompt 13, 17
 */

import { ChannelCapabilities } from "../../adapter.js";

export interface WalmartCredentials {
  clientId: string;
  clientSecret: string;
  channelType?: string;
  sellerId?: string;
}

export interface WalmartErrorItem {
  code: string;
  field?: string;
  description: string;
  info?: string;
  severity?: "ERROR" | "WARNING" | "INFO";
}

export type WalmartFeedStatus =
  | "FEED_SUBMITTED"
  | "FEED_INPROGRESS"
  | "FEED_PROCESSED"
  | "FEED_ERROR";

export const WALMART_CAPABILITIES: ChannelCapabilities = {
  provider: "WALMART",
  supportsWebhooks: false, // Uses Event Notification API
  supportsImmediateReadBack: false, // Bulk updates processed through asynchronous feeds
  supportsBulkInventory: true,
  supportsBatchOrders: true,
  supportsDeltaInventory: false,
  supportsMultiLocation: true, // Ship nodes
  supportsFulfillmentTracking: true,
  supportsAsyncFeeds: true,
  supportsShipNodes: true,
  rateLimits: {
    requestsPerSecond: 10,
    burst: 20,
    concurrencyLimit: 4,
  },
  customCapabilities: {
    asyncFeeds: true,
    shipNodeInventory: true,
  },
};
