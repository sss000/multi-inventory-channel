/**
 * Order Domain Service & Lifecycle Controller
 * Canonical Specification: Section 18, 19, 50 of 01_ENGINEERING_SPEC.md & Prompt 10 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * 
 * Rules:
 * 1. External order identity must use: (organization_id, channel_account_id, external_order_id).
 * 2. Duplicate external order requests must be handled idempotently without duplicating mutations or reservations.
 * 3. If an order item cannot be mapped to a SKU: DO NOT silently reduce inventory. Instead create an ORDER_UNMAPPED_SKU exception.
 * 4. Cancelled orders must release all active inventory reservations back to available stock.
 * 5. Reservation association must bind order_id on inventory_reservations.
 * 6. Tenant isolation enforced on all order operations.
 */

import {
  OrderRow,
  OrderItemRow,
  OrderWithItemsRow,
  OrderEventRow,
  OrderStatus,
  PaymentStatus,
  FulfillmentStatus,
  SkuRow,
  InventoryReservationRow,
} from "./schema/types.js";
import { ReservationService } from "./reservations.js";
import {
  OrderInvariantError,
  OrderNotFoundError,
  TenantAccessDeniedError,
  DomainException,
  createDomainException,
  OrganizationId,
} from "@platform/domain";

export interface ImportOrderItemParam {
  externalLineId: string;
  sku?: string;
  skuId?: string;
  quantity: number;
  unitPrice?: number;
  discount?: number;
  tax?: number;
  metadata?: Record<string, unknown>;
}

export interface ImportOrderParams {
  organizationId: string;
  channelAccountId: string;
  externalOrderId: string;
  orderNumber: string;
  currency?: string;
  subtotal?: number;
  tax?: number;
  shipping?: number;
  discount?: number;
  total?: number;
  customer?: Record<string, unknown>;
  shippingAddress?: Record<string, unknown>;
  billingAddress?: Record<string, unknown>;
  orderedAt: string;
  items: ImportOrderItemParam[];
  autoReserve?: boolean;
  warehouseId?: string;
  idempotencyKey?: string;
  actorId?: string;
  correlationId: string;
  authenticatedOrgId?: string;
}

export interface CancelOrderParams {
  organizationId: string;
  orderId: string;
  reason?: string;
  actorId?: string;
  correlationId: string;
  authenticatedOrgId?: string;
}

export interface OrderListFilters {
  status?: OrderStatus;
  channelAccountId?: string;
  limit?: number;
  offset?: number;
}

export interface OrderWithItemsAndReservations extends OrderWithItemsRow {
  reservations: InventoryReservationRow[];
  exceptions?: DomainException[];
}

export interface ImportOrderResult {
  order: OrderWithItemsRow;
  reservations: InventoryReservationRow[];
  exceptions: DomainException[];
  isDuplicate?: boolean;
}

export interface CancelOrderResult {
  order: OrderWithItemsRow;
  releasedReservations: InventoryReservationRow[];
}

export interface OrderRepository {
  createOrder(order: OrderRow, items: OrderItemRow[]): Promise<OrderWithItemsRow>;
  findOrderByExternalId(
    organizationId: string,
    channelAccountId: string,
    externalOrderId: string
  ): Promise<OrderWithItemsRow | null>;
  findOrderById(organizationId: string, orderId: string): Promise<OrderWithItemsRow | null>;
  updateOrder(organizationId: string, orderId: string, patch: Partial<OrderRow>): Promise<OrderWithItemsRow>;
  listOrders(
    organizationId: string,
    filters?: OrderListFilters
  ): Promise<{ orders: OrderWithItemsRow[]; total: number }>;
  recordOrderEvent(event: OrderEventRow): Promise<void>;
  getOrderEvents(organizationId: string, orderId: string): Promise<OrderEventRow[]>;
  recordException(exception: DomainException): Promise<void>;
  getExceptions(organizationId: string, entityId?: string): Promise<DomainException[]>;
  findSkuByCode(organizationId: string, skuCode: string): Promise<SkuRow | null>;
  findSkuById(organizationId: string, skuId: string): Promise<SkuRow | null>;
  seedSku?(sku: SkuRow): Promise<void>;
}

export class InMemoryOrderRepository implements OrderRepository {
  private orders = new Map<string, OrderRow>();
  private orderItems = new Map<string, OrderItemRow[]>();
  private externalIndex = new Map<string, string>(); // `${orgId}:${channelAccountId}:${externalOrderId}` -> orderId
  private orderEvents = new Map<string, OrderEventRow[]>();
  private exceptions = new Map<string, DomainException[]>();
  private skus = new Map<string, SkuRow>(); // `${orgId}:${skuId}` -> SkuRow
  private skuCodeIndex = new Map<string, string>(); // `${orgId}:${code}` -> skuId
  private orderIdToOrgIndex = new Map<string, string>(); // orderId -> organizationId

  async seedSku(sku: SkuRow): Promise<void> {
    const key = `${sku.organization_id}:${sku.id}`;
    this.skus.set(key, { ...sku });
    this.skuCodeIndex.set(`${sku.organization_id}:${sku.code}`, sku.id);
  }

  async findSkuById(organizationId: string, skuId: string): Promise<SkuRow | null> {
    const sku = this.skus.get(`${organizationId}:${skuId}`);
    return sku ? { ...sku } : null;
  }

  async findSkuByCode(organizationId: string, skuCode: string): Promise<SkuRow | null> {
    const skuId = this.skuCodeIndex.get(`${organizationId}:${skuCode}`);
    if (!skuId) return null;
    return this.findSkuById(organizationId, skuId);
  }

  async createOrder(order: OrderRow, items: OrderItemRow[]): Promise<OrderWithItemsRow> {
    const orderKey = `${order.organization_id}:${order.id}`;
    this.orders.set(orderKey, { ...order });
    this.orderItems.set(orderKey, items.map((i) => ({ ...i })));

    const extKey = `${order.organization_id}:${order.channel_account_id}:${order.external_order_id}`;
    this.externalIndex.set(extKey, order.id);
    this.orderIdToOrgIndex.set(order.id, order.organization_id);

    return {
      ...order,
      items: items.map((i) => ({ ...i })),
    };
  }

  async findOrderByExternalId(
    organizationId: string,
    channelAccountId: string,
    externalOrderId: string
  ): Promise<OrderWithItemsRow | null> {
    const extKey = `${organizationId}:${channelAccountId}:${externalOrderId}`;
    const orderId = this.externalIndex.get(extKey);
    if (!orderId) return null;
    return this.findOrderById(organizationId, orderId);
  }

  async findOrderById(organizationId: string, orderId: string): Promise<OrderWithItemsRow | null> {
    const ownerOrg = this.orderIdToOrgIndex.get(orderId);
    if (ownerOrg && ownerOrg !== organizationId) {
      throw new TenantAccessDeniedError(ownerOrg, organizationId);
    }
    const orderKey = `${organizationId}:${orderId}`;
    const order = this.orders.get(orderKey);
    if (!order) return null;
    const items = this.orderItems.get(orderKey) || [];
    return {
      ...order,
      items: items.map((i) => ({ ...i })),
    };
  }

  async updateOrder(
    organizationId: string,
    orderId: string,
    patch: Partial<OrderRow>
  ): Promise<OrderWithItemsRow> {
    const ownerOrg = this.orderIdToOrgIndex.get(orderId);
    if (ownerOrg && ownerOrg !== organizationId) {
      throw new TenantAccessDeniedError(ownerOrg, organizationId);
    }
    const orderKey = `${organizationId}:${orderId}`;
    const existing = this.orders.get(orderKey);
    if (!existing) {
      throw new OrderNotFoundError(orderId);
    }
    const updated: OrderRow = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    this.orders.set(orderKey, updated);
    const items = this.orderItems.get(orderKey) || [];
    return {
      ...updated,
      items: items.map((i) => ({ ...i })),
    };
  }

  async listOrders(
    organizationId: string,
    filters?: OrderListFilters
  ): Promise<{ orders: OrderWithItemsRow[]; total: number }> {
    let result: OrderWithItemsRow[] = [];
    for (const [key, order] of this.orders.entries()) {
      if (order.organization_id !== organizationId) continue;
      if (filters?.status && order.status !== filters.status) continue;
      if (filters?.channelAccountId && order.channel_account_id !== filters.channelAccountId) continue;

      const items = this.orderItems.get(key) || [];
      result.push({
        ...order,
        items: items.map((i) => ({ ...i })),
      });
    }

    result.sort((a, b) => new Date(b.ordered_at).getTime() - new Date(a.ordered_at).getTime());
    const total = result.length;

    const offset = filters?.offset ?? 0;
    const limit = filters?.limit ?? 50;
    result = result.slice(offset, offset + limit);

    return { orders: result, total };
  }

  async recordOrderEvent(event: OrderEventRow): Promise<void> {
    const key = `${event.organization_id}:${event.order_id}`;
    const list = this.orderEvents.get(key) || [];
    list.push({ ...event });
    this.orderEvents.set(key, list);
  }

  async getOrderEvents(organizationId: string, orderId: string): Promise<OrderEventRow[]> {
    const ownerOrg = this.orderIdToOrgIndex.get(orderId);
    if (ownerOrg && ownerOrg !== organizationId) {
      throw new TenantAccessDeniedError(ownerOrg, organizationId);
    }
    const key = `${organizationId}:${orderId}`;
    return (this.orderEvents.get(key) || []).map((e) => ({ ...e }));
  }


  async recordException(exception: DomainException): Promise<void> {
    const list = this.exceptions.get(exception.organizationId) || [];
    list.push({ ...exception });
    this.exceptions.set(exception.organizationId, list);
  }

  async getExceptions(organizationId: string, entityId?: string): Promise<DomainException[]> {
    const list = this.exceptions.get(organizationId as OrganizationId) || [];
    if (entityId) {
      return list.filter((e) => e.entityId === entityId);
    }
    return list.map((e) => ({ ...e }));
  }
}

export class OrderService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly reservationService: ReservationService
  ) {}

  private validateTenant(requestedOrgId: string, authenticatedOrgId?: string): void {
    if (authenticatedOrgId && requestedOrgId !== authenticatedOrgId) {
      throw new TenantAccessDeniedError(requestedOrgId, authenticatedOrgId);
    }
  }

  /**
   * 1. Import or Create Order
   * Handles idempotency via (organization, channelAccount, externalOrderId).
   * Identifies unmapped SKUs and generates ORDER_UNMAPPED_SKU domain exceptions without reducing inventory.
   * Associates reservations for mapped items.
   */
  async importOrder(params: ImportOrderParams): Promise<ImportOrderResult> {
    this.validateTenant(params.organizationId, params.authenticatedOrgId);

    if (!params.items || params.items.length === 0) {
      throw new OrderInvariantError("Order must contain at least one line item.");
    }

    // 1. Idempotency Check: External order identity
    const existingOrder = await this.repository.findOrderByExternalId(
      params.organizationId,
      params.channelAccountId,
      params.externalOrderId
    );

    if (existingOrder) {
      // Order already exists. Retrieve associated reservations.
      const reservations = await this.reservationService.listReservations(params.organizationId, {
        orderId: existingOrder.id,
      });
      const exceptions = await this.repository.getExceptions(params.organizationId);
      const orderExceptions = exceptions.filter(
        (e) => e.rootCause?.externalOrderId === params.externalOrderId
      );

      return {
        order: existingOrder,
        reservations,
        exceptions: orderExceptions,
        isDuplicate: true,
      };
    }

    // 2. Process Line Items and Detect Unmapped SKUs
    const orderId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();
    const itemRows: OrderItemRow[] = [];
    const generatedExceptions: DomainException[] = [];
    const itemsToReserve: Array<{ skuId: string; quantity: number }> = [];

    for (const item of params.items) {
      if (item.quantity <= 0) {
        throw new OrderInvariantError(
          `Item quantity must be strictly positive (received ${item.quantity} for line '${item.externalLineId}')`
        );
      }

      const itemId = `item_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      let resolvedSku: SkuRow | null = null;

      if (item.skuId) {
        resolvedSku = await this.repository.findSkuById(params.organizationId, item.skuId);
      } else if (item.sku) {
        resolvedSku = await this.repository.findSkuByCode(params.organizationId, item.sku);
      }

      if (!resolvedSku) {
        // CRITICAL INVARIANT: DO NOT silently reduce inventory. Instead create an ORDER_UNMAPPED_SKU exception.
        const ex = createDomainException({
          organizationId: params.organizationId as OrganizationId,
          type: "ORDER_UNMAPPED_SKU",
          entityType: "ORDER_ITEM",
          entityId: itemId,
          title: `Unmapped SKU in external order ${params.externalOrderId}`,
          description: `Order item '${item.externalLineId}' with external SKU identifier '${item.sku ?? "UNKNOWN"}' could not be mapped to any existing catalog SKU.`,
          rootCause: {
            organizationId: params.organizationId,
            channelAccountId: params.channelAccountId,
            externalOrderId: params.externalOrderId,
            externalLineId: item.externalLineId,
            unmappedSkuCode: item.sku ?? null,
          },
          recommendedAction: {
            action: "MAP_SKU",
            details: "Create SKU in catalog or map external channel SKU to an internal SKU.",
          },
        });

        await this.repository.recordException(ex);
        generatedExceptions.push(ex);

        itemRows.push({
          id: itemId,
          order_id: orderId,
          sku_id: null,
          external_line_id: item.externalLineId,
          quantity: item.quantity,
          unit_price: item.unitPrice ?? 0,
          discount: item.discount ?? 0,
          tax: item.tax ?? 0,
          metadata: item.metadata ?? {},
          created_at: now,
        });
      } else {
        itemRows.push({
          id: itemId,
          order_id: orderId,
          sku_id: resolvedSku.id,
          external_line_id: item.externalLineId,
          quantity: item.quantity,
          unit_price: item.unitPrice ?? 0,
          discount: item.discount ?? 0,
          tax: item.tax ?? 0,
          metadata: item.metadata ?? {},
          created_at: now,
        });

        itemsToReserve.push({
          skuId: resolvedSku.id,
          quantity: item.quantity,
        });
      }
    }

    // 3. Determine initial order status
    const hasUnmappedSku = generatedExceptions.length > 0;
    const initialStatus: OrderStatus = hasUnmappedSku ? "EXCEPTION" : "PENDING";

    const orderRow: OrderRow = {
      id: orderId,
      organization_id: params.organizationId,
      channel_account_id: params.channelAccountId,
      external_order_id: params.externalOrderId,
      order_number: params.orderNumber,
      status: initialStatus,
      payment_status: "PENDING",
      fulfillment_status: "UNFULFILLED",
      currency: params.currency || "USD",
      subtotal: params.subtotal ?? 0,
      tax: params.tax ?? 0,
      shipping: params.shipping ?? 0,
      discount: params.discount ?? 0,
      total: params.total ?? 0,
      customer: params.customer || {},
      shipping_address: params.shippingAddress || {},
      billing_address: params.billingAddress || {},
      ordered_at: params.orderedAt,
      imported_at: now,
      updated_at: now,
    };

    // 4. Persist Order and Items
    const createdOrder = await this.repository.createOrder(orderRow, itemRows);

    // 5. Emit ORDER_IMPORTED Event
    await this.repository.recordOrderEvent({
      id: `evt_ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      order_id: orderId,
      organization_id: params.organizationId,
      event_type: "ORDER_IMPORTED",
      payload: {
        externalOrderId: params.externalOrderId,
        channelAccountId: params.channelAccountId,
        itemsCount: itemRows.length,
        hasUnmappedSku,
        unmappedCount: generatedExceptions.length,
      },
      actor_type: params.actorId ? "USER" : "SYSTEM",
      actor_id: params.actorId ?? null,
      created_at: now,
    });

    if (hasUnmappedSku) {
      await this.repository.recordOrderEvent({
        id: `evt_ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        order_id: orderId,
        organization_id: params.organizationId,
        event_type: "ORDER_UNMAPPED_SKU",
        payload: {
          exceptionIds: generatedExceptions.map((e) => e.id),
        },
        actor_type: "SYSTEM",
        actor_id: null,
        created_at: now,
      });
    }

    // 6. Reservation Association for Mapped SKUs
    const createdReservations: InventoryReservationRow[] = [];
    if (params.autoReserve !== false && params.warehouseId && itemsToReserve.length > 0) {
      for (const itemToReserve of itemsToReserve) {
        try {
          const res = await this.reservationService.reserve({
            organizationId: params.organizationId,
            skuId: itemToReserve.skuId,
            warehouseId: params.warehouseId,
            quantity: itemToReserve.quantity,
            orderId: orderId,
            actorId: params.actorId,
            correlationId: params.correlationId,
            idempotencyKey: params.idempotencyKey
              ? `${params.idempotencyKey}:res:${itemToReserve.skuId}`
              : undefined,
            authenticatedOrgId: params.authenticatedOrgId,
          });

          createdReservations.push(res.reservation);

          await this.repository.recordOrderEvent({
            id: `evt_ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            order_id: orderId,
            organization_id: params.organizationId,
            event_type: "ORDER_RESERVATION_CREATED",
            payload: {
              reservationId: res.reservation.id,
              skuId: itemToReserve.skuId,
              quantity: itemToReserve.quantity,
              warehouseId: params.warehouseId,
            },
            actor_type: params.actorId ? "USER" : "SYSTEM",
            actor_id: params.actorId ?? null,
            created_at: new Date().toISOString(),
          });
        } catch (err: unknown) {
          // If reservation fails (e.g. insufficient inventory), record event without corrupting order
          await this.repository.recordOrderEvent({
            id: `evt_ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            order_id: orderId,
            organization_id: params.organizationId,
            event_type: "ORDER_RESERVATION_FAILED",
            payload: {
              skuId: itemToReserve.skuId,
              quantity: itemToReserve.quantity,
              error: err instanceof Error ? err.message : String(err),
            },
            actor_type: "SYSTEM",
            actor_id: null,
            created_at: new Date().toISOString(),
          });
        }
      }
    }

    return {
      order: createdOrder,
      reservations: createdReservations,
      exceptions: generatedExceptions,
      isDuplicate: false,
    };
  }

  /**
   * 2. Cancel Order
   * Releases all active reservations back to available stock.
   */
  async cancelOrder(params: CancelOrderParams): Promise<CancelOrderResult> {
    this.validateTenant(params.organizationId, params.authenticatedOrgId);

    const existingOrder = await this.repository.findOrderById(params.organizationId, params.orderId);
    if (!existingOrder) {
      throw new OrderNotFoundError(params.orderId);
    }

    if (existingOrder.status === "CANCELLED") {
      // Idempotent cancellation
      return {
        order: existingOrder,
        releasedReservations: [],
      };
    }

    if (existingOrder.status === "COMPLETED") {
      throw new OrderInvariantError(
        `Cannot cancel order '${params.orderId}': order is already COMPLETED.`
      );
    }

    // Update order status to CANCELLED
    const updatedOrder = await this.repository.updateOrder(params.organizationId, params.orderId, {
      status: "CANCELLED",
    });

    const now = new Date().toISOString();
    await this.repository.recordOrderEvent({
      id: `evt_ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      order_id: params.orderId,
      organization_id: params.organizationId,
      event_type: "ORDER_CANCELLED",
      payload: {
        reason: params.reason || "Customer requested cancellation",
        previousStatus: existingOrder.status,
      },
      actor_type: params.actorId ? "USER" : "SYSTEM",
      actor_id: params.actorId ?? null,
      created_at: now,
    });

    // Find and release all ACTIVE reservations associated with this order
    const orderReservations = await this.reservationService.listReservations(params.organizationId, {
      orderId: params.orderId,
    });

    const released: InventoryReservationRow[] = [];
    for (const res of orderReservations) {
      if (res.status === "ACTIVE") {
        const releaseResult = await this.reservationService.release({
          organizationId: params.organizationId,
          reservationId: res.id,
          reason: params.reason || "Order cancelled",
          actorId: params.actorId,
          correlationId: params.correlationId,
          authenticatedOrgId: params.authenticatedOrgId,
        });

        released.push(releaseResult.reservation);

        await this.repository.recordOrderEvent({
          id: `evt_ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          order_id: params.orderId,
          organization_id: params.organizationId,
          event_type: "ORDER_RESERVATION_RELEASED",
          payload: {
            reservationId: res.id,
            skuId: res.sku_id,
            quantity: res.quantity,
          },
          actor_type: params.actorId ? "USER" : "SYSTEM",
          actor_id: params.actorId ?? null,
          created_at: new Date().toISOString(),
        });
      }
    }

    return {
      order: updatedOrder,
      releasedReservations: released,
    };
  }

  /**
   * 3. Get Order by ID
   */
  async getOrder(
    organizationId: string,
    orderId: string,
    authenticatedOrgId?: string
  ): Promise<OrderWithItemsAndReservations> {
    this.validateTenant(organizationId, authenticatedOrgId);

    const order = await this.repository.findOrderById(organizationId, orderId);
    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    const reservations = await this.reservationService.listReservations(organizationId, {
      orderId,
    });

    return {
      ...order,
      reservations,
    };
  }

  /**
   * 4. List Orders
   */
  async listOrders(
    organizationId: string,
    filters?: OrderListFilters,
    authenticatedOrgId?: string
  ): Promise<{ orders: OrderWithItemsRow[]; total: number }> {
    this.validateTenant(organizationId, authenticatedOrgId);
    return await this.repository.listOrders(organizationId, filters);
  }

  /**
   * 5. Get Order Events
   */
  async getOrderEvents(
    organizationId: string,
    orderId: string,
    authenticatedOrgId?: string
  ): Promise<OrderEventRow[]> {
    this.validateTenant(organizationId, authenticatedOrgId);

    const order = await this.repository.findOrderById(organizationId, orderId);
    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    return await this.repository.getOrderEvents(organizationId, orderId);
  }

  /**
   * 6. Get Order Reservations
   */
  async getOrderReservations(
    organizationId: string,
    orderId: string,
    authenticatedOrgId?: string
  ): Promise<InventoryReservationRow[]> {
    this.validateTenant(organizationId, authenticatedOrgId);

    const order = await this.repository.findOrderById(organizationId, orderId);
    if (!order) {
      throw new OrderNotFoundError(orderId);
    }

    return await this.reservationService.listReservations(organizationId, {
      orderId,
    });
  }
}
