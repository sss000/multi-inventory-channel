/**
 * Webhook Inbound Deduplicator & Retry Handler
 * Specification: Prompt 18 & Section 43 of 01_ENGINEERING_SPEC.md
 */

import { WebhookAckResponse } from "@platform/contracts";

export interface DeduplicationEntry {
  dedupKey: string;
  provider: string;
  accountId: string;
  providerEventId: string;
  eventId: string;
  acknowledgedResponse: WebhookAckResponse;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  receivedAt: Date;
  expiresAt: Date;
}

export interface WebhookDeduplicatorOptions {
  ttlMs?: number; // default: 7 days (604,800,000 ms)
}

/**
 * Deduplication Store tracking incoming provider events to protect against
 * duplicate webhooks, out-of-order deliveries, and provider retries.
 */
export class WebhookDeduplicationStore {
  private readonly entries = new Map<string, DeduplicationEntry>();
  private readonly ttlMs: number;

  constructor(options: WebhookDeduplicatorOptions = {}) {
    this.ttlMs = options.ttlMs ?? 7 * 24 * 3600 * 1000; // 7 days
  }

  /**
   * Generates canonical deduplication key from provider, account, and provider event ID.
   */
  generateKey(provider: string, accountId: string, providerEventId: string): string {
    return `${provider.toUpperCase()}:${accountId}:${providerEventId}`;
  }

  /**
   * Checks if an event is already recorded as received.
   */
  isDuplicate(dedupKey: string): boolean {
    this.cleanupExpired();
    return this.entries.has(dedupKey);
  }

  /**
   * Retrieves the previously cached acknowledgement for a duplicate event.
   * Enables immediate response to provider retries without re-executing domain operations.
   */
  getExistingAck(dedupKey: string): WebhookAckResponse | undefined {
    const entry = this.entries.get(dedupKey);
    if (!entry) return undefined;
    return entry.acknowledgedResponse;
  }

  /**
   * Records a received webhook and caches its acknowledgement response.
   */
  record(params: {
    provider: string;
    accountId: string;
    providerEventId: string;
    eventId: string;
    acknowledgedResponse: WebhookAckResponse;
    status?: "PROCESSING" | "COMPLETED" | "FAILED";
  }): DeduplicationEntry {
    const dedupKey = this.generateKey(params.provider, params.accountId, params.providerEventId);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.ttlMs);

    const entry: DeduplicationEntry = {
      dedupKey,
      provider: params.provider,
      accountId: params.accountId,
      providerEventId: params.providerEventId,
      eventId: params.eventId,
      acknowledgedResponse: params.acknowledgedResponse,
      status: params.status ?? "COMPLETED",
      receivedAt: now,
      expiresAt,
    };

    this.entries.set(dedupKey, entry);
    return entry;
  }

  /**
   * Updates an entry's status
   */
  updateStatus(dedupKey: string, status: "PROCESSING" | "COMPLETED" | "FAILED"): void {
    const entry = this.entries.get(dedupKey);
    if (entry) {
      entry.status = status;
    }
  }

  /**
   * Removes expired entries from the deduplication map.
   */
  cleanupExpired(): number {
    const now = new Date();
    let cleaned = 0;
    for (const [key, entry] of Array.from(this.entries.entries())) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        cleaned++;
      }
    }
    return cleaned;
  }

  clear(): void {
    this.entries.clear();
  }

  size(): number {
    return this.entries.size;
  }
}
