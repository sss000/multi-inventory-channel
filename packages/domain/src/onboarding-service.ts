/**
 * Onboarding Domain Service & Progressive Stepper State Machine
 * Canonical Specifications: Section 62, 63, 64 of 01_ENGINEERING_SPEC.md & Prompt 26
 * 
 * Rules:
 * 1. The 9 progressive steps:
 *    Create account -> Create org -> Choose primary channel -> Connect channel ->
 *    Import catalog -> Map SKUs -> Validate inventory -> Enable sync -> Dashboard.
 * 2. CRITICAL SAFETY REQUIREMENT (Strict Invariant):
 *    - Never enable destructive outbound synchronization immediately after connecting a channel.
 *    - Initial sync safety sequence:
 *      IMPORT -> COMPARE -> SHOW DIFFERENCES -> USER CONFIRMS SOURCE OF TRUTH -> ENABLE OUTBOUND SYNC.
 * 3. Never silently discard unmapped records.
 * 4. Explicit source-of-truth selection for every discrepancy.
 * 5. Require confirmation before enabling outbound synchronization.
 */

import {
  OnboardingSession,
  OnboardingStep,
  StepProgressStatus,
  SourceOfTruthOption,
  ChannelProvider,
  DiscrepancyItem,
  SkuMappingItem,
  CatalogImportStatus,
  InventoryValidationStatus,
  OrganizationId,
  UserId,
  UUID,
  ChannelAccountId,
  SkuId,
} from "./types.js";
import {
  OnboardingInvariantError,
  InitialSyncSafetyViolationError,
  InvalidOnboardingStepError,
} from "./errors.js";

export const ONBOARDING_STEP_ORDER: readonly OnboardingStep[] = [
  "CREATE_ACCOUNT",
  "CREATE_ORGANIZATION",
  "CHOOSE_PRIMARY_CHANNEL",
  "CONNECT_CHANNEL",
  "IMPORT_CATALOG",
  "MAP_SKUS",
  "VALIDATE_INVENTORY",
  "ENABLE_SYNCHRONIZATION",
  "COMPLETED",
] as const;

export interface InitializeOnboardingParams {
  id?: UUID;
  organizationId: OrganizationId;
  userId: UserId;
}

export interface ChoosePrimaryChannelParams {
  provider: ChannelProvider;
}

export interface ConnectChannelStepParams {
  channelAccountId: ChannelAccountId;
  provider: ChannelProvider;
  externalAccountId: string;
  displayName: string;
}

export interface ImportCatalogStepParams {
  items: Array<{
    externalProductId: string;
    externalVariantId?: string;
    externalSku: string;
    title: string;
    price?: number;
  }>;
}

export interface MapSkusStepParams {
  mappings: Array<{
    externalSku: string;
    internalSku: string;
    externalTitle?: string;
  }>;
}

export interface ComparisonInputItem {
  sku: string;
  skuId?: SkuId;
  productTitle: string;
  internalQuantity: number;
  channelQuantities: Record<string, number>; // e.g. { SHOPIFY: 20, AMAZON: 18 }
}

export interface ResolveDiscrepancyParams {
  sku: string;
  sourceOfTruth: SourceOfTruthOption;
  sourceChannelProvider?: ChannelProvider;
  customQuantity?: number;
  notes?: string;
}

export interface BatchResolveDiscrepancyParams {
  globalSourceOfTruth?: SourceOfTruthOption;
  globalSourceChannel?: ChannelProvider;
  resolutions?: ResolveDiscrepancyParams[];
}

export interface EnableOutboundSyncParams {
  confirmed: boolean;
  userId: UserId;
}

export class OnboardingService {
  /**
   * Initializes a new onboarding session for an organization and user.
   * Steps 1 and 2 (Account & Org) are marked COMPLETED, Step 3 is CURRENT.
   */
  public initializeOnboarding(params: InitializeOnboardingParams): OnboardingSession {
    const now = new Date();
    const sessionId = params.id || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `onb-${Date.now()}`);

    const stepStatuses: Record<OnboardingStep, StepProgressStatus> = {
      CREATE_ACCOUNT: "COMPLETED",
      CREATE_ORGANIZATION: "COMPLETED",
      CHOOSE_PRIMARY_CHANNEL: "CURRENT",
      CONNECT_CHANNEL: "BLOCKED",
      IMPORT_CATALOG: "BLOCKED",
      MAP_SKUS: "BLOCKED",
      VALIDATE_INVENTORY: "BLOCKED",
      ENABLE_SYNCHRONIZATION: "BLOCKED",
      COMPLETED: "BLOCKED",
    };

    return {
      id: sessionId,
      organizationId: params.organizationId,
      userId: params.userId,
      currentStep: "CHOOSE_PRIMARY_CHANNEL",
      completedSteps: ["CREATE_ACCOUNT", "CREATE_ORGANIZATION"],
      stepStatuses,
      catalogImport: {
        totalItems: 0,
        importedItems: 0,
        failedItems: 0,
        status: "NOT_STARTED",
      },
      skuMapping: {
        totalSkus: 0,
        mappedSkus: 0,
        unmappedSkus: 0,
        conflictedSkus: 0,
        mappings: [],
      },
      inventoryValidation: {
        status: "PENDING",
        differencesCount: 0,
        items: [],
        allConfirmed: false,
      },
      outboundSyncEnabled: false,
      syncConfirmation: {
        confirmed: false,
      },
      createdAt: now,
      updatedAt: now,
    };
  }

  /**
   * Step 3: Choose Primary Sales Channel
   */
  public choosePrimaryChannel(
    session: OnboardingSession,
    params: ChoosePrimaryChannelParams
  ): OnboardingSession {
    this.assertCurrentStep(session, "CHOOSE_PRIMARY_CHANNEL");

    const validProviders: ChannelProvider[] = ["SHOPIFY", "AMAZON", "EBAY", "WALMART"];
    if (!validProviders.includes(params.provider) && (params.provider as string) !== "MOCK") {
      throw new OnboardingInvariantError(`Invalid channel provider: '${params.provider}'.`);
    }

    const updatedSession = this.cloneSession(session);
    updatedSession.primaryChannel = params.provider;
    updatedSession.stepStatuses.CHOOSE_PRIMARY_CHANNEL = "COMPLETED";
    updatedSession.stepStatuses.CONNECT_CHANNEL = "CURRENT";
    this.advanceStep(updatedSession, "CHOOSE_PRIMARY_CHANNEL", "CONNECT_CHANNEL");

    return updatedSession;
  }

  /**
   * Step 4: Connect Channel
   */
  public connectChannel(
    session: OnboardingSession,
    params: ConnectChannelStepParams
  ): OnboardingSession {
    this.assertCurrentStep(session, "CONNECT_CHANNEL");

    if (!params.channelAccountId) {
      throw new OnboardingInvariantError("channelAccountId is required to connect channel.");
    }

    const updatedSession = this.cloneSession(session);
    updatedSession.channelAccountId = params.channelAccountId;
    updatedSession.stepStatuses.CONNECT_CHANNEL = "COMPLETED";
    updatedSession.stepStatuses.IMPORT_CATALOG = "CURRENT";
    this.advanceStep(updatedSession, "CONNECT_CHANNEL", "IMPORT_CATALOG");

    return updatedSession;
  }

  /**
   * Step 5: Import Catalog
   * Guarantees unmapped records are never silently discarded.
   */
  public importCatalog(
    session: OnboardingSession,
    params: ImportCatalogStepParams
  ): OnboardingSession {
    this.assertCurrentStep(session, "IMPORT_CATALOG");

    if (!params.items || !Array.isArray(params.items)) {
      throw new OnboardingInvariantError("Catalog items must be provided as an array.");
    }

    const updatedSession = this.cloneSession(session);
    const totalItems = params.items.length;

    // Generate initial mappings from catalog items
    const mappings: SkuMappingItem[] = params.items.map((item) => ({
      externalSku: item.externalSku,
      internalSku: item.externalSku, // default proposed suggestion
      externalTitle: item.title,
      status: item.externalSku ? "SUGGESTED" : "UNMAPPED",
      externalProductId: item.externalProductId,
      externalVariantId: item.externalVariantId,
      confidence: item.externalSku ? 0.9 : 0.0,
    }));

    updatedSession.catalogImport = {
      totalItems,
      importedItems: totalItems,
      failedItems: 0,
      status: "COMPLETED",
    };

    updatedSession.skuMapping = {
      totalSkus: totalItems,
      mappedSkus: mappings.filter((m) => m.status === "MAPPED").length,
      unmappedSkus: mappings.filter((m) => m.status === "UNMAPPED").length,
      conflictedSkus: 0,
      mappings,
    };

    updatedSession.stepStatuses.IMPORT_CATALOG = "COMPLETED";
    updatedSession.stepStatuses.MAP_SKUS = "CURRENT";
    this.advanceStep(updatedSession, "IMPORT_CATALOG", "MAP_SKUS");

    return updatedSession;
  }

  /**
   * Step 6: Map SKUs
   */
  public mapSkus(session: OnboardingSession, params: MapSkusStepParams): OnboardingSession {
    this.assertCurrentStep(session, "MAP_SKUS");

    const updatedSession = this.cloneSession(session);
    const mappingMap = new Map(params.mappings.map((m) => [m.externalSku, m.internalSku]));

    // Update existing mappings
    const updatedMappings = updatedSession.skuMapping.mappings.map((m) => {
      const explicitInternalSku = mappingMap.get(m.externalSku);
      if (explicitInternalSku) {
        return {
          ...m,
          internalSku: explicitInternalSku,
          status: "MAPPED" as const,
          confidence: 1.0,
        };
      }
      return m;
    });

    const mappedCount = updatedMappings.filter((m) => m.status === "MAPPED" || m.status === "SUGGESTED").length;
    const unmappedCount = updatedMappings.filter((m) => m.status === "UNMAPPED").length;

    updatedSession.skuMapping = {
      totalSkus: updatedMappings.length,
      mappedSkus: mappedCount,
      unmappedSkus: unmappedCount,
      conflictedSkus: 0,
      mappings: updatedMappings,
    };

    updatedSession.stepStatuses.MAP_SKUS = "COMPLETED";
    updatedSession.stepStatuses.VALIDATE_INVENTORY = "CURRENT";
    this.advanceStep(updatedSession, "MAP_SKUS", "VALIDATE_INVENTORY");

    return updatedSession;
  }

  /**
   * Step 7a: Validate Inventory (Initial Sync Safety Comparison)
   * Prompt 26 Critical Rule:
   * IMPORT -> COMPARE -> SHOW DIFFERENCES -> USER CONFIRMS SOURCE OF TRUTH -> ENABLE OUTBOUND SYNC
   */
  public validateInventory(
    session: OnboardingSession,
    items: ComparisonInputItem[]
  ): OnboardingSession {
    this.assertCurrentStep(session, "VALIDATE_INVENTORY");

    const updatedSession = this.cloneSession(session);
    let differencesCount = 0;

    const discrepancyItems: DiscrepancyItem[] = items.map((item) => {
      const channelVals = Object.values(item.channelQuantities);
      const allChannelsMatchInternal = channelVals.every((val) => val === item.internalQuantity);
      const allChannelsMatchEachOther = channelVals.every((val) => val === channelVals[0]);
      const hasDiscrepancy = !(allChannelsMatchInternal && allChannelsMatchEachOther);

      if (hasDiscrepancy) {
        differencesCount++;
      }

      return {
        sku: item.sku,
        skuId: item.skuId,
        productTitle: item.productTitle,
        internalQuantity: item.internalQuantity,
        channelQuantities: { ...item.channelQuantities },
        discrepancy: hasDiscrepancy,
        resolvedQuantity: hasDiscrepancy ? undefined : item.internalQuantity,
        confirmed: !hasDiscrepancy, // matched items are confirmed by default
      };
    });

    const hasUnresolvedDifferences = differencesCount > 0;

    updatedSession.inventoryValidation = {
      status: hasUnresolvedDifferences ? "DIFFERENCES_FOUND" : "VERIFIED",
      differencesCount,
      items: discrepancyItems,
      allConfirmed: !hasUnresolvedDifferences,
    };

    if (hasUnresolvedDifferences) {
      updatedSession.stepStatuses.VALIDATE_INVENTORY = "NEEDS_ATTENTION";
    } else {
      updatedSession.stepStatuses.VALIDATE_INVENTORY = "COMPLETED";
      updatedSession.stepStatuses.ENABLE_SYNCHRONIZATION = "CURRENT";
      this.advanceStep(updatedSession, "VALIDATE_INVENTORY", "ENABLE_SYNCHRONIZATION");
    }

    return updatedSession;
  }

  /**
   * Step 7b: Explicit Source of Truth Resolution per SKU
   * Example: Internal = 20, Shopify = 20, Amazon = 18.
   * User selects whether Internal Ledger (20), Shopify (20), Amazon (18), or Custom count is authoritative.
   */
  public resolveSourceOfTruth(
    session: OnboardingSession,
    params: ResolveDiscrepancyParams
  ): OnboardingSession {
    if (session.currentStep !== "VALIDATE_INVENTORY" && session.currentStep !== "ENABLE_SYNCHRONIZATION") {
      throw new OnboardingInvariantError(
        `Cannot resolve discrepancies while in step '${session.currentStep}'.`
      );
    }

    const updatedSession = this.cloneSession(session);
    const itemIndex = updatedSession.inventoryValidation.items.findIndex(
      (i) => i.sku.toLowerCase() === params.sku.toLowerCase()
    );

    if (itemIndex === -1) {
      throw new OnboardingInvariantError(`SKU '${params.sku}' not found in inventory validation set.`);
    }

    const rawItem = updatedSession.inventoryValidation.items[itemIndex];
    if (!rawItem) {
      throw new OnboardingInvariantError(`SKU '${params.sku}' not found in inventory validation set.`);
    }

    const item: DiscrepancyItem = {
      sku: rawItem.sku,
      skuId: rawItem.skuId,
      productTitle: rawItem.productTitle,
      internalQuantity: rawItem.internalQuantity,
      channelQuantities: { ...rawItem.channelQuantities },
      discrepancy: rawItem.discrepancy,
      chosenSourceOfTruth: rawItem.chosenSourceOfTruth,
      sourceChannelProvider: rawItem.sourceChannelProvider,
      resolvedQuantity: rawItem.resolvedQuantity,
      confirmed: rawItem.confirmed,
      notes: rawItem.notes,
    };

    let resolvedQuantity: number;
    if (params.sourceOfTruth === "INTERNAL_LEDGER") {
      resolvedQuantity = item.internalQuantity;
    } else if (params.sourceOfTruth === "CHANNEL") {
      if (!params.sourceChannelProvider) {
        throw new OnboardingInvariantError("sourceChannelProvider is required when sourceOfTruth is 'CHANNEL'.");
      }
      const channelQty = item.channelQuantities[params.sourceChannelProvider];
      if (channelQty === undefined) {
        throw new OnboardingInvariantError(
          `Channel '${params.sourceChannelProvider}' has no reported quantity for SKU '${params.sku}'.`
        );
      }
      resolvedQuantity = channelQty;
    } else if (params.sourceOfTruth === "CUSTOM") {
      if (params.customQuantity === undefined || params.customQuantity < 0) {
        throw new OnboardingInvariantError(
          "A valid non-negative customQuantity is required when sourceOfTruth is 'CUSTOM'."
        );
      }
      resolvedQuantity = params.customQuantity;
    } else {
      throw new OnboardingInvariantError(`Invalid source of truth option: '${params.sourceOfTruth}'.`);
    }

    item.chosenSourceOfTruth = params.sourceOfTruth;
    item.sourceChannelProvider = params.sourceChannelProvider;
    item.resolvedQuantity = resolvedQuantity;
    item.confirmed = true;
    item.notes = params.notes;

    updatedSession.inventoryValidation.items[itemIndex] = item;

    // Check if all discrepancies are now confirmed
    const allConfirmed = updatedSession.inventoryValidation.items.every(
      (i) => !i.discrepancy || i.confirmed
    );
    updatedSession.inventoryValidation.allConfirmed = allConfirmed;

    if (allConfirmed) {
      updatedSession.inventoryValidation.status = "RESOLVED";
      updatedSession.stepStatuses.VALIDATE_INVENTORY = "COMPLETED";
      updatedSession.stepStatuses.ENABLE_SYNCHRONIZATION = "CURRENT";
      if (!updatedSession.completedSteps.includes("VALIDATE_INVENTORY")) {
        this.advanceStep(updatedSession, "VALIDATE_INVENTORY", "ENABLE_SYNCHRONIZATION");
      }
    }

    return updatedSession;
  }

  /**
   * Batch Resolve Source of Truth
   */
  public batchResolveSourceOfTruth(
    session: OnboardingSession,
    params: BatchResolveDiscrepancyParams
  ): OnboardingSession {
    let currentSession = session;

    if (params.globalSourceOfTruth) {
      for (const item of currentSession.inventoryValidation.items) {
        if (item.discrepancy && !item.confirmed) {
          currentSession = this.resolveSourceOfTruth(currentSession, {
            sku: item.sku,
            sourceOfTruth: params.globalSourceOfTruth,
            sourceChannelProvider: params.globalSourceChannel,
          });
        }
      }
    }

    if (params.resolutions && params.resolutions.length > 0) {
      for (const res of params.resolutions) {
        currentSession = this.resolveSourceOfTruth(currentSession, res);
      }
    }

    return currentSession;
  }

  /**
   * Step 7c: Confirm Inventory Validation
   */
  public confirmInventoryValidation(
    session: OnboardingSession,
    userId: UserId
  ): OnboardingSession {
    this.assertCurrentStep(session, "VALIDATE_INVENTORY");

    const unconfirmed = session.inventoryValidation.items.filter(
      (i) => i.discrepancy && !i.confirmed
    );

    if (unconfirmed.length > 0) {
      throw new InitialSyncSafetyViolationError(
        `Cannot confirm inventory validation: ${unconfirmed.length} item(s) have unconfirmed discrepancies. Explicit source of truth is required.`
      );
    }

    const updatedSession = this.cloneSession(session);
    updatedSession.inventoryValidation.allConfirmed = true;
    updatedSession.inventoryValidation.status = "RESOLVED";
    updatedSession.stepStatuses.VALIDATE_INVENTORY = "COMPLETED";
    updatedSession.stepStatuses.ENABLE_SYNCHRONIZATION = "CURRENT";
    this.advanceStep(updatedSession, "VALIDATE_INVENTORY", "ENABLE_SYNCHRONIZATION");

    return updatedSession;
  }

  /**
   * Step 8: Enable Outbound Synchronization (CRITICAL PROMPT 26 INVARIANT GATE)
   * Never enable destructive outbound synchronization immediately after connecting a channel.
   * Requires:
   * 1. Catalog imported
   * 2. SKUs mapped
   * 3. Inventory compared and all discrepancies explicitly resolved
   * 4. Explicit user confirmation
   */
  public enableOutboundSynchronization(
    session: OnboardingSession,
    params: EnableOutboundSyncParams
  ): OnboardingSession {
    if (session.currentStep !== "ENABLE_SYNCHRONIZATION") {
      throw new InvalidOnboardingStepError(
        session.currentStep,
        "ENABLE_SYNCHRONIZATION",
        `Cannot enable outbound synchronization while in step '${session.currentStep}'.`
      );
    }

    if (!session.inventoryValidation.allConfirmed) {
      throw new InitialSyncSafetyViolationError(
        "Initial sync safety violation: Outbound synchronization cannot be enabled while inventory discrepancies remain unconfirmed."
      );
    }

    if (!params.confirmed) {
      throw new InitialSyncSafetyViolationError(
        "Explicit user confirmation is strictly required to enable outbound synchronization."
      );
    }

    const updatedSession = this.cloneSession(session);
    updatedSession.outboundSyncEnabled = true;
    updatedSession.syncConfirmation = {
      confirmed: true,
      confirmedAt: new Date(),
      confirmedBy: params.userId,
    };

    updatedSession.stepStatuses.ENABLE_SYNCHRONIZATION = "COMPLETED";
    updatedSession.stepStatuses.COMPLETED = "CURRENT";
    this.advanceStep(updatedSession, "ENABLE_SYNCHRONIZATION", "COMPLETED");

    return updatedSession;
  }

  /**
   * Step 9: Complete Onboarding & Unlock Dashboard
   */
  public completeOnboarding(session: OnboardingSession): OnboardingSession {
    if (!session.outboundSyncEnabled) {
      throw new InitialSyncSafetyViolationError(
        "Cannot complete onboarding without safely configuring and confirming outbound synchronization."
      );
    }

    const updatedSession = this.cloneSession(session);
    updatedSession.currentStep = "COMPLETED";
    updatedSession.stepStatuses.COMPLETED = "COMPLETED";
    if (!updatedSession.completedSteps.includes("COMPLETED")) {
      updatedSession.completedSteps.push("COMPLETED");
    }
    updatedSession.completedAt = new Date();
    updatedSession.updatedAt = new Date();

    return updatedSession;
  }

  // ==========================================
  // HELPER METHODS
  // ==========================================

  private assertCurrentStep(session: OnboardingSession, expectedStep: OnboardingStep): void {
    if (session.currentStep !== expectedStep) {
      throw new InvalidOnboardingStepError(session.currentStep, expectedStep);
    }
  }

  private advanceStep(
    session: OnboardingSession,
    completedStep: OnboardingStep,
    nextStep: OnboardingStep
  ): void {
    if (!session.completedSteps.includes(completedStep)) {
      session.completedSteps.push(completedStep);
    }
    session.currentStep = nextStep;
    session.updatedAt = new Date();
  }

  private cloneSession(session: OnboardingSession): OnboardingSession {
    return {
      ...session,
      completedSteps: [...session.completedSteps],
      stepStatuses: { ...session.stepStatuses },
      catalogImport: { ...session.catalogImport },
      skuMapping: {
        ...session.skuMapping,
        mappings: session.skuMapping.mappings.map((m) => ({ ...m })),
      },
      inventoryValidation: {
        ...session.inventoryValidation,
        items: session.inventoryValidation.items.map((i) => ({
          ...i,
          channelQuantities: { ...i.channelQuantities },
        })),
      },
      syncConfirmation: { ...session.syncConfirmation },
      updatedAt: new Date(),
    };
  }
}
