/**
 * Walmart Channel Adapter
 * Canonical Specifications: Section 41 of 01_ENGINEERING_SPEC.md & Prompt 13, 17
 * 
 * NOTE: Per Prompt 13 directive: "Implement integration interfaces without claiming
 * the providers are already operational."
 */

import {
  AuthResult,
  ExternalAccount,
  ExternalProduct,
  Page,
  ExternalOrderQuery,
  ExternalOrder,
  InventoryQuery,
  ExternalInventory,
  InventoryUpdate,
  UpdateResult,
  WebhookRegistrationConfig,
  WebhookRegistrationResult,
  WebhookRequest,
  NormalizedWebhookEvent,
  HealthStatus,
  AdapterCredentials,
} from "../../adapter.js";
import { BaseChannelAdapter } from "../../base-adapter.js";
import { ProviderNotOperationalError } from "../../errors/provider-error.js";
import { WalmartErrorNormalizer } from "./walmart-normalizer.js";
import {
  WALMART_CAPABILITIES,
  WalmartCredentials,
} from "./walmart-types.js";

export class WalmartAdapter extends BaseChannelAdapter {
  readonly provider = "WALMART" as const;
  readonly capabilities = WALMART_CAPABILITIES;
  readonly normalizer = new WalmartErrorNormalizer();

  private credentials?: WalmartCredentials;

  constructor(credentials?: WalmartCredentials) {
    super();
    this.credentials = credentials;
  }

  override isOperational(): boolean {
    return false;
  }

  configure(credentials: WalmartCredentials): void {
    this.credentials = credentials;
  }

  async authenticate(credentials?: AdapterCredentials): Promise<AuthResult> {
    if (credentials) {
      this.credentials = {
        clientId: String(credentials.clientId ?? ""),
        clientSecret: String(credentials.clientSecret ?? ""),
        sellerId: credentials.sellerId ? String(credentials.sellerId) : undefined,
      };
    }

    if (!this.isOperational()) {
      throw new ProviderNotOperationalError(this.provider, "Phase 16 (Walmart Integration)");
    }

    return {
      success: false,
      provider: this.provider,
      error: "Walmart adapter live execution is not operational in Phase 12",
    };
  }

  async refreshCredentials(_credentials?: AdapterCredentials): Promise<AuthResult> {
    if (!this.isOperational()) {
      throw new ProviderNotOperationalError(this.provider, "Phase 16 (Walmart Integration)");
    }
    return {
      success: false,
      provider: this.provider,
      error: "Walmart OAuth token refresh requires Phase 16 integration",
    };
  }

  async getAccount(): Promise<ExternalAccount> {
    if (!this.isOperational()) {
      throw new ProviderNotOperationalError(this.provider, "Phase 16 (Walmart Integration)");
    }
    return {
      id: "walmart-account",
      provider: this.provider,
      name: "Walmart Marketplace Seller",
      currency: "USD",
      status: "INACTIVE",
    };
  }

  async listProducts(_cursor?: string): Promise<Page<ExternalProduct>> {
    if (!this.isOperational()) {
      throw new ProviderNotOperationalError(this.provider, "Phase 16 (Walmart Integration)");
    }
    return { items: [], hasMore: false };
  }

  async getProduct(_id: string): Promise<ExternalProduct> {
    throw new ProviderNotOperationalError(this.provider, "Phase 16 (Walmart Integration)");
  }

  async listOrders(_params: ExternalOrderQuery): Promise<Page<ExternalOrder>> {
    if (!this.isOperational()) {
      throw new ProviderNotOperationalError(this.provider, "Phase 16 (Walmart Integration)");
    }
    return { items: [], hasMore: false };
  }

  async getOrder(_id: string): Promise<ExternalOrder> {
    throw new ProviderNotOperationalError(this.provider, "Phase 16 (Walmart Integration)");
  }

  async getInventory(_input: InventoryQuery): Promise<ExternalInventory> {
    throw new ProviderNotOperationalError(this.provider, "Phase 16 (Walmart Integration)");
  }

  async updateInventory(_input: InventoryUpdate): Promise<UpdateResult> {
    if (!this.isOperational()) {
      throw new ProviderNotOperationalError(this.provider, "Phase 16 (Walmart Integration)");
    }
    return {
      success: false,
      sku: _input.sku,
      acknowledged: false,
      timestamp: new Date(),
      status: "FAILED",
      error: "Walmart adapter is not operational in Phase 12",
    };
  }

  async registerWebhooks(_config?: WebhookRegistrationConfig): Promise<WebhookRegistrationResult> {
    this.assertSupported("supportsWebhooks");
    throw new ProviderNotOperationalError(this.provider, "Phase 16 (Walmart Integration)");
  }

  async verifyWebhook(_request: WebhookRequest): Promise<boolean> {
    this.assertSupported("supportsWebhooks");
    return false;
  }

  async parseWebhook(_request: WebhookRequest): Promise<NormalizedWebhookEvent> {
    this.assertSupported("supportsWebhooks");
    throw new ProviderNotOperationalError(this.provider, "Phase 16 (Walmart Integration)");
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      status: "DISCONNECTED",
      provider: this.provider,
      latencyMs: 0,
      message: "Walmart adapter interface initialized (Phase 16 pending)",
      lastChecked: new Date(),
    };
  }
}
