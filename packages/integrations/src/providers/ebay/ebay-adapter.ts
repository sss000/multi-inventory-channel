/**
 * eBay Channel Adapter
 * Canonical Specifications: Section 40 of 01_ENGINEERING_SPEC.md & Prompt 13, 16
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
import { EbayErrorNormalizer } from "./ebay-normalizer.js";
import {
  EBAY_CAPABILITIES,
  EbayCredentials,
} from "./ebay-types.js";

export class EbayAdapter extends BaseChannelAdapter {
  readonly provider = "EBAY" as const;
  readonly capabilities = EBAY_CAPABILITIES;
  readonly normalizer = new EbayErrorNormalizer();

  private credentials?: EbayCredentials;

  constructor(credentials?: EbayCredentials) {
    super();
    this.credentials = credentials;
  }

  override isOperational(): boolean {
    return false;
  }

  configure(credentials: EbayCredentials): void {
    this.credentials = credentials;
  }

  async authenticate(credentials?: AdapterCredentials): Promise<AuthResult> {
    if (credentials) {
      this.credentials = {
        clientId: String(credentials.clientId ?? ""),
        clientSecret: String(credentials.clientSecret ?? ""),
        environment: credentials.environment === "SANDBOX" ? "SANDBOX" : "PRODUCTION",
        refreshToken: credentials.refreshToken ? String(credentials.refreshToken) : undefined,
      };
    }

    if (!this.isOperational()) {
      throw new ProviderNotOperationalError(this.provider, "Phase 15 (eBay Integration)");
    }

    return {
      success: false,
      provider: this.provider,
      error: "eBay adapter live execution is not operational in Phase 12",
    };
  }

  async refreshCredentials(_credentials?: AdapterCredentials): Promise<AuthResult> {
    if (!this.isOperational()) {
      throw new ProviderNotOperationalError(this.provider, "Phase 15 (eBay Integration)");
    }
    return {
      success: false,
      provider: this.provider,
      error: "eBay refresh token lifecycle requires Phase 15 integration",
    };
  }

  async getAccount(): Promise<ExternalAccount> {
    if (!this.isOperational()) {
      throw new ProviderNotOperationalError(this.provider, "Phase 15 (eBay Integration)");
    }
    return {
      id: "ebay-account",
      provider: this.provider,
      name: "eBay Seller",
      currency: "USD",
      status: "INACTIVE",
    };
  }

  async listProducts(_cursor?: string): Promise<Page<ExternalProduct>> {
    if (!this.isOperational()) {
      throw new ProviderNotOperationalError(this.provider, "Phase 15 (eBay Integration)");
    }
    return { items: [], hasMore: false };
  }

  async getProduct(_id: string): Promise<ExternalProduct> {
    throw new ProviderNotOperationalError(this.provider, "Phase 15 (eBay Integration)");
  }

  async listOrders(_params: ExternalOrderQuery): Promise<Page<ExternalOrder>> {
    if (!this.isOperational()) {
      throw new ProviderNotOperationalError(this.provider, "Phase 15 (eBay Integration)");
    }
    return { items: [], hasMore: false };
  }

  async getOrder(_id: string): Promise<ExternalOrder> {
    throw new ProviderNotOperationalError(this.provider, "Phase 15 (eBay Integration)");
  }

  async getInventory(_input: InventoryQuery): Promise<ExternalInventory> {
    throw new ProviderNotOperationalError(this.provider, "Phase 15 (eBay Integration)");
  }

  async updateInventory(_input: InventoryUpdate): Promise<UpdateResult> {
    if (!this.isOperational()) {
      throw new ProviderNotOperationalError(this.provider, "Phase 15 (eBay Integration)");
    }
    return {
      success: false,
      sku: _input.sku,
      acknowledged: false,
      timestamp: new Date(),
      status: "FAILED",
      error: "eBay adapter is not operational in Phase 12",
    };
  }

  async registerWebhooks(_config?: WebhookRegistrationConfig): Promise<WebhookRegistrationResult> {
    this.assertSupported("supportsWebhooks");
    throw new ProviderNotOperationalError(this.provider, "Phase 15 (eBay Integration)");
  }

  async verifyWebhook(_request: WebhookRequest): Promise<boolean> {
    this.assertSupported("supportsWebhooks");
    return false;
  }

  async parseWebhook(_request: WebhookRequest): Promise<NormalizedWebhookEvent> {
    this.assertSupported("supportsWebhooks");
    throw new ProviderNotOperationalError(this.provider, "Phase 15 (eBay Integration)");
  }

  async healthCheck(): Promise<HealthStatus> {
    return {
      status: "DISCONNECTED",
      provider: this.provider,
      latencyMs: 0,
      message: "eBay adapter interface initialized (Phase 15 pending)",
      lastChecked: new Date(),
    };
  }
}
