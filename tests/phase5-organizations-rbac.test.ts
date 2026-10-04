import { describe, it, before, after } from "node:test";
import * as assert from "node:assert/strict";
import { Server } from "node:http";
import {
  hasPermission,
  assertPermission,
  normalizeRole,
  PermissionDeniedError,
  TenantAccessDeniedError,
  validateTenantAccess,
  enforceTenantScope,
  TenantIsolatedRepository,
  OrganizationService,
  type TenantContext,
  SupabaseAuthAdapter,
} from "@platform/security";
import type { OrganizationId, UserId } from "@platform/domain";
import { startApiServer } from "@platform/api";
import { SupabaseClient } from "@supabase/supabase-js";

function createMockAuthForOrgTesting() {
  const users = new Map<string, { id: string; email: string; user_metadata: Record<string, unknown> }>();

  const client = {
    auth: {
      async getUser(token: string) {
        if (token === "token_org_a_owner") {
          return {
            data: {
              user: {
                id: "u-owner-a",
                email: "owner-a@example.com",
                user_metadata: {
                  organization_id: "00000000-0000-0000-0000-00000000000a",
                  organization_name: "Organization Alpha",
                  slug: "org-alpha",
                  role: "OWNER",
                },
              },
            },
            error: null,
          };
        }

        if (token === "token_org_a_viewer") {
          return {
            data: {
              user: {
                id: "u-viewer-a",
                email: "viewer-a@example.com",
                user_metadata: {
                  organization_id: "00000000-0000-0000-0000-00000000000a",
                  organization_name: "Organization Alpha",
                  slug: "org-alpha",
                  role: "VIEWER",
                },
              },
            },
            error: null,
          };
        }

        if (token === "token_org_b_owner") {
          return {
            data: {
              user: {
                id: "u-owner-b",
                email: "owner-b@example.com",
                user_metadata: {
                  organization_id: "00000000-0000-0000-0000-00000000000b",
                  organization_name: "Organization Beta",
                  slug: "org-beta",
                  role: "OWNER",
                },
              },
            },
            error: null,
          };
        }

        return { data: { user: null }, error: { message: "Invalid token", status: 401 } };
      },
    },
  };

  return client as unknown as SupabaseClient;
}

describe("Phase 5: Organizations and RBAC Acceptance Suite", () => {
  describe("1. System Roles & RBAC Permission Checks", () => {
    it("should normalize role names correctly", () => {
      assert.equal(normalizeRole("OWNER"), "OWNER");
      assert.equal(normalizeRole("Owner"), "OWNER");
      assert.equal(normalizeRole("admin"), "ADMIN");
      assert.equal(normalizeRole("MANAGER"), "MANAGER");
      assert.equal(normalizeRole("InventoryManager"), "MANAGER");
      assert.equal(normalizeRole("OPERATOR"), "OPERATOR");
      assert.equal(normalizeRole("VIEWER"), "VIEWER");
    });

    it("should grant inventory:adjust to OWNER, ADMIN, MANAGER, OPERATOR, but deny VIEWER", () => {
      assert.equal(hasPermission("OWNER", "inventory:adjust"), true);
      assert.equal(hasPermission("ADMIN", "inventory:adjust"), true);
      assert.equal(hasPermission("MANAGER", "inventory:adjust"), true);
      assert.equal(hasPermission("OPERATOR", "inventory:adjust"), true);
      assert.equal(hasPermission("VIEWER", "inventory:adjust"), false);

      assert.doesNotThrow(() => assertPermission("OPERATOR", "inventory:adjust"));
      assert.throws(() => assertPermission("VIEWER", "inventory:adjust"), PermissionDeniedError);
    });

    it("should grant reconciliation:write to OWNER, ADMIN, MANAGER, but deny OPERATOR and VIEWER", () => {
      assert.equal(hasPermission("OWNER", "reconciliation:write"), true);
      assert.equal(hasPermission("ADMIN", "reconciliation:write"), true);
      assert.equal(hasPermission("MANAGER", "reconciliation:write"), true);
      assert.equal(hasPermission("OPERATOR", "reconciliation:write"), false);
      assert.equal(hasPermission("VIEWER", "reconciliation:write"), false);
    });

    it("should grant integration management (channels:write) strictly to OWNER and ADMIN", () => {
      assert.equal(hasPermission("OWNER", "channels:write"), true);
      assert.equal(hasPermission("ADMIN", "channels:write"), true);
      assert.equal(hasPermission("MANAGER", "channels:write"), false);
      assert.equal(hasPermission("OPERATOR", "channels:write"), false);
      assert.equal(hasPermission("VIEWER", "channels:write"), false);
    });

    it("should grant member management (organization:manage, users:manage) to OWNER and ADMIN", () => {
      assert.equal(hasPermission("OWNER", "organization:manage"), true);
      assert.equal(hasPermission("ADMIN", "organization:manage"), true);
      assert.equal(hasPermission("MANAGER", "organization:manage"), false);
      assert.equal(hasPermission("VIEWER", "organization:manage"), false);
    });

    it("should grant billing management (billing:manage) strictly to OWNER and ADMIN", () => {
      assert.equal(hasPermission("OWNER", "billing:manage"), true);
      assert.equal(hasPermission("ADMIN", "billing:manage"), true);
      assert.equal(hasPermission("MANAGER", "billing:manage"), false);
      assert.equal(hasPermission("OPERATOR", "billing:manage"), false);
      assert.equal(hasPermission("VIEWER", "billing:manage"), false);
    });

    it("should grant administrative actions (admin:action) strictly to OWNER and ADMIN", () => {
      assert.equal(hasPermission("OWNER", "admin:action"), true);
      assert.equal(hasPermission("ADMIN", "admin:action"), true);
      assert.equal(hasPermission("MANAGER", "admin:action"), false);
    });

    it("should restrict dangerous bulk operations (inventory:bulk_operation) to OWNER and ADMIN", () => {
      assert.equal(hasPermission("OWNER", "inventory:bulk_operation"), true);
      assert.equal(hasPermission("ADMIN", "inventory:bulk_operation"), true);
      assert.equal(hasPermission("MANAGER", "inventory:bulk_operation"), false);
      assert.equal(hasPermission("OPERATOR", "inventory:bulk_operation"), false);
      assert.equal(hasPermission("VIEWER", "inventory:bulk_operation"), false);

      assert.throws(
        () => assertPermission("MANAGER", "inventory:bulk_operation"),
        PermissionDeniedError
      );
    });
  });

  describe("2. Server-Side Organization Context & API Endpoints", () => {
    let apiServer: Server;
    let baseUrl: string;
    let orgService: OrganizationService;

    before((_, done) => {
      orgService = new OrganizationService();
      const mockAuth = createMockAuthForOrgTesting();
      const authAdapter = new SupabaseAuthAdapter(mockAuth);

      apiServer = startApiServer({
        portOverride: 0,
        authAdapter,
        organizationService: orgService,
      });

      apiServer.on("listening", () => {
        const addr = apiServer.address();
        if (typeof addr === "object" && addr !== null) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
          done();
        }
      });
    });

    after((_, done) => {
      apiServer.close(() => done());
    });

    it("GET /organizations/current should return current organization for authenticated user", async () => {
      const res = await fetch(`${baseUrl}/organizations/current`, {
        headers: { Authorization: "Bearer token_org_a_owner" },
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.id, "00000000-0000-0000-0000-00000000000a");
    });

    it("PATCH /organizations/current should allow OWNER to update organization name", async () => {
      const res = await fetch(`${baseUrl}/organizations/current`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer token_org_a_owner",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Alpha Enterprises Ltd" }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.name, "Alpha Enterprises Ltd");
    });

    it("PATCH /organizations/current should forbid VIEWER from updating organization name", async () => {
      const res = await fetch(`${baseUrl}/organizations/current`, {
        method: "PATCH",
        headers: {
          Authorization: "Bearer token_org_a_viewer",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ name: "Malicious Rename" }),
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.error.code, "FORBIDDEN");
    });

    it("POST /organizations/current/members should allow OWNER to add a member", async () => {
      const res = await fetch(`${baseUrl}/organizations/current/members`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token_org_a_owner",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "colleague@example.com",
          name: "Colleague",
          role: "MANAGER",
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.equal(json.data.email, "colleague@example.com");
      assert.equal(json.data.role, "MANAGER");
      assert.equal(json.data.organizationId, "00000000-0000-0000-0000-00000000000a");
    });

    it("POST /organizations/current/members should forbid VIEWER from adding members", async () => {
      const res = await fetch(`${baseUrl}/organizations/current/members`, {
        method: "POST",
        headers: {
          Authorization: "Bearer token_org_a_viewer",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email: "unauthorized@example.com",
          name: "Unauthorized",
          role: "ADMIN",
        }),
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.error.code, "FORBIDDEN");
    });
  });

  describe("3. TENANT ISOLATION TEST (Canonical Prompt 06 Gate)", () => {
    const orgAId = "00000000-0000-0000-0000-00000000000a";
    const orgBId = "00000000-0000-0000-0000-00000000000b";

    const contextA: TenantContext = {
      organizationId: orgAId as unknown as OrganizationId,
      userId: "u-a1" as unknown as UserId,
      role: "OWNER",
      permissions: [],
    };

    const contextB: TenantContext = {
      organizationId: orgBId as unknown as OrganizationId,
      userId: "u-b1" as unknown as UserId,
      role: "OWNER",
      permissions: [],
    };

    // Instantiate repositories for all 6 required entities
    const productRepo = new TenantIsolatedRepository<{ id: string; organizationId: string; title: string }>("products");
    const inventoryRepo = new TenantIsolatedRepository<{ id: string; organizationId: string; onHand: number }>("inventory");
    const orderRepo = new TenantIsolatedRepository<{ id: string; organizationId: string; orderNumber: string }>("orders");
    const exceptionRepo = new TenantIsolatedRepository<{ id: string; organizationId: string; title: string }>("exceptions");
    const integrationRepo = new TenantIsolatedRepository<{ id: string; organizationId: string; provider: string }>("integrations");
    const auditRepo = new TenantIsolatedRepository<{ id: string; organizationId: string; action: string }>("audit_logs");

    before(() => {
      // Seed Organization B's data
      productRepo.save(contextB, { id: "p-b1", organizationId: orgBId, title: "Org B Product" });
      inventoryRepo.save(contextB, { id: "inv-b1", organizationId: orgBId, onHand: 50 });
      orderRepo.save(contextB, { id: "ord-b1", organizationId: orgBId, orderNumber: "ORD-B-1001" });
      exceptionRepo.save(contextB, { id: "exc-b1", organizationId: orgBId, title: "Org B Discrepancy" });
      integrationRepo.save(contextB, { id: "int-b1", organizationId: orgBId, provider: "SHOPIFY" });
      auditRepo.save(contextB, { id: "aud-b1", organizationId: orgBId, action: "INVENTORY_SYNC" });
    });

    it("should fail when Organization A attempts access to B products", () => {
      assert.throws(
        () => productRepo.getById(contextA, "p-b1"),
        TenantAccessDeniedError
      );
      assert.throws(
        () => validateTenantAccess(contextA, orgBId),
        TenantAccessDeniedError
      );
    });

    it("should fail when Organization A attempts access to B inventory", () => {
      assert.throws(
        () => inventoryRepo.getById(contextA, "inv-b1"),
        TenantAccessDeniedError
      );
      assert.throws(
        () => inventoryRepo.save(contextA, { id: "inv-b1", organizationId: orgBId, onHand: 999 }),
        TenantAccessDeniedError
      );
    });

    it("should fail when Organization A attempts access to B orders", () => {
      assert.throws(
        () => orderRepo.getById(contextA, "ord-b1"),
        TenantAccessDeniedError
      );
      assert.throws(
        () => orderRepo.delete(contextA, "ord-b1"),
        TenantAccessDeniedError
      );
    });

    it("should fail when Organization A attempts access to B exceptions", () => {
      assert.throws(
        () => exceptionRepo.getById(contextA, "exc-b1"),
        TenantAccessDeniedError
      );
    });

    it("should fail when Organization A attempts access to B integrations", () => {
      assert.throws(
        () => integrationRepo.getById(contextA, "int-b1"),
        TenantAccessDeniedError
      );
    });

    it("should fail when Organization A attempts access to B audit records", () => {
      assert.throws(
        () => auditRepo.getById(contextA, "aud-b1"),
        TenantAccessDeniedError
      );
    });

    it("should never trust frontend organization ID and override it with server tenant context", () => {
      const clientPayload = {
        title: "Injected Product",
        organizationId: orgBId, // Malicious attempt to inject into Org B
      };

      const secured = enforceTenantScope(contextA, clientPayload);
      assert.equal(secured.organizationId, orgAId, "Server MUST override frontend organizationId with authenticated context");
    });

    it("should only return Organization A items when listing resources", () => {
      // Add Org A item
      productRepo.save(contextA, { id: "p-a1", organizationId: orgAId, title: "Org A Product" });

      const listA = productRepo.list(contextA);
      assert.equal(listA.length, 1);
      assert.equal(listA[0]?.id, "p-a1");

      const listB = productRepo.list(contextB);
      assert.equal(listB.length, 1);
      assert.equal(listB[0]?.id, "p-b1");
    });
  });
});
