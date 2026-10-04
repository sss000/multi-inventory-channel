/**
 * Base Channel Adapter Abstract Class
 * Canonical Specifications: Section 35, 42 of 01_ENGINEERING_SPEC.md & Prompt 13
 */

import {
  ChannelAdapter,
  ChannelCapabilities,
  ChannelProvider,
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
  ExternalInventorySnapshot,
  PushInventoryResult,
  VerificationResult,
  hasCapability,
  assertCapability,
} from "./adapter.js";
import { ProviderErrorNormalizer } from "./errors/normalizer.js";

export abstract class BaseChannelAdapter implements ChannelAdapter {
  abstract readonly provider: ChannelProvider;
  abstract readonly capabilities: ChannelCapabilities;
  abstract readonly normalizer: ProviderErrorNormalizer;

  /**
   * Indicates whether this adapter is operational in live environments or currently
   * stubbed/interface-only pending its implementation phase.
   */
  isOperational(): boolean {
    return false;
  }

  // Abstract canonical operations to be implemented by specific adapters
  abstract authenticate(credentials?: AdapterCredentials): Promise<AuthResult>;
  abstract refreshCredentials(credentials?: AdapterCredentials): Promise<AuthResult>;
  abstract getAccount(): Promise<ExternalAccount>;
  abstract listProducts(cursor?: string): Promise<Page<ExternalProduct>>;
  abstract getProduct(id: string): Promise<ExternalProduct>;
  abstract listOrders(params: ExternalOrderQuery): Promise<Page<ExternalOrder>>;
  abstract getOrder(id: string): Promise<ExternalOrder>;
  abstract getInventory(input: InventoryQuery): Promise<ExternalInventory>;
  abstract updateInventory(input: InventoryUpdate): Promise<UpdateResult>;
  abstract registerWebhooks(config?: WebhookRegistrationConfig): Promise<WebhookRegistrationResult>;
  abstract verifyWebhook(request: WebhookRequest): Promise<boolean>;
  abstract parseWebhook(request: WebhookRequest): Promise<NormalizedWebhookEvent>;
  abstract healthCheck(): Promise<HealthStatus>;

  /**
   * Helper to verify a capability is supported before invoking provider-specific logic.
   */
  protected assertSupported(capability: keyof ChannelCapabilities): void {
    assertCapability(this, capability);
  }

  /**
   * Default high-level connection helper calling authenticate()
   */
  async connect(credentials: Record<string, unknown>): Promise<{ status: "connected" | "failed"; error?: string }> {
    try {
      const res = await this.authenticate(credentials);
      return res.success ? { status: "connected" } : { status: "failed", error: res.error };
    } catch (err: unknown) {
      const normalized = this.normalizer.normalize(err);
      return { status: "failed", error: normalized.message };
    }
  }

  /**
   * High-level batch inventory retrieval bridging to getInventory()
   */
  async fetchInventoryLevels(externalSkuIds: string[]): Promise<ExternalInventorySnapshot[]> {
    const snapshots: ExternalInventorySnapshot[] = [];
    for (const sku of externalSkuIds) {
      try {
        const inv = await this.getInventory({ sku });
        snapshots.push({
          externalSkuId: inv.sku,
          quantity: inv.quantity,
          observedAt: inv.observedAt || inv.updatedAt || new Date(),
          receivedAt: inv.receivedAt || new Date(),
          verifiedAt: inv.verifiedAt ?? null,
          locationId: inv.locationId,
        });
      } catch {
        // Continue processing others
      }
    }
    return snapshots;
  }

  /**
   * High-level push inventory bridging to updateInventory() for SyncEngine compatibility
   */
  async pushInventoryLevel(externalSkuId: string, availableQuantity: number): Promise<PushInventoryResult> {
    try {
      const res = await this.updateInventory({
        sku: externalSkuId,
        quantity: availableQuantity,
      });

      return {
        externalSkuId,
        acknowledged: res.acknowledged,
        providerTransactionId: res.transactionId,
        submittedAt: res.submittedAt || res.timestamp,
        acknowledgedAt: res.acknowledgedAt || (res.acknowledged ? new Date() : undefined),
        status: res.status,
        error: res.error,
        httpStatus: res.httpStatus,
        retryAfterMs: res.retryAfterMs,
      };
    } catch (err: unknown) {
      const normalized = this.normalizer.normalize(err);
      return {
        externalSkuId,
        acknowledged: false,
        submittedAt: new Date(),
        status: "FAILED",
        error: normalized.message,
        errorCode: normalized.originalCode,
        httpStatus: normalized.httpStatus,
        retryAfterMs: normalized.retryAfterMs,
      };
    }
  }

  /**
   * High-level read-back verification bridging to getInventory() for SyncEngine compatibility
   */
  async verifyInventoryLevel(externalSkuId: string, expectedQuantity: number): Promise<VerificationResult> {
    const callStart = new Date();
    try {
      const inv = await this.getInventory({ sku: externalSkuId });
      const receivedAt = new Date();
      const observedAt = inv.observedAt || inv.updatedAt || callStart;
      const isVerified = inv.quantity === expectedQuantity;
      const verifiedAt = new Date();
      return {
        externalSkuId,
        isVerified,
        expectedQuantity,
        actualQuantity: inv.quantity,
        observedAt,
        receivedAt,
        verifiedAt,
        status: isVerified ? "VERIFIED" : "MISMATCH",
      };
    } catch (err: unknown) {
      const normalized = this.normalizer.normalize(err);
      const now = new Date();
      return {
        externalSkuId,
        isVerified: false,
        expectedQuantity,
        observedAt: now,
        receivedAt: now,
        verifiedAt: now,
        status: "UNREACHABLE",
        error: normalized.message,
        errorCode: normalized.originalCode,
        httpStatus: normalized.httpStatus,
      };
    }
  }
}
