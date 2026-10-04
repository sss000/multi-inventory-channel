import { describe, it, before, after, beforeEach } from "node:test";
import * as assert from "node:assert/strict";
import { Server } from "node:http";
import {
  OrderService,
  InMemoryOrderRepository,
  InMemoryInventoryLedgerRepository,
  ReservationService,
  InventoryLedgerService,
  calculateSellableAvailable,
} from "@platform/database";
import type {
  OrderRow,
  OrderItemRow,
  OrderEventRow,
  SkuRow,
} from "@platform/database";
import {
  OrderInvariantError,
  OrderNotFoundError,
  TenantAccessDeniedError,
} from "@platform/domain";
import type { DomainException } from "@platform/domain";

import { startApiServer } from "@platform/api";
import { SupabaseAuthAdapter } from "@platform/security";
import type { SupabaseClient } from "@supabase/supabase-js";

function createMockAuthForOrderTesting() {
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

        return { data: { user: null }, error: new Error("Invalid token") };
      },
    },
  };

  return new SupabaseAuthAdapter(client as unknown as SupabaseClient);
}

describe("Phase 9: Orders Acceptance Suite", () => {
  const orgA = "00000000-0000-0000-0000-00000000000a";
  const orgB = "00000000-0000-0000-0000-00000000000b";
  const channelAccA = "chan_shopify_001";
  const channelAccB = "chan_amazon_002";
  const warehouseA = "wh_main_001";

  let ledgerRepo: InMemoryInventoryLedgerRepository;
  let ledgerService: InventoryLedgerService;
  let reservationService: ReservationService;
  let orderRepo: InMemoryOrderRepository;
  let orderService: OrderService;

  beforeEach(async () => {
    ledgerRepo = new InMemoryInventoryLedgerRepository();
    ledgerService = new InventoryLedgerService(ledgerRepo);
    reservationService = new ReservationService(ledgerRepo);
    orderRepo = new InMemoryOrderRepository();
    orderService = new OrderService(orderRepo, reservationService);

    // Seed SKUs in Org A
    await orderRepo.seedSku({
      id: "sku_widget_01",
      organization_id: orgA,
      code: "WIDGET-01",
      barcode: "123456789012",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    await orderRepo.seedSku({
      id: "sku_gadget_02",
      organization_id: orgA,
      code: "GADGET-02",
      barcode: "123456789013",
      status: "ACTIVE",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    // Seed initial inventory for Org A
    await ledgerService.recordInitialImport({
      organizationId: orgA,
      skuId: "sku_widget_01",
      warehouseId: warehouseA,
      onHand: 100,
      safetyStock: 10,
      correlationId: "corr_seed_1",
    });

    await ledgerService.recordInitialImport({
      organizationId: orgA,
      skuId: "sku_gadget_02",
      warehouseId: warehouseA,
      onHand: 50,
      safetyStock: 5,
      correlationId: "corr_seed_2",
    });
  });

  describe("1. Order Creation & Import Domain Logic", () => {
    it("should successfully import order with line items, pricing, customer details, and record ORDER_IMPORTED event", async () => {
      const result = await orderService.importOrder({
        organizationId: orgA,
        channelAccountId: channelAccA,
        externalOrderId: "EXT-ORD-1001",
        orderNumber: "#1001",
        currency: "USD",
        subtotal: 120.0,
        tax: 12.0,
        shipping: 8.0,
        discount: 0.0,
        total: 140.0,
        customer: { name: "Alice Smith", email: "alice@example.com" },
        shippingAddress: { city: "Seattle", state: "WA", postalCode: "98101" },
        billingAddress: { city: "Seattle", state: "WA", postalCode: "98101" },
        orderedAt: new Date().toISOString(),
        items: [
          {
            externalLineId: "line_1",
            sku: "WIDGET-01",
            quantity: 3,
            unitPrice: 30.0,
          },
          {
            externalLineId: "line_2",
            sku: "GADGET-02",
            quantity: 1,
            unitPrice: 30.0,
          },
        ],
        warehouseId: warehouseA,
        autoReserve: true,
        correlationId: "corr_ord_import_1",
      });

      assert.equal(result.isDuplicate, false);
      assert.equal(result.order.status, "PENDING");
      assert.equal(result.order.external_order_id, "EXT-ORD-1001");
      assert.equal(result.order.items.length, 2);
      assert.equal(result.exceptions.length, 0);

      // Verify reservations created
      assert.equal(result.reservations.length, 2);
      assert.equal(result.reservations[0].order_id, result.order.id);
      assert.equal(result.reservations[0].sku_id, "sku_widget_01");
      assert.equal(result.reservations[0].quantity, 3);
      assert.equal(result.reservations[1].sku_id, "sku_gadget_02");
      assert.equal(result.reservations[1].quantity, 1);

      // Verify sellable available reduced
      const balWidget = await ledgerRepo.getBalance(orgA, "sku_widget_01", warehouseA);
      assert.equal(calculateSellableAvailable(balWidget!), 87); // 100 - 3 reserved - 10 safety = 87

      // Verify events recorded
      const events = await orderService.getOrderEvents(orgA, result.order.id);
      assert.ok(events.some((e) => e.event_type === "ORDER_IMPORTED"));
      assert.ok(events.some((e) => e.event_type === "ORDER_RESERVATION_CREATED"));
    });

    it("should reject order with empty items", async () => {
      await assert.rejects(
        async () => {
          await orderService.importOrder({
            organizationId: orgA,
            channelAccountId: channelAccA,
            externalOrderId: "EXT-ORD-EMPTY",
            orderNumber: "#EMPTY",
            orderedAt: new Date().toISOString(),
            items: [],
            correlationId: "corr_empty",
          });
        },
        (err: unknown) => err instanceof OrderInvariantError
      );
    });

    it("should reject non-positive item quantity", async () => {
      await assert.rejects(
        async () => {
          await orderService.importOrder({
            organizationId: orgA,
            channelAccountId: channelAccA,
            externalOrderId: "EXT-ORD-BAD-QTY",
            orderNumber: "#BAD-QTY",
            orderedAt: new Date().toISOString(),
            items: [
              {
                externalLineId: "line_1",
                sku: "WIDGET-01",
                quantity: -2,
              },
            ],
            correlationId: "corr_bad_qty",
          });
        },
        (err: unknown) => err instanceof OrderInvariantError
      );
    });
  });

  describe("2. Duplicate External Order Gate (Prompt 10 Requirement)", () => {
    it("should idempotently return existing order without creating duplicates or duplicate reservations", async () => {
      const orderPayload = {
        organizationId: orgA,
        channelAccountId: channelAccA,
        externalOrderId: "EXT-ORD-DUP-01",
        orderNumber: "#DUP-01",
        orderedAt: new Date().toISOString(),
        items: [
          {
            externalLineId: "line_1",
            sku: "WIDGET-01",
            quantity: 5,
          },
        ],
        warehouseId: warehouseA,
        autoReserve: true,
        correlationId: "corr_dup_1",
      };

      // 1. Initial import
      const firstResult = await orderService.importOrder(orderPayload);
      assert.equal(firstResult.isDuplicate, false);
      assert.equal(firstResult.reservations.length, 1);

      const balAfterFirst = await ledgerRepo.getBalance(orgA, "sku_widget_01", warehouseA);
      assert.equal(calculateSellableAvailable(balAfterFirst!), 85); // 100 - 5 reserved - 10 safety = 85

      // 2. Duplicate import request with same (organization, channelAccount, externalOrderId)
      const secondResult = await orderService.importOrder(orderPayload);
      assert.equal(secondResult.isDuplicate, true);
      assert.equal(secondResult.order.id, firstResult.order.id);
      assert.equal(secondResult.order.items.length, 1);

      // Verify no second reservation was made and inventory was NOT double-decremented
      const balAfterSecond = await ledgerRepo.getBalance(orgA, "sku_widget_01", warehouseA);
      assert.equal(calculateSellableAvailable(balAfterSecond!), 85);

      // Verify total orders count in org is still 1
      const list = await orderService.listOrders(orgA);
      assert.equal(list.total, 1);
    });
  });

  describe("3. Unmapped SKU Handling Gate (Critical Specification Invariant)", () => {
    it("DO NOT silently reduce inventory when SKU is unmapped; create ORDER_UNMAPPED_SKU exception and set status EXCEPTION", async () => {
      const balWidgetBefore = await ledgerRepo.getBalance(orgA, "sku_widget_01", warehouseA);
      const availableBefore = calculateSellableAvailable(balWidgetBefore!);

      const result = await orderService.importOrder({
        organizationId: orgA,
        channelAccountId: channelAccA,
        externalOrderId: "EXT-ORD-UNMAPPED-01",
        orderNumber: "#UNMAPPED-01",
        orderedAt: new Date().toISOString(),
        items: [
          {
            externalLineId: "line_known",
            sku: "WIDGET-01", // Mapped SKU
            quantity: 2,
          },
          {
            externalLineId: "line_unknown",
            sku: "UNKNOWN-SKU-999", // Unmapped SKU
            quantity: 10,
          },
        ],
        warehouseId: warehouseA,
        autoReserve: true,
        correlationId: "corr_unmapped_1",
      });

      // 1. Order status is EXCEPTION due to unmapped SKU
      assert.equal(result.order.status, "EXCEPTION");

      // 2. Unmapped item stored with sku_id: null
      const unmappedItem = result.order.items.find((i) => i.external_line_id === "line_unknown");
      assert.ok(unmappedItem);
      assert.equal(unmappedItem.sku_id, null);

      // 3. Exception created and persisted
      assert.equal(result.exceptions.length, 1);
      const ex = result.exceptions[0];
      assert.equal(ex.type, "ORDER_UNMAPPED_SKU");
      assert.equal(ex.severity, "MEDIUM");
      assert.equal(ex.entityType, "ORDER_ITEM");
      assert.equal(ex.entityId, unmappedItem.id);
      assert.equal(ex.rootCause?.unmappedSkuCode, "UNKNOWN-SKU-999");
      assert.equal(ex.rootCause?.externalOrderId, "EXT-ORD-UNMAPPED-01");

      // 4. Mapped item reserved 2 units, unmapped item touched 0 inventory
      assert.equal(result.reservations.length, 1);
      assert.equal(result.reservations[0].sku_id, "sku_widget_01");
      assert.equal(result.reservations[0].quantity, 2);

      const balWidgetAfter = await ledgerRepo.getBalance(orgA, "sku_widget_01", warehouseA);
      assert.equal(calculateSellableAvailable(balWidgetAfter!), availableBefore - 2);

      // 5. Order events include ORDER_UNMAPPED_SKU
      const events = await orderService.getOrderEvents(orgA, result.order.id);
      assert.ok(events.some((e) => e.event_type === "ORDER_UNMAPPED_SKU"));
    });
  });

  describe("4. Reservation Association & Querying", () => {
    it("should associate reservations with order_id and allow querying by order", async () => {
      const result = await orderService.importOrder({
        organizationId: orgA,
        channelAccountId: channelAccA,
        externalOrderId: "EXT-ORD-RES-01",
        orderNumber: "#RES-01",
        orderedAt: new Date().toISOString(),
        items: [
          {
            externalLineId: "line_1",
            sku: "WIDGET-01",
            quantity: 4,
          },
        ],
        warehouseId: warehouseA,
        autoReserve: true,
        correlationId: "corr_res_assoc",
      });

      const orderReservations = await orderService.getOrderReservations(orgA, result.order.id);
      assert.equal(orderReservations.length, 1);
      assert.equal(orderReservations[0].order_id, result.order.id);
      assert.equal(orderReservations[0].sku_id, "sku_widget_01");
      assert.equal(orderReservations[0].quantity, 4);
      assert.equal(orderReservations[0].status, "ACTIVE");

      // Fetch full order with reservations
      const fetched = await orderService.getOrder(orgA, result.order.id);
      assert.equal(fetched.reservations.length, 1);
      assert.equal(fetched.reservations[0].id, orderReservations[0].id);
    });
  });

  describe("5. Order Cancellation & Reservation Release Gate", () => {
    it("should cancel order, transition status to CANCELLED, and release all active reservations back to available stock", async () => {
      // 1. Create order with 8 reserved units
      const importResult = await orderService.importOrder({
        organizationId: orgA,
        channelAccountId: channelAccA,
        externalOrderId: "EXT-ORD-CANCEL-01",
        orderNumber: "#CANCEL-01",
        orderedAt: new Date().toISOString(),
        items: [
          {
            externalLineId: "line_1",
            sku: "WIDGET-01",
            quantity: 8,
          },
        ],
        warehouseId: warehouseA,
        autoReserve: true,
        correlationId: "corr_cancel_pre",
      });

      const balWhileActive = await ledgerRepo.getBalance(orgA, "sku_widget_01", warehouseA);
      assert.equal(calculateSellableAvailable(balWhileActive!), 82); // 100 - 8 - 10 = 82

      // 2. Cancel order
      const cancelResult = await orderService.cancelOrder({
        organizationId: orgA,
        orderId: importResult.order.id,
        reason: "Customer changed mind",
        correlationId: "corr_cancel_exec",
      });

      assert.equal(cancelResult.order.status, "CANCELLED");
      assert.equal(cancelResult.releasedReservations.length, 1);
      assert.equal(cancelResult.releasedReservations[0].status, "RELEASED");

      // 3. Verify stock restored to sellable available
      const balRestored = await ledgerRepo.getBalance(orgA, "sku_widget_01", warehouseA);
      assert.equal(calculateSellableAvailable(balRestored!), 90); // 100 - 0 - 10 = 90

      // 4. Verify order events
      const events = await orderService.getOrderEvents(orgA, importResult.order.id);
      assert.ok(events.some((e) => e.event_type === "ORDER_CANCELLED"));
      assert.ok(events.some((e) => e.event_type === "ORDER_RESERVATION_RELEASED"));

      // 5. Subsequent cancel call is idempotent
      const secondCancel = await orderService.cancelOrder({
        organizationId: orgA,
        orderId: importResult.order.id,
        correlationId: "corr_cancel_dup",
      });
      assert.equal(secondCancel.order.status, "CANCELLED");
      assert.equal(secondCancel.releasedReservations.length, 0);
    });

    it("should reject cancelling non-existent order with OrderNotFoundError", async () => {
      await assert.rejects(
        async () => {
          await orderService.cancelOrder({
            organizationId: orgA,
            orderId: "ord_ghost_999",
            correlationId: "corr_ghost",
          });
        },
        (err: unknown) => err instanceof OrderNotFoundError
      );
    });
  });

  describe("6. Tenant Isolation Gate", () => {
    it("should forbid Organization B from viewing, retrieving, or cancelling Organization A's orders", async () => {
      // 1. Create order for Org A
      const importResult = await orderService.importOrder({
        organizationId: orgA,
        channelAccountId: channelAccA,
        externalOrderId: "EXT-ORD-ISO-01",
        orderNumber: "#ISO-01",
        orderedAt: new Date().toISOString(),
        items: [
          {
            externalLineId: "line_1",
            sku: "WIDGET-01",
            quantity: 1,
          },
        ],
        warehouseId: warehouseA,
        correlationId: "corr_iso_1",
      });

      // 2. Org B attempts to retrieve Org A's order
      await assert.rejects(
        async () => {
          await orderService.getOrder(orgA, importResult.order.id, orgB);
        },
        (err: unknown) => err instanceof TenantAccessDeniedError
      );

      // 3. Org B attempts to cancel Org A's order
      await assert.rejects(
        async () => {
          await orderService.cancelOrder({
            organizationId: orgA,
            orderId: importResult.order.id,
            correlationId: "corr_iso_cancel",
            authenticatedOrgId: orgB,
          });
        },
        (err: unknown) => err instanceof TenantAccessDeniedError
      );

      // 4. Org B listing orders sees 0 orders
      const listB = await orderService.listOrders(orgB, undefined, orgB);
      assert.equal(listB.total, 0);
      assert.equal(listB.orders.length, 0);
    });
  });

  describe("7. REST API Endpoints & RBAC Conformance", () => {
    let apiServer: Server;
    let baseUrl: string;

    before(async () => {
      const mockAuth = createMockAuthForOrderTesting();
      apiServer = startApiServer({
        portOverride: 0,
        authAdapter: mockAuth,
        orderService,
      });

      await new Promise<void>((resolve) => {
        apiServer.on("listening", () => {
          const addr = apiServer.address();
          if (addr && typeof addr === "object") {
            baseUrl = `http://127.0.0.1:${addr.port}`;
          }
          resolve();
        });
      });
    });

    after(async () => {
      await new Promise<void>((resolve) => {
        apiServer.close(() => resolve());
      });
    });

    it("POST /orders: should import order and return 201 Created with envelope", async () => {
      const res = await fetch(`${baseUrl}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token_org_a_owner",
        },
        body: JSON.stringify({
          channelAccountId: channelAccA,
          externalOrderId: "HTTP-ORD-101",
          orderNumber: "#HTTP-101",
          orderedAt: new Date().toISOString(),
          items: [
            {
              externalLineId: "line_1",
              sku: "WIDGET-01",
              quantity: 2,
              unitPrice: 25.0,
            },
          ],
          warehouseId: warehouseA,
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.ok(json.data);
      assert.equal(json.data.externalOrderId, "HTTP-ORD-101");
      assert.equal(json.data.status, "PENDING");
      assert.ok(json.meta?.correlationId);
    });

    it("POST /orders: duplicate order should return 200 OK without double creation", async () => {
      const payload = {
        channelAccountId: channelAccA,
        externalOrderId: "HTTP-ORD-101", // Duplicate of above
        orderNumber: "#HTTP-101",
        orderedAt: new Date().toISOString(),
        items: [
          {
            externalLineId: "line_1",
            sku: "WIDGET-01",
            quantity: 2,
            unitPrice: 25.0,
          },
        ],
        warehouseId: warehouseA,
      };

      const res = await fetch(`${baseUrl}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token_org_a_owner",
        },
        body: JSON.stringify(payload),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.externalOrderId, "HTTP-ORD-101");
    });

    it("GET /orders: should list orders with envelope and pagination", async () => {
      const res = await fetch(`${baseUrl}/orders`, {
        headers: {
          Authorization: "Bearer token_org_a_owner",
        },
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.data));
      assert.ok(json.data.length >= 1);
      assert.ok(json.meta?.correlationId);
    });

    it("GET /orders/:id: should retrieve single order", async () => {
      // First get an existing order ID from list
      const listRes = await fetch(`${baseUrl}/orders`, {
        headers: { Authorization: "Bearer token_org_a_owner" },
      });
      const listJson = await listRes.json();
      const orderId = listJson.data[0].id;

      const res = await fetch(`${baseUrl}/orders/${orderId}`, {
        headers: { Authorization: "Bearer token_org_a_owner" },
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.id, orderId);
    });

    it("GET /orders/:id/events: should return order event history", async () => {
      const listRes = await fetch(`${baseUrl}/orders`, {
        headers: { Authorization: "Bearer token_org_a_owner" },
      });
      const listJson = await listRes.json();
      const orderId = listJson.data[0].id;

      const res = await fetch(`${baseUrl}/orders/${orderId}/events`, {
        headers: { Authorization: "Bearer token_org_a_owner" },
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.data));
      assert.ok(json.data.some((e: any) => e.eventType === "ORDER_IMPORTED"));
    });

    it("GET /orders/:id/reservations: should return order reservations", async () => {
      const listRes = await fetch(`${baseUrl}/orders`, {
        headers: { Authorization: "Bearer token_org_a_owner" },
      });
      const listJson = await listRes.json();
      const orderId = listJson.data[0].id;

      const res = await fetch(`${baseUrl}/orders/${orderId}/reservations`, {
        headers: { Authorization: "Bearer token_org_a_owner" },
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(Array.isArray(json.data));
      assert.ok(json.data.length >= 1);
    });

    it("POST /orders/:id/cancel: should cancel order and release reservation", async () => {
      const listRes = await fetch(`${baseUrl}/orders`, {
        headers: { Authorization: "Bearer token_org_a_owner" },
      });
      const listJson = await listRes.json();
      const orderId = listJson.data[0].id;

      const res = await fetch(`${baseUrl}/orders/${orderId}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token_org_a_owner",
        },
        body: JSON.stringify({ reason: "Customer requested cancellation via API" }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.status, "CANCELLED");
    });

    it("RBAC enforcement: VIEWER role lacks orders:write and is forbidden from POST /orders", async () => {
      const res = await fetch(`${baseUrl}/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token_org_a_viewer",
        },
        body: JSON.stringify({
          channelAccountId: channelAccA,
          externalOrderId: "HTTP-ORD-VIEWER",
          orderNumber: "#VIEWER",
          orderedAt: new Date().toISOString(),
          items: [
            {
              externalLineId: "line_1",
              sku: "WIDGET-01",
              quantity: 1,
            },
          ],
        }),
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.error?.code, "FORBIDDEN");
    });

    it("HTTP Tenant Isolation: Org B user is forbidden from retrieving Org A order", async () => {
      const listRes = await fetch(`${baseUrl}/orders`, {
        headers: { Authorization: "Bearer token_org_a_owner" },
      });
      const listJson = await listRes.json();
      const orderId = listJson.data[0].id;

      const res = await fetch(`${baseUrl}/orders/${orderId}`, {
        headers: { Authorization: "Bearer token_org_b_owner" },
      });

      assert.equal(res.status, 403);
      const json = await res.json();
      assert.equal(json.error?.code, "FORBIDDEN");
    });
  });
});
