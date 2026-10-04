/**
 * Phase 26: Inventory UI & Dynamic Multichannel Table Test Suite
 * Canonical Specification: Section 14, 15 of 03_FRONTEND_SPEC.md, Section 59 of 01_ENGINEERING_SPEC.md & Prompt 27
 *
 * Verifies:
 * 1. Inventory Table Columns:
 *    - SKU, Product, Warehouse, On Hand, Reserved, Available, Connected Channel Quantities, Status.
 * 2. Dynamic Connected Channel Columns:
 *    - Columns dynamically adapt to enabled merchant integrations.
 *    - Mandatory Invariant: Never present eBay or Walmart as operational channels when those integrations are not enabled.
 * 3. Invariant Available Calculation:
 *    - available = on_hand - reserved - safety_stock - allocated
 * 4. Explicit Status Semantics:
 *    - LIVE, VERIFIED, STALE, CONFLICT, UNKNOWN.
 * 5. Provider Submission Verification Guarantee:
 *    - Do not use a green success state for data that has merely been submitted to a provider.
 * 6. Server-Side Filtering & Pagination:
 *    - Filters: channel, warehouse, low stock, mismatch, sync state, product, SKU.
 *    - Server-side pagination parameters (page, limit, total, totalPages, hasNext, hasPrev).
 * 7. SKU Detail - 8 Canonical Sections:
 *    - 1. Summary
 *    - 2. Inventory by Warehouse
 *    - 3. Inventory by Channel
 *    - 4. Synchronization
 *    - 5. Exceptions
 *    - 6. Timeline (making inventory explainable with causal traversal)
 *    - 7. Orders
 *    - 8. Audit
 * 8. Web Application Route (/app/inventory) rendering and WCAG compliance.
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import type { AddressInfo } from "node:net";

import {
  renderInventoryTable,
  renderSkuDetailDrawer,
  renderInventoryCell,
  renderStatusBadge,
} from "@platform/ui";
import { startWebServer, renderInventoryView } from "@platform/web";
import { startApiServer, ApiRateLimiter } from "@platform/api";
import { SupabaseAuthAdapter, OrganizationService } from "@platform/security";
import {
  InMemoryInventoryLedgerRepository,
  InventoryLedgerService,
  InMemoryIntegrationRepository,
  IntegrationDatabaseService,
  InMemoryProductRepository,
  ProductDatabaseService,
  InMemoryExceptionRepository,
  ExceptionDatabaseService,
  InMemoryAuditRepository,
  AuditDatabaseService,
  InMemorySyncJobRepository,
  SyncJobService,
  InMemoryOrderRepository,
  OrderService,
  ReservationService,
} from "@platform/database";
import type {
  ConnectedChannelColumnDto,
  InventoryTableRowDto,
  SkuDetailDto,
} from "@platform/contracts";

const ORG_ID = "00000000-0000-0000-0000-000000000001";
const USER_ID = "10000000-0000-0000-0000-000000000001";
const TEST_TOKEN = "test-admin-token";

function createMockAuthAdapter(): SupabaseAuthAdapter {
  const client = {
    auth: {
      getUser: async (token: string) => {
        if (token === TEST_TOKEN) {
          return {
            data: {
              user: {
                id: USER_ID,
                email: "admin@test.com",
                user_metadata: {
                  organization_id: ORG_ID,
                  organization_name: "Test Org",
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

describe("Phase 26: Inventory UI & Dynamic Channel Controls (Prompt 27)", () => {
  let apiServer: http.Server;
  let apiPort: number;
  let apiBase: string;

  let webServer: http.Server;
  let webPort: number;
  let webBase: string;

  let ledgerRepo: InMemoryInventoryLedgerRepository;
  let ledgerService: InventoryLedgerService;
  let integrationRepo: InMemoryIntegrationRepository;
  let integrationService: IntegrationDatabaseService;
  let productRepo: InMemoryProductRepository;
  let productService: ProductDatabaseService;
  let exceptionRepo: InMemoryExceptionRepository;
  let auditRepo: InMemoryAuditRepository;
  let exceptionService: ExceptionDatabaseService;
  let auditService: AuditDatabaseService;
  let syncJobRepo: InMemorySyncJobRepository;
  let syncJobService: SyncJobService;
  let orderRepo: InMemoryOrderRepository;
  let orderService: OrderService;
  let reservationService: ReservationService;

  before(async () => {
    // 1. Initialize repositories and domain services
    ledgerRepo = new InMemoryInventoryLedgerRepository();
    ledgerService = new InventoryLedgerService(ledgerRepo);
    integrationRepo = new InMemoryIntegrationRepository();
    integrationService = new IntegrationDatabaseService(integrationRepo);
    productRepo = new InMemoryProductRepository();
    productService = new ProductDatabaseService(productRepo);
    auditRepo = new InMemoryAuditRepository();
    auditService = new AuditDatabaseService(auditRepo);
    exceptionRepo = new InMemoryExceptionRepository();
    exceptionService = new ExceptionDatabaseService(exceptionRepo, auditRepo);
    syncJobRepo = new InMemorySyncJobRepository();
    syncJobService = new SyncJobService(syncJobRepo);
    orderRepo = new InMemoryOrderRepository();
    reservationService = new ReservationService(ledgerRepo);
    orderService = new OrderService(orderRepo, reservationService);

    const mockAuthAdapter = createMockAuthAdapter();

    // 2. Start API Server
    apiServer = startApiServer({
      portOverride: 0,
      authAdapter: mockAuthAdapter,
      ledgerService,
      integrationDbService: integrationService,
      productDbService: productService,
      exceptionDbService: exceptionService,
      auditDbService: auditService,
      syncJobService,
      orderService,
      rateLimiter: new ApiRateLimiter({ windowMs: 60000, maxRequests: 5000 }),
    });
    if (!apiServer.listening) {
      await new Promise<void>((resolve) => apiServer.on("listening", resolve));
    }
    apiPort = (apiServer.address() as AddressInfo).port;
    apiBase = `http://127.0.0.1:${apiPort}`;

    // 3. Start Web Server
    webServer = startWebServer({ portOverride: 0 });
    if (!webServer.listening) {
      await new Promise<void>((resolve) => webServer.on("listening", resolve));
    }
    webPort = (webServer.address() as AddressInfo).port;
    webBase = `http://127.0.0.1:${webPort}`;
  });

  after(async () => {
    if (apiServer) await new Promise<void>((resolve) => apiServer.close(() => resolve()));
    if (webServer) await new Promise<void>((resolve) => webServer.close(() => resolve()));
  });

  // Seed baseline merchant data before each test
  beforeEach(async () => {
    // Connect Shopify (ACTIVE) and Amazon (ACTIVE). Do NOT connect eBay or Walmart!
    await integrationRepo.createAccount({
      id: "int-shopify-1",
      organization_id: ORG_ID,
      channel_id: "chan-shopify",
      display_name: "Shopify Store US",
      status: "ACTIVE",
      external_account_id: "ext-shopify-101",
      credential_reference: "vault-shop-1",
      metadata: { provider: "SHOPIFY" },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await integrationRepo.createAccount({
      id: "int-amazon-1",
      organization_id: ORG_ID,
      channel_id: "chan-amazon",
      display_name: "Amazon FBA/FBM",
      status: "ACTIVE",
      external_account_id: "ext-amazon-202",
      credential_reference: "vault-amz-1",
      metadata: { provider: "AMAZON" },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed Ledger Balances:
    // SKU 1: WIRELESS-HEADSET-BLK (On Hand: 42, Reserved: 4, Safety Stock: 5 -> Available: 33)
    await ledgerRepo.saveBalance({
      id: "bal-headset-1",
      organization_id: ORG_ID,
      sku_id: "WIRELESS-HEADSET-BLK",
      warehouse_id: "wh-1",
      on_hand: 42,
      reserved: 4,
      allocated: 0,
      damaged: 0,
      quarantined: 0,
      in_transit: 0,
      incoming: 0,
      safety_stock: 5,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // SKU 2: USB-C-DOCK-PRO (On Hand: 130, Reserved: 6, Safety Stock: 10 -> Available: 114)
    await ledgerRepo.saveBalance({
      id: "bal-dock-1",
      organization_id: ORG_ID,
      sku_id: "USB-C-DOCK-PRO",
      warehouse_id: "wh-1",
      on_hand: 130,
      reserved: 6,
      allocated: 0,
      damaged: 0,
      quarantined: 0,
      in_transit: 0,
      incoming: 0,
      safety_stock: 10,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // SKU 3: ERGONOMIC-CHAIR-GRY (On Hand: 10, Reserved: 3, Safety Stock: 2 -> Available: 5)
    await ledgerRepo.saveBalance({
      id: "bal-chair-1",
      organization_id: ORG_ID,
      sku_id: "ERGONOMIC-CHAIR-GRY",
      warehouse_id: "wh-2",
      on_hand: 10,
      reserved: 3,
      allocated: 0,
      damaged: 0,
      quarantined: 0,
      in_transit: 0,
      incoming: 0,
      safety_stock: 2,
      version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed Products
    await productRepo.createProduct({
      id: "WIRELESS-HEADSET-BLK",
      organization_id: ORG_ID,
      title: "Pro Noise-Cancelling Wireless Headphones (Black)",
      description: "Premium ANC Wireless Headphones",
      brand: "AcousticPro",
      category: "Audio",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    await productRepo.createProduct({
      id: "USB-C-DOCK-PRO",
      organization_id: ORG_ID,
      title: "12-in-1 Triple Display Thunderbolt Dock",
      description: "High performance dock",
      brand: "ConnectHub",
      category: "Accessories",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed Events for explainable timeline
    await ledgerRepo.createEvent({
      id: "evt-init-headset",
      organization_id: ORG_ID,
      sku_id: "WIRELESS-HEADSET-BLK",
      warehouse_id: "wh-1",
      event_type: "PURCHASE_RECEIPT",
      quantity_delta: 42,
      source_type: "PURCHASE_ORDER",
      source_id: "po-101",
      order_id: null,
      reservation_id: null,
      before_state: { on_hand: 0, available: 0 },
      after_state: { on_hand: 42, available: 37, reason: "Inbound PO-101 receipt" },
      idempotency_key: "po-101-headset",
      correlation_id: "corr-init-headset",
      actor_type: "USER",
      actor_id: USER_ID,
      created_at: new Date().toISOString(),
    });
  });

  // ==========================================
  // 1. Mandatory Table Columns
  // ==========================================
  describe("1. Mandatory Table Columns (Prompt 27)", () => {
    it("renders all 8 required columns: SKU, Product, Warehouse, On Hand, Reserved, Available, Connected Channels, Status", () => {
      const html = renderInventoryTable({
        items: [
          {
            sku: "WIRELESS-HEADSET-BLK",
            productTitle: "Pro Headphones",
            warehouseId: "wh-1",
            warehouseName: "Main Fulfillment Center",
            onHand: 42,
            reserved: 4,
            available: 33,
            status: "VERIFIED",
            channelQuantities: {},
          },
        ],
        connectedChannels: [
          { id: "shopify-1", provider: "SHOPIFY", displayName: "Shopify US", status: "ACTIVE", isEnabled: true },
        ],
        pagination: { page: 1, limit: 50, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
      });

      // Verify each column header is present
      assert.match(html, /<th scope="col" class="th-sku">SKU<\/th>/, "SKU column must be present");
      assert.match(html, /<th scope="col" class="th-product">Product<\/th>/, "Product column must be present");
      assert.match(html, /<th scope="col" class="th-warehouse">Warehouse<\/th>/, "Warehouse column must be present");
      assert.match(html, /<th scope="col" class="th-on-hand">On Hand<\/th>/, "On Hand column must be present");
      assert.match(html, /<th scope="col" class="th-reserved">Reserved<\/th>/, "Reserved column must be present");
      assert.match(html, /<th scope="col" class="th-available">Available<\/th>/, "Available column must be present");
      assert.match(html, /Shopify US/, "Connected channel column header must be present");
      assert.match(html, /<th scope="col" class="th-status">Status<\/th>/, "Status column must be present");
    });
  });

  // ==========================================
  // 2. Dynamic Connected Channel Columns
  // ==========================================
  describe("2. Dynamic Connected Channel Columns (Prompt 27 Invariant)", () => {
    it("does NOT present eBay or Walmart as operational channels when those integrations are not enabled", () => {
      // Tenant only has Shopify and Amazon active
      const channels: ConnectedChannelColumnDto[] = [
        { id: "shopify-1", provider: "SHOPIFY", displayName: "Shopify Store US", status: "ACTIVE", isEnabled: true },
        { id: "amazon-1", provider: "AMAZON", displayName: "Amazon NA", status: "ACTIVE", isEnabled: true },
      ];

      const html = renderInventoryTable({
        items: [],
        connectedChannels: channels,
        pagination: { page: 1, limit: 50, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
      });

      // Assert Shopify and Amazon ARE rendered
      assert.match(html, /Shopify Store US/);
      assert.match(html, /Amazon NA/);

      // Assert eBay and Walmart ARE NOT rendered
      assert.doesNotMatch(html, /eBay/i, "eBay must NOT be present as an operational channel column");
      assert.doesNotMatch(html, /Walmart/i, "Walmart must NOT be present as an operational channel column");
    });

    it("dynamically adds channel column when an integration is connected and enabled", () => {
      // Now eBay is enabled and added
      const channelsWithEbay: ConnectedChannelColumnDto[] = [
        { id: "shopify-1", provider: "SHOPIFY", displayName: "Shopify Store US", status: "ACTIVE", isEnabled: true },
        { id: "amazon-1", provider: "AMAZON", displayName: "Amazon NA", status: "ACTIVE", isEnabled: true },
        { id: "ebay-1", provider: "EBAY", displayName: "eBay Global Store", status: "ACTIVE", isEnabled: true },
      ];

      const html = renderInventoryTable({
        items: [],
        connectedChannels: channelsWithEbay,
        pagination: { page: 1, limit: 50, total: 0, totalPages: 1, hasNext: false, hasPrev: false },
      });

      assert.match(html, /eBay Global Store/, "eBay column must appear dynamically once enabled");
      assert.doesNotMatch(html, /Walmart/i, "Walmart must still NOT be present because it is not enabled");
    });
  });

  // ==========================================
  // 3. Invariant Available Calculation
  // ==========================================
  describe("3. Invariant Available Calculation", () => {
    it("dynamically exposes the ledger invariant breakdown: available = on_hand - reserved - safety_stock - allocated", () => {
      const cellHtml = renderInventoryCell({
        sku: "WIRELESS-HEADSET-BLK",
        onHand: 42,
        reserved: 4,
        safetyStock: 5,
        allocated: 0,
        available: 33, // 42 - 4 - 5
        trustState: "VERIFIED",
        lastVerifiedAt: "Just now",
      });

      assert.match(cellHtml, /33/, "Must display calculated available (33)");
      assert.match(cellHtml, /On Hand:.*?42/, "Must show onHand in breakdown");
      assert.match(cellHtml, /Reserved:.*?4/, "Must show reserved in breakdown");
      assert.match(cellHtml, /Safety:.*?5/, "Must show safetyStock in breakdown");
    });
  });

  // ==========================================
  // 4. Explicit Status Semantics
  // ==========================================
  describe("4. Explicit Status Semantics (LIVE, VERIFIED, STALE, CONFLICT, UNKNOWN)", () => {
    it("renders explicit status badges for all 5 canonical trust states", () => {
      const states = ["LIVE", "VERIFIED", "STALE", "CONFLICT", "UNKNOWN"] as const;

      for (const st of states) {
        const badge = renderStatusBadge({ status: st, category: "trust" });
        assert.ok(badge.includes(st) || badge.toLowerCase().includes(st.toLowerCase()), `Badge must render status ${st}`);
      }
    });
  });

  // ==========================================
  // 5. Provider Submission Verification Guarantee
  // ==========================================
  describe("5. Provider Submission Verification Guarantee", () => {
    it("does not use a green success state for data that has merely been submitted or pending", () => {
      // SENT, PENDING, QUEUED, PROCESSING are NOT green!
      const sentBadge = renderStatusBadge({ status: "PENDING", category: "sync" });
      const inProgressBadge = renderStatusBadge({ status: "IN_PROGRESS", category: "sync" });

      // In status-badge.ts:
      // VERIFIED uses var(--color-status-verified, #10b981)
      // PENDING uses var(--color-status-stale, #f59e0b)
      // IN_PROGRESS uses var(--color-status-live, #06b6d4)
      assert.doesNotMatch(sentBadge, /#10b981/, "Pending/Submitted sync must NOT use green success color");
      assert.match(sentBadge, /#f59e0b/, "Pending sync should use amber status token");
      assert.match(inProgressBadge, /#06b6d4/, "In-progress sync should use cyan active token");
    });
  });

  // ==========================================
  // 6. Server-Side Filtering & Pagination API (GET /inventory/table)
  // ==========================================
  describe("6. Server-Side Filtering & Pagination API (GET /inventory/table)", () => {
    it("returns server-side filtered and paginated inventory table records with dynamic channels", async () => {
      const res = await makeAuthRequest(`${apiBase}/inventory/table?page=1&limit=10`, "GET");
      assert.equal(res.status, 200);

      const json = await res.json();
      assert.ok(json.data, "Response must include data envelope");
      assert.ok(Array.isArray(json.data.items), "Items must be an array");
      assert.ok(json.data.pagination, "Pagination must be included");
      assert.equal(json.data.pagination.page, 1);
      assert.equal(json.data.pagination.limit, 10);

      // Verify dynamic channels list: only active Shopify & Amazon, no eBay or Walmart
      const providers = json.data.connectedChannels.map((c: any) => c.provider);
      assert.ok(providers.includes("SHOPIFY"), "Shopify must be present");
      assert.ok(providers.includes("AMAZON"), "Amazon must be present");
      assert.ok(!providers.includes("EBAY"), "eBay must NOT be present when not enabled");
      assert.ok(!providers.includes("WALMART"), "Walmart must NOT be present when not enabled");
    });

    it("filters server-side by SKU", async () => {
      const res = await makeAuthRequest(`${apiBase}/inventory/table?sku=HEADSET`, "GET");
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.items.length, 1);
      assert.equal(json.data.items[0].sku, "WIRELESS-HEADSET-BLK");
    });

    it("filters server-side by Product title", async () => {
      const res = await makeAuthRequest(`${apiBase}/inventory/table?product=Thunderbolt`, "GET");
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.items.length, 1);
      assert.equal(json.data.items[0].sku, "USB-C-DOCK-PRO");
    });

    it("filters server-side by Warehouse", async () => {
      const res = await makeAuthRequest(`${apiBase}/inventory/table?warehouse=wh-2`, "GET");
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.items.length, 1);
      assert.equal(json.data.items[0].sku, "ERGONOMIC-CHAIR-GRY");
    });

    it("filters server-side by Low Stock", async () => {
      const res = await makeAuthRequest(`${apiBase}/inventory/table?lowStock=true`, "GET");
      assert.equal(res.status, 200);
      const json = await res.json();
      // ERGONOMIC-CHAIR-GRY has available 5 (<= 10), so it is low stock
      assert.ok(json.data.items.some((i: any) => i.sku === "ERGONOMIC-CHAIR-GRY"));
    });

    it("filters server-side by Sync State (CONFLICT)", async () => {
      // Simulate conflict on HEADSET (oversold / negative available)
      await ledgerRepo.saveBalance({
        id: "bal-headset-1",
        organization_id: ORG_ID,
        sku_id: "WIRELESS-HEADSET-BLK",
        warehouse_id: "wh-1",
        on_hand: 5,
        reserved: 10,
        allocated: 0,
        damaged: 0,
        quarantined: 0,
        in_transit: 0,
        incoming: 0,
        safety_stock: 0,
        version: 2,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      const res = await makeAuthRequest(`${apiBase}/inventory/table?syncState=CONFLICT`, "GET");
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.data.items.length >= 1);
      assert.equal(json.data.items[0].sku, "WIRELESS-HEADSET-BLK");
      assert.equal(json.data.items[0].status, "CONFLICT");
    });
  });

  // ==========================================
  // 7. SKU Detail - 8 Canonical Sections
  // ==========================================
  describe("7. SKU Detail - 8 Canonical Sections (Prompt 27)", () => {
    it("returns all 8 sections for SKU detail: Summary, Warehouse, Channel, Sync, Exceptions, Timeline, Orders, Audit", async () => {
      const res = await makeAuthRequest(`${apiBase}/inventory/WIRELESS-HEADSET-BLK/detail`, "GET");
      assert.equal(res.status, 200);
      const json = await res.json();
      const detail = json.data as SkuDetailDto;

      // 1. Summary
      assert.ok(detail.summary, "Summary section must exist");
      assert.equal(detail.summary.sku, "WIRELESS-HEADSET-BLK");
      assert.ok(detail.summary.sellableFormulaEquation.includes("="), "Must include sellable formula equation");

      // 2. Inventory by Warehouse
      assert.ok(Array.isArray(detail.inventoryByWarehouse), "Inventory by Warehouse must be an array");
      assert.ok(detail.inventoryByWarehouse.length >= 1);
      assert.equal(detail.inventoryByWarehouse[0].warehouseId, "wh-1");

      // 3. Inventory by Channel
      assert.ok(Array.isArray(detail.inventoryByChannel), "Inventory by Channel must be an array");
      assert.ok(detail.inventoryByChannel.length >= 1);

      // 4. Synchronization
      assert.ok(Array.isArray(detail.synchronization), "Synchronization section must be an array");

      // 5. Exceptions
      assert.ok(Array.isArray(detail.exceptions), "Exceptions section must be an array");

      // 6. Timeline (explainable)
      assert.ok(Array.isArray(detail.timeline), "Timeline section must be an array");
      assert.ok(detail.timeline.length >= 1);
      assert.ok(detail.timeline[0].causalChain, "Timeline must include causal chain");

      // 7. Orders
      assert.ok(Array.isArray(detail.orders), "Orders section must be an array");

      // 8. Audit
      assert.ok(Array.isArray(detail.audit), "Audit section must be an array");
    });

    it("renders all 8 sections in the SkuDetailDrawer UI component", () => {
      const detail: SkuDetailDto = {
        summary: {
          sku: "WIRELESS-HEADSET-BLK",
          productTitle: "Pro Wireless Headphones",
          brand: "AcousticPro",
          category: "Audio",
          status: "ACTIVE",
          trustState: "CONFLICT",
          totalOnHand: 42,
          totalReserved: 4,
          totalAllocated: 0,
          totalSafetyStock: 5,
          totalDamaged: 0,
          totalQuarantined: 0,
          totalAvailable: 33,
          sellableFormulaEquation: "33 = 42 - 4 - 5 - 0",
        },
        inventoryByWarehouse: [
          {
            warehouseId: "wh-1",
            warehouseName: "Main Fulfillment Center",
            onHand: 42,
            reserved: 4,
            allocated: 0,
            available: 33,
            safetyStock: 5,
            updatedAt: "2 mins ago",
          },
        ],
        inventoryByChannel: [
          {
            channelAccountId: "shopify-1",
            provider: "SHOPIFY",
            channelDisplayName: "Shopify US",
            currentQuantity: 33,
            internalQuantity: 33,
            difference: 0,
            syncState: "VERIFIED",
            isOperational: true,
          },
          {
            channelAccountId: "amazon-1",
            provider: "AMAZON",
            channelDisplayName: "Amazon NA",
            currentQuantity: 35,
            internalQuantity: 33,
            difference: 2,
            syncState: "CONFLICT",
            isOperational: true,
          },
        ],
        synchronization: [
          {
            jobId: "sync-01",
            channel: "Shopify US",
            provider: "SHOPIFY",
            direction: "OUTBOUND",
            operation: "UPDATE_INVENTORY",
            status: "VERIFIED",
            quantitySent: 33,
            verifiedQuantity: 33,
            timestamp: "2 mins ago",
          },
        ],
        exceptions: [
          {
            id: "exc-01",
            severity: "HIGH",
            type: "INVENTORY_MISMATCH",
            title: "Marketplace reported 35 units, expected 33",
            difference: 2,
            status: "OPEN",
            suggestedAction: "Reconcile Amazon channel",
            createdAt: "5 mins ago",
          },
        ],
        timeline: [
          {
            id: "evt-01",
            timestamp: "11:42:16",
            title: "Channel Discrepancy Flagged",
            eventType: "RECONCILIATION_AUDIT",
            quantityDelta: 0,
            beforeOnHand: 42,
            afterOnHand: 42,
            beforeAvailable: 33,
            afterAvailable: 33,
            channelOrWarehouse: "Amazon NA",
            actor: "System",
            actorType: "SYSTEM",
            reason: "Discrepancy detected",
            correlationId: "corr-01",
            causalChain: ["Quantity Audit", "Feed Read-Back", "Discrepancy Detected"],
          },
        ],
        orders: [
          {
            orderId: "ord-1",
            orderNumber: "ORD-1042",
            channel: "Shopify US",
            customer: "Alice Smith",
            status: "RESERVED",
            quantityReserved: 4,
            reservedAt: "11:41:20",
          },
        ],
        audit: [
          {
            id: "aud-01",
            timestamp: "11:42:16",
            actor: "System",
            action: "EXCEPTION_CREATED",
            entityType: "SKU",
            entityId: "WIRELESS-HEADSET-BLK",
            correlationId: "corr-01",
          },
        ],
      };

      const drawerHtml = renderSkuDetailDrawer({
        isOpen: true,
        skuDetail: detail,
      });

      // Verify all 8 section headings / contents exist in rendered HTML:
      assert.match(drawerHtml, /Authoritative Sellable Invariant Formula/, "Section 1: Summary Equation");
      assert.match(drawerHtml, /Inventory by Warehouse/, "Section 2: Inventory by Warehouse");
      assert.match(drawerHtml, /Inventory by Channel/, "Section 3: Inventory by Channel");
      assert.match(drawerHtml, /Synchronization History/, "Section 4: Synchronization");
      assert.match(drawerHtml, /Exceptions &amp; Discrepancies|Exceptions & Discrepancies/, "Section 5: Exceptions");
      assert.match(drawerHtml, /Explainable Inventory Timeline/, "Section 6: Timeline");
      assert.match(drawerHtml, /Active Orders &amp; Reservations|Active Orders & Reservations/, "Section 7: Orders");
      assert.match(drawerHtml, /Immutable Audit Trail/, "Section 8: Audit");

      // Verify causal traversal in timeline
      assert.match(drawerHtml, /Causal Path:/, "Timeline must display causal path");
      assert.match(drawerHtml, /Feed Read-Back/, "Timeline must display intermediate causal steps");
    });
  });

  // ==========================================
  // 8. Web Route Rendering (/app/inventory)
  // ==========================================
  describe("8. Web Route Rendering (/app/inventory)", () => {
    it("renders the inventory view with WCAG accessible table and filter controls", async () => {
      const res = await fetch(`${webBase}/app/inventory`);
      assert.equal(res.status, 200);
      const html = await res.text();

      // Check header, search form, table, and accessibility landmarks
      assert.match(html, /<h1>Inventory Control<\/h1>/);
      assert.match(html, /role="search"/);
      assert.match(html, /id="filterSku"/);
      assert.match(html, /id="filterWarehouse"/);
      assert.match(html, /id="filterLowStockToggle"/);
      assert.match(html, /id="filterMismatchToggle"/);
      assert.match(html, /class="inventory-data-table"/);
      assert.match(html, /role="navigation" aria-label="Inventory table pagination"/);
    });

    it("opens the SKU detail drawer when ?skuDetail=WIRELESS-HEADSET-BLK is requested", async () => {
      const res = await fetch(`${webBase}/app/inventory?skuDetail=WIRELESS-HEADSET-BLK`);
      assert.equal(res.status, 200);
      const html = await res.text();

      assert.match(html, /class="sku-drawer-overlay drawer-open"/, "Drawer must be open");
      assert.match(html, /WIRELESS-HEADSET-BLK/);
      assert.match(html, /Explainable Inventory Timeline/);
    });
  });
});

/**
 * Helper to make authenticated requests to API server
 */
async function makeAuthRequest(url: string, method = "GET", body?: any): Promise<Response> {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${TEST_TOKEN}`,
    "x-organization-id": ORG_ID,
    "x-user-id": USER_ID,
    "x-user-role": "ADMIN",
    "Content-Type": "application/json",
  };

  return fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}
