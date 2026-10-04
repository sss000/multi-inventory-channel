/**
 * Onboarding Contracts & Schemas
 * Canonical Specifications: Section 62, 63, 64 of 01_ENGINEERING_SPEC.md & Prompt 26
 */

import { z } from "zod";

export const OnboardingStepSchema = z.enum([
  "CREATE_ACCOUNT",
  "CREATE_ORGANIZATION",
  "CHOOSE_PRIMARY_CHANNEL",
  "CONNECT_CHANNEL",
  "IMPORT_CATALOG",
  "MAP_SKUS",
  "VALIDATE_INVENTORY",
  "ENABLE_SYNCHRONIZATION",
  "COMPLETED",
]);

export type OnboardingStep = z.infer<typeof OnboardingStepSchema>;

export const StepProgressStatusSchema = z.enum([
  "COMPLETED",
  "CURRENT",
  "BLOCKED",
  "NEEDS_ATTENTION",
]);

export type StepProgressStatus = z.infer<typeof StepProgressStatusSchema>;

export const SourceOfTruthOptionSchema = z.enum([
  "INTERNAL_LEDGER",
  "CHANNEL",
  "CUSTOM",
]);

export type SourceOfTruthOption = z.infer<typeof SourceOfTruthOptionSchema>;

export const CatalogImportStatusSchema = z.enum([
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "FAILED",
]);

export type CatalogImportStatus = z.infer<typeof CatalogImportStatusSchema>;

export const SkuMappingStatusSchema = z.enum([
  "MAPPED",
  "UNMAPPED",
  "SUGGESTED",
  "CONFLICT",
]);

export type SkuMappingStatus = z.infer<typeof SkuMappingStatusSchema>;

export const InventoryValidationStatusSchema = z.enum([
  "PENDING",
  "COMPARING",
  "DIFFERENCES_FOUND",
  "RESOLVED",
  "VERIFIED",
]);

export type InventoryValidationStatus = z.infer<typeof InventoryValidationStatusSchema>;

export const DiscrepancyItemDtoSchema = z.object({
  sku: z.string(),
  skuId: z.string().optional(),
  productTitle: z.string(),
  internalQuantity: z.number(),
  channelQuantities: z.record(z.string(), z.number()),
  discrepancy: z.boolean(),
  chosenSourceOfTruth: SourceOfTruthOptionSchema.optional(),
  sourceChannelProvider: z.string().optional(),
  resolvedQuantity: z.number().optional(),
  confirmed: z.boolean(),
  notes: z.string().optional(),
});

export type DiscrepancyItemDto = z.infer<typeof DiscrepancyItemDtoSchema>;

export const SkuMappingItemDtoSchema = z.object({
  externalSku: z.string(),
  internalSku: z.string(),
  externalTitle: z.string(),
  status: SkuMappingStatusSchema,
  externalProductId: z.string().optional(),
  externalVariantId: z.string().optional(),
  confidence: z.number().optional(),
});

export type SkuMappingItemDto = z.infer<typeof SkuMappingItemDtoSchema>;

export const OnboardingSessionDtoSchema = z.object({
  id: z.string(),
  organizationId: z.string(),
  userId: z.string(),
  currentStep: OnboardingStepSchema,
  completedSteps: z.array(OnboardingStepSchema),
  stepStatuses: z.record(z.string(), StepProgressStatusSchema),
  primaryChannel: z.string().optional(),
  channelAccountId: z.string().optional(),
  catalogImport: z.object({
    totalItems: z.number(),
    importedItems: z.number(),
    failedItems: z.number(),
    status: CatalogImportStatusSchema,
  }),
  skuMapping: z.object({
    totalSkus: z.number(),
    mappedSkus: z.number(),
    unmappedSkus: z.number(),
    conflictedSkus: z.number(),
    mappings: z.array(SkuMappingItemDtoSchema),
  }),
  inventoryValidation: z.object({
    status: InventoryValidationStatusSchema,
    baselineRunId: z.string().optional(),
    differencesCount: z.number(),
    items: z.array(DiscrepancyItemDtoSchema),
    allConfirmed: z.boolean(),
  }),
  outboundSyncEnabled: z.boolean(),
  syncConfirmation: z.object({
    confirmed: z.boolean(),
    confirmedAt: z.string().optional(),
    confirmedBy: z.string().optional(),
  }),
  completedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type OnboardingSessionDto = z.infer<typeof OnboardingSessionDtoSchema>;

// ==========================================
// REQUEST DTO SCHEMAS
// ==========================================

export const ChoosePrimaryChannelRequestSchema = z.object({
  provider: z.enum(["SHOPIFY", "AMAZON", "EBAY", "WALMART", "MOCK"]),
});

export type ChoosePrimaryChannelRequest = z.infer<typeof ChoosePrimaryChannelRequestSchema>;

export const ConnectChannelStepRequestSchema = z.object({
  channelAccountId: z.string(),
  provider: z.enum(["SHOPIFY", "AMAZON", "EBAY", "WALMART", "MOCK"]),
  externalAccountId: z.string(),
  displayName: z.string().min(1, "Display name is required"),
});

export type ConnectChannelStepRequest = z.infer<typeof ConnectChannelStepRequestSchema>;

export const ImportCatalogStepRequestSchema = z.object({
  items: z.array(
    z.object({
      externalProductId: z.string(),
      externalVariantId: z.string().optional(),
      externalSku: z.string(),
      title: z.string(),
      price: z.number().optional(),
    })
  ),
});

export type ImportCatalogStepRequest = z.infer<typeof ImportCatalogStepRequestSchema>;

export const MapSkusStepRequestSchema = z.object({
  mappings: z.array(
    z.object({
      externalSku: z.string(),
      internalSku: z.string(),
      externalTitle: z.string().optional(),
    })
  ),
});

export type MapSkusStepRequest = z.infer<typeof MapSkusStepRequestSchema>;

export const ComparisonInputItemSchema = z.object({
  sku: z.string(),
  skuId: z.string().optional(),
  productTitle: z.string(),
  internalQuantity: z.number(),
  channelQuantities: z.record(z.string(), z.number()),
});

export type ComparisonInputItemDto = z.infer<typeof ComparisonInputItemSchema>;

export const ValidateInventoryRequestSchema = z.object({
  items: z.array(ComparisonInputItemSchema),
});

export type ValidateInventoryRequest = z.infer<typeof ValidateInventoryRequestSchema>;

export const ResolveDiscrepancyRequestSchema = z.object({
  sku: z.string(),
  sourceOfTruth: SourceOfTruthOptionSchema,
  sourceChannelProvider: z.string().optional(),
  customQuantity: z.number().optional(),
  notes: z.string().optional(),
});

export type ResolveDiscrepancyRequest = z.infer<typeof ResolveDiscrepancyRequestSchema>;

export const BatchResolveDiscrepancyRequestSchema = z.object({
  globalSourceOfTruth: SourceOfTruthOptionSchema.optional(),
  globalSourceChannel: z.string().optional(),
  resolutions: z.array(ResolveDiscrepancyRequestSchema).optional(),
});

export type BatchResolveDiscrepancyRequest = z.infer<typeof BatchResolveDiscrepancyRequestSchema>;

export const ConfirmInventoryValidationRequestSchema = z.object({
  confirmed: z.boolean(),
});

export type ConfirmInventoryValidationRequest = z.infer<typeof ConfirmInventoryValidationRequestSchema>;

export const EnableOutboundSyncRequestSchema = z.object({
  confirmed: z.boolean(),
});

export type EnableOutboundSyncRequest = z.infer<typeof EnableOutboundSyncRequestSchema>;

export const CompleteOnboardingRequestSchema = z.object({
  feedback: z.string().optional(),
});

export type CompleteOnboardingRequest = z.infer<typeof CompleteOnboardingRequestSchema>;
