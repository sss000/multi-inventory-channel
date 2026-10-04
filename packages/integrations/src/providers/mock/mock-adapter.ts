/**
 * Deterministic Mock Channel Adapter
 * Canonical Specifications: Section 35, 42 of 01_ENGINEERING_SPEC.md & Prompt 13
 * 
 * Provides a fully deterministic, in-memory implementation of the canonical
 * ChannelAdapter contract for automated contract tests and offline simulations.
 */

import crypto from "node:crypto";
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
  ChannelCapabilities,
  ChannelProvider,
  ProviderHealthState,
} from "../../adapter.js";
import { BaseChannelAdapter } from "../../base-adapter.js";
import {
  ProviderAuthenticationError,
  ProviderRateLimitError,
  ProviderTransientError,
  ProviderValidationError,
  ProviderNotFoundError,
  ProviderError,
} from "../../errors/provider-error.js";
import { ProviderErrorNormalizer } from "../../errors/normalizer.js";

export interface MockAdapterOptions {
  provider?: ChannelProvider;
  capabilities?: Partial<ChannelCapabilities>;
  webhookSecret?: string;
  initialInventory?: Record<string, number>;
  initialProducts?: ExternalProduct[];
  initialOrders?: ExternalOrder[];
}

export interface MockFaultConfig {
  rateLimit?: boolean;
  rateLimitRetryAfterMs?: number;
  authError?: boolean;
  transientError?: boolean;
  validationError?: string;
  notFound?: boolean;
  readBackMismatchQuantity?: number;
  timeout?: boolean;
}

export class MockErrorNormalizer implements ProviderErrorNormalizer {
  constructor(readonly provider: ChannelProvider) {}

  normalize(error: unknown): ProviderError {
    if (error instanceof ProviderError) return error;
    const msg = error instanceof Error ? error.message : String(error);
    return new ProviderError(msg, {
      classification: "UNKNOWN",
      provider: this.provider,
    });
  }
}

export class MockChannelAdapter extends BaseChannelAdapter {
  readonly provider: ChannelProvider;
  private _capabilities: ChannelCapabilities;
  readonly normalizer: ProviderErrorNormalizer;

  private webhookSecret: string;
  private inventory: Map<string, number> = new Map();
  private products: Map<string, ExternalProduct> = new Map();
  private orders: Map<string, ExternalOrder> = new Map();
  private registeredWebhooks: Set<string> = new Set();
  private faults: MockFaultConfig = {};
  private healthState: ProviderHealthState = "CONNECTED";
  private healthMessage?: string;

  // Invocation telemetry spy
  readonly calls: Array<{ method: string; args: unknown[]; timestamp: Date }> = [];

  constructor(options: MockAdapterOptions = {}) {
    super();
    this.provider = options.provider ?? "SHOPIFY";
    this.webhookSecret = options.webhookSecret ?? "mock_webhook_secret_key_123";
    this.normalizer = new MockErrorNormalizer(this.provider);

    this._capabilities = {
      provider: this.provider,
      supportsWebhooks: options.capabilities?.supportsWebhooks ?? true,
      supportsImmediateReadBack: options.capabilities?.supportsImmediateReadBack ?? true,
      supportsBulkInventory: options.capabilities?.supportsBulkInventory ?? true,
      supportsBatchOrders: options.capabilities?.supportsBatchOrders ?? true,
      supportsDeltaInventory: options.capabilities?.supportsDeltaInventory ?? true,
      supportsMultiLocation: options.capabilities?.supportsMultiLocation ?? true,
      supportsFulfillmentTracking: options.capabilities?.supportsFulfillmentTracking ?? true,
      supportsAsyncFeeds: options.capabilities?.supportsAsyncFeeds ?? false,
      rateLimits: options.capabilities?.rateLimits ?? {
        requestsPerSecond: 100,
        burst: 100,
      },
      customCapabilities: options.capabilities?.customCapabilities ?? {},
    };

    if (options.initialInventory) {
      for (const [sku, qty] of Object.entries(options.initialInventory)) {
        this.inventory.set(sku, qty);
      }
    }

    if (options.initialProducts) {
      for (const p of options.initialProducts) {
        this.products.set(p.id, p);
      }
    }

    if (options.initialOrders) {
      for (const o of options.initialOrders) {
        this.orders.set(o.id, o);
      }
    }
  }

  get capabilities(): ChannelCapabilities {
    return this._capabilities;
  }

  override isOperational(): boolean {
    return true;
  }

  setCapabilities(overrides: Partial<ChannelCapabilities>): void {
    this._capabilities = {
      ...this._capabilities,
      ...overrides,
    };
  }

  setFault(fault: MockFaultConfig): void {
    this.faults = { ...this.faults, ...fault };
  }

  clearFaults(): void {
    this.faults = {};
  }

  setHealthState(state: ProviderHealthState, message?: string): void {
    this.healthState = state;
    this.healthMessage = message;
  }

  setInventoryQuantity(sku: string, quantity: number): void {
    this.inventory.set(sku, quantity);
  }

  setInventoryLevel(sku: string, quantity: number): void {
    this.inventory.set(sku, quantity);
  }

  private recordCall(method: string, args: unknown[]): void {
    this.calls.push({ method, args, timestamp: new Date() });
    this.checkFaults(method);
  }

  private checkFaults(operation: string): void {
    if (this.faults.rateLimit) {
      throw new ProviderRateLimitError(this.provider, `Mock ${operation} rate limit exceeded`, {
        retryAfterMs: this.faults.rateLimitRetryAfterMs ?? 1000,
      });
    }
    if (this.faults.authError) {
      throw new ProviderAuthenticationError(this.provider, `Mock ${operation} authentication expired`);
    }
    if (this.faults.transientError) {
      throw new ProviderTransientError(this.provider, `Mock ${operation} transient network connection reset`);
    }
    if (this.faults.validationError) {
      throw new ProviderValidationError(this.provider, this.faults.validationError);
    }
    if (this.faults.notFound) {
      throw new ProviderNotFoundError(this.provider, `Mock ${operation} resource not found`);
    }
  }

  async authenticate(_credentials?: AdapterCredentials): Promise<AuthResult> {
    this.recordCall("authenticate", [_credentials]);
    return {
      success: true,
      provider: this.provider,
      accountId: "mock_account_123",
      expiresAt: new Date(Date.now() + 86400 * 1000),
      scopes: ["read_products", "write_inventory", "read_orders"],
    };
  }

  async refreshCredentials(_credentials?: AdapterCredentials): Promise<AuthResult> {
    this.recordCall("refreshCredentials", [_credentials]);
    return {
      success: true,
      provider: this.provider,
      accountId: "mock_account_123",
      expiresAt: new Date(Date.now() + 86400 * 1000),
      scopes: ["read_products", "write_inventory", "read_orders"],
    };
  }

  async getAccount(): Promise<ExternalAccount> {
    this.recordCall("getAccount", []);
    return {
      id: "mock_account_123",
      provider: this.provider,
      name: "Mock Integration Account",
      email: "mock-merchant@example.com",
      currency: "USD",
      country: "US",
      status: "ACTIVE",
    };
  }

  async listProducts(_cursor?: string): Promise<Page<ExternalProduct>> {
    this.recordCall("listProducts", [_cursor]);
    return {
      items: Array.from(this.products.values()),
      hasMore: false,
      totalCount: this.products.size,
    };
  }

  async getProduct(id: string): Promise<ExternalProduct> {
    this.recordCall("getProduct", [id]);
    const prod = this.products.get(id);
    if (!prod) {
      throw new ProviderNotFoundError(this.provider, `Product '${id}' not found`);
    }
    return prod;
  }

  async listOrders(_params: ExternalOrderQuery): Promise<Page<ExternalOrder>> {
    this.recordCall("listOrders", [_params]);
    return {
      items: Array.from(this.orders.values()),
      hasMore: false,
      totalCount: this.orders.size,
    };
  }

  async getOrder(id: string): Promise<ExternalOrder> {
    this.recordCall("getOrder", [id]);
    const order = this.orders.get(id);
    if (!order) {
      throw new ProviderNotFoundError(this.provider, `Order '${id}' not found`);
    }
    return order;
  }

  async getInventory(input: InventoryQuery): Promise<ExternalInventory> {
    this.recordCall("getInventory", [input]);
    if (this.faults.readBackMismatchQuantity !== undefined) {
      return {
        sku: input.sku,
        quantity: this.faults.readBackMismatchQuantity,
        locationId: input.locationId,
        updatedAt: new Date(),
      };
    }
    const quantity = this.inventory.get(input.sku) ?? 0;
    return {
      sku: input.sku,
      quantity,
      locationId: input.locationId,
      updatedAt: new Date(),
    };
  }

  async updateInventory(input: InventoryUpdate): Promise<UpdateResult> {
    this.recordCall("updateInventory", [input]);
    this.inventory.set(input.sku, input.quantity);
    return {
      success: true,
      sku: input.sku,
      acknowledged: true,
      transactionId: `mock_tx_${Date.now()}`,
      timestamp: new Date(),
      status: "ACKNOWLEDGED",
    };
  }

  async registerWebhooks(config?: WebhookRegistrationConfig): Promise<WebhookRegistrationResult> {
    this.assertSupported("supportsWebhooks");
    this.recordCall("registerWebhooks", [config]);
    const topics = config?.topics ?? ["orders/create", "inventory_levels/update"];
    topics.forEach((t) => this.registeredWebhooks.add(t));
    return {
      success: true,
      registeredTopics: topics,
      webhookIds: topics.map((t) => `mock_hook_${t.replace("/", "_")}`),
    };
  }

  async verifyWebhook(request: WebhookRequest): Promise<boolean> {
    this.assertSupported("supportsWebhooks");
    this.recordCall("verifyWebhook", [request]);
    const headerSignature =
      request.headers["x-mock-signature"] ||
      request.headers["x-shopify-hmac-sha256"] ||
      request.headers["X-Mock-Signature"];

    if (!headerSignature) return false;

    const bodyStr = typeof request.rawBody === "string"
      ? request.rawBody
      : Buffer.isBuffer(request.rawBody)
      ? request.rawBody.toString("utf8")
      : JSON.stringify(request.rawBody);

    const expectedSig = crypto
      .createHmac("sha256", this.webhookSecret)
      .update(bodyStr, "utf8")
      .digest("base64");

    const sigStr = (Array.isArray(headerSignature) ? headerSignature[0] : headerSignature) ?? "";
    if (!sigStr) return false;
    try {
      return crypto.timingSafeEqual(
        Buffer.from(expectedSig, "base64"),
        Buffer.from(sigStr, "base64")
      );
    } catch {
      return false;
    }
  }

  /**
   * Helper to generate a valid signed mock webhook request for testing
   */
  createSignedWebhookRequest(
    topic: string,
    payload: Record<string, unknown>,
    secret = this.webhookSecret
  ): WebhookRequest {
    const rawBody = JSON.stringify(payload);
    const signature = crypto
      .createHmac("sha256", secret)
      .update(rawBody, "utf8")
      .digest("base64");

    return {
      headers: {
        "x-mock-signature": signature,
        "x-topic": topic,
        "content-type": "application/json",
      },
      rawBody,
      topic,
      timestamp: new Date(),
    };
  }

  async parseWebhook(request: WebhookRequest): Promise<NormalizedWebhookEvent> {
    this.assertSupported("supportsWebhooks");
    this.recordCall("parseWebhook", [request]);
    const topic = request.topic || (request.headers["x-topic"] as string) || "unknown";
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
    } else {
      payload = request.rawBody as Record<string, unknown>;
    }

    let eventType: NormalizedWebhookEvent["eventType"] = "UNKNOWN";
    if (topic.includes("order") && topic.includes("create")) eventType = "ORDER_CREATED";
    else if (topic.includes("order") && topic.includes("cancel")) eventType = "ORDER_CANCELLED";
    else if (topic.includes("inventory")) eventType = "INVENTORY_CHANGED";
    else if (topic.includes("product")) eventType = "PRODUCT_UPDATED";

    return {
      id: String(payload.id ?? crypto.randomUUID()),
      provider: this.provider,
      topic,
      eventType,
      payload,
      receivedAt: request.timestamp ?? new Date(),
    };
  }

  async healthCheck(): Promise<HealthStatus> {
    this.recordCall("healthCheck", []);
    return {
      status: this.healthState,
      provider: this.provider,
      latencyMs: 12,
      message: this.healthMessage,
      lastChecked: new Date(),
      rateLimitHeadroom: this.healthState === "RATE_LIMITED" ? 0 : 95,
    };
  }
}
