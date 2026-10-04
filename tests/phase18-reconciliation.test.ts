/**
 * Phase 18: Reconciliation Engine Acceptance Test Suite
 * Canonical Specification: Sections 29, 30, 31, 53 of 01_ENGINEERING_SPEC.md & Prompt 19 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 *
 * Verifies:
 * 1. Discrepancy comparison across internal and external counts with all 7 classifications:
 *    MATCH, MINOR_DIFFERENCE, MATERIAL_DIFFERENCE, MISSING_EXTERNAL, MISSING_INTERNAL, STALE_EXTERNAL, UNKNOWN.
 * 2. Deterministic causes evaluation across all 10 causes:
 *    delayed update, external order, cancellation, return, manual marketplace adjustment,
 *    warehouse adjustment, mapping error, stale cache, synchronization failure, channel-specific logic.
 * 3. CRITICAL MUTATION RULE (Mandatory Invariant):
 *    A detected external discrepancy must NOT by itself mutate the internal inventory ledger.
 * 4. Safe auto-reconciliation criteria & execution:
 *    known mapping, known source of truth, no competing events, permitted delta, no lock, no high-risk.
 * 5. Manual review & approval lifecycle:
 *    REQUIRES_APPROVAL -> approveResult -> transactional mutation / channel sync -> MANUALLY_RESOLVED.
 *    REQUIRES_APPROVAL -> rejectResult -> IGNORED.
 * 6. Multi-tenant isolation enforcement across runs and results.
 * 7. Section 53 REST API endpoints and RBAC conformance:
 *    POST /reconciliation/run, GET /reconciliation/runs, GET /reconciliation/runs/:id,
 *    GET /reconciliation/results/:id, POST /reconciliation/results/:id/approve, POST /reconciliation/results/:id/reject.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  ReconciliationDatabaseService,
  InMemoryReconciliationRepository,
  InventoryLedgerService,
  InMemoryInventoryLedgerRepository,
  type ReconciliationRunRow,
  type ReconciliationResultRow,
  type InventoryBalanceRow,
} from "@platform/database";

import {
  ReconciliationEngine,
  MockChannelAdapter,
  type ChannelAdapter,
} from "@platform/integrations";

import {
  classifyDiscrepancy,
  evaluateDiscrepancyCause,
  evaluateSafeCorrection,
  DEFAULT_RECONCILIATION_POLICY,
  TenantAccessDeniedError,
  ReconciliationInvariantError,
} from "@platform/domain";

import { startApiServer } from "@platform/api";
import { SupabaseAuthAdapter } from "@platform/security";

const ORG_A_ID = "00000000-0000-0000-0000-000000000001";
const ORG_B_ID = "00000000-0000-0000-0000-000000000002";
const CHANNEL_ACCOUNT_ID = "11111111-2222-3333-4444-555555555555";
const WAREHOUSE_A_ID = "aaaa1111-0000-0000-0000-000000000001";

function createMockAuthAdapter() {
  const client = {
    auth: {
      async getUser(token: string) {
        if (token === "token_admin_org_a") {
          return {
            data: {
              user: {
                id: "user_admin_a",
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
                id: "user_viewer_a",
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
                id: "user_admin_b",
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

describe("Phase 18: Reconciliation Acceptance Suite", () => {
  let ledgerRepo: InMemoryInventoryLedgerRepository;
  let ledgerService: InventoryLedgerService;
  let recRepo: InMemoryReconciliationRepository;
  let recDbService: ReconciliationDatabaseService;
  let recEngine: ReconciliationEngine;
  let mockAdapter: MockChannelAdapter;

  beforeEach(() => {
    ledgerRepo = new InMemoryInventoryLedgerRepository();
    ledgerService = new InventoryLedgerService(ledgerRepo);
    recRepo = new InMemoryReconciliationRepository();
    recDbService = new ReconciliationDatabaseService(recRepo);
    mockAdapter = new MockChannelAdapter();
    recEngine = new ReconciliationEngine(
      recDbService,
      ledgerService,
      async () => mockAdapter
    );
  });

  // ==========================================
  // 1. DISCREPANCY CLASSIFICATION & COMPARISON
  // ==========================================
  describe("1. Discrepancy Classification & Comparison", () => {
    it("should classify MATCH when internal and external counts match exactly", () => {
      const res = classifyDiscrepancy(50, 50);
      assert.strictEqual(res.classification, "MATCH");
      assert.strictEqual(res.difference, 0);
    });

    it("should classify MINOR_DIFFERENCE when difference is within minor threshold", () => {
      const res = classifyDiscrepancy(50, 51, { ...DEFAULT_RECONCILIATION_POLICY, minorDifferenceThreshold: 2 });
      assert.strictEqual(res.classification, "MINOR_DIFFERENCE");
      assert.strictEqual(res.difference, 1);

      const resNeg = classifyDiscrepancy(50, 48, { ...DEFAULT_RECONCILIATION_POLICY, minorDifferenceThreshold: 2 });
      assert.strictEqual(resNeg.classification, "MINOR_DIFFERENCE");
      assert.strictEqual(resNeg.difference, -2);
    });

    it("should classify MATERIAL_DIFFERENCE when difference exceeds minor threshold", () => {
      const res = classifyDiscrepancy(50, 40, { ...DEFAULT_RECONCILIATION_POLICY, minorDifferenceThreshold: 2 });
      assert.strictEqual(res.classification, "MATERIAL_DIFFERENCE");
      assert.strictEqual(res.difference, -10);
    });

    it("should classify MISSING_EXTERNAL when internal exists but external is missing", () => {
      const res = classifyDiscrepancy(25, null);
      assert.strictEqual(res.classification, "MISSING_EXTERNAL");
      assert.strictEqual(res.difference, -25);
    });

    it("should classify MISSING_INTERNAL when external exists but internal is missing", () => {
      const res = classifyDiscrepancy(null, 15);
      assert.strictEqual(res.classification, "MISSING_INTERNAL");
      assert.strictEqual(res.difference, 15);
    });

    it("should classify STALE_EXTERNAL when snapshot age exceeds freshness threshold", () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      const res = classifyDiscrepancy(50, 45, { ...DEFAULT_RECONCILIATION_POLICY, staleThresholdMs: 300_000 }, {
        externalObservedAt: tenMinutesAgo,
      });
      assert.strictEqual(res.classification, "STALE_EXTERNAL");
      assert.strictEqual(res.difference, -5);
    });

    it("should classify UNKNOWN when both counts are missing", () => {
      const res = classifyDiscrepancy(null, null);
      assert.strictEqual(res.classification, "UNKNOWN");
      assert.strictEqual(res.difference, 0);
    });
  });

  // ==========================================
  // 2. DETERMINISTIC CAUSES EVALUATION
  // ==========================================
  describe("2. Deterministic Causes Evaluation (Prompt 19 Mandatory Causes)", () => {
    it("should evaluate DELAYED_UPDATE when recent pending outbound sync exists", () => {
      const evalResult = evaluateDiscrepancyCause("MINOR_DIFFERENCE", 1, {
        hasRecentPendingSync: true,
      });
      assert.strictEqual(evalResult.cause, "DELAYED_UPDATE");
      assert.match(evalResult.explanation, /still propagating/);
    });

    it("should evaluate SYNCHRONIZATION_FAILURE when recent sync failed", () => {
      const evalResult = evaluateDiscrepancyCause("MATERIAL_DIFFERENCE", 10, {
        hasFailedSync: true,
      });
      assert.strictEqual(evalResult.cause, "SYNCHRONIZATION_FAILURE");
      assert.match(evalResult.explanation, /synchronization job failure/);
    });

    it("should evaluate EXTERNAL_ORDER when recent external orders are pending balance reduction", () => {
      const evalResult = evaluateDiscrepancyCause("MINOR_DIFFERENCE", -2, {
        recentOrderCount: 2,
      });
      assert.strictEqual(evalResult.cause, "EXTERNAL_ORDER");
      assert.match(evalResult.explanation, /external order/);
    });

    it("should evaluate CANCELLATION when recent cancellations restored inventory", () => {
      const evalResult = evaluateDiscrepancyCause("MINOR_DIFFERENCE", 1, {
        recentCancellationCount: 1,
      });
      assert.strictEqual(evalResult.cause, "CANCELLATION");
      assert.match(evalResult.explanation, /cancellation/);
    });

    it("should evaluate RETURN when recent return receipts logged in inventory", () => {
      const evalResult = evaluateDiscrepancyCause("MINOR_DIFFERENCE", 1, {
        recentReturnCount: 1,
      });
      assert.strictEqual(evalResult.cause, "RETURN");
      assert.match(evalResult.explanation, /return receipt/);
    });

    it("should evaluate WAREHOUSE_ADJUSTMENT when warehouse cycle recount occurred", () => {
      const evalResult = evaluateDiscrepancyCause("MATERIAL_DIFFERENCE", -5, {
        warehouseRecountLogged: true,
      });
      assert.strictEqual(evalResult.cause, "WAREHOUSE_ADJUSTMENT");
      assert.match(evalResult.explanation, /warehouse cycle count/);
    });

    it("should evaluate MANUAL_MARKETPLACE_ADJUSTMENT when marketplace adjustment logged", () => {
      const evalResult = evaluateDiscrepancyCause("MINOR_DIFFERENCE", 1, {
        manualAdjustmentLogged: true,
      });
      assert.strictEqual(evalResult.cause, "MANUAL_MARKETPLACE_ADJUSTMENT");
      assert.match(evalResult.explanation, /Manual inventory adjustment/);
    });

    it("should evaluate MAPPING_ERROR for unmapped SKUs", () => {
      const evalResult = evaluateDiscrepancyCause("MISSING_INTERNAL", 10, {
        unmappedSku: true,
      });
      assert.strictEqual(evalResult.cause, "MAPPING_ERROR");
      assert.match(evalResult.explanation, /unmapped or missing/);
    });

    it("should evaluate STALE_CACHE when external snapshot is stale", () => {
      const evalResult = evaluateDiscrepancyCause("STALE_EXTERNAL", -3, {
        isStaleSnapshot: true,
      });
      assert.strictEqual(evalResult.cause, "STALE_CACHE");
      assert.match(evalResult.explanation, /stale or outdated/);
    });

    it("should evaluate CHANNEL_SPECIFIC_LOGIC when marketplace fulfillment rules applied", () => {
      const evalResult = evaluateDiscrepancyCause("MINOR_DIFFERENCE", -1, {
        channelSpecificRulesApplied: true,
      });
      assert.strictEqual(evalResult.cause, "CHANNEL_SPECIFIC_LOGIC");
      assert.match(evalResult.explanation, /Channel-specific/);
    });
  });

  // ==========================================
  // 3. CRITICAL MUTATION RULE (MANDATORY INVARIANT)
  // ==========================================
  describe("3. CRITICAL MUTATION RULE (Prompt 19 Invariant)", () => {
    it("A detected external discrepancy must NOT by itself mutate the internal inventory ledger", async () => {
      // Setup initial internal balance of 100 units
      await ledgerService.recordInitialImport({
        organizationId: ORG_A_ID,
        skuId: "sku_critical_mutation",
        warehouseId: WAREHOUSE_A_ID,
        onHand: 100,
        correlationId: "init_import",
      });

      const initialBalance = await ledgerService.getBalance(ORG_A_ID, "sku_critical_mutation", WAREHOUSE_A_ID);
      assert.strictEqual(initialBalance?.on_hand, 100);
      assert.strictEqual(initialBalance?.version, 1);

      // Channel reports a MATERIAL difference: only 80 units
      mockAdapter.setInventoryLevel("ext_sku_crit", 80);

      // Execute reconciliation run
      const summary = await recEngine.runReconciliation({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        warehouseId: WAREHOUSE_A_ID,
        skuMappings: [{ skuId: "sku_critical_mutation", externalSkuId: "ext_sku_crit" }],
      });

      assert.strictEqual(summary.discrepancyCount, 1);
      assert.strictEqual(summary.results[0]?.classification, "MATERIAL_DIFFERENCE");
      assert.strictEqual(summary.results[0]?.status, "PENDING");

      // Verify internal ledger balance was NOT mutated by the discrepancy detection
      const afterBalance = await ledgerService.getBalance(ORG_A_ID, "sku_critical_mutation", WAREHOUSE_A_ID);
      assert.strictEqual(afterBalance?.on_hand, 100, "Internal ledger on_hand must not be modified during discrepancy detection!");
      assert.strictEqual(afterBalance?.version, 1, "Internal balance version must not increment during discrepancy detection!");
    });
  });

  // ==========================================
  // 4. SAFE AUTO-RECONCILIATION GATE
  // ==========================================
  describe("4. Safe Auto-Reconciliation Gate (Section 31 & Prompt 19)", () => {
    it("should safely auto-reconcile minor delta with known mapping and internal source of truth by pushing to channel", async () => {
      // Internal ledger: 50
      await ledgerService.recordInitialImport({
        organizationId: ORG_A_ID,
        skuId: "sku_auto_sync",
        warehouseId: WAREHOUSE_A_ID,
        onHand: 50,
        correlationId: "init_auto",
      });

      // External channel: 49 (difference = -1 within maxDelta 1)
      mockAdapter.setInventoryLevel("ext_sku_auto", 49);

      const summary = await recEngine.runReconciliation({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        warehouseId: WAREHOUSE_A_ID,
        skuMappings: [{ skuId: "sku_auto_sync", externalSkuId: "ext_sku_auto" }],
        policy: { allowAutoReconcileMinor: true, autoReconcileMaxDelta: 1, minorDifferenceThreshold: 2 },
        sourceOfTruth: "INTERNAL_LEDGER",
      });

      assert.strictEqual(summary.results[0]?.status, "AUTO_RESOLVED");
      assert.strictEqual(summary.results[0]?.correction_direction, "PUSH_TO_CHANNEL");

      // Channel should have received the push to align with internal ledger (50)
      const channelLevel = await mockAdapter.getInventory({ sku: "ext_sku_auto" });
      assert.strictEqual(channelLevel.quantity, 50);

      // Audit record emitted
      const audits = recEngine.getAuditEvents();
      assert.ok(audits.some((a) => a.action === "AUTO_RESOLVED" && a.details?.skuId === "sku_auto_sync"));
    });

    it("should safely auto-reconcile minor delta with external channel source of truth by adjusting internal ledger", async () => {
      // Internal ledger: 50
      await ledgerService.recordInitialImport({
        organizationId: ORG_A_ID,
        skuId: "sku_fba_authority",
        warehouseId: WAREHOUSE_A_ID,
        onHand: 50,
        correlationId: "init_fba",
      });

      // External channel (e.g. FBA authority): 51 (difference = +1 within maxDelta 1)
      mockAdapter.setInventoryLevel("ext_sku_fba", 51);

      const summary = await recEngine.runReconciliation({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        warehouseId: WAREHOUSE_A_ID,
        skuMappings: [{ skuId: "sku_fba_authority", externalSkuId: "ext_sku_fba" }],
        policy: { allowAutoReconcileMinor: true, autoReconcileMaxDelta: 1, minorDifferenceThreshold: 2 },
        sourceOfTruth: "EXTERNAL_CHANNEL",
      });

      assert.strictEqual(summary.results[0]?.status, "AUTO_RESOLVED");
      assert.strictEqual(summary.results[0]?.correction_direction, "ADJUST_INTERNAL_LEDGER");

      // Internal ledger must have been updated to 51 via recordReconciliationCorrection
      const updatedBalance = await ledgerService.getBalance(ORG_A_ID, "sku_fba_authority", WAREHOUSE_A_ID);
      assert.strictEqual(updatedBalance?.on_hand, 51);
      assert.strictEqual(updatedBalance?.version, 2);
    });

    it("should require approval when delta exceeds autoReconcileMaxDelta", async () => {
      // Delta = 2, maxDelta = 1
      const safeEval = evaluateSafeCorrection({
        classification: "MINOR_DIFFERENCE",
        difference: 2,
        internalQuantity: 50,
        externalQuantity: 52,
        policy: { autoReconcileMaxDelta: 1, allowAutoReconcileMinor: true },
        sourceOfTruth: "INTERNAL_LEDGER",
      });

      assert.strictEqual(safeEval.isAutoReconcilable, false);
      assert.strictEqual(safeEval.requiresApproval, true);
      assert.strictEqual(safeEval.correctionDirection, "REQUIRES_APPROVAL");
      assert.match(safeEval.reason, /exceeds auto-reconcile limit/);
    });

    it("should require approval when unresolved competing events or pending sync exist", () => {
      const safeEval = evaluateSafeCorrection({
        classification: "MINOR_DIFFERENCE",
        difference: 1,
        internalQuantity: 50,
        externalQuantity: 51,
        policy: { autoReconcileMaxDelta: 1, allowAutoReconcileMinor: true },
        evidence: { hasRecentPendingSync: true },
      });

      assert.strictEqual(safeEval.isAutoReconcilable, false);
      assert.strictEqual(safeEval.requiresApproval, true);
      assert.match(safeEval.reason, /competing events/);
    });

    it("should require approval when manual lock or high-risk state is active", () => {
      const safeEval = evaluateSafeCorrection({
        classification: "MINOR_DIFFERENCE",
        difference: 1,
        internalQuantity: 50,
        externalQuantity: 51,
        policy: { autoReconcileMaxDelta: 1, allowAutoReconcileMinor: true },
        evidence: { activeLocksOrHighRisk: true },
      });

      assert.strictEqual(safeEval.isAutoReconcilable, false);
      assert.strictEqual(safeEval.requiresApproval, true);
      assert.match(safeEval.reason, /manual lock/);
    });
  });

  // ==========================================
  // 5. MANUAL REVIEW & APPROVAL LIFECYCLE
  // ==========================================
  describe("5. Manual Review & Approval Lifecycle Gate", () => {
    it("should allow operator to manually approve resolution with ledger adjustment", async () => {
      await ledgerService.recordInitialImport({
        organizationId: ORG_A_ID,
        skuId: "sku_manual_approval",
        warehouseId: WAREHOUSE_A_ID,
        onHand: 100,
        correlationId: "init_manual",
      });

      // Channel reports 90 (-10 material difference)
      mockAdapter.setInventoryLevel("ext_sku_manual", 90);

      const summary = await recEngine.runReconciliation({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        warehouseId: WAREHOUSE_A_ID,
        skuMappings: [{ skuId: "sku_manual_approval", externalSkuId: "ext_sku_manual" }],
      });

      const result = summary.results[0]!;
      assert.strictEqual(result.status, "PENDING");

      // Operator approves adjustment of internal ledger to match physical reality
      const approved = await recEngine.approveResult({
        organizationId: ORG_A_ID,
        resultId: result.id,
        correctionDirection: "ADJUST_INTERNAL_LEDGER",
        reason: "Warehouse physical recount verified channel count",
        actorId: "operator_01",
      });

      assert.strictEqual(approved.status, "MANUALLY_RESOLVED");

      // Internal ledger should now be 90
      const balance = await ledgerService.getBalance(ORG_A_ID, "sku_manual_approval", WAREHOUSE_A_ID);
      assert.strictEqual(balance?.on_hand, 90);

      // Re-approving already resolved result must be rejected
      await assert.rejects(
        () =>
          recEngine.approveResult({
            organizationId: ORG_A_ID,
            resultId: result.id,
          }),
        ReconciliationInvariantError
      );
    });

    it("should allow operator to reject / ignore a reconciliation discrepancy", async () => {
      await ledgerService.recordInitialImport({
        organizationId: ORG_A_ID,
        skuId: "sku_ignore_test",
        warehouseId: WAREHOUSE_A_ID,
        onHand: 50,
        correlationId: "init_ignore",
      });

      mockAdapter.setInventoryLevel("ext_sku_ignore", 40);

      const summary = await recEngine.runReconciliation({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        warehouseId: WAREHOUSE_A_ID,
        skuMappings: [{ skuId: "sku_ignore_test", externalSkuId: "ext_sku_ignore" }],
      });

      const result = summary.results[0]!;
      const rejected = await recEngine.rejectResult({
        organizationId: ORG_A_ID,
        resultId: result.id,
        reason: "Transient marketplace feed issue; no action required",
        actorId: "operator_01",
      });

      assert.strictEqual(rejected.status, "IGNORED");

      // Balance remains unchanged at 50
      const balance = await ledgerService.getBalance(ORG_A_ID, "sku_ignore_test", WAREHOUSE_A_ID);
      assert.strictEqual(balance?.on_hand, 50);

      // Re-rejecting or approving ignored result must be rejected
      await assert.rejects(
        () =>
          recEngine.rejectResult({
            organizationId: ORG_A_ID,
            resultId: result.id,
          }),
        ReconciliationInvariantError
      );
    });
  });

  // ==========================================
  // 6. TENANT ISOLATION ENFORCEMENT
  // ==========================================
  describe("6. Tenant Isolation Enforcement Gate", () => {
    it("should forbid Organization B from viewing or approving Organization A's reconciliation runs or results", async () => {
      await ledgerService.recordInitialImport({
        organizationId: ORG_A_ID,
        skuId: "sku_tenant_isolation",
        warehouseId: WAREHOUSE_A_ID,
        onHand: 50,
        correlationId: "init_tenant",
      });

      mockAdapter.setInventoryLevel("ext_sku_tenant", 40);

      const summary = await recEngine.runReconciliation({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        warehouseId: WAREHOUSE_A_ID,
        skuMappings: [{ skuId: "sku_tenant_isolation", externalSkuId: "ext_sku_tenant" }],
      });

      const runId = summary.run.id;
      const resultId = summary.results[0]!.id;

      // Org B attempts to retrieve Org A run
      await assert.rejects(
        () => recDbService.getRun(ORG_B_ID, runId),
        TenantAccessDeniedError
      );

      // Org B attempts to retrieve Org A result
      await assert.rejects(
        () => recDbService.getResult(ORG_B_ID, resultId),
        TenantAccessDeniedError
      );

      // Org B attempts to approve Org A result
      await assert.rejects(
        () =>
          recEngine.approveResult({
            organizationId: ORG_B_ID,
            resultId,
          }),
        TenantAccessDeniedError
      );
    });
  });

  // ==========================================
  // 7. REST API ENDPOINTS & RBAC CONFORMANCE
  // ==========================================
  describe("7. REST API Endpoints & RBAC Conformance (Section 53)", () => {
    let server: Server;
    let baseUrl: string;

    beforeEach(async () => {
      const authAdapter = createMockAuthAdapter();
      server = startApiServer({
        portOverride: 0,
        authAdapter,
        reconciliationDbService: recDbService,
        reconciliationEngine: recEngine,
        ledgerService,
      });

      await new Promise<void>((resolve) => {
        if (server.listening) resolve();
        else server.on("listening", resolve);
      });

      const addr = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    afterEach(async () => {
      await new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    });

    it("POST /reconciliation/run: should start run and return 201 Created with envelope", async () => {
      const res = await fetch(`${baseUrl}/reconciliation/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token_admin_org_a",
        },
        body: JSON.stringify({
          channelAccountId: CHANNEL_ACCOUNT_ID,
          warehouseId: WAREHOUSE_A_ID,
        }),
      });

      assert.strictEqual(res.status, 201);
      const json = await res.json();
      assert.ok(json.data);
      assert.strictEqual(json.data.organizationId, ORG_A_ID);
      assert.strictEqual(json.data.status, "COMPLETED");
    });

    it("GET /reconciliation/runs: should list runs for authenticated tenant", async () => {
      const res = await fetch(`${baseUrl}/reconciliation/runs`, {
        method: "GET",
        headers: {
          Authorization: "Bearer token_admin_org_a",
        },
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.data));
    });

    it("GET /reconciliation/runs/:id: should retrieve single run and its results", async () => {
      const run = await recDbService.startRun({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
      });
      await recDbService.completeRun({
        organizationId: ORG_A_ID,
        runId: run.id,
        totalEvaluated: 1,
        matchedCount: 1,
        discrepancyCount: 0,
      });

      const res = await fetch(`${baseUrl}/reconciliation/runs/${run.id}`, {
        method: "GET",
        headers: {
          Authorization: "Bearer token_admin_org_a",
        },
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.id, run.id);
    });

    it("POST /reconciliation/results/:id/approve: should approve result and return 200 OK", async () => {
      const run = await recDbService.startRun({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
      });

      const resultRow: ReconciliationResultRow = {
        id: "res_to_approve",
        reconciliation_run_id: run.id,
        sku_id: "sku_api_approve",
        internal_quantity: 10,
        external_quantity: 8,
        difference: -2,
        classification: "MINOR_DIFFERENCE",
        recommended_action: "Review",
        status: "PENDING",
        created_at: new Date().toISOString(),
        resolved_at: null,
      };
      await recDbService.saveResults(ORG_A_ID, run.id, [resultRow]);

      const res = await fetch(`${baseUrl}/reconciliation/results/res_to_approve/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token_admin_org_a",
        },
        body: JSON.stringify({
          reason: "Approved via API",
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.status, "MANUALLY_RESOLVED");
    });

    it("POST /reconciliation/results/:id/reject: should reject result and return 200 OK", async () => {
      const run = await recDbService.startRun({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
      });

      const resultRow: ReconciliationResultRow = {
        id: "res_to_reject",
        reconciliation_run_id: run.id,
        sku_id: "sku_api_reject",
        internal_quantity: 10,
        external_quantity: 8,
        difference: -2,
        classification: "MINOR_DIFFERENCE",
        recommended_action: "Review",
        status: "PENDING",
        created_at: new Date().toISOString(),
        resolved_at: null,
      };
      await recDbService.saveResults(ORG_A_ID, run.id, [resultRow]);

      const res = await fetch(`${baseUrl}/reconciliation/results/res_to_reject/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token_admin_org_a",
        },
        body: JSON.stringify({
          reason: "Rejected via API",
        }),
      });

      assert.strictEqual(res.status, 200);
      const json = await res.json();
      assert.strictEqual(json.data.status, "IGNORED");
    });

    it("RBAC enforcement: VIEWER role lacks reconciliation:write and is forbidden from POST /reconciliation/run", async () => {
      const res = await fetch(`${baseUrl}/reconciliation/run`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token_viewer_org_a",
        },
        body: JSON.stringify({
          channelAccountId: CHANNEL_ACCOUNT_ID,
        }),
      });

      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.strictEqual(json.error.code, "FORBIDDEN");
    });

    it("HTTP Tenant Isolation: Tenant B cannot retrieve Tenant A reconciliation run", async () => {
      const run = await recDbService.startRun({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
      });

      const res = await fetch(`${baseUrl}/reconciliation/runs/${run.id}`, {
        method: "GET",
        headers: {
          Authorization: "Bearer token_admin_org_b",
        },
      });

      assert.strictEqual(res.status, 403);
      const json = await res.json();
      assert.strictEqual(json.error.code, "FORBIDDEN");
    });
  });
});
