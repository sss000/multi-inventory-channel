import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import * as path from "node:path";
import * as fs from "node:fs";
import {
  validateSchemaMigrations,
  CANONICAL_ENTITIES,
  TENANT_SCOPED_TABLES,
  calculateSellableAvailable,
  validateInventoryBalanceConstraints,
  assertInventoryVersion,
  OptimisticLockConflictError,
  InventoryBalanceInvariantError,
  withTransactionBoundary,
  createAdminClient,
  createPublishableClient,
} from "@platform/database";

describe("Phase 3: Database Foundation Acceptance Suite", () => {
  const migrationsDir = path.resolve(process.cwd(), "supabase", "migrations");
  const seedFile = path.resolve(process.cwd(), "supabase", "seed.sql");

  describe("1. Migration File Structure & Organization", () => {
    it("should find supabase/migrations with sequential versioned SQL files", () => {
      assert.ok(fs.existsSync(migrationsDir), "Migrations directory must exist at supabase/migrations");
      const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql"));
      assert.ok(files.length >= 2, "Must contain at least 2 migration files");
      assert.ok(files.includes("20260928000001_core_schema.sql"), "Core schema migration must exist");
      assert.ok(files.includes("20260928000002_row_level_security.sql"), "RLS policies migration must exist");
    });

    it("should have a valid supabase/seed.sql file", () => {
      assert.ok(fs.existsSync(seedFile), "Seed file must exist at supabase/seed.sql");
      const seedContent = fs.readFileSync(seedFile, "utf-8");
      assert.match(seedContent, /INSERT\s+INTO\s+channels/i);
      assert.match(seedContent, /INSERT\s+INTO\s+roles/i);
      assert.match(seedContent, /INSERT\s+INTO\s+organizations/i);
      assert.match(seedContent, /SHOPIFY/);
      assert.match(seedContent, /AMAZON/);
      assert.match(seedContent, /OWNER/);
    });
  });

  describe("2. Canonical Entity Coverage", () => {
    const validation = validateSchemaMigrations(migrationsDir);

    it("should implement all 25 canonical database entities specified in 01_ENGINEERING_SPEC.md", () => {
      assert.equal(validation.missingEntities.length, 0, `Missing entities: ${validation.missingEntities.join(", ")}`);
      assert.equal(validation.discoveredEntities.length, CANONICAL_ENTITIES.length);
      for (const entity of CANONICAL_ENTITIES) {
        assert.ok(validation.discoveredEntities.includes(entity), `Entity ${entity} must be created`);
      }
    });

    it("should enforce required unique constraints", () => {
      assert.equal(
        validation.missingUniqueConstraints.length,
        0,
        `Missing unique constraints: ${validation.missingUniqueConstraints.join(", ")}`
      );
      assert.ok(validation.discoveredUniqueConstraints.includes("skus(organization_id, code)"));
      assert.ok(validation.discoveredUniqueConstraints.includes("inventory_balances(organization_id, sku_id, warehouse_id)"));
      assert.ok(validation.discoveredUniqueConstraints.includes("channel_accounts(organization_id, channel_id, external_account_id)"));
      assert.ok(validation.discoveredUniqueConstraints.includes("orders(organization_id, channel_account_id, external_order_id)"));
      assert.ok(validation.discoveredUniqueConstraints.includes("returns(organization_id, external_return_id)"));
      assert.ok(validation.discoveredUniqueConstraints.includes("inventory_events(idempotency_key)"));
      assert.ok(validation.discoveredUniqueConstraints.includes("sync_jobs(idempotency_key)"));
    });
  });

  describe("3. Row Level Security (RLS) Multi-Tenant Policies", () => {
    const validation = validateSchemaMigrations(migrationsDir);

    it("should enable RLS on all 24 tenant-scoped tables", () => {
      assert.equal(
        validation.missingRlsTables.length,
        0,
        `Missing RLS on tables: ${validation.missingRlsTables.join(", ")}`
      );
      assert.equal(validation.tablesWithRls.length, TENANT_SCOPED_TABLES.length);
      for (const table of TENANT_SCOPED_TABLES) {
        assert.ok(validation.tablesWithRls.includes(table), `Table ${table} must have RLS enabled`);
      }
    });

    it("should define the current_user_organization_ids helper function", () => {
      const rlsMigration = fs.readFileSync(
        path.join(migrationsDir, "20260928000002_row_level_security.sql"),
        "utf-8"
      );
      assert.match(rlsMigration, /CREATE\s+OR\s+REPLACE\s+FUNCTION\s+current_user_organization_ids/i);
      assert.match(rlsMigration, /SECURITY\s+DEFINER/i);
    });

    it("should declare tenant isolation policies for authenticated roles", () => {
      const rlsMigration = fs.readFileSync(
        path.join(migrationsDir, "20260928000002_row_level_security.sql"),
        "utf-8"
      );
      assert.match(rlsMigration, /CREATE\s+POLICY\s+"organizations_select_policy"/i);
      assert.match(rlsMigration, /CREATE\s+POLICY\s+"products_tenant_isolation_select"/i);
      assert.match(rlsMigration, /CREATE\s+POLICY\s+"balances_tenant_isolation_select"/i);
      assert.match(rlsMigration, /CREATE\s+POLICY\s+"orders_tenant_isolation_select"/i);
      assert.match(rlsMigration, /CREATE\s+POLICY\s+"audit_logs_tenant_isolation_select"/i);
    });
  });

  describe("4. Database Domain Transaction Boundary & Invariants", () => {
    it("should calculate available balance according to canonical formula: on_hand - reserved - safety_stock - damaged - quarantined - allocated", () => {
      const balance = {
        on_hand: 100,
        reserved: 10,
        safety_stock: 5,
        damaged: 2,
        quarantined: 3,
        allocated: 15,
      };

      // 100 - 10 - 5 - 2 - 3 - 15 = 65
      const available = calculateSellableAvailable(balance);
      assert.equal(available, 65);
    });

    it("should enforce non-negative inventory balance fields", () => {
      assert.doesNotThrow(() => {
        validateInventoryBalanceConstraints({
          on_hand: 50,
          reserved: 10,
          allocated: 0,
        });
      });

      assert.throws(
        () => {
          validateInventoryBalanceConstraints({
            on_hand: -5,
          });
        },
        InventoryBalanceInvariantError
      );
    });

    it("should enforce optimistic locking version verification", () => {
      assert.doesNotThrow(() => {
        assertInventoryVersion("inventory_balance", "balance-123", 1, 1);
      });

      assert.throws(
        () => {
          assertInventoryVersion("inventory_balance", "balance-123", 1, 2);
        },
        OptimisticLockConflictError
      );
    });

    it("should execute operations inside withTransactionBoundary", async () => {
      let executed = false;
      const result = await withTransactionBoundary(async (tx) => {
        assert.ok(tx.id.startsWith("tx_"));
        assert.equal(tx.isolationLevel, "READ COMMITTED");
        executed = true;
        return { success: true };
      });

      assert.ok(executed);
      assert.deepEqual(result, { success: true });
    });
  });

  describe("5. Supabase Client Typing", () => {
    it("should initialize typed admin and publishable client instances", () => {
      const adminClient = createAdminClient("http://localhost:54321", "dummy-secret-key-for-test");
      assert.ok(adminClient, "Typed admin client must initialize");

      const publishableClient = createPublishableClient("http://localhost:54321", "dummy-anon-key-for-test");
      assert.ok(publishableClient, "Typed publishable client must initialize");
    });
  });
});
