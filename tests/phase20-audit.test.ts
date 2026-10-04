/**
 * Phase 20: Audit System Acceptance Test Suite
 * Canonical Specification: Sections 35, 36, 68, 114 of 01_ENGINEERING_SPEC.md & Prompt 21 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 *
 * Verifies:
 * 1. Append-Only Immutability Invariant (Prompt 21 & Section 68):
 *    - Rejection of database update and delete operations (ImmutableAuditLogError).
 *    - Rejection of HTTP PUT, PATCH, DELETE and direct POST on /audit with 405 Method Not Allowed.
 * 2. Domain Validation & Invariant Protections:
 *    - Mandatory audit fields: organizationId, actorType, action, entityType, entityId, correlationId.
 * 3. Comprehensive Querying & Filtering:
 *    - Filter by date range (startDate, endDate).
 *    - Filter by actor (actorType, actorId).
 *    - Filter by entity (entityType, entityId).
 *    - Filter by action.
 *    - Filter by correlationId.
 *    - Pagination: limit, offset, total count, order preservation (most recent first).
 * 4. The 8 Canonical Material Mutation Categories Audited:
 *    - 1. Inventory adjustments
 *    - 2. Reconciliation mutations
 *    - 3. Mapping changes
 *    - 4. Exception resolutions
 *    - 5. Integration changes
 *    - 6. Billing administrative actions
 *    - 7. Dangerous bulk operations
 *    - 8. Admin actions
 * 5. Multi-Tenant Isolation:
 *    - Organization A vs Organization B: Org B cannot view Org A's audit history.
 *    - HTTP endpoints enforce strict tenant boundaries.
 * 6. Role-Based Access Control (RBAC):
 *    - OWNER, ADMIN, MANAGER permitted (audit:read, audit:export).
 *    - VIEWER denied unless permitted (HTTP 403 FORBIDDEN).
 * 7. REST API Endpoints & Standard Envelopes:
 *    - GET /audit (pagination, filters, envelope)
 *    - GET /audit/:id (single record envelope, 404 on missing)
 *    - GET /audit/export (CSV RFC 4180 export and JSON format)
 *    - GET /audit/reconstruct/:correlationId (causal reconstruction)
 * 8. THE CANONICAL ACCEPTANCE TEST (Prompt 21 & Section 114):
 *    - Given an inventory discrepancy, an administrator must be able to reconstruct:
 *      before, event, actor, reason, after, channel impact, synchronization result, resolution.
 */

import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";

import {
  AuditDatabaseService,
  InMemoryAuditRepository,
  type AuditRepository,
  type AuditLogRow,
} from "@platform/database";

import {
  createDomainAuditRecord,
  assertAuditLogImmutable,
  reconstructDiscrepancyTrail,
  ImmutableAuditLogError,
  AuditNotFoundError,
  AuditInvariantError,
  TenantAccessDeniedError,
} from "@platform/domain";

import type {
  AuditLogDto,
  AuditActorType,
  AuditReconstruction,
} from "@platform/contracts";

import { startApiServer } from "@platform/api";
import { SupabaseAuthAdapter } from "@platform/security";

const ORG_A_ID = "00000000-0000-0000-0000-000000000001";
const ORG_B_ID = "00000000-0000-0000-0000-000000000002";
const USER_ADMIN_A = "user_admin_org_a";
const USER_VIEWER_A = "user_viewer_org_a";
const USER_ADMIN_B = "user_admin_org_b";

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

describe("Phase 20: Audit System Acceptance Suite", () => {
  let auditRepo: InMemoryAuditRepository;
  let auditDbService: AuditDatabaseService;
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    auditRepo = new InMemoryAuditRepository();
    auditDbService = new AuditDatabaseService(auditRepo);

    const authAdapter = createMockAuthAdapter();
    server = startApiServer({
      portOverride: 0,
      authAdapter,
      auditDbService,
    });

    await new Promise<void>((resolve) => {
      server.on("listening", resolve);
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  // =========================================================================
  // 1. STRICT APPEND-ONLY IMMUTABILITY INVARIANT (Prompt 21 & Section 68)
  // =========================================================================
  describe("1. Strict Append-Only Immutability Invariant", () => {
    it("should throw ImmutableAuditLogError on repository update attempt", async () => {
      await assert.rejects(
        async () => {
          await auditRepo.update();
        },
        (err: unknown) => {
          assert.ok(err instanceof ImmutableAuditLogError);
          assert.equal(err.code, "IMMUTABLE_AUDIT_LOG");
          assert.match(err.message, /strictly append-only/i);
          return true;
        }
      );
    });

    it("should throw ImmutableAuditLogError on repository delete attempt", async () => {
      await assert.rejects(
        async () => {
          await auditRepo.delete();
        },
        (err: unknown) => {
          assert.ok(err instanceof ImmutableAuditLogError);
          assert.equal(err.code, "IMMUTABLE_AUDIT_LOG");
          assert.match(err.message, /strictly append-only/i);
          return true;
        }
      );
    });

    it("should throw ImmutableAuditLogError on domain assertAuditLogImmutable", () => {
      assert.throws(
        () => assertAuditLogImmutable("UPDATE"),
        (err: unknown) => {
          assert.ok(err instanceof ImmutableAuditLogError);
          assert.match((err as Error).message, /cannot be modified/i);
          return true;
        }
      );

      assert.throws(
        () => assertAuditLogImmutable("DELETE"),
        (err: unknown) => {
          assert.ok(err instanceof ImmutableAuditLogError);
          assert.match((err as Error).message, /cannot be deleted/i);
          return true;
        }
      );
    });

    it("HTTP: should return 405 Method Not Allowed on PUT, PATCH, DELETE /audit", async () => {
      for (const method of ["PUT", "PATCH", "DELETE"]) {
        const res = await fetch(`${baseUrl}/audit/some_id`, {
          method,
          headers: {
            Authorization: "Bearer token_admin_org_a",
            "Content-Type": "application/json",
          },
          body: method !== "DELETE" ? JSON.stringify({ reason: "tampered" }) : undefined,
        });

        assert.equal(res.status, 405, `Expected 405 for method ${method}`);
        const body = (await res.json()) as any;
        assert.equal(body.error.code, "IMMUTABLE_AUDIT_LOG");
        assert.match(body.error.message, /strictly append-only/i);
      }
    });

    it("HTTP: should return 405 Method Not Allowed on direct client POST /audit", async () => {
      const res = await fetch(`${baseUrl}/audit`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token_admin_org_a",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ action: "FAKE_MUTATION" }),
      });

      assert.equal(res.status, 405);
      const body = (await res.json()) as any;
      assert.equal(body.error.code, "IMMUTABLE_AUDIT_LOG");
      assert.match(body.error.message, /Direct client creation of audit logs is forbidden/i);
    });
  });

  // =========================================================================
  // 2. DOMAIN MODEL & INVARIANTS VALIDATION
  // =========================================================================
  describe("2. Domain Model & Invariants Validation", () => {
    it("should reject creation of audit record missing organizationId", () => {
      assert.throws(
        () =>
          createDomainAuditRecord({
            organizationId: "" as any,
            actorType: "USER",
            action: "TEST",
            entityType: "sku",
            entityId: "sku-1",
            correlationId: "corr-1" as any,
          }),
        (err: unknown) => {
          assert.ok(err instanceof AuditInvariantError);
          assert.match((err as Error).message, /organizationId/i);
          return true;
        }
      );
    });

    it("should reject creation of audit record missing action or entityType", () => {
      assert.throws(
        () =>
          createDomainAuditRecord({
            organizationId: ORG_A_ID as any,
            actorType: "USER",
            action: "   ",
            entityType: "sku",
            entityId: "sku-1",
            correlationId: "corr-1" as any,
          }),
        (err: unknown) => {
          assert.ok(err instanceof AuditInvariantError);
          assert.match((err as Error).message, /non-empty action/i);
          return true;
        }
      );

      assert.throws(
        () =>
          createDomainAuditRecord({
            organizationId: ORG_A_ID as any,
            actorType: "USER",
            action: "INVENTORY_ADJUST",
            entityType: "",
            entityId: "sku-1",
            correlationId: "corr-1" as any,
          }),
        (err: unknown) => {
          assert.ok(err instanceof AuditInvariantError);
          assert.match((err as Error).message, /non-empty entityType/i);
          return true;
        }
      );
    });

    it("should successfully construct valid domain audit record with timestamp", () => {
      const record = createDomainAuditRecord({
        organizationId: ORG_A_ID as any,
        actorType: "USER",
        actorId: USER_ADMIN_A as any,
        action: "INVENTORY_ADJUSTMENT",
        entityType: "inventory_balance",
        entityId: "sku-laptop-pro",
        beforeState: { onHand: 50 },
        afterState: { onHand: 40 },
        reason: "Damaged packaging in warehouse A",
        correlationId: "corr-12345" as any,
      });

      assert.ok(record.id.startsWith("audit_"));
      assert.equal(record.organizationId, ORG_A_ID);
      assert.equal(record.action, "INVENTORY_ADJUSTMENT");
      assert.equal(record.beforeState?.onHand, 50);
      assert.equal(record.afterState?.onHand, 40);
      assert.equal(record.reason, "Damaged packaging in warehouse A");
      assert.ok(record.createdAt instanceof Date);
    });
  });

  // =========================================================================
  // 3. REPOSITORY QUERYING & FILTERING
  // =========================================================================
  describe("3. Repository Querying, Filtering & Pagination", () => {
    beforeEach(async () => {
      // Seed audit records with staggered timestamps and varied attributes
      const baseTime = new Date("2026-10-01T10:00:00.000Z").getTime();

      const seedRecords: AuditLogRow[] = [
        {
          id: "audit_1",
          organization_id: ORG_A_ID,
          actor_type: "USER",
          actor_id: USER_ADMIN_A,
          action: "INVENTORY_ADJUSTMENT",
          entity_type: "inventory_balance",
          entity_id: "sku-100",
          before_state: { on_hand: 100 },
          after_state: { on_hand: 95 },
          reason: "Physical count recount",
          request_id: "req_1",
          correlation_id: "corr_alpha",
          created_at: new Date(baseTime).toISOString(),
        },
        {
          id: "audit_2",
          organization_id: ORG_A_ID,
          actor_type: "SYSTEM",
          actor_id: null,
          action: "SYNC_OUTBOUND_DISPATCHED",
          entity_type: "sync_job",
          entity_id: "sync_job_1",
          before_state: { status: "QUEUED" },
          after_state: { status: "PROCESSING" },
          reason: "Automated sync schedule",
          request_id: "req_2",
          correlation_id: "corr_alpha",
          created_at: new Date(baseTime + 10_000).toISOString(),
        },
        {
          id: "audit_3",
          organization_id: ORG_A_ID,
          actor_type: "CHANNEL",
          actor_id: null,
          action: "RECONCILIATION_RUN_STARTED",
          entity_type: "reconciliation",
          entity_id: "rec_run_1",
          before_state: null,
          after_state: { status: "PROCESSING" },
          reason: "Hourly reconciliation cycle",
          request_id: "req_3",
          correlation_id: "corr_beta",
          created_at: new Date(baseTime + 20_000).toISOString(),
        },
        {
          id: "audit_4",
          organization_id: ORG_A_ID,
          actor_type: "USER",
          actor_id: USER_ADMIN_A,
          action: "MEMBER_INVITED",
          entity_type: "organization_admin",
          entity_id: "user_new",
          before_state: null,
          after_state: { role: "OPERATOR" },
          reason: "New hire in warehouse",
          request_id: "req_4",
          correlation_id: "corr_gamma",
          created_at: new Date(baseTime + 30_000).toISOString(),
        },
        {
          id: "audit_5",
          organization_id: ORG_A_ID,
          actor_type: "USER",
          actor_id: USER_ADMIN_A,
          action: "INVENTORY_ADJUSTMENT",
          entity_type: "inventory_balance",
          entity_id: "sku-200",
          before_state: { on_hand: 20 },
          after_state: { on_hand: 10 },
          reason: "Water damage",
          request_id: "req_5",
          correlation_id: "corr_delta",
          created_at: new Date(baseTime + 40_000).toISOString(),
        },
      ];

      for (const rec of seedRecords) {
        await auditRepo.record(rec);
      }
    });

    it("should list all audit logs sorted by most recent first", async () => {
      const res = await auditDbService.list(ORG_A_ID);
      assert.equal(res.total, 5);
      assert.equal(res.items.length, 5);
      // Most recent should be audit_5
      assert.equal(res.items[0]?.id, "audit_5");
      assert.equal(res.items[4]?.id, "audit_1");
    });

    it("should filter by entityType and entityId", async () => {
      const res = await auditDbService.list(ORG_A_ID, {
        entityType: "inventory_balance",
        entityId: "sku-100",
      });
      assert.equal(res.total, 1);
      assert.equal(res.items[0]?.id, "audit_1");
      assert.equal(res.items[0]?.action, "INVENTORY_ADJUSTMENT");
    });

    it("should filter by action", async () => {
      const res = await auditDbService.list(ORG_A_ID, {
        action: "INVENTORY_ADJUSTMENT",
      });
      assert.equal(res.total, 2);
      assert.ok(res.items.every((i) => i.action === "INVENTORY_ADJUSTMENT"));
    });

    it("should filter by actorType and actorId", async () => {
      const systemRes = await auditDbService.list(ORG_A_ID, {
        actorType: "SYSTEM",
      });
      assert.equal(systemRes.total, 1);
      assert.equal(systemRes.items[0]?.id, "audit_2");

      const channelRes = await auditDbService.list(ORG_A_ID, {
        actorType: "CHANNEL",
      });
      assert.equal(channelRes.total, 1);
      assert.equal(channelRes.items[0]?.id, "audit_3");
    });

    it("should filter by correlationId", async () => {
      const res = await auditDbService.list(ORG_A_ID, {
        correlationId: "corr_alpha",
      });
      assert.equal(res.total, 2);
      assert.ok(res.items.some((i) => i.id === "audit_1"));
      assert.ok(res.items.some((i) => i.id === "audit_2"));
    });

    it("should filter by date range", async () => {
      const res = await auditDbService.list(ORG_A_ID, {
        startDate: "2026-10-01T10:00:15.000Z",
        endDate: "2026-10-01T10:00:35.000Z",
      });
      // Should match audit_3 (20s) and audit_4 (30s)
      assert.equal(res.total, 2);
      assert.equal(res.items[0]?.id, "audit_4");
      assert.equal(res.items[1]?.id, "audit_3");
    });

    it("should paginate correctly with limit and offset", async () => {
      const page1 = await auditDbService.list(ORG_A_ID, { limit: 2, offset: 0 });
      assert.equal(page1.total, 5);
      assert.equal(page1.items.length, 2);
      assert.equal(page1.items[0]?.id, "audit_5");
      assert.equal(page1.items[1]?.id, "audit_4");

      const page2 = await auditDbService.list(ORG_A_ID, { limit: 2, offset: 2 });
      assert.equal(page2.total, 5);
      assert.equal(page2.items.length, 2);
      assert.equal(page2.items[0]?.id, "audit_3");
      assert.equal(page2.items[1]?.id, "audit_2");

      const page3 = await auditDbService.list(ORG_A_ID, { limit: 2, offset: 4 });
      assert.equal(page3.items.length, 1);
      assert.equal(page3.items[0]?.id, "audit_1");
    });
  });

  // =========================================================================
  // 4. THE 8 CANONICAL MATERIAL MUTATION CATEGORIES AUDITED
  // =========================================================================
  describe("4. The 8 Canonical Material Mutation Categories Audited", () => {
    const corr = "corr-categories-test";

    it("1. Inventory adjustments: should record audit entry with before/after state", async () => {
      await auditDbService.recordInventoryAdjustment({
        organizationId: ORG_A_ID,
        actorType: "USER",
        actorId: USER_ADMIN_A,
        action: "INVENTORY_ADJUSTMENT",
        skuId: "sku-headphones",
        beforeState: { onHand: 100, available: 90 },
        afterState: { onHand: 90, available: 80 },
        reason: "Shrinkage detected during weekly audit",
        correlationId: corr,
      });

      const logs = await auditDbService.list(ORG_A_ID, { correlationId: corr });
      assert.equal(logs.total, 1);
      assert.equal(logs.items[0]?.action, "INVENTORY_ADJUSTMENT");
      assert.equal(logs.items[0]?.entity_type, "inventory_balance");
      assert.equal(logs.items[0]?.entity_id, "sku-headphones");
      assert.equal(logs.items[0]?.before_state?.onHand, 100);
      assert.equal(logs.items[0]?.after_state?.onHand, 90);
    });

    it("2. Reconciliation mutations: should record audit entry on approval", async () => {
      await auditDbService.recordReconciliation({
        organizationId: ORG_A_ID,
        actorType: "USER",
        actorId: USER_ADMIN_A,
        action: "RECONCILIATION_RESULT_APPROVED",
        runIdOrResultId: "rec_result_777",
        beforeState: { status: "REQUIRES_APPROVAL", delta: -2 },
        afterState: { status: "CORRECTED", targetQuantity: 48 },
        reason: "Approved physical inventory match",
        correlationId: corr,
      });

      const logs = await auditDbService.list(ORG_A_ID, { action: "RECONCILIATION_RESULT_APPROVED" });
      assert.equal(logs.total, 1);
      assert.equal(logs.items[0]?.entity_type, "reconciliation");
    });

    it("3. Mapping changes: should record audit entry on mapping creation", async () => {
      await auditDbService.recordMappingChange({
        organizationId: ORG_A_ID,
        actorType: "USER",
        actorId: USER_ADMIN_A,
        action: "MAPPING_CREATED",
        mappingId: "map_shopify_123",
        beforeState: null,
        afterState: { skuId: "sku-headphones", externalId: "gid://shopify/ProductVariant/999" },
        reason: "Initial channel onboarding",
        correlationId: corr,
      });

      const logs = await auditDbService.list(ORG_A_ID, { action: "MAPPING_CREATED" });
      assert.equal(logs.total, 1);
      assert.equal(logs.items[0]?.entity_type, "channel_product_mapping");
    });

    it("4. Exception resolution: should record audit entry on resolution", async () => {
      await auditDbService.recordExceptionResolution({
        organizationId: ORG_A_ID,
        actorType: "USER",
        actorId: USER_ADMIN_A,
        action: "EXCEPTION_RESOLVED",
        exceptionId: "ex_sync_fail_01",
        beforeState: { status: "OPEN" },
        afterState: { status: "RESOLVED" },
        reason: "Fixed invalid shopify credential scopes",
        correlationId: corr,
      });

      const logs = await auditDbService.list(ORG_A_ID, { action: "EXCEPTION_RESOLVED" });
      assert.equal(logs.total, 1);
      assert.equal(logs.items[0]?.entity_type, "exception");
    });

    it("5. Integration changes: should record audit entry on disconnect", async () => {
      await auditDbService.recordIntegrationChange({
        organizationId: ORG_A_ID,
        actorType: "USER",
        actorId: USER_ADMIN_A,
        action: "INTEGRATION_DISCONNECTED",
        channelAccountId: "channel_acc_shopify_main",
        beforeState: { status: "CONNECTED" },
        afterState: { status: "DISCONNECTED" },
        reason: "Merchant requested channel disconnection",
        correlationId: corr,
      });

      const logs = await auditDbService.list(ORG_A_ID, { action: "INTEGRATION_DISCONNECTED" });
      assert.equal(logs.total, 1);
      assert.equal(logs.items[0]?.entity_type, "channel_account");
    });

    it("6. Billing administrative actions: should record audit entry on plan upgrade", async () => {
      await auditDbService.recordBillingAction({
        organizationId: ORG_A_ID,
        actorType: "USER",
        actorId: USER_ADMIN_A,
        action: "BILLING_PLAN_CHANGED",
        billingId: "sub_stripe_12345",
        beforeState: { plan: "GROWTH" },
        afterState: { plan: "SCALE" },
        reason: "Merchant upgraded tier for higher sync capacity",
        correlationId: corr,
      });

      const logs = await auditDbService.list(ORG_A_ID, { action: "BILLING_PLAN_CHANGED" });
      assert.equal(logs.total, 1);
      assert.equal(logs.items[0]?.entity_type, "billing");
    });

    it("7. Dangerous bulk operations: should record audit entry on bulk adjustment", async () => {
      await auditDbService.recordBulkOperation({
        organizationId: ORG_A_ID,
        actorType: "USER",
        actorId: USER_ADMIN_A,
        action: "BULK_INVENTORY_ADJUSTMENT",
        bulkOperationId: "bulk_op_987",
        beforeState: { count: 250 },
        afterState: { appliedCount: 250, failedCount: 0 },
        reason: "Annual warehouse cycle recount import",
        correlationId: corr,
      });

      const logs = await auditDbService.list(ORG_A_ID, { action: "BULK_INVENTORY_ADJUSTMENT" });
      assert.equal(logs.total, 1);
      assert.equal(logs.items[0]?.entity_type, "bulk_operation");
    });

    it("8. Admin actions: should record audit entry on role change", async () => {
      await auditDbService.recordAdminAction({
        organizationId: ORG_A_ID,
        actorType: "USER",
        actorId: USER_ADMIN_A,
        action: "ROLE_CHANGED",
        targetId: "member_bob_123",
        beforeState: { role: "OPERATOR" },
        afterState: { role: "MANAGER" },
        reason: "Promoted to warehouse manager",
        correlationId: corr,
      });

      const logs = await auditDbService.list(ORG_A_ID, { action: "ROLE_CHANGED" });
      assert.equal(logs.total, 1);
      assert.equal(logs.items[0]?.entity_type, "organization_admin");
    });
  });

  // =========================================================================
  // 5. MULTI-TENANT ISOLATION (Org A vs Org B)
  // =========================================================================
  describe("5. Multi-Tenant Isolation Enforcement", () => {
    beforeEach(async () => {
      await auditRepo.record({
        id: "audit_org_a_secret",
        organization_id: ORG_A_ID,
        actor_type: "USER",
        actor_id: USER_ADMIN_A,
        action: "INVENTORY_ADJUSTMENT",
        entity_type: "inventory_balance",
        entity_id: "sku-laptop-org-a",
        correlation_id: "corr_tenant_a",
        created_at: new Date().toISOString(),
      });

      await auditRepo.record({
        id: "audit_org_b_secret",
        organization_id: ORG_B_ID,
        actor_type: "USER",
        actor_id: USER_ADMIN_B,
        action: "INVENTORY_ADJUSTMENT",
        entity_type: "inventory_balance",
        entity_id: "sku-laptop-org-b",
        correlation_id: "corr_tenant_b",
        created_at: new Date().toISOString(),
      });
    });

    it("should prevent Organization B from finding Organization A's audit record by ID", async () => {
      await assert.rejects(
        async () => {
          await auditDbService.findById(ORG_B_ID, "audit_org_a_secret");
        },
        (err: unknown) => {
          assert.ok(err instanceof TenantAccessDeniedError);
          assert.match(err.message, /Cross-tenant access violation/i);
          return true;
        }
      );
    });

    it("should strictly scope list query to authenticated organization", async () => {
      const orgAList = await auditDbService.list(ORG_A_ID);
      assert.equal(orgAList.total, 1);
      assert.equal(orgAList.items[0]?.id, "audit_org_a_secret");

      const orgBList = await auditDbService.list(ORG_B_ID);
      assert.equal(orgBList.total, 1);
      assert.equal(orgBList.items[0]?.id, "audit_org_b_secret");
    });

    it("HTTP: Org B user is forbidden from retrieving Org A audit record", async () => {
      const res = await fetch(`${baseUrl}/audit/audit_org_a_secret`, {
        headers: {
          Authorization: "Bearer token_admin_org_b",
        },
      });

      assert.equal(res.status, 403);
      const body = (await res.json()) as any;
      assert.equal(body.error.code, "FORBIDDEN");
      assert.match(body.error.message, /Tenant isolation violation|Cross-tenant/i);
    });
  });

  // =========================================================================
  // 6. ROLE-BASED ACCESS CONTROL (RBAC)
  // =========================================================================
  describe("6. Role-Based Access Control (RBAC)", () => {
    beforeEach(async () => {
      await auditRepo.record({
        id: "audit_rbac_test",
        organization_id: ORG_A_ID,
        actor_type: "USER",
        actor_id: USER_ADMIN_A,
        action: "INVENTORY_ADJUSTMENT",
        entity_type: "inventory_balance",
        entity_id: "sku-phone",
        correlation_id: "corr_rbac",
        created_at: new Date().toISOString(),
      });
    });

    it("ADMIN role can access GET /audit", async () => {
      const res = await fetch(`${baseUrl}/audit`, {
        headers: {
          Authorization: "Bearer token_admin_org_a",
        },
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.ok(Array.isArray(body.data));
      assert.equal(body.data.length, 1);
    });

    it("VIEWER role is forbidden from GET /audit (lacks audit:read)", async () => {
      const res = await fetch(`${baseUrl}/audit`, {
        headers: {
          Authorization: "Bearer token_viewer_org_a",
        },
      });

      assert.equal(res.status, 403);
      const body = (await res.json()) as any;
      assert.equal(body.error.code, "FORBIDDEN");
      assert.match(body.error.message, /lacks required permission 'audit:read'/i);
    });

    it("VIEWER role is forbidden from GET /audit/:id", async () => {
      const res = await fetch(`${baseUrl}/audit/audit_rbac_test`, {
        headers: {
          Authorization: "Bearer token_viewer_org_a",
        },
      });

      assert.equal(res.status, 403);
      const body = (await res.json()) as any;
      assert.equal(body.error.code, "FORBIDDEN");
    });
  });

  // =========================================================================
  // 7. REST API ENDPOINTS & STANDARD ENVELOPES
  // =========================================================================
  describe("7. REST API Endpoints & Standard Envelopes", () => {
    beforeEach(async () => {
      await auditRepo.record({
        id: "audit_api_001",
        organization_id: ORG_A_ID,
        actor_type: "USER",
        actor_id: USER_ADMIN_A,
        action: "INVENTORY_ADJUSTMENT",
        entity_type: "inventory_balance",
        entity_id: "sku-watch",
        before_state: { on_hand: 50 },
        after_state: { on_hand: 40 },
        reason: "Sold in physical showroom",
        request_id: "req_api_1",
        correlation_id: "corr_api_test",
        created_at: new Date().toISOString(),
      });
    });

    it("GET /audit: returns 200 OK with envelope and pagination metadata", async () => {
      const res = await fetch(`${baseUrl}/audit?limit=10&page=1`, {
        headers: { Authorization: "Bearer token_admin_org_a" },
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.ok(body.data);
      assert.equal(body.data.length, 1);
      assert.equal(body.data[0].id, "audit_api_001");
      assert.equal(body.data[0].action, "INVENTORY_ADJUSTMENT");
      assert.equal(body.data[0].beforeState?.on_hand, 50);
      assert.equal(body.data[0].afterState?.on_hand, 40);
      assert.ok(body.meta.pagination);
      assert.equal(body.meta.pagination.total, 1);
      assert.equal(body.meta.pagination.hasMore, false);
    });

    it("GET /audit/:id: returns 200 OK with single record envelope", async () => {
      const res = await fetch(`${baseUrl}/audit/audit_api_001`, {
        headers: { Authorization: "Bearer token_admin_org_a" },
      });

      assert.equal(res.status, 200);
      const body = (await res.json()) as any;
      assert.equal(body.data.id, "audit_api_001");
      assert.equal(body.data.entityType, "inventory_balance");
      assert.equal(body.data.entityId, "sku-watch");
    });

    it("GET /audit/:id: returns 404 AUDIT_LOG_NOT_FOUND if id does not exist", async () => {
      const res = await fetch(`${baseUrl}/audit/non_existent_id`, {
        headers: { Authorization: "Bearer token_admin_org_a" },
      });

      assert.equal(res.status, 404);
      const body = (await res.json()) as any;
      assert.equal(body.error.code, "AUDIT_LOG_NOT_FOUND");
    });

    it("GET /audit/export: exports CSV format conforming to RFC 4180", async () => {
      const res = await fetch(`${baseUrl}/audit/export?format=csv`, {
        headers: { Authorization: "Bearer token_admin_org_a" },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "text/csv; charset=utf-8");
      const csv = await res.text();
      assert.ok(csv.includes("id,created_at,action,actor_type"));
      assert.ok(csv.includes("audit_api_001"));
      assert.ok(csv.includes("INVENTORY_ADJUSTMENT"));
      assert.ok(csv.includes("Sold in physical showroom"));
    });

    it("GET /audit/export: exports JSON format", async () => {
      const res = await fetch(`${baseUrl}/audit/export?format=json`, {
        headers: { Authorization: "Bearer token_admin_org_a" },
      });

      assert.equal(res.status, 200);
      assert.equal(res.headers.get("content-type"), "application/json; charset=utf-8");
      const json = (await res.json()) as any[];
      assert.ok(Array.isArray(json));
      assert.equal(json.length, 1);
      assert.equal(json[0].id, "audit_api_001");
    });
  });

  // =========================================================================
  // 8. THE CANONICAL ACCEPTANCE TEST (Prompt 21 & Section 114)
  // =========================================================================
  describe("8. THE CANONICAL ACCEPTANCE TEST (Section 114 & Prompt 21)", () => {
    /**
     * Requirement:
     * "Given an inventory discrepancy, an administrator must be able to reconstruct:
     * before
     * event
     * actor
     * reason
     * after
     * channel impact
     * synchronization result
     * resolution"
     */
    it("should reconstruct the complete 8-part incident causal chain from an inventory discrepancy", async () => {
      const incidentCorrelationId = "incident-sku-555-discrepancy-chain";
      const skuId = "sku-555-ultra-display";
      const baseTime = new Date("2026-10-02T14:00:00.000Z").getTime();

      // Step 1: Physical Warehouse Recount Discrepancy (before state: 50, after: 42, reason: "Defective units removed")
      await auditRepo.record({
        id: "step_1_inventory_adjustment",
        organization_id: ORG_A_ID,
        actor_type: "USER",
        actor_id: USER_ADMIN_A,
        action: "INVENTORY_RECOUNT",
        entity_type: "inventory_balance",
        entity_id: skuId,
        before_state: { on_hand: 50, available: 45, reserved: 5 },
        after_state: { on_hand: 42, available: 37, reserved: 5 },
        reason: "Defective packaging discovered during safety sweep",
        request_id: "req_rec_001",
        correlation_id: incidentCorrelationId,
        created_at: new Date(baseTime).toISOString(),
      });

      // Step 2: Channel Outbound Sync Dispatched (Channel impact: previous 45 -> target 37)
      await auditRepo.record({
        id: "step_2_channel_sync_dispatched",
        organization_id: ORG_A_ID,
        actor_type: "SYSTEM",
        actor_id: null,
        action: "SYNC_OUTBOUND_DISPATCHED",
        entity_type: "channel_account",
        entity_id: "channel_shopify_store",
        before_state: {
          channelAccountId: "channel_shopify_store",
          channelName: "Shopify US Flagship",
          previousChannelQuantity: 45,
          targetChannelQuantity: 37,
        },
        after_state: {
          channelAccountId: "channel_shopify_store",
          channelName: "Shopify US Flagship",
          previousChannelQuantity: 45,
          targetChannelQuantity: 37,
          channelStatus: "SYNCING",
        },
        reason: "Automated delta inventory push",
        request_id: "req_rec_002",
        correlation_id: incidentCorrelationId,
        created_at: new Date(baseTime + 5_000).toISOString(),
      });

      // Step 3: Synchronization Verification Succeeds (Synchronization result: VERIFIED, syncJobId)
      await auditRepo.record({
        id: "step_3_sync_verified",
        organization_id: ORG_A_ID,
        actor_type: "SYSTEM",
        actor_id: null,
        action: "SYNC_READ_BACK_VERIFIED",
        entity_type: "sync_job",
        entity_id: "sync_job_9999",
        before_state: { stage: "VERIFYING" },
        after_state: {
          syncJobId: "sync_job_9999",
          syncStatus: "VERIFIED",
          stage: "VERIFIED",
          verifiedAt: new Date(baseTime + 12_000).toISOString(),
          quantityObserved: 37,
        },
        reason: "Shopify GraphQL inventoryItem read-back matched target (37 === 37)",
        request_id: "req_rec_003",
        correlation_id: incidentCorrelationId,
        created_at: new Date(baseTime + 12_000).toISOString(),
      });

      // Step 4: Discrepancy Exception Resolution Closed by Warehouse Admin
      await auditRepo.record({
        id: "step_4_resolution_closed",
        organization_id: ORG_A_ID,
        actor_type: "USER",
        actor_id: USER_ADMIN_A,
        action: "EXCEPTION_RESOLVED",
        entity_type: "exception",
        entity_id: "ex_discrepancy_555",
        before_state: { status: "INVESTIGATING" },
        after_state: { status: "RESOLVED", notes: "Count reconciled and verified across Shopify" },
        reason: "Discrepancy fully investigated and confirmed by supervisor",
        request_id: "req_rec_004",
        correlation_id: incidentCorrelationId,
        created_at: new Date(baseTime + 20_000).toISOString(),
      });

      // --- Execute Reconstruction via Domain / Database Service ---
      const reconstructed = await auditDbService.reconstructDiscrepancy(ORG_A_ID, {
        correlationId: incidentCorrelationId,
      });

      // 1. BEFORE STATE
      assert.ok(reconstructed.before, "Must reconstruct before state");
      assert.equal(reconstructed.before?.on_hand, 50);
      assert.equal(reconstructed.before?.available, 45);

      // 2. EVENT
      assert.equal(reconstructed.event, "INVENTORY_RECOUNT");

      // 3. ACTOR
      assert.equal(reconstructed.actor.type, "USER");
      assert.equal(reconstructed.actor.id, USER_ADMIN_A);

      // 4. REASON
      assert.equal(reconstructed.reason, "Defective packaging discovered during safety sweep");

      // 5. AFTER STATE
      assert.ok(reconstructed.after, "Must reconstruct after state");
      assert.equal(reconstructed.after?.status, "RESOLVED");

      // 6. CHANNEL IMPACT
      assert.ok(reconstructed.channelImpact, "Must reconstruct channel impact");
      assert.equal(reconstructed.channelImpact?.channelAccountId, "channel_shopify_store");
      assert.equal(reconstructed.channelImpact?.channelName, "Shopify US Flagship");
      assert.equal(reconstructed.channelImpact?.previousChannelQuantity, 45);
      assert.equal(reconstructed.channelImpact?.targetChannelQuantity, 37);

      // 7. SYNCHRONIZATION RESULT
      assert.ok(reconstructed.synchronizationResult, "Must reconstruct synchronization result");
      assert.equal(reconstructed.synchronizationResult?.syncJobId, "sync_job_9999");
      assert.equal(reconstructed.synchronizationResult?.status, "VERIFIED");
      assert.equal(reconstructed.synchronizationResult?.stage, "VERIFIED");
      assert.ok(reconstructed.synchronizationResult?.verifiedAt);

      // 8. RESOLUTION
      assert.ok(reconstructed.resolution, "Must reconstruct resolution");
      assert.equal(reconstructed.resolution?.status, "RESOLVED");
      assert.equal(reconstructed.resolution?.resolvedBy, USER_ADMIN_A);
      assert.equal(
        reconstructed.resolution?.notes,
        "Discrepancy fully investigated and confirmed by supervisor"
      );

      // Entire timeline verified
      assert.equal(reconstructed.timeline.length, 4);

      // --- Verify over HTTP GET /audit/reconstruct/:correlationId ---
      const httpRes = await fetch(`${baseUrl}/audit/reconstruct/${incidentCorrelationId}`, {
        headers: {
          Authorization: "Bearer token_admin_org_a",
        },
      });

      assert.equal(httpRes.status, 200);
      const httpBody = (await httpRes.json()) as any;
      const apiRecon: AuditReconstruction = httpBody.data;

      assert.equal(apiRecon.event, "INVENTORY_RECOUNT");
      assert.equal(apiRecon.actor.type, "USER");
      assert.equal(apiRecon.actor.id, USER_ADMIN_A);
      assert.equal(apiRecon.channelImpact?.channelAccountId, "channel_shopify_store");
      assert.equal(apiRecon.synchronizationResult?.status, "VERIFIED");
      assert.equal(apiRecon.resolution?.status, "RESOLVED");
    });
  });
});
