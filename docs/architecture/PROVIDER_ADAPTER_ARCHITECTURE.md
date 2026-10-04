# Provider Adapter Architecture & Capability Framework

**Status:** Canonical architectural design and operational specification  
**Applies to:** `@platform/integrations`, `@platform/contracts`, `@platform/domain`  
**Governing Specifications:** Section 35, 36, 37, 38, 39, 40, 41, 42 of [`01_ENGINEERING_SPEC.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/specifications/01_ENGINEERING_SPEC.md) & Prompt 13 of [`06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/specifications/06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md)  
**Lifecycle State:** `VERIFIED`

---

## 1. Executive Architecture Overview

The Provider Adapter Architecture establishes a strict, provider-independent abstraction layer between internal domain logic (inventory ledger, order ingestion, synchronization engine) and external sales channels.

```text
┌─────────────────────────────────────────────────────────────────┐
│                    Platform Domain & Core Services              │
│       (SyncEngine, OrderService, InventoryLedger, Webhooks)     │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│               Canonical ChannelAdapter Contract                 │
│              (13 Standardized Operations + Sync Bridge)          │
└────────┬───────────────┬────────────────┬───────────────┬───────┘
         │               │                │               │
         ▼               ▼                ▼               ▼
┌─────────────────┐ ┌──────────────┐ ┌──────────┐ ┌──────────────┐
│  ShopifyAdapter │ │ AmazonAdapter│ │EbayAdapter││WalmartAdapter│
│  (GraphQL Admin)│ │   (SP-API)   │ │ (REST/XML)││(Feeds / Sync)│
└─────────────────┘ └──────────────┘ └──────────┘ └──────────────┘
         ▲               ▲                ▲               ▲
         │               │                │               │
┌────────┴───────────────┴────────────────┴───────────────┴───────┐
│              Provider-Neutral Error Normalization               │
│          (7 Canonical Error Classes + Retry Classification)     │
└─────────────────────────────────────────────────────────────────┘
```

### Core Architecture Directives:
1. **Never make a provider appear to support functionality that it does not actually support.**
2. **Never claim provider adapters are operational without verified live implementation.**
3. **Isolate provider specifics** into isolated modules without cross-leakage.
4. **Normalize raw channel errors** into the canonical 7-class taxonomy.
5. **Support deterministic mock testing** for comprehensive simulation and fault injection.

---

## 2. Canonical `ChannelAdapter` Contract

Every channel integration implements the common `ChannelAdapter` contract defined in [`packages/integrations/src/adapter.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/adapter.ts):

```typescript
export interface ChannelAdapter {
  readonly provider: ChannelProvider;
  readonly capabilities: ChannelCapabilities;

  // 13 Canonical Operations
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

  // High-Level SyncEngine Bridge
  connect(credentials: Record<string, unknown>): Promise<{ status: "connected" | "failed"; error?: string }>;
  fetchInventoryLevels(externalSkuIds: string[]): Promise<ExternalInventorySnapshot[]>;
  pushInventoryLevel(externalSkuId: string, availableQuantity: number): Promise<PushInventoryResult>;
  verifyInventoryLevel(externalSkuId: string, expectedQuantity: number): Promise<VerificationResult>;

  // Operational Indicator
  isOperational?(): boolean;
}
```

---

## 3. Explicit Capability Detection Matrix

Capabilities are declared honestly via `ChannelCapabilities`. Unsupported operations fail immediately with `ProviderOperationUnsupportedError` rather than fabricating behavior:

| Capability | Shopify | Amazon SP-API | eBay | Walmart | Mock Adapter |
|---|:---:|:---:|:---:|:---:|:---:|
| `supportsWebhooks` | **Yes** | **No** (SQS/EventBridge) | **No** (Push topics) | **No** (Event API) | **Yes** (Configurable) |
| `supportsImmediateReadBack` | **Yes** (Synchronous) | **No** (Eventual consistency) | **Yes** (Synchronous) | **No** (Async feeds) | **Yes** (Configurable) |
| `supportsBulkInventory` | **No** | **Yes** (SP-API Feeds) | **Yes** | **Yes** (Feed processor) | **Yes** |
| `supportsBatchOrders` | **Yes** | **Yes** | **Yes** | **Yes** | **Yes** |
| `supportsDeltaInventory` | **Yes** | **No** | **Yes** | **No** | **Yes** |
| `supportsMultiLocation` | **Yes** (Locations) | **No** (Isolated fulfillment) | **Yes** (Locations) | **Yes** (Ship nodes) | **Yes** |
| `supportsFba` | **No** | **Yes** (FBA isolated) | **No** | **No** | **No** |
| `supportsAsyncFeeds` | **No** | **Yes** | **No** | **Yes** | **No** |
| `supportsGraphQLAdmin` | **Yes** | **No** | **No** | **No** | **No** |
| `supportsShipNodes` | **No** | **No** | **No** | **Yes** | **No** |
| Default RPS Limit | 2 req/s (GraphQL leaky bucket) | 0.5 req/s (SP-API bucket) | 5 req/s | 10 req/s | 100 req/s |

### Capability Assertions
Programmatic capability assertion prevents illegal invocations:
```typescript
assertCapability(adapter, "supportsWebhooks"); // Throws ProviderOperationUnsupportedError if unsupported
```

---

## 4. Provider-Neutral Error Normalization

Raw channel exceptions, HTTP response codes, GraphQL `userErrors`, and platform rate limit envelopes are normalized into structured subclasses of [`ProviderError`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/errors/provider-error.ts):

| Canonical Classification | Error Subclass | Retryable? | Triggers & Examples |
|---|---|:---:|---|
| `RATE_LIMIT` | `ProviderRateLimitError` | **Yes** | HTTP 429, Shopify `THROTTLED`, Amazon `QuotaExceeded`, eBay `10007`. Carries `retryAfterMs`. |
| `AUTHENTICATION` | `ProviderAuthenticationError` | **No** | HTTP 401/403, Shopify `ACCESS_DENIED`, Amazon `Unauthorized`, eBay `1001` (token expired). |
| `NOT_FOUND` | `ProviderNotFoundError` | **No** | HTTP 404, product/order/SKU not found on external channel. |
| `VALIDATION` | `ProviderValidationError` | **No** | HTTP 400, Shopify `userErrors`, Amazon `InvalidInput`, schema mismatch. |
| `CONFLICT` | `ProviderConflictError` | **No** | HTTP 409, Shopify stale compare digest, inventory race conflict. |
| `TRANSIENT` | `ProviderTransientError` | **Yes** | HTTP 500/502/503/504, socket hang up, network timeout. |
| `UNKNOWN` | `ProviderError` | **No** | Unrecognized error shapes. |

---

## 5. Provider Isolation Modules

Each external provider has a dedicated, fully isolated module in `packages/integrations/src/providers/`:

### 1. Shopify (`packages/integrations/src/providers/shopify/`)
- Uses stable Admin GraphQL API (`2025-01`).
- Minimum required scopes: `read_products`, `write_products`, `read_inventory`, `write_inventory`, `read_orders`, `read_locations`.
- Strictly differentiates:
  - `Shopify Product` (container)
  - `Shopify Product Variant` (internal SKU)
  - `Shopify InventoryItem` (inventory tracking entity)
  - `Shopify Location` (internal warehouse)
- Full HMAC-SHA256 timing-safe webhook verification.

### 2. Amazon SP-API (`packages/integrations/src/providers/amazon/`)
- Implements Amazon Selling Partner API (SP-API) contracts.
- **Section 39 Fulfillment Isolation Rule**: Strictly segregates Merchant-Fulfilled (MFN) and Fulfillment by Amazon (FBA) inventory contexts. FBA is isolated as an explicit capability and never silently intermingled into standard merchant warehouse balances.

### 3. eBay (`packages/integrations/src/providers/ebay/`)
- Supports OAuth 2.0 refresh-token lifecycle.
- Environments: `SANDBOX` and `PRODUCTION`.
- Maps inventory API entities and listings.

### 4. Walmart Marketplace (`packages/integrations/src/providers/walmart/`)
- Implements OAuth 2.0 with ship nodes.
- Models asynchronous feeds for bulk inventory separately from synchronous API updates.

---

## 6. Operational Honesty Invariant

In accordance with Prompt 13 and [`AGENTS.md`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/AGENTS.md):
- `ShopifyAdapter`, `AmazonAdapter`, `EbayAdapter`, and `WalmartAdapter` declare `isOperational() === false`.
- Any attempt to invoke live network operations prior to their designated implementation phases (Phases 13, 14, 15, and 16) throws a structured `ProviderNotOperationalError`.
- Production credentials are never fabricated or mocked in provider adapter code.

---

## 7. Deterministic Mock Provider (`MockChannelAdapter`)

For automated contract testing and local development, [`MockChannelAdapter`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/packages/integrations/src/providers/mock/mock-adapter.ts) provides a 100% operational in-memory provider:
- **Programmable Responses:** Pre-seed products, orders, and inventory levels.
- **Fault Injection:** Simulate rate limits (with configurable `retryAfterMs`), authentication expirations, transient network failures, validation errors, and read-back discrepancies.
- **Webhook Generation & Signature:** In-memory HMAC-SHA256 signature generation and timing-safe verification.
- **Health Check States:** Simulate all 6 canonical Section 42 health states (`CONNECTED`, `DEGRADED`, `AUTH_REQUIRED`, `RATE_LIMITED`, `ERROR`, `DISCONNECTED`).
- **Telemetry Spy:** Records all invocations, arguments, and timestamps for deterministic assertions.

---

## 8. Automated Verification Evidence

The entire adapter architecture is verified via [`tests/phase12-provider-adapter.test.ts`](file:///c:/Users/Administrator/Desktop/multi-inventory-channel/tests/phase12-provider-adapter.test.ts):
- **30 / 30 tests passing** covering all contract methods, capability detection, error normalizers, provider isolation, operational honesty, mock adapter fault injection, and `SyncEngine` integration.
- **Total Test Suite:** **223 tests passing across 88 suites with 0 failures** across the entire platform.
