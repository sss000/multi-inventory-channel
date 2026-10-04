/**
 * Canonical Webhook Ingestion & Processing Pipeline
 * Specifications: Section 43 of 01_ENGINEERING_SPEC.md & Prompt 18 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * 
 * Implements the 9-stage pipeline:
 * 1. Receive
 * 2. Verify signature
 * 3. Persist raw event securely
 * 4. Deduplicate
 * 5. Acknowledge quickly (BEFORE long-running work!)
 * 6. Queue processing
 * 7. Normalize
 * 8. Apply domain event (with out-of-order & delayed event safeguards)
 * 9. Trigger synchronization/reconciliation
 */

import crypto from "node:crypto";
import {
  WebhookIngestionRequest,
  WebhookAckResponse,
  WebhookPipelineResult,
  NormalizedEvent,
  OrderCreated,
  OrderUpdated,
  OrderCancelled,
  InventoryChanged,
  ProductChanged,
  ListingChanged,
  ReturnCreated,
  ReturnUpdated,
  IntegrationChanged,
} from "@platform/contracts";
import {
  RawWebhookStorageService,
  PayloadTooLargeError,
} from "./raw-storage.js";
import { WebhookDeduplicationStore } from "./deduplicator.js";
import { WebhookNormalizer, MalformedPayloadError } from "./normalizer.js";

export class InvalidSignatureError extends Error {
  readonly httpStatus = 401;
  readonly provider: string;

  constructor(provider: string) {
    super(`Invalid webhook signature for provider '${provider}'`);
    this.name = "InvalidSignatureError";
    this.provider = provider;
  }
}

export class OutOfOrderEventError extends Error {
  readonly incomingOccurredAt: string;
  readonly currentUpdatedAt: string;

  constructor(message: string, incomingOccurredAt: string, currentUpdatedAt: string) {
    super(message);
    this.name = "OutOfOrderEventError";
    this.incomingOccurredAt = incomingOccurredAt;
    this.currentUpdatedAt = currentUpdatedAt;
  }
}

export interface WebhookDomainDispatcher {
  applyOrderCreated?(event: OrderCreated): Promise<void>;
  applyOrderUpdated?(event: OrderUpdated): Promise<void>;
  applyOrderCancelled?(event: OrderCancelled): Promise<void>;
  applyInventoryChanged?(event: InventoryChanged): Promise<void>;
  applyProductChanged?(event: ProductChanged): Promise<void>;
  applyListingChanged?(event: ListingChanged): Promise<void>;
  applyReturnCreated?(event: ReturnCreated): Promise<void>;
  applyReturnUpdated?(event: ReturnUpdated): Promise<void>;
  applyIntegrationChanged?(event: IntegrationChanged): Promise<void>;
  getEntityVersion?(
    entityType: string,
    entityId: string
  ): Promise<{ lastUpdatedAt?: Date; version?: number } | null>;
}

export interface WebhookSyncTrigger {
  triggerSync?(event: NormalizedEvent): Promise<void>;
  triggerReconciliation?(event: NormalizedEvent, reason: string): Promise<void>;
}

export interface WebhookQueueEnqueuer {
  enqueue(jobData: {
    eventId: string;
    organizationId: string;
    provider: string;
    accountId: string;
    rawStoragePath: string;
    correlationId: string;
  }): Promise<void>;
}

export type SignatureVerifier = (
  provider: string,
  accountId: string,
  request: WebhookIngestionRequest
) => Promise<boolean> | boolean;

export interface PipelineOptions {
  storageService?: RawWebhookStorageService;
  deduplicator?: WebhookDeduplicationStore;
  normalizer?: WebhookNormalizer;
  signatureVerifier?: SignatureVerifier;
  dispatcher?: WebhookDomainDispatcher;
  syncTrigger?: WebhookSyncTrigger;
  queueEnqueuer?: WebhookQueueEnqueuer;
  delayedEventThresholdMs?: number; // default: 24h (86,400,000ms)
}

/**
 * Webhook Ingestion Pipeline implementing Prompt 18 & Section 43
 */
export class WebhookIngestionPipeline {
  private readonly storageService: RawWebhookStorageService;
  private readonly deduplicator: WebhookDeduplicationStore;
  private readonly normalizer: WebhookNormalizer;
  private readonly signatureVerifier?: SignatureVerifier;
  private readonly dispatcher?: WebhookDomainDispatcher;
  private readonly syncTrigger?: WebhookSyncTrigger;
  private readonly queueEnqueuer?: WebhookQueueEnqueuer;
  private readonly delayedEventThresholdMs: number;

  constructor(options: PipelineOptions = {}) {
    this.storageService = options.storageService ?? new RawWebhookStorageService();
    this.deduplicator = options.deduplicator ?? new WebhookDeduplicationStore();
    this.normalizer = options.normalizer ?? new WebhookNormalizer();
    this.signatureVerifier = options.signatureVerifier;
    this.dispatcher = options.dispatcher;
    this.syncTrigger = options.syncTrigger;
    this.queueEnqueuer = options.queueEnqueuer;
    this.delayedEventThresholdMs = options.delayedEventThresholdMs ?? 24 * 3600 * 1000;
  }

  /**
   * Stage 1 - 5: Synchronous, fast ingestion and immediate provider acknowledgement.
   * INVARIANT: Returns HTTP 200/202 BEFORE executing long-running background tasks.
   */
  async receiveAndAcknowledge(
    request: WebhookIngestionRequest
  ): Promise<{ ack: WebhookAckResponse; rawStoragePath?: string; isDuplicate?: boolean }> {
    const startTime = Date.now();
    const eventId = crypto.randomUUID();
    const correlationId = request.correlationId ?? crypto.randomUUID();

    // ------------------------------------------------------------------------
    // Stage 1: Receive & Validate Basics
    // ------------------------------------------------------------------------
    if (!request.provider) {
      throw new MalformedPayloadError("Missing provider in request", "UNKNOWN");
    }
    if (!request.organizationId) {
      throw new MalformedPayloadError("Missing organizationId", request.provider);
    }
    if (!request.rawBody) {
      throw new MalformedPayloadError("Empty webhook raw body", request.provider);
    }

    // ------------------------------------------------------------------------
    // Stage 2: Verify Signature
    // ------------------------------------------------------------------------
    if (this.signatureVerifier) {
      const isValid = await this.signatureVerifier(
        request.provider,
        request.accountId,
        request
      );
      if (!isValid) {
        throw new InvalidSignatureError(request.provider);
      }
    }

    // Determine provider event ID
    const providerEventId = this.extractProviderEventId(request, eventId);
    const dedupKey = this.deduplicator.generateKey(
      request.provider,
      request.accountId,
      providerEventId
    );

    // ------------------------------------------------------------------------
    // Stage 4: Deduplicate (Checked early to return cached ack on retries)
    // ------------------------------------------------------------------------
    if (this.deduplicator.isDuplicate(dedupKey)) {
      const cachedAck = this.deduplicator.getExistingAck(dedupKey);
      if (cachedAck) {
        return {
          ack: {
            ...cachedAck,
            status: "DUPLICATE",
            processingTimeMs: Date.now() - startTime,
          },
          isDuplicate: true,
        };
      }
    }

    // ------------------------------------------------------------------------
    // Stage 3: Persist Raw Event Securely (Private tenant bucket, size limits, PII redaction)
    // ------------------------------------------------------------------------
    const storageRecord = await this.storageService.savePayload({
      organizationId: request.organizationId,
      provider: request.provider,
      accountId: request.accountId,
      eventId,
      providerEventId,
      rawBody: request.rawBody,
      headers: request.headers,
    });

    // ------------------------------------------------------------------------
    // Stage 5: Acknowledge Provider Quickly
    // Invariant: Fast acknowledgement issued before queue/domain dispatch!
    // ------------------------------------------------------------------------
    const ack: WebhookAckResponse = {
      received: true,
      status: "ACCEPTED",
      eventId,
      provider: request.provider,
      accountId: request.accountId,
      acknowledgedAt: new Date().toISOString(),
      processingTimeMs: Date.now() - startTime,
    };

    // Record in deduplication store
    this.deduplicator.record({
      provider: request.provider,
      accountId: request.accountId,
      providerEventId,
      eventId,
      acknowledgedResponse: ack,
      status: "PROCESSING",
    });

    // ------------------------------------------------------------------------
    // Stage 6: Queue Processing (Async delegation)
    // ------------------------------------------------------------------------
    if (this.queueEnqueuer) {
      await this.queueEnqueuer.enqueue({
        eventId,
        organizationId: request.organizationId,
        provider: request.provider,
        accountId: request.accountId,
        rawStoragePath: storageRecord.storagePath,
        correlationId,
      });
    }

    return { ack, rawStoragePath: storageRecord.storagePath, isDuplicate: false };
  }

  /**
   * Stage 7 - 9: Asynchronous processing of persisted webhook events
   * Executed by background workers after fast acknowledgement.
   */
  async processPersistedWebhook(params: {
    eventId: string;
    organizationId: string;
    provider: string;
    accountId: string;
    rawStoragePath: string;
    correlationId?: string;
  }): Promise<{
    normalizedEvent: NormalizedEvent;
    isOutOfOrder: boolean;
    isDelayed: boolean;
    domainDispatched: boolean;
    reconciliationTriggered: boolean;
  }> {
    const { eventId, organizationId, provider, accountId, rawStoragePath } = params;
    const correlationId = params.correlationId ?? crypto.randomUUID();

    // Load payload securely from tenant partition
    const rawContent = await this.storageService.getPayload(
      organizationId,
      rawStoragePath
    );

    // ------------------------------------------------------------------------
    // Stage 7: Normalize
    // ------------------------------------------------------------------------
    const record = this.storageService.getRecord(eventId);
    const normalizedEvent = this.normalizer.normalize(rawContent, {
      eventId,
      correlationId,
      organizationId,
      provider,
      accountId,
      providerEventId: record?.providerEventId,
      headers: record?.headers,
      receivedAt: record?.createdAt,
    });

    // ------------------------------------------------------------------------
    // Stage 8: Apply Domain Event (Safeguarded against out-of-order & delayed events)
    // ------------------------------------------------------------------------
    let isOutOfOrder = false;
    let isDelayed = false;
    let domainDispatched = false;
    let reconciliationTriggered = false;

    // Check for Delayed Event
    const occurredTime = new Date(normalizedEvent.occurred_at).getTime();
    const now = Date.now();
    if (now - occurredTime > this.delayedEventThresholdMs) {
      isDelayed = true;
      // Stale event detected! Trigger reconciliation instead of blind overwrite
      if (this.syncTrigger?.triggerReconciliation) {
        await this.syncTrigger.triggerReconciliation(
          normalizedEvent,
          `Event occurred ${Math.round((now - occurredTime) / 60000)} minutes ago (exceeds ${Math.round(this.delayedEventThresholdMs / 60000)}m threshold)`
        );
        reconciliationTriggered = true;
      }
    }

    // Check Out-of-Order protection against existing entity state
    if (this.dispatcher?.getEntityVersion) {
      const entityId = this.extractEntityId(normalizedEvent);
      if (entityId) {
        const entityState = await this.dispatcher.getEntityVersion(
          normalizedEvent.event_type,
          entityId
        );

        if (entityState?.lastUpdatedAt) {
          const entityTime = entityState.lastUpdatedAt.getTime();
          if (occurredTime < entityTime) {
            // Out of order: older event arriving after newer update!
            isOutOfOrder = true;
          }
        }
      }
    }

    // Apply domain mutation only if not out of order
    if (!isOutOfOrder && this.dispatcher) {
      await this.dispatchDomainEvent(normalizedEvent);
      domainDispatched = true;
    }

    // ------------------------------------------------------------------------
    // Stage 9: Trigger Synchronization / Reconciliation
    // ------------------------------------------------------------------------
    if (this.syncTrigger?.triggerSync && !isOutOfOrder) {
      await this.syncTrigger.triggerSync(normalizedEvent);
    }

    // Mark deduplication entry as completed
    const dedupKey = this.deduplicator.generateKey(
      provider,
      accountId,
      normalizedEvent.provider_event_id
    );
    this.deduplicator.updateStatus(dedupKey, "COMPLETED");

    return {
      normalizedEvent,
      isOutOfOrder,
      isDelayed,
      domainDispatched,
      reconciliationTriggered,
    };
  }

  /**
   * End-to-end processing helper for synchronous testing or non-queued execution.
   * Guarantees acknowledgement timing is recorded before domain execution.
   */
  async ingestSync(request: WebhookIngestionRequest): Promise<WebhookPipelineResult<NormalizedEvent>> {
    try {
      // Stages 1 - 5 (Fast Ingestion)
      const { ack, rawStoragePath, isDuplicate } = await this.receiveAndAcknowledge(request);

      if (isDuplicate || !rawStoragePath) {
        return {
          success: true,
          acknowledged: ack,
          isDuplicate: true,
          httpStatus: 200,
        };
      }

      // Stages 7 - 9 (Processing)
      const processing = await this.processPersistedWebhook({
        eventId: ack.eventId,
        organizationId: request.organizationId,
        provider: request.provider,
        accountId: request.accountId,
        rawStoragePath,
        correlationId: request.correlationId,
      });

      return {
        success: true,
        acknowledged: ack,
        rawStoragePath,
        normalizedEvent: processing.normalizedEvent,
        isDuplicate: false,
        isOutOfOrder: processing.isOutOfOrder,
        isDelayed: processing.isDelayed,
        domainDispatched: processing.domainDispatched,
        reconciliationTriggered: processing.reconciliationTriggered,
        httpStatus: 200,
      };
    } catch (err: any) {
      if (err instanceof InvalidSignatureError) {
        return {
          success: false,
          acknowledged: {
            received: false,
            status: "IGNORED",
            eventId: "",
            provider: request.provider,
            accountId: request.accountId,
            acknowledgedAt: new Date().toISOString(),
            message: err.message,
          },
          error: err.message,
          httpStatus: 401,
        };
      }
      if (err instanceof PayloadTooLargeError) {
        return {
          success: false,
          acknowledged: {
            received: false,
            status: "IGNORED",
            eventId: "",
            provider: request.provider,
            accountId: request.accountId,
            acknowledgedAt: new Date().toISOString(),
            message: err.message,
          },
          error: err.message,
          httpStatus: 413,
        };
      }
      if (err instanceof MalformedPayloadError) {
        return {
          success: false,
          acknowledged: {
            received: false,
            status: "IGNORED",
            eventId: "",
            provider: request.provider,
            accountId: request.accountId,
            acknowledgedAt: new Date().toISOString(),
            message: err.message,
          },
          error: err.message,
          httpStatus: 400,
        };
      }
      throw err;
    }
  }

  // --------------------------------------------------------------------------
  // Private Helper Methods
  // --------------------------------------------------------------------------
  private extractProviderEventId(
    request: WebhookIngestionRequest,
    fallbackId: string
  ): string {
    const headers = request.headers;
    const lower = new Map<string, string>();
    for (const [k, v] of Object.entries(headers)) {
      if (v !== undefined) {
        const headerVal = Array.isArray(v) ? v[0] : v;
        if (headerVal !== undefined) {
          lower.set(k.toLowerCase(), headerVal);
        }
      }
    }

    const headerCandidates = [
      "x-shopify-webhook-id",
      "x-amz-sns-message-id",
      "x-amzn-requestid",
      "x-event-id",
    ];

    for (const h of headerCandidates) {
      const val = lower.get(h);
      if (val) return val;
    }

    // Try parsing rawBody if JSON
    try {
      const bodyStr = Buffer.isBuffer(request.rawBody)
        ? request.rawBody.toString("utf8")
        : request.rawBody;
      const parsed = JSON.parse(bodyStr);
      return (parsed.id || parsed.event_id || parsed.eventId || fallbackId).toString();
    } catch {
      return fallbackId;
    }
  }

  private extractEntityId(event: NormalizedEvent): string | undefined {
    const payload = event.payload as any;
    if (event.event_type === "OrderCreated" || event.event_type === "OrderUpdated" || event.event_type === "OrderCancelled") {
      return payload.order_id || payload.order_number;
    }
    if (event.event_type === "InventoryChanged") {
      return payload.sku;
    }
    if (event.event_type === "ProductChanged") {
      return payload.product_id;
    }
    if (event.event_type === "ListingChanged") {
      return payload.listing_id || payload.sku;
    }
    if (event.event_type === "ReturnCreated" || event.event_type === "ReturnUpdated") {
      return payload.return_id;
    }
    return undefined;
  }

  private async dispatchDomainEvent(event: NormalizedEvent): Promise<void> {
    if (!this.dispatcher) return;

    switch (event.event_type) {
      case "OrderCreated":
        if (this.dispatcher.applyOrderCreated) {
          await this.dispatcher.applyOrderCreated(event as OrderCreated);
        }
        break;
      case "OrderUpdated":
        if (this.dispatcher.applyOrderUpdated) {
          await this.dispatcher.applyOrderUpdated(event as OrderUpdated);
        }
        break;
      case "OrderCancelled":
        if (this.dispatcher.applyOrderCancelled) {
          await this.dispatcher.applyOrderCancelled(event as OrderCancelled);
        }
        break;
      case "InventoryChanged":
        if (this.dispatcher.applyInventoryChanged) {
          await this.dispatcher.applyInventoryChanged(event as InventoryChanged);
        }
        break;
      case "ProductChanged":
        if (this.dispatcher.applyProductChanged) {
          await this.dispatcher.applyProductChanged(event as ProductChanged);
        }
        break;
      case "ListingChanged":
        if (this.dispatcher.applyListingChanged) {
          await this.dispatcher.applyListingChanged(event as ListingChanged);
        }
        break;
      case "ReturnCreated":
        if (this.dispatcher.applyReturnCreated) {
          await this.dispatcher.applyReturnCreated(event as ReturnCreated);
        }
        break;
      case "ReturnUpdated":
        if (this.dispatcher.applyReturnUpdated) {
          await this.dispatcher.applyReturnUpdated(event as ReturnUpdated);
        }
        break;
      case "IntegrationChanged":
        if (this.dispatcher.applyIntegrationChanged) {
          await this.dispatcher.applyIntegrationChanged(event as IntegrationChanged);
        }
        break;
    }
  }

  getStorageService(): RawWebhookStorageService {
    return this.storageService;
  }

  getDeduplicator(): WebhookDeduplicationStore {
    return this.deduplicator;
  }

  getNormalizer(): WebhookNormalizer {
    return this.normalizer;
  }
}
