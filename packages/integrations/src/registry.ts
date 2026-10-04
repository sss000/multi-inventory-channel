/**
 * Channel Adapter Registry & Provider Discovery
 * Canonical Specifications: Section 35, 42 of 01_ENGINEERING_SPEC.md & Prompt 13
 */

import { ChannelProvider, ChannelCapabilities } from "@platform/contracts";
import { ChannelAdapter } from "./adapter.js";
import { ShopifyAdapter } from "./providers/shopify/shopify-adapter.js";
import { AmazonAdapter } from "./providers/amazon/amazon-adapter.js";
import { EbayAdapter } from "./providers/ebay/ebay-adapter.js";
import { WalmartAdapter } from "./providers/walmart/walmart-adapter.js";

export interface ProviderRegistrationInfo {
  provider: ChannelProvider;
  operational: boolean;
  capabilities: ChannelCapabilities;
}

export class AdapterRegistry {
  private adapters: Map<ChannelProvider, ChannelAdapter> = new Map();

  register(provider: ChannelProvider, adapter: ChannelAdapter): void {
    this.adapters.set(provider, adapter);
  }

  get(provider: ChannelProvider): ChannelAdapter {
    const adapter = this.adapters.get(provider);
    if (!adapter) {
      throw new Error(`No channel adapter registered for provider '${provider}'`);
    }
    return adapter;
  }

  has(provider: ChannelProvider): boolean {
    return this.adapters.has(provider);
  }

  getCapabilities(provider: ChannelProvider): ChannelCapabilities {
    return this.get(provider).capabilities;
  }

  listProviders(): ProviderRegistrationInfo[] {
    const list: ProviderRegistrationInfo[] = [];
    for (const [provider, adapter] of this.adapters.entries()) {
      const operational = typeof adapter.isOperational === "function" ? adapter.isOperational() : false;
      list.push({
        provider,
        operational,
        capabilities: adapter.capabilities,
      });
    }
    return list;
  }
}

/**
 * Creates and initializes the default AdapterRegistry with isolated channel adapters.
 */
export function createDefaultAdapterRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register("SHOPIFY", new ShopifyAdapter());
  registry.register("AMAZON", new AmazonAdapter());
  registry.register("EBAY", new EbayAdapter());
  registry.register("WALMART", new WalmartAdapter());
  return registry;
}

export const defaultAdapterRegistry = createDefaultAdapterRegistry();
