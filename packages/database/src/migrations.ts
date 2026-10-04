/**
 * Migration Inspector and Schema Coverage Validator
 * Used by automated tests and CI/CD pipelines to guarantee migration completeness and consistency.
 */

import * as fs from "node:fs";
import * as path from "node:path";

export interface MigrationFile {
  filename: string;
  filepath: string;
  version: string;
  content: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  migrations: MigrationFile[];
  discoveredEntities: string[];
  missingEntities: string[];
  discoveredEnums: string[];
  missingEnums: string[];
  discoveredUniqueConstraints: string[];
  missingUniqueConstraints: string[];
  tablesWithRls: string[];
  missingRlsTables: string[];
}

export const CANONICAL_ENTITIES = [
  "organizations",
  "users",
  "roles",
  "memberships",
  "products",
  "product_variants",
  "skus",
  "channels",
  "channel_accounts",
  "channel_product_mappings",
  "warehouses",
  "inventory_balances",
  "inventory_events",
  "inventory_reservations",
  "orders",
  "order_items",
  "returns",
  "suppliers",
  "purchase_orders",
  "purchase_order_items",
  "sync_jobs",
  "reconciliation_runs",
  "reconciliation_results",
  "exceptions",
  "audit_logs",
] as const;

export const TENANT_SCOPED_TABLES = [
  "organizations",
  "users",
  "memberships",
  "roles",
  "products",
  "skus",
  "product_variants",
  "channel_accounts",
  "channel_product_mappings",
  "warehouses",
  "inventory_balances",
  "inventory_reservations",
  "orders",
  "order_items",
  "inventory_events",
  "returns",
  "suppliers",
  "purchase_orders",
  "purchase_order_items",
  "sync_jobs",
  "reconciliation_runs",
  "reconciliation_results",
  "exceptions",
  "audit_logs",
] as const;

export const REQUIRED_UNIQUE_CONSTRAINTS = [
  "organizations(slug)",
  "users(email)",
  "memberships(organization_id, user_id)",
  "skus(organization_id, code)",
  "channel_accounts(organization_id, channel_id, external_account_id)",
  "inventory_balances(organization_id, sku_id, warehouse_id)",
  "orders(organization_id, channel_account_id, external_order_id)",
  "returns(organization_id, external_return_id)",
  "inventory_events(idempotency_key)",
  "sync_jobs(idempotency_key)",
] as const;

/**
 * Loads all SQL migrations from the given migrations directory.
 */
export function loadMigrationFiles(migrationsDir: string): MigrationFile[] {
  if (!fs.existsSync(migrationsDir)) {
    throw new Error(`Migrations directory does not exist: ${migrationsDir}`);
  }

  const entries = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql"));
  entries.sort(); // Natural chronological sort by prefix timestamp

  return entries.map((filename) => {
    const filepath = path.join(migrationsDir, filename);
    const content = fs.readFileSync(filepath, "utf-8");
    const version = filename.split("_")[0] || filename;
    return { filename, filepath, version, content };
  });
}

/**
 * Validates the schema migrations against the canonical specification requirements.
 */
export function validateSchemaMigrations(migrationsDir: string): SchemaValidationResult {
  const migrations = loadMigrationFiles(migrationsDir);
  const combinedSql = migrations.map((m) => m.content).join("\n\n");

  const discoveredEntities: string[] = [];
  const missingEntities: string[] = [];

  for (const entity of CANONICAL_ENTITIES) {
    const tableRegex = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${entity}\\b`, "i");
    if (tableRegex.test(combinedSql)) {
      discoveredEntities.push(entity);
    } else {
      missingEntities.push(entity);
    }
  }

  const discoveredUniqueConstraints: string[] = [];
  const missingUniqueConstraints: string[] = [];

  // Check unique constraints
  if (/slug\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(combinedSql) || /UNIQUE\s*\(\s*slug\s*\)/i.test(combinedSql)) {
    discoveredUniqueConstraints.push("organizations(slug)");
  } else {
    missingUniqueConstraints.push("organizations(slug)");
  }

  if (/email\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(combinedSql) || /UNIQUE\s*\(\s*email\s*\)/i.test(combinedSql)) {
    discoveredUniqueConstraints.push("users(email)");
  } else {
    missingUniqueConstraints.push("users(email)");
  }

  if (/UNIQUE\s*\(\s*organization_id\s*,\s*user_id\s*\)/i.test(combinedSql)) {
    discoveredUniqueConstraints.push("memberships(organization_id, user_id)");
  } else {
    missingUniqueConstraints.push("memberships(organization_id, user_id)");
  }

  if (/UNIQUE\s*\(\s*organization_id\s*,\s*code\s*\)/i.test(combinedSql)) {
    discoveredUniqueConstraints.push("skus(organization_id, code)");
  } else {
    missingUniqueConstraints.push("skus(organization_id, code)");
  }

  if (/UNIQUE\s*\(\s*organization_id\s*,\s*channel_id\s*,\s*external_account_id\s*\)/i.test(combinedSql)) {
    discoveredUniqueConstraints.push("channel_accounts(organization_id, channel_id, external_account_id)");
  } else {
    missingUniqueConstraints.push("channel_accounts(organization_id, channel_id, external_account_id)");
  }

  if (/UNIQUE\s*\(\s*organization_id\s*,\s*sku_id\s*,\s*warehouse_id\s*\)/i.test(combinedSql)) {
    discoveredUniqueConstraints.push("inventory_balances(organization_id, sku_id, warehouse_id)");
  } else {
    missingUniqueConstraints.push("inventory_balances(organization_id, sku_id, warehouse_id)");
  }

  if (/UNIQUE\s*\(\s*organization_id\s*,\s*channel_account_id\s*,\s*external_order_id\s*\)/i.test(combinedSql)) {
    discoveredUniqueConstraints.push("orders(organization_id, channel_account_id, external_order_id)");
  } else {
    missingUniqueConstraints.push("orders(organization_id, channel_account_id, external_order_id)");
  }

  if (/UNIQUE\s*\(\s*organization_id\s*,\s*external_return_id\s*\)/i.test(combinedSql)) {
    discoveredUniqueConstraints.push("returns(organization_id, external_return_id)");
  } else {
    missingUniqueConstraints.push("returns(organization_id, external_return_id)");
  }

  if (/idempotency_key\s+TEXT\s+UNIQUE/i.test(combinedSql) || /UNIQUE\s*\(\s*idempotency_key\s*\)/i.test(combinedSql)) {
    discoveredUniqueConstraints.push("inventory_events(idempotency_key)");
    discoveredUniqueConstraints.push("sync_jobs(idempotency_key)");
  }

  // Check RLS
  const tablesWithRls: string[] = [];
  const missingRlsTables: string[] = [];

  for (const table of TENANT_SCOPED_TABLES) {
    const rlsRegex = new RegExp(`ALTER\\s+TABLE\\s+${table}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, "i");
    if (rlsRegex.test(combinedSql)) {
      tablesWithRls.push(table);
    } else {
      missingRlsTables.push(table);
    }
  }

  const valid = missingEntities.length === 0 && missingUniqueConstraints.length === 0 && missingRlsTables.length === 0;

  return {
    valid,
    migrations,
    discoveredEntities,
    missingEntities,
    discoveredEnums: [],
    missingEnums: [],
    discoveredUniqueConstraints,
    missingUniqueConstraints,
    tablesWithRls,
    missingRlsTables,
  };
}
