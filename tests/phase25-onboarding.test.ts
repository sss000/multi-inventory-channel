/**
 * Phase 25: Progressive Onboarding & Initial Sync Safety Test Suite
 * Canonical Specification: Section 62, 63, 64 of 01_ENGINEERING_SPEC.md & Prompt 26
 *
 * Verifies:
 * 1. The 9-step progressive merchant onboarding lifecycle & state machine:
 *    Create account -> Create org -> Choose primary channel -> Connect channel ->
 *    Import catalog -> Map SKUs -> Validate inventory -> Enable sync -> Dashboard.
 * 2. CRITICAL INITIAL SYNC SAFETY GATE (Prompt 26 Mandatory Invariant):
 *    - Never enable destructive outbound synchronization immediately after connecting a channel.
 *    - Sequence: IMPORT -> COMPARE -> SHOW DIFFERENCES -> USER CONFIRMS SOURCE OF TRUTH -> ENABLE OUTBOUND SYNC.
 *    - Canonical Discrepancy Scenario: Internal = 20, Shopify = 20, Amazon = 18.
 *    - Detects differences, flags CONFLICT, and strictly blocks premature outbound synchronization.
 *    - Explicit source-of-truth selection (INTERNAL_LEDGER, CHANNEL, CUSTOM).
 *    - Explicit user confirmation required before enabling outbound synchronization.
 * 3. Multi-Tenant Isolation & RBAC:
 *    - Tenant A session is completely isolated from Tenant B.
 *    - VIEWER lacks permissions and is rejected with 403 FORBIDDEN.
 *    - ADMIN/OWNER is authorized.
 * 4. REST API Endpoints & Envelopes:
 *    - GET /onboarding/state, POST /onboarding/choose-channel, POST /onboarding/connect-channel,
 *      POST /onboarding/import-catalog, POST /onboarding/map-skus, POST /onboarding/validate-inventory,
 *      POST /onboarding/resolve-discrepancy, POST /onboarding/enable-sync, POST /onboarding/complete.
 * 5. UI Stepper, Discrepancy Table, & Accessible Components:
 *    - Stepper with Completed/Current/Blocked/Needs Attention badges and aria attributes.
 *    - Discrepancy table rendering Internal = 20, Shopify = 20, Amazon = 18.
 *    - Web server route /app/onboarding.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

import {
  OnboardingService,
  type OnboardingSession,
  OnboardingInvariantError,
  InitialSyncSafetyViolationError,
  InvalidOnboardingStepError,
} from "@platform/domain";
import {
  renderOnboardingStepper,
  renderDiscrepancyTable,
  renderSyncConfirmationCard,
  CANONICAL_ONBOARDING_STEPS,
} from "@platform/ui";
import { startWebServer } from "@platform/web";
import { startApiServer, ApiRateLimiter } from "@platform/api";
import { SupabaseAuthAdapter, OrganizationService } from "@platform/security";
import {
  AuditDatabaseService,
  InMemoryAuditRepository,
} from "@platform/database";

const ORG_A_ID = "00000000-0000-0000-0000-000000000001";
const ORG_B_ID = "00000000-0000-0000-0000-000000000002";
const USER_ADMIN_A = "10000000-0000-0000-0000-000000000001";
const USER_VIEWER_A = "10000000-0000-0000-0000-000000000002";
const USER_ADMIN_B = "20000000-0000-0000-0000-000000000001";

function createMockAuthAdapter(): SupabaseAuthAdapter {
  const client = {
    auth: {
      getUser: async (token: string) => {
        if (token === "token_admin_org_a") {
          return {
            data: {
              user: {
                id: USER_ADMIN_A,
                email: "admin@orga.com",
                user_metadata: {
                  organization_id: ORG_A_ID,
                  organization_name: "Org A",
                  role: "ADMIN",
                },
              },
            },
            error: null,
          };
        }
        if (token === "token_viewer_org_a") {
          return {
            data: {
              user: {
                id: USER_VIEWER_A,
                email: "viewer@orga.com",
                user_metadata: {
                  organization_id: ORG_A_ID,
                  organization_name: "Org A",
                  role: "VIEWER",
                },
              },
            },
            error: null,
          };
        }
        if (token === "token_admin_org_b") {
          return {
            data: {
              user: {
                id: USER_ADMIN_B,
                email: "admin@orgb.com",
                user_metadata: {
                  organization_id: ORG_B_ID,
                  organization_name: "Org B",
                  role: "ADMIN",
                },
              },
            },
            error: null,
          };
        }
        return { data: { user: null }, error: { message: "Invalid token" } };
      },
    },
  };
  return new SupabaseAuthAdapter(client as any);
}

describe("Phase 25: Progressive Onboarding & Initial Sync Safety (Prompt 26)", () => {
  let apiServer: http.Server;
  let webServer: http.Server;
  let apiBaseUrl: string;
  let webBaseUrl: string;

  let onboardingService: OnboardingService;
  let onboardingSessions: Map<string, OnboardingSession>;
  let auditDbService: AuditDatabaseService;
  let auditRepo: InMemoryAuditRepository;

  before(async () => {
    onboardingService = new OnboardingService();
    onboardingSessions = new Map<string, OnboardingSession>();
    auditRepo = new InMemoryAuditRepository();
    auditDbService = new AuditDatabaseService(auditRepo);

    const mockAuthAdapter = createMockAuthAdapter();

    apiServer = startApiServer({
      portOverride: 0,
      authAdapter: mockAuthAdapter,
      onboardingService,
      onboardingSessions,
      auditDbService,
      rateLimiter: new ApiRateLimiter({ windowMs: 60000, maxRequests: 1000 }),
    });

    await new Promise<void>((resolve) => {
      apiServer.on("listening", resolve);
    });
    const apiAddress = apiServer.address() as AddressInfo;
    apiBaseUrl = `http://127.0.0.1:${apiAddress.port}`;

    webServer = startWebServer({
      portOverride: 0,
    });
    await new Promise<void>((resolve) => {
      webServer.on("listening", resolve);
    });
    const webAddress = webServer.address() as AddressInfo;
    webBaseUrl = `http://127.0.0.1:${webAddress.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => apiServer.close(() => resolve()));
    await new Promise<void>((resolve) => webServer.close(() => resolve()));
  });

  beforeEach(() => {
    onboardingSessions.clear();
  });

  // ==========================================
  // 1. DOMAIN SERVICE & 9-STEP STATE MACHINE
  // ==========================================
  describe("1. The 9 Progressive Steps Lifecycle & State Machine", () => {
    it("should initialize onboarding session with steps 1 and 2 completed and step 3 current", () => {
      const session = onboardingService.initializeOnboarding({
        organizationId: ORG_A_ID,
        userId: USER_ADMIN_A,
      });

      assert.equal(session.organizationId, ORG_A_ID);
      assert.equal(session.userId, USER_ADMIN_A);
      assert.equal(session.currentStep, "CHOOSE_PRIMARY_CHANNEL");
      assert.deepEqual(session.completedSteps, ["CREATE_ACCOUNT", "CREATE_ORGANIZATION"]);
      assert.equal(session.stepStatuses.CREATE_ACCOUNT, "COMPLETED");
      assert.equal(session.stepStatuses.CREATE_ORGANIZATION, "COMPLETED");
      assert.equal(session.stepStatuses.CHOOSE_PRIMARY_CHANNEL, "CURRENT");
      assert.equal(session.stepStatuses.CONNECT_CHANNEL, "BLOCKED");
      assert.equal(session.stepStatuses.IMPORT_CATALOG, "BLOCKED");
      assert.equal(session.stepStatuses.MAP_SKUS, "BLOCKED");
      assert.equal(session.stepStatuses.VALIDATE_INVENTORY, "BLOCKED");
      assert.equal(session.stepStatuses.ENABLE_SYNCHRONIZATION, "BLOCKED");
      assert.equal(session.stepStatuses.COMPLETED, "BLOCKED");
      assert.equal(session.outboundSyncEnabled, false);
    });

    it("should reject step skip or illegal transition", () => {
      const session = onboardingService.initializeOnboarding({
        organizationId: ORG_A_ID,
        userId: USER_ADMIN_A,
      });

      // Cannot connect channel without choosing primary channel
      assert.throws(
        () =>
          onboardingService.connectChannel(session, {
            channelAccountId: "acc-123",
            provider: "SHOPIFY",
            externalAccountId: "sh-1",
            displayName: "Shopify Store",
          }),
        InvalidOnboardingStepError
      );

      // Cannot import catalog without connecting channel
      assert.throws(
        () =>
          onboardingService.importCatalog(session, {
            items: [],
          }),
        InvalidOnboardingStepError
      );

      // Cannot enable sync without completing prior steps
      assert.throws(
        () =>
          onboardingService.enableOutboundSynchronization(session, {
            confirmed: true,
            userId: USER_ADMIN_A,
          }),
        InvalidOnboardingStepError
      );
    });

    it("should transition through Step 3 (Choose Channel) and reject invalid providers", () => {
      const session = onboardingService.initializeOnboarding({
        organizationId: ORG_A_ID,
        userId: USER_ADMIN_A,
      });

      assert.throws(
        () =>
          onboardingService.choosePrimaryChannel(session, {
            provider: "INVALID_CHANNEL" as any,
          }),
        OnboardingInvariantError
      );

      const afterStep3 = onboardingService.choosePrimaryChannel(session, {
        provider: "SHOPIFY",
      });

      assert.equal(afterStep3.primaryChannel, "SHOPIFY");
      assert.equal(afterStep3.currentStep, "CONNECT_CHANNEL");
      assert.equal(afterStep3.stepStatuses.CHOOSE_PRIMARY_CHANNEL, "COMPLETED");
      assert.equal(afterStep3.stepStatuses.CONNECT_CHANNEL, "CURRENT");
      assert.ok(afterStep3.completedSteps.includes("CHOOSE_PRIMARY_CHANNEL"));
    });

    it("should transition through Step 4 (Connect Channel) and record account id", () => {
      const s0 = onboardingService.initializeOnboarding({
        organizationId: ORG_A_ID,
        userId: USER_ADMIN_A,
      });
      const s1 = onboardingService.choosePrimaryChannel(s0, { provider: "SHOPIFY" });
      const s2 = onboardingService.connectChannel(s1, {
        channelAccountId: "acc-shopify-101",
        provider: "SHOPIFY",
        externalAccountId: "ext-sh-101",
        displayName: "Acme Shopify Main",
      });

      assert.equal(s2.channelAccountId, "acc-shopify-101");
      assert.equal(s2.currentStep, "IMPORT_CATALOG");
      assert.equal(s2.stepStatuses.CONNECT_CHANNEL, "COMPLETED");
      assert.equal(s2.stepStatuses.IMPORT_CATALOG, "CURRENT");
    });

    it("should transition through Step 5 (Import Catalog) and preserve all unmapped SKUs", () => {
      const s0 = onboardingService.initializeOnboarding({
        organizationId: ORG_A_ID,
        userId: USER_ADMIN_A,
      });
      const s1 = onboardingService.choosePrimaryChannel(s0, { provider: "SHOPIFY" });
      const s2 = onboardingService.connectChannel(s1, {
        channelAccountId: "acc-shopify-101",
        provider: "SHOPIFY",
        externalAccountId: "ext-sh-101",
        displayName: "Acme Shopify Main",
      });

      const s3 = onboardingService.importCatalog(s2, {
        items: [
          {
            externalProductId: "prod-1",
            externalVariantId: "var-1",
            externalSku: "WIRELESS-HEADSET-BLK",
            title: "Wireless Noise Cancelling Headset",
            price: 199.99,
          },
          {
            externalProductId: "prod-2",
            externalVariantId: "var-2",
            externalSku: "USB-C-DOCK-PRO",
            title: "Multi-Port USB-C Dock Pro",
            price: 89.99,
          },
        ],
      });

      assert.equal(s3.catalogImport.totalItems, 2);
      assert.equal(s3.catalogImport.importedItems, 2);
      assert.equal(s3.catalogImport.status, "COMPLETED");
      assert.equal(s3.skuMapping.mappings.length, 2);
      assert.equal(s3.currentStep, "MAP_SKUS");
      assert.equal(s3.stepStatuses.IMPORT_CATALOG, "COMPLETED");
      assert.equal(s3.stepStatuses.MAP_SKUS, "CURRENT");
    });

    it("should transition through Step 6 (Map SKUs) and advance to Step 7 (Validate Inventory)", () => {
      const s0 = onboardingService.initializeOnboarding({
        organizationId: ORG_A_ID,
        userId: USER_ADMIN_A,
      });
      const s1 = onboardingService.choosePrimaryChannel(s0, { provider: "SHOPIFY" });
      const s2 = onboardingService.connectChannel(s1, {
        channelAccountId: "acc-shopify-101",
        provider: "SHOPIFY",
        externalAccountId: "ext-sh-101",
        displayName: "Acme Shopify Main",
      });
      const s3 = onboardingService.importCatalog(s2, {
        items: [
          {
            externalProductId: "prod-1",
            externalSku: "WIRELESS-HEADSET-BLK",
            title: "Wireless Noise Cancelling Headset",
          },
        ],
      });

      const s4 = onboardingService.mapSkus(s3, {
        mappings: [
          {
            externalSku: "WIRELESS-HEADSET-BLK",
            internalSku: "WIRELESS-HEADSET-BLK",
          },
        ],
      });

      assert.equal(s4.currentStep, "VALIDATE_INVENTORY");
      assert.equal(s4.stepStatuses.MAP_SKUS, "COMPLETED");
      assert.equal(s4.stepStatuses.VALIDATE_INVENTORY, "CURRENT");
      assert.equal(s4.skuMapping.mappedSkus, 1);
    });
  });

  // ==========================================
  // 2. CRITICAL INITIAL SYNC SAFETY GATE (Prompt 26)
  // ==========================================
  describe("2. CRITICAL INITIAL SYNC SAFETY GATE (Prompt 26 Mandatory Rule)", () => {
    it("should detect discrepancy: Internal = 20, Shopify = 20, Amazon = 18 and flag CONFLICT without silent overwrite", () => {
      const s0 = onboardingService.initializeOnboarding({
        organizationId: ORG_A_ID,
        userId: USER_ADMIN_A,
      });
      const s1 = onboardingService.choosePrimaryChannel(s0, { provider: "SHOPIFY" });
      const s2 = onboardingService.connectChannel(s1, {
        channelAccountId: "acc-shopify-101",
        provider: "SHOPIFY",
        externalAccountId: "ext-sh-101",
        displayName: "Acme Shopify Main",
      });
      const s3 = onboardingService.importCatalog(s2, {
        items: [
          { externalProductId: "p1", externalSku: "WIRELESS-HEADSET-BLK", title: "Wireless Headset" },
          { externalProductId: "p2", externalSku: "USB-C-DOCK-PRO", title: "USB-C Dock" },
        ],
      });
      const s4 = onboardingService.mapSkus(s3, {
        mappings: [
          { externalSku: "WIRELESS-HEADSET-BLK", internalSku: "WIRELESS-HEADSET-BLK" },
          { externalSku: "USB-C-DOCK-PRO", internalSku: "USB-C-DOCK-PRO" },
        ],
      });

      // Initial Inventory Comparison
      const s5 = onboardingService.validateInventory(s4, [
        {
          sku: "WIRELESS-HEADSET-BLK",
          productTitle: "Wireless Headset",
          internalQuantity: 20,
          channelQuantities: {
            SHOPIFY: 20,
            AMAZON: 18,
          },
        },
        {
          sku: "USB-C-DOCK-PRO",
          productTitle: "USB-C Dock",
          internalQuantity: 50,
          channelQuantities: {
            SHOPIFY: 50,
            AMAZON: 50,
          },
        },
      ]);

      // Canonical assertions
      assert.equal(s5.inventoryValidation.status, "DIFFERENCES_FOUND");
      assert.equal(s5.inventoryValidation.differencesCount, 1);
      assert.equal(s5.inventoryValidation.allConfirmed, false);
      assert.equal(s5.stepStatuses.VALIDATE_INVENTORY, "NEEDS_ATTENTION");

      const headset = s5.inventoryValidation.items.find((i) => i.sku === "WIRELESS-HEADSET-BLK");
      assert.ok(headset);
      assert.equal(headset.discrepancy, true);
      assert.equal(headset.confirmed, false);
      assert.equal(headset.internalQuantity, 20);
      assert.equal(headset.channelQuantities.SHOPIFY, 20);
      assert.equal(headset.channelQuantities.AMAZON, 18);

      const dock = s5.inventoryValidation.items.find((i) => i.sku === "USB-C-DOCK-PRO");
      assert.ok(dock);
      assert.equal(dock.discrepancy, false);
      assert.equal(dock.confirmed, true);
    });

    it("CRITICAL INVARIANT: should strictly block enabling outbound sync when differences remain unconfirmed", () => {
      const s0 = onboardingService.initializeOnboarding({
        organizationId: ORG_A_ID,
        userId: USER_ADMIN_A,
      });
      const s1 = onboardingService.choosePrimaryChannel(s0, { provider: "SHOPIFY" });
      const s2 = onboardingService.connectChannel(s1, {
        channelAccountId: "acc-shopify-101",
        provider: "SHOPIFY",
        externalAccountId: "ext-sh-101",
        displayName: "Acme Shopify Main",
      });
      const s3 = onboardingService.importCatalog(s2, {
        items: [{ externalProductId: "p1", externalSku: "WIRELESS-HEADSET-BLK", title: "Wireless Headset" }],
      });
      const s4 = onboardingService.mapSkus(s3, {
        mappings: [{ externalSku: "WIRELESS-HEADSET-BLK", internalSku: "WIRELESS-HEADSET-BLK" }],
      });
      const s5 = onboardingService.validateInventory(s4, [
        {
          sku: "WIRELESS-HEADSET-BLK",
          productTitle: "Wireless Headset",
          internalQuantity: 20,
          channelQuantities: { SHOPIFY: 20, AMAZON: 18 },
        },
      ]);

      // Attempting to confirm inventory validation with unconfirmed differences must fail
      assert.throws(
        () => onboardingService.confirmInventoryValidation(s5, USER_ADMIN_A),
        InitialSyncSafetyViolationError
      );

      // Attempting to enable outbound synchronization while in VALIDATE_INVENTORY must fail
      assert.throws(
        () =>
          onboardingService.enableOutboundSynchronization(s5, {
            confirmed: true,
            userId: USER_ADMIN_A,
          }),
        InvalidOnboardingStepError
      );
    });

    it("should allow explicit source-of-truth selection (INTERNAL_LEDGER, CHANNEL, CUSTOM)", () => {
      const s0 = onboardingService.initializeOnboarding({
        organizationId: ORG_A_ID,
        userId: USER_ADMIN_A,
      });
      const s1 = onboardingService.choosePrimaryChannel(s0, { provider: "SHOPIFY" });
      const s2 = onboardingService.connectChannel(s1, {
        channelAccountId: "acc-shopify-101",
        provider: "SHOPIFY",
        externalAccountId: "ext-sh-101",
        displayName: "Acme Shopify Main",
      });
      const s3 = onboardingService.importCatalog(s2, {
        items: [{ externalProductId: "p1", externalSku: "WIRELESS-HEADSET-BLK", title: "Wireless Headset" }],
      });
      const s4 = onboardingService.mapSkus(s3, {
        mappings: [{ externalSku: "WIRELESS-HEADSET-BLK", internalSku: "WIRELESS-HEADSET-BLK" }],
      });
      const s5 = onboardingService.validateInventory(s4, [
        {
          sku: "WIRELESS-HEADSET-BLK",
          productTitle: "Wireless Headset",
          internalQuantity: 20,
          channelQuantities: { SHOPIFY: 20, AMAZON: 18 },
        },
      ]);

      // Option A: Choose Amazon (18) as authoritative source of truth
      const resolvedAmazon = onboardingService.resolveSourceOfTruth(s5, {
        sku: "WIRELESS-HEADSET-BLK",
        sourceOfTruth: "CHANNEL",
        sourceChannelProvider: "AMAZON",
      });

      const itemA = resolvedAmazon.inventoryValidation.items[0];
      assert.equal(itemA.chosenSourceOfTruth, "CHANNEL");
      assert.equal(itemA.sourceChannelProvider, "AMAZON");
      assert.equal(itemA.resolvedQuantity, 18);
      assert.equal(itemA.confirmed, true);
      assert.equal(resolvedAmazon.inventoryValidation.allConfirmed, true);
      assert.equal(resolvedAmazon.inventoryValidation.status, "RESOLVED");

      // Option B: Choose Internal Ledger (20) as authoritative source of truth
      const resolvedInternal = onboardingService.resolveSourceOfTruth(s5, {
        sku: "WIRELESS-HEADSET-BLK",
        sourceOfTruth: "INTERNAL_LEDGER",
      });
      assert.equal(resolvedInternal.inventoryValidation.items[0].resolvedQuantity, 20);

      // Option C: Choose Custom physical count (22)
      const resolvedCustom = onboardingService.resolveSourceOfTruth(s5, {
        sku: "WIRELESS-HEADSET-BLK",
        sourceOfTruth: "CUSTOM",
        customQuantity: 22,
      });
      assert.equal(resolvedCustom.inventoryValidation.items[0].resolvedQuantity, 22);
    });

    it("CRITICAL INVARIANT: requires explicit confirmation before enabling outbound sync", () => {
      const s0 = onboardingService.initializeOnboarding({
        organizationId: ORG_A_ID,
        userId: USER_ADMIN_A,
      });
      const s1 = onboardingService.choosePrimaryChannel(s0, { provider: "SHOPIFY" });
      const s2 = onboardingService.connectChannel(s1, {
        channelAccountId: "acc-shopify-101",
        provider: "SHOPIFY",
        externalAccountId: "ext-sh-101",
        displayName: "Acme Shopify Main",
      });
      const s3 = onboardingService.importCatalog(s2, {
        items: [{ externalProductId: "p1", externalSku: "WIRELESS-HEADSET-BLK", title: "Wireless Headset" }],
      });
      const s4 = onboardingService.mapSkus(s3, {
        mappings: [{ externalSku: "WIRELESS-HEADSET-BLK", internalSku: "WIRELESS-HEADSET-BLK" }],
      });
      const s5 = onboardingService.validateInventory(s4, [
        {
          sku: "WIRELESS-HEADSET-BLK",
          productTitle: "Wireless Headset",
          internalQuantity: 20,
          channelQuantities: { SHOPIFY: 20, AMAZON: 18 },
        },
      ]);
      const s6 = onboardingService.resolveSourceOfTruth(s5, {
        sku: "WIRELESS-HEADSET-BLK",
        sourceOfTruth: "INTERNAL_LEDGER",
      });

      // s6 is now in step ENABLE_SYNCHRONIZATION because all discrepancies are confirmed
      assert.equal(s6.currentStep, "ENABLE_SYNCHRONIZATION");

      // If user confirmation is false, must throw InitialSyncSafetyViolationError
      assert.throws(
        () =>
          onboardingService.enableOutboundSynchronization(s6, {
            confirmed: false,
            userId: USER_ADMIN_A,
          }),
        InitialSyncSafetyViolationError
      );

      // If user confirms, outbound sync is enabled
      const s7 = onboardingService.enableOutboundSynchronization(s6, {
        confirmed: true,
        userId: USER_ADMIN_A,
      });

      assert.equal(s7.outboundSyncEnabled, true);
      assert.equal(s7.syncConfirmation.confirmed, true);
      assert.equal(s7.currentStep, "COMPLETED");

      // Complete onboarding to unlock dashboard
      const s8 = onboardingService.completeOnboarding(s7);
      assert.equal(s8.currentStep, "COMPLETED");
      assert.ok(s8.completedSteps.includes("COMPLETED"));
      assert.ok(s8.completedAt instanceof Date);
    });
  });

  // ==========================================
  // 3. REST API ENDPOINTS & ENVELOPE CONFORMANCE
  // ==========================================
  describe("3. REST API Endpoints & Envelope Conformance", () => {
    it("GET /onboarding/state: should auto-initialize and return session envelope", async () => {
      const res = await fetch(`${apiBaseUrl}/onboarding/state`, {
        headers: { Authorization: "Bearer token_admin_org_a" },
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.ok(body.data);
      assert.equal(body.data.organizationId, ORG_A_ID);
      assert.equal(body.data.currentStep, "CHOOSE_PRIMARY_CHANNEL");
      assert.ok(body.meta.correlationId);
      assert.ok(body.meta.timestamp);
    });

    it("POST /onboarding/choose-channel: should set primary channel and advance to CONNECT_CHANNEL", async () => {
      const res = await fetch(`${apiBaseUrl}/onboarding/choose-channel`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token_admin_org_a",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider: "SHOPIFY" }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.primaryChannel, "SHOPIFY");
      assert.equal(body.data.currentStep, "CONNECT_CHANNEL");
    });

    it("POST /onboarding/connect-channel: should connect channel and advance to IMPORT_CATALOG", async () => {
      // First ensure channel is chosen
      await fetch(`${apiBaseUrl}/onboarding/choose-channel`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token_admin_org_a",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider: "SHOPIFY" }),
      });

      const res = await fetch(`${apiBaseUrl}/onboarding/connect-channel`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token_admin_org_a",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          channelAccountId: "acc-sh-001",
          provider: "SHOPIFY",
          externalAccountId: "store-acme",
          displayName: "Shopify US Store",
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.data.channelAccountId, "acc-sh-001");
      assert.equal(body.data.currentStep, "IMPORT_CATALOG");
    });

    it("POST /onboarding/import-catalog & POST /onboarding/map-skus: should ingest catalog and map SKUs", async () => {
      // Connect channel first
      await fetch(`${apiBaseUrl}/onboarding/choose-channel`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_a", "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "SHOPIFY" }),
      });
      await fetch(`${apiBaseUrl}/onboarding/connect-channel`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_a", "Content-Type": "application/json" },
        body: JSON.stringify({
          channelAccountId: "acc-sh-001",
          provider: "SHOPIFY",
          externalAccountId: "store-acme",
          displayName: "Shopify US Store",
        }),
      });

      // Import catalog
      const importRes = await fetch(`${apiBaseUrl}/onboarding/import-catalog`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_a", "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              externalProductId: "p1",
              externalSku: "WIRELESS-HEADSET-BLK",
              title: "Wireless Headset",
            },
          ],
        }),
      });
      assert.equal(importRes.status, 200);
      const importBody = await importRes.json();
      assert.equal(importBody.data.currentStep, "MAP_SKUS");

      // Map SKUs
      const mapRes = await fetch(`${apiBaseUrl}/onboarding/map-skus`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_a", "Content-Type": "application/json" },
        body: JSON.stringify({
          mappings: [
            {
              externalSku: "WIRELESS-HEADSET-BLK",
              internalSku: "WIRELESS-HEADSET-BLK",
            },
          ],
        }),
      });
      assert.equal(mapRes.status, 200);
      const mapBody = await mapRes.json();
      assert.equal(mapBody.data.currentStep, "VALIDATE_INVENTORY");
    });

    it("POST /onboarding/validate-inventory & POST /onboarding/enable-sync: should enforce Initial Sync Safety Gate via API", async () => {
      // Setup state up to VALIDATE_INVENTORY
      await fetch(`${apiBaseUrl}/onboarding/choose-channel`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_a", "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "SHOPIFY" }),
      });
      await fetch(`${apiBaseUrl}/onboarding/connect-channel`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_a", "Content-Type": "application/json" },
        body: JSON.stringify({
          channelAccountId: "acc-sh-001",
          provider: "SHOPIFY",
          externalAccountId: "store-acme",
          displayName: "Shopify US Store",
        }),
      });
      await fetch(`${apiBaseUrl}/onboarding/import-catalog`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_a", "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            { externalProductId: "p1", externalSku: "WIRELESS-HEADSET-BLK", title: "Wireless Headset" },
          ],
        }),
      });
      await fetch(`${apiBaseUrl}/onboarding/map-skus`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_a", "Content-Type": "application/json" },
        body: JSON.stringify({
          mappings: [{ externalSku: "WIRELESS-HEADSET-BLK", internalSku: "WIRELESS-HEADSET-BLK" }],
        }),
      });

      // Validate inventory with the Prompt 26 discrepancy (Internal = 20, Shopify = 20, Amazon = 18)
      const valRes = await fetch(`${apiBaseUrl}/onboarding/validate-inventory`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_a", "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              sku: "WIRELESS-HEADSET-BLK",
              productTitle: "Wireless Headset",
              internalQuantity: 20,
              channelQuantities: {
                SHOPIFY: 20,
                AMAZON: 18,
              },
            },
          ],
        }),
      });
      assert.equal(valRes.status, 200);
      const valBody = await valRes.json();
      assert.equal(valBody.data.inventoryValidation.status, "DIFFERENCES_FOUND");
      assert.equal(valBody.data.inventoryValidation.allConfirmed, false);

      // Attempting to enable sync before resolving differences must return HTTP 400 INITIAL_SYNC_SAFETY_VIOLATION
      const blockedSyncRes = await fetch(`${apiBaseUrl}/onboarding/enable-sync`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_a", "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      assert.equal(blockedSyncRes.status, 400);
      const blockedBody = await blockedSyncRes.json();
      assert.equal(blockedBody.error.code, "INVALID_ONBOARDING_STEP");

      // Resolve the discrepancy by choosing Amazon (18)
      const resolveRes = await fetch(`${apiBaseUrl}/onboarding/resolve-discrepancy`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_a", "Content-Type": "application/json" },
        body: JSON.stringify({
          sku: "WIRELESS-HEADSET-BLK",
          sourceOfTruth: "CHANNEL",
          sourceChannelProvider: "AMAZON",
        }),
      });
      assert.equal(resolveRes.status, 200);
      const resolveBody = await resolveRes.json();
      assert.equal(resolveBody.data.inventoryValidation.status, "RESOLVED");
      assert.equal(resolveBody.data.inventoryValidation.allConfirmed, true);
      assert.equal(resolveBody.data.currentStep, "ENABLE_SYNCHRONIZATION");

      // Now enable sync with explicit confirmation = true
      const enableSyncRes = await fetch(`${apiBaseUrl}/onboarding/enable-sync`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_a", "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true }),
      });
      assert.equal(enableSyncRes.status, 200);
      const enableSyncBody = await enableSyncRes.json();
      assert.equal(enableSyncBody.data.outboundSyncEnabled, true);
      assert.equal(enableSyncBody.data.syncConfirmation.confirmed, true);

      // Complete onboarding
      const completeRes = await fetch(`${apiBaseUrl}/onboarding/complete`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_a", "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      assert.equal(completeRes.status, 200);
      const completeBody = await completeRes.json();
      assert.equal(completeBody.data.currentStep, "COMPLETED");
      assert.ok(completeBody.data.completedAt);
    });
  });

  // ==========================================
  // 4. MULTI-TENANT ISOLATION & RBAC
  // ==========================================
  describe("4. Multi-Tenant Isolation & RBAC Gate", () => {
    it("should prevent VIEWER from mutating onboarding steps (HTTP 403 FORBIDDEN)", async () => {
      const res = await fetch(`${apiBaseUrl}/onboarding/choose-channel`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token_viewer_org_a",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ provider: "SHOPIFY" }),
      });

      assert.equal(res.status, 403);
      const body = await res.json();
      assert.equal(body.error.code, "FORBIDDEN");
    });

    it("should ensure complete isolation between Org A and Org B onboarding sessions", async () => {
      // Org A chooses SHOPIFY
      await fetch(`${apiBaseUrl}/onboarding/choose-channel`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_a", "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "SHOPIFY" }),
      });

      // Org B chooses AMAZON
      await fetch(`${apiBaseUrl}/onboarding/choose-channel`, {
        method: "POST",
        headers: { Authorization: "Bearer token_admin_org_b", "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "AMAZON" }),
      });

      // Verify Org A is still SHOPIFY
      const resA = await fetch(`${apiBaseUrl}/onboarding/state`, {
        headers: { Authorization: "Bearer token_admin_org_a" },
      });
      const bodyA = await resA.json();
      assert.equal(bodyA.data.primaryChannel, "SHOPIFY");
      assert.equal(bodyA.data.organizationId, ORG_A_ID);

      // Verify Org B is AMAZON
      const resB = await fetch(`${apiBaseUrl}/onboarding/state`, {
        headers: { Authorization: "Bearer token_admin_org_b" },
      });
      const bodyB = await resB.json();
      assert.equal(bodyB.data.primaryChannel, "AMAZON");
      assert.equal(bodyB.data.organizationId, ORG_B_ID);
    });
  });

  // ==========================================
  // 5. UI COMPONENTS & WEB ROUTE VERIFICATION
  // ==========================================
  describe("5. UI Components & Web Route Verification", () => {
    it("renderOnboardingStepper: should render all 9 steps with badges and accessibility attributes", () => {
      const html = renderOnboardingStepper({
        currentStepId: "VALIDATE_INVENTORY",
        steps: CANONICAL_ONBOARDING_STEPS,
      });

      assert.ok(html.includes('<nav class="onboarding-stepper-container'));
      assert.ok(html.includes('aria-label="Progressive Onboarding Steps"'));
      assert.ok(html.includes('aria-current="step"'));
      assert.ok(html.includes("Create Account"));
      assert.ok(html.includes("Create Organization"));
      assert.ok(html.includes("Primary Channel"));
      assert.ok(html.includes("Connect Channel"));
      assert.ok(html.includes("Import Catalog"));
      assert.ok(html.includes("Map SKUs"));
      assert.ok(html.includes("Validate Inventory"));
      assert.ok(html.includes("Enable Sync"));
      assert.ok(html.includes("Dashboard"));
    });

    it("renderDiscrepancyTable: should render the Prompt 26 discrepancy (Internal = 20, Shopify = 20, Amazon = 18)", () => {
      const html = renderDiscrepancyTable({
        channels: ["Shopify", "Amazon"],
        rows: [
          {
            sku: "WIRELESS-HEADSET-BLK",
            productTitle: "Wireless Noise Cancelling Headset",
            internalQuantity: 20,
            channelQuantities: { SHOPIFY: 20, AMAZON: 18 },
            discrepancy: true,
            confirmed: false,
          },
        ],
      });

      assert.ok(html.includes("WIRELESS-HEADSET-BLK"));
      assert.ok(html.includes("Wireless Noise Cancelling Headset"));
      assert.ok(html.includes("20")); // internal
      assert.ok(html.includes("18")); // amazon
      assert.ok(html.includes("CRITICAL INITIAL SYNC SAFETY GUARANTEE"));
      assert.ok(html.includes("Discrepancy Detected"));
      assert.ok(html.includes("sot-select"));
      assert.ok(html.includes("Internal Ledger (20 units)"));
      assert.ok(html.includes("Amazon (18 units)"));
    });

    it("renderSyncConfirmationCard: should render blocked state when differences exist and form when resolved", () => {
      const blockedHtml = renderSyncConfirmationCard({
        unresolvedCount: 2,
        totalSkusCount: 15,
      });
      assert.ok(blockedHtml.includes("Outbound Synchronization Blocked"));
      assert.ok(blockedHtml.includes("disabled"));

      const readyHtml = renderSyncConfirmationCard({
        unresolvedCount: 0,
        totalSkusCount: 15,
      });
      assert.ok(readyHtml.includes("Authorize Outbound Synchronization"));
      assert.ok(readyHtml.includes("confirm-sync-checkbox"));
      assert.ok(readyHtml.includes("btn-enable-outbound-sync"));
    });

    it("GET /app/onboarding: Web portal route should return HTTP 200 with interactive wizard view", async () => {
      const res = await fetch(`${webBaseUrl}/app/onboarding`);
      assert.equal(res.status, 200);
      assert.ok(res.headers.get("content-type")?.includes("text/html"));
      const text = await res.text();
      assert.ok(text.includes("Merchant Onboarding Wizard"));
      assert.ok(text.includes("Step 7: Validate Initial Inventory"));
      assert.ok(text.includes("CRITICAL INITIAL SYNC SAFETY GUARANTEE"));
      assert.ok(text.includes("WIRELESS-HEADSET-BLK"));
    });
  });
});
