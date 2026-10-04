/**
 * Integrations / Channels API Contracts
 * Canonical Specification: Section 51 of 01_ENGINEERING_SPEC.md & Prompt 24
 */

import { z } from "zod";
import { PaginationParamsSchema } from "./api.js";

export const IntegrationStatusSchema = z.enum(["ACTIVE", "DISCONNECTED", "ERROR", "PAUSED"]);
export type IntegrationStatus = z.infer<typeof IntegrationStatusSchema>;

export const IntegrationDtoSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  channelId: z.string().uuid(),
  provider: z.string(),
  displayName: z.string(),
  status: IntegrationStatusSchema,
  externalAccountId: z.string(),
  lastSuccessfulSyncAt: z.string().nullable().optional(),
  lastErrorAt: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type IntegrationDto = z.infer<typeof IntegrationDtoSchema>;

export const ConnectIntegrationRequestSchema = z.object({
  provider: z.enum(["SHOPIFY", "AMAZON", "EBAY", "WALMART", "MOCK"]),
  displayName: z.string().min(1, "Display name is required"),
  credentials: z.record(z.unknown()).optional(),
  settings: z.record(z.unknown()).optional(),
});

export type ConnectIntegrationRequest = z.infer<typeof ConnectIntegrationRequestSchema>;

export const IntegrationHealthDtoSchema = z.object({
  integrationId: z.string().uuid(),
  provider: z.string(),
  healthState: z.enum(["CONNECTED", "DEGRADED", "AUTH_REQUIRED", "RATE_LIMITED", "ERROR", "DISCONNECTED"]),
  latencyMs: z.number(),
  lastCheckedAt: z.string(),
  details: z.record(z.unknown()).optional(),
});

export type IntegrationHealthDto = z.infer<typeof IntegrationHealthDtoSchema>;

export const IntegrationQuerySchema = PaginationParamsSchema.extend({
  provider: z.string().optional(),
  status: IntegrationStatusSchema.optional(),
});

export type IntegrationQuery = z.infer<typeof IntegrationQuerySchema>;
