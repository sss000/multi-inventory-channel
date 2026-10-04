/**
 * Phase 19: Exception Management Acceptance Test Suite
 * Canonical Specification: Sections 32, 33, 34, 52 of 01_ENGINEERING_SPEC.md & Prompt 20 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 *
 * Verifies:
 * 1. Support for all 11 canonical exception types:
 *    - SYNC_FAILURE
 *    - AUTHENTICATION_FAILURE
 *    - MISSING_MAPPING
 *    - DUPLICATE_MAPPING
 *    - NEGATIVE_INVENTORY
 *    - ORDER_UNMAPPED_SKU
 *    - STALE_DATA
 *    - PROVIDER_OUTAGE
 *    - INVENTORY_MISMATCH
 *    - RATE_LIMIT
 *    - ORDER_IMPORT_FAILURE
 * 2. Deterministic severity scoring (CRITICAL, HIGH, MEDIUM, LOW, INFO) and dynamic elevation.
 * 3. Lifecycle transitions:
 *    OPEN → INVESTIGATING → ACTION_REQUIRED → RESOLVING → RESOLVED
 *    and OPEN → IGNORED.
 * 4. Structured Diagnostic Explanation answering the 6 mandatory questions:
 *    - WHAT HAPPENED?
 *    - WHY?
 *    - WHAT IS AFFECTED?
 *    - WHAT DID THE SYSTEM TRY?
 *    - WHAT HAPPENS NEXT?
 *    - WHAT CAN I DO?
 * 5. CRITICAL PROMPT 20 INVARIANT:
 *    Submitting a retry transitions to RESOLVING, NEVER directly to RESOLVED.
 * 6. Audit Trail Enforcement:
 *    Every mutation creates an append-only audit record in audit_logs.
 * 7. Multi-tenant isolation:
 *    Organization B cannot read or mutate Organization A exceptions.
 * 8. Section 52 REST API Endpoints & RBAC:
 *    GET /exceptions, GET /exceptions/:id, POST /exceptions/:id/resolve,
 *    POST /exceptions/:id/retry, POST /exceptions/:id/ignore, POST /exceptions/:id/reconcile.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  ExceptionDatabaseService,
  InMemoryExceptionRepository,
  InMemoryAuditLogRepository,
  type ExceptionRow,
  type AuditLogRow,
} from "@platform/database";

import {
  ExceptionEngine,
  type ExceptionWithDiagnostic,
} from "@platform/integrations";

import {
  createDomainException,
  transitionException,
  retryExceptionDomain,
  calculateExceptionSeverity,
  generateDiagnosticExplanation,
  DEFAULT_EXCEPTION_SEVERITY,
  TenantAccessDeniedError,
  InvalidStateTransitionError,
  ExceptionInvariantError,
} from "@platform/domain";

import type {
  ExceptionType,
  ExceptionSeverity,
  ExceptionStatus,
} from "@platform/contracts";

import { startApiServer } from "@platform/api";
import { SupabaseAuthAdapter } from "@platform/security";

const ORG_A_ID = "00000000-0000-0000-0000-000000000001";
const ORG_B_ID = "00000000-0000-0000-0000-000000000002";
const CHANNEL_ACCOUNT_ID = "11111111-2222-3333-4444-555555555555";
const SKU_1 = "sku-laptop-pro";

function createMockAuthAdapter(): SupabaseAuthAdapter {
  const client = {
    auth: {
      getUser: async (token: string) => {
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

describe("Phase 19: Exception Management Acceptance Suite", () => {
  let exceptionRepo: InMemoryExceptionRepository;
  let auditRepo: InMemoryAuditLogRepository;
  let exceptionDbService: ExceptionDatabaseService;
  let exceptionEngine: ExceptionEngine;

  beforeEach(() => {
    exceptionRepo = new InMemoryExceptionRepository();
    auditRepo = new InMemoryAuditLogRepository();
    exceptionDbService = new ExceptionDatabaseService(exceptionRepo, auditRepo);
    exceptionEngine = new ExceptionEngine(exceptionDbService);
  });

  // ==========================================
  // 1. ALL 11 CANONICAL EXCEPTION TYPES & FACTORIES
  // ==========================================
  describe("1. All 11 Canonical Exception Types & Factories", () => {
    it("1.1 should create SYNC_FAILURE exception with deterministic HIGH severity", async () => {
      const ex = await exceptionEngine.createSyncFailureException({
        organizationId: ORG_A_ID,
        syncJobId: "job-sync-101",
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        errorMessage: "Network timeout while communicating with channel endpoint",
        errorCode: "TIMEOUT",
        isRetryable: true,
      });

      assert.equal(ex.type, "SYNC_FAILURE");
      assert.equal(ex.severity, "HIGH");
      assert.equal(ex.status, "OPEN");
      assert.equal(ex.automatable, true);
      assert.ok(ex.title.includes(SKU_1));
      assert.ok(ex.description.includes("Network timeout"));
    });

    it("1.2 should create AUTHENTICATION_FAILURE exception with HIGH severity", async () => {
      const ex = await exceptionEngine.createAuthenticationFailureException({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        provider: "SHOPIFY",
        errorMessage: "OAuth access token expired or was revoked",
      });

      assert.equal(ex.type, "AUTHENTICATION_FAILURE");
      assert.equal(ex.severity, "HIGH");
      assert.equal(ex.status, "OPEN");
      assert.equal(ex.automatable, false);
      assert.ok(ex.title.toLowerCase().includes("shopify"));
    });

    it("1.3 should create MISSING_MAPPING exception with MEDIUM severity", async () => {
      const ex = await exceptionEngine.createMissingMappingException({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        externalProductId: "prod-999",
        externalSku: "ext-sku-headphones",
      });

      assert.equal(ex.type, "MISSING_MAPPING");
      assert.equal(ex.severity, "MEDIUM");
      assert.equal(ex.status, "OPEN");
      assert.equal(ex.automatable, false);
      assert.ok(ex.title.includes("ext-sku-headphones"));
    });

    it("1.4 should create DUPLICATE_MAPPING exception with HIGH severity", async () => {
      const ex = await exceptionEngine.createDuplicateMappingException({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        externalSku: "ext-sku-mouse",
        conflictingSkuIds: ["sku-mouse-black", "sku-mouse-grey"],
      });

      assert.equal(ex.type, "DUPLICATE_MAPPING");
      assert.equal(ex.severity, "HIGH");
      assert.equal(ex.status, "OPEN");
      assert.equal(ex.automatable, false);
      assert.ok(ex.title.includes("Duplicate channel mapping"));
    });

    it("1.5 should create NEGATIVE_INVENTORY exception with CRITICAL severity", async () => {
      const ex = await exceptionEngine.createNegativeInventoryException({
        organizationId: ORG_A_ID,
        skuId: SKU_1,
        warehouseId: "wh-1",
        onHand: -5,
        available: -10,
      });

      assert.equal(ex.type, "NEGATIVE_INVENTORY");
      assert.equal(ex.severity, "CRITICAL");
      assert.equal(ex.status, "OPEN");
      assert.equal(ex.automatable, false);
      assert.ok(ex.title.includes("Negative inventory"));
    });

    it("1.6 should create ORDER_UNMAPPED_SKU exception with MEDIUM severity", async () => {
      const ex = await exceptionEngine.createOrderUnmappedSkuException({
        organizationId: ORG_A_ID,
        orderId: "ord-8888",
        externalLineId: "line-1",
        externalSku: "ext-gift-card",
      });

      assert.equal(ex.type, "ORDER_UNMAPPED_SKU");
      assert.equal(ex.severity, "MEDIUM");
      assert.equal(ex.status, "OPEN");
      assert.equal(ex.automatable, false);
      assert.ok(ex.title.includes("ord-8888"));
    });

    it("1.7 should create STALE_DATA exception with LOW severity and automatable=true", async () => {
      const ex = await exceptionEngine.createStaleDataException({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        stalenessMs: 3600000,
        lastObservedAt: new Date(Date.now() - 3600000).toISOString(),
      });

      assert.equal(ex.type, "STALE_DATA");
      assert.equal(ex.severity, "LOW");
      assert.equal(ex.status, "OPEN");
      assert.equal(ex.automatable, true);
    });

    it("1.8 should create PROVIDER_OUTAGE exception with CRITICAL severity", async () => {
      const ex = await exceptionEngine.createProviderOutageException({
        organizationId: ORG_A_ID,
        provider: "AMAZON",
        channelAccountId: CHANNEL_ACCOUNT_ID,
        errorMessage: "HTTP 503 Service Unavailable across all regions",
      });

      assert.equal(ex.type, "PROVIDER_OUTAGE");
      assert.equal(ex.severity, "CRITICAL");
      assert.equal(ex.status, "OPEN");
      assert.equal(ex.automatable, true);
    });

    it("1.9 should create INVENTORY_MISMATCH exception with appropriate severity", async () => {
      const exMinor = await exceptionEngine.createInventoryMismatchException({
        organizationId: ORG_A_ID,
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        internalQuantity: 20,
        externalQuantity: 18,
        difference: 2,
      });
      assert.equal(exMinor.type, "INVENTORY_MISMATCH");
      assert.equal(exMinor.severity, "MEDIUM");
      assert.equal(exMinor.automatable, true);

      const exMajor = await exceptionEngine.createInventoryMismatchException({
        organizationId: ORG_A_ID,
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        internalQuantity: 100,
        externalQuantity: 40,
        difference: 60,
      });
      assert.equal(exMajor.type, "INVENTORY_MISMATCH");
      assert.equal(exMajor.severity, "HIGH");
      assert.equal(exMajor.automatable, false);
    });

    it("1.10 should create RATE_LIMIT exception with LOW severity and automatable=true", async () => {
      const ex = await exceptionEngine.createRateLimitException({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        retryAfterMs: 30000,
      });

      assert.equal(ex.type, "RATE_LIMIT");
      assert.equal(ex.severity, "LOW");
      assert.equal(ex.status, "OPEN");
      assert.equal(ex.automatable, true);
    });

    it("1.11 should create ORDER_IMPORT_FAILURE exception with HIGH severity", async () => {
      const ex = await exceptionEngine.createOrderImportFailureException({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        externalOrderId: "amz-ord-12345",
        errorMessage: "Malformed customer address in payload",
      });

      assert.equal(ex.type, "ORDER_IMPORT_FAILURE");
      assert.equal(ex.severity, "HIGH");
      assert.equal(ex.status, "OPEN");
      assert.equal(ex.automatable, false);
    });
  });

  // ==========================================
  // 2. THE 6 DIAGNOSTIC QUESTIONS
  // ==========================================
  describe("2. The 6 Mandatory Diagnostic Questions", () => {
    it("should ensure every exception contains answers to all 6 diagnostic questions", async () => {
      const ex = await exceptionEngine.createSyncFailureException({
        organizationId: ORG_A_ID,
        syncJobId: "job-sync-1",
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        errorMessage: "Connection refused by Shopify storefront",
      });

      assert.ok(ex.diagnostic, "Diagnostic explanation must be present");
      assert.ok(typeof ex.diagnostic.whatHappened === "string" && ex.diagnostic.whatHappened.length > 0, "WHAT HAPPENED? required");
      assert.ok(typeof ex.diagnostic.why === "string" && ex.diagnostic.why.length > 0, "WHY? required");
      assert.ok(typeof ex.diagnostic.whatIsAffected === "string" && ex.diagnostic.whatIsAffected.length > 0, "WHAT IS AFFECTED? required");
      assert.ok(typeof ex.diagnostic.whatDidSystemTry === "string" && ex.diagnostic.whatDidSystemTry.length > 0, "WHAT DID THE SYSTEM TRY? required");
      assert.ok(typeof ex.diagnostic.whatHappensNext === "string" && ex.diagnostic.whatHappensNext.length > 0, "WHAT HAPPENS NEXT? required");
      assert.ok(typeof ex.diagnostic.whatCanIDo === "string" && ex.diagnostic.whatCanIDo.length > 0, "WHAT CAN I DO? required");
    });

    it("should provide meaningful negative inventory diagnostic advice", async () => {
      const diag = generateDiagnosticExplanation("NEGATIVE_INVENTORY", {
        entityType: "SKU",
        entityId: SKU_1,
        rootCause: { reason: "Oversold due to duplicate order import" },
      });

      assert.ok(diag.whatHappened.toLowerCase().includes("negative") || diag.whatHappened.toLowerCase().includes("overselling"));
      assert.ok(diag.whatCanIDo.toLowerCase().includes("recount") || diag.whatCanIDo.toLowerCase().includes("adjustment"));
    });
  });

  // ==========================================
  // 3. SEVERITY SCORING DYNAMICS
  // ==========================================
  describe("3. Deterministic & Dynamic Severity Scoring", () => {
    it("should respect DEFAULT_EXCEPTION_SEVERITY for all 11 types", () => {
      const types: ExceptionType[] = [
        "SYNC_FAILURE",
        "AUTHENTICATION_FAILURE",
        "MISSING_MAPPING",
        "DUPLICATE_MAPPING",
        "NEGATIVE_INVENTORY",
        "ORDER_UNMAPPED_SKU",
        "STALE_DATA",
        "PROVIDER_OUTAGE",
        "INVENTORY_MISMATCH",
        "RATE_LIMIT",
        "ORDER_IMPORT_FAILURE",
      ];

      for (const t of types) {
        const severity = calculateExceptionSeverity(t);
        assert.ok(severity, `Severity must be defined for ${t}`);
        assert.equal(severity, DEFAULT_EXCEPTION_SEVERITY[t]);
      }
    });

    it("should elevate severity to CRITICAL when financial impact exceeds threshold", () => {
      const baseSeverity = calculateExceptionSeverity("MISSING_MAPPING");
      assert.equal(baseSeverity, "MEDIUM");

      const elevated = calculateExceptionSeverity("MISSING_MAPPING", { financialImpact: 10000 });
      assert.equal(elevated, "CRITICAL");
    });

    it("should elevate severity when repeated failure occurs", () => {
      const base = calculateExceptionSeverity("RATE_LIMIT");
      assert.equal(base, "LOW");

      const repeated = calculateExceptionSeverity("RATE_LIMIT", { isRepeatedFailure: true });
      assert.equal(repeated, "MEDIUM");
    });
  });

  // ==========================================
  // 4. LIFECYCLE STATE MACHINE & TRANSITIONS
  // ==========================================
  describe("4. Lifecycle State Machine & Valid Transitions", () => {
    it("should transition through full canonical lifecycle: OPEN → INVESTIGATING → ACTION_REQUIRED → RESOLVING → RESOLVED", async () => {
      const ex = await exceptionEngine.createSyncFailureException({
        organizationId: ORG_A_ID,
        syncJobId: "job-1",
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        errorMessage: "Error 500",
      });
      assert.equal(ex.status, "OPEN");

      // 1. OPEN → INVESTIGATING
      const s1 = await exceptionDbService.transitionStatus({
        organizationId: ORG_A_ID,
        exceptionId: ex.id,
        nextStatus: "INVESTIGATING",
        actorId: "user-1",
      });
      assert.equal(s1.status, "INVESTIGATING");

      // 2. INVESTIGATING → ACTION_REQUIRED
      const s2 = await exceptionDbService.transitionStatus({
        organizationId: ORG_A_ID,
        exceptionId: ex.id,
        nextStatus: "ACTION_REQUIRED",
        actorId: "user-1",
      });
      assert.equal(s2.status, "ACTION_REQUIRED");

      // 3. ACTION_REQUIRED → RESOLVING
      const s3 = await exceptionDbService.transitionStatus({
        organizationId: ORG_A_ID,
        exceptionId: ex.id,
        nextStatus: "RESOLVING",
        actorId: "user-1",
      });
      assert.equal(s3.status, "RESOLVING");

      // 4. RESOLVING → RESOLVED
      const s4 = await exceptionEngine.resolveException({
        organizationId: ORG_A_ID,
        exceptionId: ex.id,
        actorId: "user-1",
        notes: "Fixed mapping on channel",
      });
      assert.equal(s4.status, "RESOLVED");
      assert.ok(s4.resolved_at);
      assert.equal(s4.resolved_by, "user-1");
    });

    it("should support OPEN → IGNORED transition with reason and audit log", async () => {
      const ex = await exceptionEngine.createRateLimitException({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
      });

      const ignored = await exceptionEngine.ignoreException({
        organizationId: ORG_A_ID,
        exceptionId: ex.id,
        actorId: "user-1",
        reason: "Temporary rate limit known to clear quickly",
      });

      assert.equal(ignored.status, "IGNORED");

      // Verify audit log created for ignored exception (Section 33)
      const logs = await auditRepo.list(ORG_A_ID, { entityId: ex.id });
      const ignoreLog = logs.items.find((l) => l.action === "EXCEPTION_IGNORED");
      assert.ok(ignoreLog, "Must create audit record when ignoring an exception");
      assert.equal(ignoreLog.reason, "Temporary rate limit known to clear quickly");
    });

    it("should reject invalid transitions in domain service", () => {
      const domainEx = createDomainException({
        organizationId: ORG_A_ID,
        type: "SYNC_FAILURE",
        entityType: "SYNC_JOB",
        entityId: "job-1",
        title: "Test",
        description: "Test description",
      });

      // Cannot transition from RESOLVED directly to ACTION_REQUIRED without reopening
      const resolved = transitionException(domainEx, { nextStatus: "RESOLVED" });
      assert.throws(
        () => transitionException(resolved, { nextStatus: "ACTION_REQUIRED" }),
        (err) => err instanceof InvalidStateTransitionError
      );
    });
  });

  // ==========================================
  // 5. CRITICAL PROMPT 20 INVARIANT: RETRY HANDLING
  // ==========================================
  describe("5. CRITICAL INVARIANT: Retry Handling", () => {
    it("CRITICAL GATE: Do not mark an exception RESOLVED merely because a retry was submitted; retry transitions to RESOLVING", async () => {
      const ex = await exceptionEngine.createSyncFailureException({
        organizationId: ORG_A_ID,
        syncJobId: "job-retry-test",
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        errorMessage: "504 Gateway Timeout",
      });

      // Submit retry
      const retried = await exceptionEngine.retryException({
        organizationId: ORG_A_ID,
        exceptionId: ex.id,
        actorId: "user-operator",
        reason: "Triggering sync replay",
      });

      // MUST NOT be RESOLVED!
      assert.notEqual(retried.status, "RESOLVED", "Submitting retry MUST NOT mark exception RESOLVED");
      assert.equal(retried.status, "RESOLVING", "Submitting retry must transition status to RESOLVING");
      assert.equal(retried.resolved_at, null);

      // Audit log must confirm retry submission
      const logs = await auditRepo.list(ORG_A_ID, { entityId: ex.id });
      const retryLog = logs.items.find((l) => l.action === "EXCEPTION_RETRY_SUBMITTED");
      assert.ok(retryLog, "Audit log must be created for retry submission");
      assert.equal(retryLog.after_state?.status, "RESOLVING");
    });

    it("should reject retry on an already RESOLVED exception", async () => {
      const ex = await exceptionEngine.createSyncFailureException({
        organizationId: ORG_A_ID,
        syncJobId: "job-test",
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        errorMessage: "Error",
      });

      await exceptionEngine.resolveException({
        organizationId: ORG_A_ID,
        exceptionId: ex.id,
        actorId: "user-1",
      });

      await assert.rejects(
        () =>
          exceptionEngine.retryException({
            organizationId: ORG_A_ID,
            exceptionId: ex.id,
          }),
        (err: any) => err instanceof ExceptionInvariantError
      );
    });

    it("should reject retry on an IGNORED exception until reopened", async () => {
      const ex = await exceptionEngine.createSyncFailureException({
        organizationId: ORG_A_ID,
        syncJobId: "job-test-2",
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        errorMessage: "Error",
      });

      await exceptionEngine.ignoreException({
        organizationId: ORG_A_ID,
        exceptionId: ex.id,
      });

      await assert.rejects(
        () =>
          exceptionEngine.retryException({
            organizationId: ORG_A_ID,
            exceptionId: ex.id,
          }),
        (err: any) => err instanceof ExceptionInvariantError
      );
    });
  });

  // ==========================================
  // 6. AUDIT TRAIL VERIFICATION
  // ==========================================
  describe("6. Audit Record Creation On All Mutations", () => {
    it("should record append-only audit logs for creation, resolution, ignore, retry, and reconciliation", async () => {
      // 1. Create
      const ex = await exceptionEngine.createMissingMappingException({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        externalProductId: "p1",
        externalSku: "ext-sku-1",
      });

      let logs = await auditRepo.list(ORG_A_ID, { entityId: ex.id });
      assert.equal(logs.total, 1);
      assert.equal(logs.items[0].action, "EXCEPTION_CREATED");

      // 2. Retry
      await exceptionEngine.retryException({
        organizationId: ORG_A_ID,
        exceptionId: ex.id,
        actorId: "actor-1",
      });
      logs = await auditRepo.list(ORG_A_ID, { entityId: ex.id });
      assert.equal(logs.total, 2);
      assert.equal(logs.items[0].action, "EXCEPTION_RETRY_SUBMITTED");

      // 3. Resolve
      await exceptionEngine.resolveException({
        organizationId: ORG_A_ID,
        exceptionId: ex.id,
        actorId: "actor-1",
        notes: "Mapping completed",
      });
      logs = await auditRepo.list(ORG_A_ID, { entityId: ex.id });
      assert.equal(logs.total, 3);
      assert.equal(logs.items[0].action, "EXCEPTION_RESOLVED");
    });
  });

  // ==========================================
  // 7. MULTI-TENANT ISOLATION GATE
  // ==========================================
  describe("7. Multi-Tenant Isolation Enforcement", () => {
    it("should strictly prevent Organization B from accessing Organization A's exception", async () => {
      const exA = await exceptionEngine.createSyncFailureException({
        organizationId: ORG_A_ID,
        syncJobId: "job-a",
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        errorMessage: "Error A",
      });

      // Org B attempts to retrieve Org A exception
      await assert.rejects(
        () => exceptionEngine.getException(ORG_B_ID, exA.id),
        (err: any) => err instanceof TenantAccessDeniedError
      );

      // Org B attempts to resolve Org A exception
      await assert.rejects(
        () =>
          exceptionEngine.resolveException({
            organizationId: ORG_B_ID,
            exceptionId: exA.id,
            actorId: "user-b",
          }),
        (err: any) => err instanceof TenantAccessDeniedError
      );
    });

    it("should not return Organization A exceptions in Organization B list query", async () => {
      await exceptionEngine.createSyncFailureException({
        organizationId: ORG_A_ID,
        syncJobId: "job-a",
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        errorMessage: "Error A",
      });

      const listB = await exceptionEngine.listExceptions(ORG_B_ID);
      assert.equal(listB.total, 0);
      assert.equal(listB.items.length, 0);
    });
  });

  // ==========================================
  // 8. SECTION 52 REST API ACCEPTANCE
  // ==========================================
  describe("8. Section 52 REST API Endpoints & RBAC", () => {
    let apiServer: Server;
    let baseUrl: string;

    beforeEach(async () => {
      const authAdapter = createMockAuthAdapter();
      apiServer = startApiServer({
        portOverride: 0,
        authAdapter,
        exceptionDbService,
        exceptionEngine,
      });

      await new Promise<void>((resolve) => {
        apiServer.on("listening", resolve);
      });

      const addr = apiServer.address() as AddressInfo;
      baseUrl = `http://localhost:${addr.port}`;
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => {
        apiServer.close(() => resolve());
      });
    });

    it("GET /exceptions: should list exceptions for authenticated organization with envelope and pagination", async () => {
      await exceptionEngine.createSyncFailureException({
        organizationId: ORG_A_ID,
        syncJobId: "job-1",
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        errorMessage: "Sync failed",
      });

      const res = await fetch(`${baseUrl}/exceptions`, {
        headers: {
          Authorization: "Bearer token_admin_org_a",
        },
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.ok(Array.isArray(body.data));
      assert.equal(body.data.length, 1);
      assert.equal(body.meta.pagination.total, 1);
      assert.equal(body.data[0].type, "SYNC_FAILURE");
      assert.ok(body.data[0].diagnostic.whatHappened);
    });

    it("GET /exceptions/:id: should retrieve a single exception with full diagnostic explanation", async () => {
      const ex = await exceptionEngine.createNegativeInventoryException({
        organizationId: ORG_A_ID,
        skuId: SKU_1,
        warehouseId: "wh-1",
        onHand: -2,
        available: -5,
      });

      const res = await fetch(`${baseUrl}/exceptions/${ex.id}`, {
        headers: {
          Authorization: "Bearer token_admin_org_a",
        },
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.id, ex.id);
      assert.equal(body.data.type, "NEGATIVE_INVENTORY");
      assert.equal(body.data.severity, "CRITICAL");
      assert.ok(body.data.diagnostic.whatHappened);
      assert.ok(body.data.diagnostic.whatCanIDo);
    });

    it("POST /exceptions/:id/resolve: should resolve exception with 200 OK and audit trail", async () => {
      const ex = await exceptionEngine.createSyncFailureException({
        organizationId: ORG_A_ID,
        syncJobId: "job-resolve-api",
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        errorMessage: "Sync failed",
      });

      const res = await fetch(`${baseUrl}/exceptions/${ex.id}/resolve`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token_admin_org_a",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          notes: "Repaired credentials and verified update",
          reason: "Manual operator fix",
        }),
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.status, "RESOLVED");
      assert.ok(body.data.resolvedAt);

      // Verify audit record created
      const logs = await auditRepo.list(ORG_A_ID, { entityId: ex.id });
      assert.ok(logs.items.some((l) => l.action === "EXCEPTION_RESOLVED"));
    });

    it("POST /exceptions/:id/retry: should transition to RESOLVING, NOT RESOLVED (Prompt 20 Invariant)", async () => {
      const ex = await exceptionEngine.createSyncFailureException({
        organizationId: ORG_A_ID,
        syncJobId: "job-retry-api",
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        errorMessage: "Connection dropped",
      });

      const res = await fetch(`${baseUrl}/exceptions/${ex.id}/retry`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token_admin_org_a",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "Operator initiated retry",
        }),
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.status, "RESOLVING", "Must be in RESOLVING state, not RESOLVED");
      assert.equal(body.data.resolvedAt, null);
    });

    it("POST /exceptions/:id/ignore: should transition to IGNORED and retain audit record (Section 33)", async () => {
      const ex = await exceptionEngine.createRateLimitException({
        organizationId: ORG_A_ID,
        channelAccountId: CHANNEL_ACCOUNT_ID,
      });

      const res = await fetch(`${baseUrl}/exceptions/${ex.id}/ignore`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token_admin_org_a",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reason: "Transient throttling expected to subside",
        }),
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.status, "IGNORED");

      const logs = await auditRepo.list(ORG_A_ID, { entityId: ex.id });
      assert.ok(logs.items.some((l) => l.action === "EXCEPTION_IGNORED"));
    });

    it("POST /exceptions/:id/reconcile: should transition to RESOLVING for discrepancy resolution", async () => {
      const ex = await exceptionEngine.createInventoryMismatchException({
        organizationId: ORG_A_ID,
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        internalQuantity: 10,
        externalQuantity: 7,
        difference: 3,
      });

      const res = await fetch(`${baseUrl}/exceptions/${ex.id}/reconcile`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token_admin_org_a",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          correctionDirection: "PUSH_TO_CHANNEL",
          reason: "Channel was behind internal receipts",
        }),
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.status, "RESOLVING");
    });

    it("RBAC enforcement: VIEWER can read exceptions but is forbidden from resolving/retrying/ignoring", async () => {
      const ex = await exceptionEngine.createSyncFailureException({
        organizationId: ORG_A_ID,
        syncJobId: "job-rbac",
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        errorMessage: "Error",
      });

      // VIEWER can GET
      const getRes = await fetch(`${baseUrl}/exceptions/${ex.id}`, {
        headers: { Authorization: "Bearer token_viewer_org_a" },
      });
      assert.equal(getRes.status, 200);

      // VIEWER forbidden from POST /resolve
      const resolveRes = await fetch(`${baseUrl}/exceptions/${ex.id}/resolve`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token_viewer_org_a",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes: "Unauthorized try" }),
      });
      assert.equal(resolveRes.status, 403);

      // VIEWER forbidden from POST /retry
      const retryRes = await fetch(`${baseUrl}/exceptions/${ex.id}/retry`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token_viewer_org_a",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ reason: "Unauthorized try" }),
      });
      assert.equal(retryRes.status, 403);
    });

    it("HTTP Tenant Isolation: Org B user is forbidden from accessing Org A exception", async () => {
      const exA = await exceptionEngine.createSyncFailureException({
        organizationId: ORG_A_ID,
        syncJobId: "job-cross-tenant",
        skuId: SKU_1,
        channelAccountId: CHANNEL_ACCOUNT_ID,
        errorMessage: "Error",
      });

      const res = await fetch(`${baseUrl}/exceptions/${exA.id}`, {
        headers: { Authorization: "Bearer token_admin_org_b" },
      });
      assert.equal(res.status, 403);
    });
  });
});
