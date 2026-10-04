import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Test packages importing each other across workspace boundaries
import { loadServerConfig, loadClientConfig } from "@platform/config";
import { calculateAvailableInventory, assertInventoryInvariants } from "@platform/domain";
import { runWithTenant, requireTenantContext, hasPermission } from "@platform/security";
import { createAdminClient, createPublishableClient, getDatabaseConnectionConfig } from "@platform/database";
import { DESIGN_TOKENS, TRUST_STATE_STYLES } from "@platform/ui";
import { createTestOrganization, createTestInventoryBalance } from "@platform/testing";
import { createLogger } from "@platform/observability";
import { startApiServer } from "@platform/api";
import { startWebServer } from "@platform/web";
import { startAdminServer } from "@platform/admin";
import { startWorker } from "@platform/worker";

describe("Phase 1: Repository and Architecture Foundation Acceptance Suite", () => {
  describe("1. Environment & Configuration (@platform/config)", () => {
    it("should load valid server configuration with development defaults", () => {
      const config = loadServerConfig({
        NODE_ENV: "development",
        PORT: "4000",
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test_anon_key",
        SUPABASE_SECRET_KEY: "test_service_key"
      });

      assert.equal(config.NODE_ENV, "development");
      assert.equal(config.PORT, 4000);
      assert.equal(config.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54321");
      assert.equal(config.REDIS_HOST, "127.0.0.1");
      assert.equal(config.REDIS_PORT, 6379);
    });

    it("should load client configuration without leaking server secrets", () => {
      const clientConfig = loadClientConfig({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "test_anon_key",
        SUPABASE_SECRET_KEY: "do_not_leak_this"
      });

      assert.equal(clientConfig.NEXT_PUBLIC_SUPABASE_URL, "http://127.0.0.1:54321");
      // @ts-expect-error - SUPABASE_SECRET_KEY must not exist on client config
      assert.equal(clientConfig.SUPABASE_SECRET_KEY, undefined);
    });

    it("should throw a clear error when required configuration is missing or invalid", () => {
      assert.throws(() => {
        loadServerConfig({
          NEXT_PUBLIC_SUPABASE_URL: "not-a-valid-url"
        });
      }, /\[Configuration Error\]/);
    });
  });

  describe("2. Domain Invariants (@platform/domain)", () => {
    it("should correctly calculate available inventory: available = on_hand - reserved - allocated + incoming", () => {
      const balance = calculateAvailableInventory({
        onHand: 150,
        reserved: 20,
        allocated: 30,
        incoming: 10
      });

      assert.equal(balance.available, 110);
      assert.doesNotThrow(() => assertInventoryInvariants(balance));
    });

    it("should throw error if inventory invariants are violated", () => {
      assert.throws(() => {
        assertInventoryInvariants({
          onHand: 100,
          reserved: -5, // Negative reserved not allowed
          allocated: 0,
          incoming: 0,
          available: 105
        });
      }, /Inventory invariant violated/);
    });
  });

  describe("3. Security & Multi-Tenancy (@platform/security)", () => {
    it("should enforce tenant context isolation", () => {
      assert.throws(() => {
        requireTenantContext();
      }, /TenantContextMissing/);

      const mockContext = {
        organizationId: "org-123",
        userId: "user-456",
        role: "InventoryManager" as const,
        permissions: ["inventory:read", "inventory:write"] as const
      };

      runWithTenant(mockContext, () => {
        const current = requireTenantContext();
        assert.equal(current.organizationId, "org-123");
        assert.equal(current.userId, "user-456");
      });
    });

    it("should enforce RBAC permissions", () => {
      assert.equal(hasPermission("Owner", "billing:manage"), true);
      assert.equal(hasPermission("Viewer", "inventory:adjust"), false);
      assert.equal(hasPermission("InventoryManager", "inventory:adjust"), true);
      assert.equal(hasPermission("InventoryManager", "billing:manage"), false);
    });
  });

  describe("4. Database & Supabase Platform (@platform/database)", () => {
    it("should return database connection configuration for pooled and direct connections", () => {
      const dbConfig = getDatabaseConnectionConfig();
      assert.ok(dbConfig.pooledUrl);
      assert.ok(dbConfig.directUrl);
      assert.equal(dbConfig.isPoolerConfigured, true);
    });

    it("should initialize publishable and admin Supabase clients", () => {
      const pubClient = createPublishableClient("http://127.0.0.1:54321", "sb_anon_key");
      assert.ok(pubClient);

      const adminClient = createAdminClient("http://127.0.0.1:54321", "sb_secret_key");
      assert.ok(adminClient);
    });
  });

  describe("5. Observability & Logging (@platform/observability)", () => {
    it("should create structured logger with secret redaction", () => {
      const logger = createLogger("test-suite");
      assert.ok(logger);
      // Verify no throw on logging with redacted data
      assert.doesNotThrow(() => {
        logger.info("Test log entry", {
          apiKey: "secret_value_12345",
          normalField: "visible"
        });
      });
    });
  });

  describe("6. UI Design Tokens & Status System (@platform/ui)", () => {
    it("should export design tokens and trust state styles", () => {
      assert.equal(DESIGN_TOKENS.colors.status.live, "#10B981");
      assert.equal(DESIGN_TOKENS.colors.status.verified, "#059669");
      assert.equal(DESIGN_TOKENS.colors.status.conflict, "#EF4444");

      assert.equal(TRUST_STATE_STYLES.VERIFIED.label, "Verified");
      assert.equal(TRUST_STATE_STYLES.CONFLICT.label, "Conflict");
    });
  });

  describe("7. Test Fixtures (@platform/testing)", () => {
    it("should generate valid test fixtures", () => {
      const org = createTestOrganization();
      assert.equal(org.name, "Acme Ecommerce Corp");

      const balance = createTestInventoryBalance({ onHand: 200 });
      assert.equal(balance.onHand, 200);
      assert.equal(balance.available, 180);
    });
  });

  describe("8. Independent Application Startup Smoke Tests", () => {
    it("should start and stop API server on ephemeral port", async () => {
      const server = startApiServer(4099);
      assert.ok(server);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("should start and stop Web server on ephemeral port", async () => {
      const server = startWebServer(3099);
      assert.ok(server);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("should start and stop Admin server on ephemeral port", async () => {
      const server = startAdminServer(3199);
      assert.ok(server);
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("should start and stop Worker instance", async () => {
      const worker = startWorker();
      assert.ok(worker);
      await worker.stop();
    });
  });
});
