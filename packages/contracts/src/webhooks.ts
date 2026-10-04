/**
 * Webhook Ingestion & Raw Storage Contracts
 * Specifications: Section 43 of 01_ENGINEERING_SPEC.md & Prompt 18 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 */

import { z } from "zod";

export type WebhookAckStatus = "ACCEPTED" | "DUPLICATE" | "QUEUED" | "IGNORED";

/**
 * Inbound webhook request passed into the ingestion pipeline
 */
export interface WebhookIngestionRequest {
  provider: string;
  accountId: string;
  organizationId: string;
  headers: Record<string, string | string[] | undefined>;
  rawBody: string | Buffer;
  receivedAt?: Date;
  correlationId?: string;
  ipAddress?: string;
}

/**
 * Fast acknowledgement returned to the external provider
 * Guaranteed to return before long-running work begins.
 */
export interface WebhookAckResponse {
  received: boolean;
  status: WebhookAckStatus;
  eventId: string;
  provider: string;
  accountId: string;
  acknowledgedAt: string;
  message?: string;
  processingTimeMs?: number;
}

/**
 * Metadata record for a securely persisted raw webhook payload in Supabase Storage
 */
export interface RawWebhookStorageRecord {
  id: string;
  organizationId: string;
  provider: string;
  providerAccountId: string;
  providerEventId: string;
  storagePath: string;
  bucket: string;
  payloadSize: number;
  contentType: string;
  headers: Record<string, string>;
  createdAt: Date;
  expiresAt: Date;
  isRedacted: boolean;
  retentionDays: number;
}

/**
 * Options for configuring raw webhook storage retention & limits
 */
export interface RawWebhookStorageOptions {
  bucket?: string;
  maxSizeBytes?: number; // default: 5MB (5,242,880 bytes)
  retentionDays?: number; // default: 30 days
  enableRedaction?: boolean; // default: true
}

/**
 * Execution outcome of the full webhook pipeline
 */
export interface WebhookPipelineResult<TEvent = unknown> {
  success: boolean;
  acknowledged: WebhookAckResponse;
  rawStoragePath?: string;
  normalizedEvent?: TEvent;
  isDuplicate?: boolean;
  isOutOfOrder?: boolean;
  isDelayed?: boolean;
  domainDispatched?: boolean;
  reconciliationTriggered?: boolean;
  error?: string;
  httpStatus: number;
}

export const WebhookAckResponseSchema = z.object({
  received: z.boolean(),
  status: z.enum(["ACCEPTED", "DUPLICATE", "QUEUED", "IGNORED"]),
  eventId: z.string(),
  provider: z.string(),
  accountId: z.string(),
  acknowledgedAt: z.string(),
  message: z.string().optional(),
  processingTimeMs: z.number().optional()
});
