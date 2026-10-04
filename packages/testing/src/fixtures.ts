import { Organization, InventoryBalance, LedgerEntry } from "@platform/domain";

export function createTestOrganization(overrides: Partial<Organization> = {}): Organization {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Acme Ecommerce Corp",
    slug: "acme-ecommerce",
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides
  };
}

export function createTestInventoryBalance(overrides: Partial<InventoryBalance> = {}): InventoryBalance {
  const onHand = overrides.onHand ?? 100;
  const reserved = overrides.reserved ?? 10;
  const allocated = overrides.allocated ?? 15;
  const incoming = overrides.incoming ?? 5;
  const safetyStock = overrides.safetyStock ?? 0;
  const damaged = overrides.damaged ?? 0;
  const quarantined = overrides.quarantined ?? 0;
  const inTransit = overrides.inTransit ?? 0;
  const available = overrides.available ?? (onHand - reserved - allocated + incoming);

  return {
    id: "bal_11111111_test",
    organizationId: "11111111-1111-4111-8111-111111111111",
    skuId: "33333333-3333-4333-8333-333333333333",
    warehouseId: "44444444-4444-4444-8444-444444444444",
    onHand,
    reserved,
    allocated,
    incoming,
    inTransit,
    safetyStock,
    damaged,
    quarantined,
    version: 1,
    available,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides
  };
}

export function createTestLedgerEntry(overrides: Partial<LedgerEntry> = {}): LedgerEntry {
  return {
    id: "22222222-2222-4222-8222-222222222222",
    organizationId: "11111111-1111-4111-8111-111111111111",
    skuId: "33333333-3333-4333-8333-333333333333",
    warehouseId: "44444444-4444-4444-8444-444444444444",
    eventType: "ADJUSTMENT",
    quantityDelta: 10,
    reason: "Initial physical stock count",
    actorId: "SYSTEM",
    createdAt: new Date(),
    ...overrides
  };
}
