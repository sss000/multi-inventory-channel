/**
 * Channel Adapter Framework & Interface
 * Canonical Specifications: Section 35, 42 of 01_ENGINEERING_SPEC.md & Prompt 13
 */

import {
  ChannelProvider,
  ChannelCapabilities,
  AuthResult,
  ExternalAccount,
  ExternalProduct,
  ExternalVariant,
  Page,
  ExternalOrderQuery,
  ExternalOrder,
  ExternalOrderItem,
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
  ProviderHealthState,
  VerificationStage,
  FreshnessMetadata,
  TrustState,
} from "@platform/contracts";
import { ProviderOperationUnsupportedError } from "./errors/provider-error.js";

export type {
  ChannelProvider,
  ChannelCapabilities,
  AuthResult,
  ExternalAccount,
  ExternalProduct,
  ExternalVariant,
  Page,
  ExternalOrderQuery,
  ExternalOrder,
  ExternalOrderItem,
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
  ProviderHealthState,
  VerificationStage,
  FreshnessMetadata,
  TrustState,
};

/**
 * Historical snapshot interface preserved for SyncEngine compatibility.
 * Tracks Section 121 freshness timestamps: observedAt, receivedAt, verifiedAt.
 */
export interface ExternalInventorySnapshot {
  externalSkuId: string;
  quantity: number;
  observedAt: Date;
  receivedAt?: Date;
  verifiedAt?: Date | null;
  locationId?: string;
}

/**
 * Push inventory result interface preserved for SyncEngine compatibility.
 */
export interface PushInventoryResult {
  externalSkuId: string;
  acknowledged: boolean;
  providerTransactionId?: string;
  submittedAt: Date;
  acknowledgedAt?: Date;
  status: "ACKNOWLEDGED" | "FAILED";
  error?: string;
  errorCode?: string;
  httpStatus?: number;
  retryAfterMs?: number;
}

/**
 * Verification result interface preserved for SyncEngine compatibility.
 * Tracks Section 121 freshness timestamps: observedAt, receivedAt, verifiedAt.
 */
export interface VerificationResult {
  externalSkuId: string;
  isVerified: boolean;
  expectedQuantity: number;
  actualQuantity?: number;
  observedAt?: Date;
  receivedAt?: Date;
  verifiedAt: Date;
  status: "VERIFIED" | "MISMATCH" | "UNREACHABLE";
  error?: string;
  errorCode?: string;
  httpStatus?: number;
}

/**
 * Canonical Channel Adapter Contract conforming strictly to Section 35 of 01_ENGINEERING_SPEC.md.
 * Every channel integration MUST implement this common contract.
 */
export interface ChannelAdapter {
  readonly provider: ChannelProvider;
  readonly capabilities: ChannelCapabilities;

  // Canonical 13 operations
  authenticate(credentials?: AdapterCredentials): Promise<AuthResult>;
  refreshCredentials(credentials?: AdapterCredentials): Promise<AuthResult>;
  getAccount(): Promise<ExternalAccount>;
  listProducts(cursor?: string): Promise<Page<ExternalProduct>>;
  getProduct(id: string): Promise<ExternalProduct>;
  listOrders(params: ExternalOrderQuery): Promise<Page<ExternalOrder>>;
  getOrder(id: string): Promise<ExternalOrder>;
  getInventory(input: InventoryQuery): Promise<ExternalInventory>;
  updateInventory(input: InventoryUpdate): Promise<UpdateResult>;
  registerWebhooks(config?: WebhookRegistrationConfig): Promise<WebhookRegistrationResult>;
  verifyWebhook(request: WebhookRequest): Promise<boolean>;
  parseWebhook(request: WebhookRequest): Promise<NormalizedWebhookEvent>;
  healthCheck(): Promise<HealthStatus>;

  // High-level / SyncEngine compatibility methods
  connect(credentials: Record<string, unknown>): Promise<{ status: "connected" | "failed"; error?: string }>;
  fetchInventoryLevels(externalSkuIds: string[]): Promise<ExternalInventorySnapshot[]>;
  pushInventoryLevel(externalSkuId: string, availableQuantity: number): Promise<PushInventoryResult>;
  verifyInventoryLevel(externalSkuId: string, expectedQuantity: number): Promise<VerificationResult>;

  // Operational indicator
  isOperational?(): boolean;
}

/**
 * Checks whether an adapter supports a particular capability.
 */
export function hasCapability(
  adapter: ChannelAdapter,
  capability: keyof ChannelCapabilities
): boolean {
  const val = adapter.capabilities[capability];
  return Boolean(val);
}

/**
 * Asserts that an adapter supports a capability, throwing ProviderOperationUnsupportedError if unsupported.
 */
export function assertCapability(
  adapter: ChannelAdapter,
  capability: keyof ChannelCapabilities
): void {
  if (!hasCapability(adapter, capability)) {
    throw new ProviderOperationUnsupportedError(
      adapter.provider,
      String(capability),
      `Provider capabilities explicitly declare '${String(capability)}: false'`
    );
  }
}
