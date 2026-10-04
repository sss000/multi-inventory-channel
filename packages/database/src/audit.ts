import {
  AuditLogRow,
  ActorType,
} from "./schema/types.js";
import {
  ImmutableAuditLogError,
  TenantAccessDeniedError,
  AuditNotFoundError,
  AuditInvariantError,
  reconstructDiscrepancyTrail,
  ReconstructedAuditTrail,
} from "@platform/domain";
import {
  AuditLogFilter,
  AuditLogDto,
} from "@platform/contracts";

/**
 * Transforms an internal database AuditLogRow to an external AuditLogDto.
 */
export function toAuditLogDto(row: AuditLogRow): AuditLogDto {
  return {
    id: row.id,
    organizationId: row.organization_id,
    actorType: row.actor_type,
    actorId: row.actor_id,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    beforeState: row.before_state,
    afterState: row.after_state,
    reason: row.reason,
    requestId: row.request_id,
    correlationId: row.correlation_id,
    createdAt: row.created_at,
  };
}

/**
 * Audit Database Repository, Service & Acceptance Engine
 * Canonical Specification: Sections 35, 36, 68, 114 of 01_ENGINEERING_SPEC.md & Prompt 21
 *
 * Enforces:
 * 1. Strict append-only immutability: updates and deletes are permanently forbidden.
 * 2. Multi-tenant isolation: Organization B can never view Organization A's audit history.
 * 3. 8 Material mutation audit categories.
 * 4. Causal timeline reconstruction (Section 114 Acceptance Test).
 */

export interface AuditRepository {
  record(entry: AuditLogRow): Promise<void>;
  recordBatch(entries: AuditLogRow[]): Promise<void>;
  findById(organizationId: string, id: string): Promise<AuditLogRow | null>;
  list(
    organizationId: string,
    filter?: AuditLogFilter
  ): Promise<{ items: AuditLogRow[]; total: number }>;
  findByCorrelationId(organizationId: string, correlationId: string): Promise<AuditLogRow[]>;
  findByEntity(organizationId: string, entityType: string, entityId: string): Promise<AuditLogRow[]>;
  update(organizationId: string, id: string, data: unknown): Promise<never>;
  delete(organizationId: string, id: string): Promise<never>;
}

export class InMemoryAuditRepository implements AuditRepository {
  private auditLogs: (AuditLogRow & { _seq: number })[] = [];
  private seq = 0;

  async record(entry: AuditLogRow): Promise<void> {
    if (!entry.organization_id) {
      throw new AuditInvariantError("Audit record requires a valid organization_id.");
    }
    if (!entry.action || entry.action.trim() === "") {
      throw new AuditInvariantError("Audit record requires a non-empty action.");
    }
    if (!entry.entity_type || entry.entity_type.trim() === "") {
      throw new AuditInvariantError("Audit record requires a non-empty entity_type.");
    }
    if (!entry.entity_id || entry.entity_id.trim() === "") {
      throw new AuditInvariantError("Audit record requires a non-empty entity_id.");
    }
    if (!entry.correlation_id) {
      throw new AuditInvariantError("Audit record requires a correlation_id.");
    }

    const row: AuditLogRow & { _seq: number } = {
      ...entry,
      id: entry.id || `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      created_at: entry.created_at || new Date().toISOString(),
      _seq: ++this.seq,
    };

    this.auditLogs.push(row);
  }

  async recordBatch(entries: AuditLogRow[]): Promise<void> {
    for (const entry of entries) {
      await this.record(entry);
    }
  }

  async findById(organizationId: string, id: string): Promise<AuditLogRow | null> {
    const log = this.auditLogs.find((l) => l.id === id);
    if (!log) return null;
    if (log.organization_id !== organizationId) {
      throw new TenantAccessDeniedError(
        log.organization_id,
        organizationId,
        `Cross-tenant access violation: audit record '${id}' belongs to organization '${log.organization_id}', not '${organizationId}'.`
      );
    }
    const { _seq, ...clean } = log;
    return clean;
  }

  async list(
    organizationId: string,
    filter?: AuditLogFilter
  ): Promise<{ items: AuditLogRow[]; total: number }> {
    const all = this.auditLogs
      .filter((l) => l.organization_id === organizationId)
      .filter((l) => !filter?.entityType || l.entity_type === filter.entityType)
      .filter((l) => !filter?.entityId || l.entity_id === filter.entityId)
      .filter((l) => !filter?.action || l.action === filter.action)
      .filter((l) => !filter?.actorType || l.actor_type === filter.actorType)
      .filter((l) => !filter?.actorId || l.actor_id === filter.actorId)
      .filter((l) => !filter?.correlationId || l.correlation_id === filter.correlationId)
      .filter((l) => {
        if (!filter?.startDate) return true;
        const logTime = new Date(l.created_at).getTime();
        const startTime = new Date(filter.startDate).getTime();
        return logTime >= startTime;
      })
      .filter((l) => {
        if (!filter?.endDate) return true;
        const logTime = new Date(l.created_at).getTime();
        const endTime = new Date(filter.endDate).getTime();
        return logTime <= endTime;
      })
      .sort((a, b) => {
        const timeDiff = new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        if (timeDiff !== 0) return timeDiff;
        return b._seq - a._seq;
      });

    const total = all.length;
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;
    const items = all.slice(offset, offset + limit).map((l) => {
      const { _seq, ...clean } = l;
      return clean;
    });

    return { items, total };
  }

  async findByCorrelationId(organizationId: string, correlationId: string): Promise<AuditLogRow[]> {
    return this.auditLogs
      .filter((l) => l.organization_id === organizationId && l.correlation_id === correlationId)
      .sort((a, b) => a._seq - b._seq)
      .map((l) => {
        const { _seq, ...clean } = l;
        return clean;
      });
  }

  async findByEntity(
    organizationId: string,
    entityType: string,
    entityId: string
  ): Promise<AuditLogRow[]> {
    return this.auditLogs
      .filter(
        (l) =>
          l.organization_id === organizationId &&
          l.entity_type === entityType &&
          l.entity_id === entityId
      )
      .sort((a, b) => a._seq - b._seq)
      .map((l) => {
        const { _seq, ...clean } = l;
        return clean;
      });
  }

  // Section 68 & Prompt 21 Invariant: Historical audit records cannot be modified or deleted.
  async update(): Promise<never> {
    throw new ImmutableAuditLogError(
      "Audit logs are strictly append-only. Modification of historical audit records is forbidden."
    );
  }

  async delete(): Promise<never> {
    throw new ImmutableAuditLogError(
      "Audit logs are strictly append-only. Deletion of historical audit records is forbidden."
    );
  }
}

/**
 * High-Level Audit Database Service
 */
export class AuditDatabaseService {
  constructor(private readonly repository: AuditRepository = new InMemoryAuditRepository()) {}

  getRepository(): AuditRepository {
    return this.repository;
  }

  async record(entry: AuditLogRow): Promise<void> {
    await this.repository.record(entry);
  }

  async findById(organizationId: string, id: string): Promise<AuditLogRow | null> {
    return this.repository.findById(organizationId, id);
  }

  async list(
    organizationId: string,
    filter?: AuditLogFilter
  ): Promise<{ items: AuditLogRow[]; total: number }> {
    return this.repository.list(organizationId, filter);
  }

  /**
   * Section 114 & Prompt 21 Acceptance Test:
   * Given an inventory discrepancy or correlation ID, reconstruct:
   * before, event, actor, reason, after, channel impact, synchronization result, resolution.
   */
  async reconstructDiscrepancy(
    organizationId: string,
    criteria: { correlationId?: string; entityType?: string; entityId?: string }
  ): Promise<ReconstructedAuditTrail> {
    let logs: AuditLogRow[] = [];

    if (criteria.correlationId) {
      logs = await this.repository.findByCorrelationId(organizationId, criteria.correlationId);
    } else if (criteria.entityType && criteria.entityId) {
      logs = await this.repository.findByEntity(
        organizationId,
        criteria.entityType,
        criteria.entityId
      );
    } else {
      throw new AuditInvariantError(
        "Reconstruction requires either correlationId or entityType and entityId."
      );
    }

    if (logs.length === 0) {
      throw new AuditNotFoundError(
        criteria.correlationId || `${criteria.entityType}:${criteria.entityId}`,
        { criteria }
      );
    }

    return reconstructDiscrepancyTrail(logs);
  }

  // -------------------------------------------------------------
  // Audit Mutation Helpers across the 8 Canonical Categories
  // -------------------------------------------------------------

  // 1. Inventory adjustments
  async recordInventoryAdjustment(params: {
    organizationId: string;
    actorType: ActorType;
    actorId?: string | null;
    action:
      | "INVENTORY_ADJUSTMENT"
      | "INVENTORY_IMPORT"
      | "INVENTORY_RECEIPT"
      | "INVENTORY_RECOUNT"
      | "INVENTORY_DAMAGE"
      | "INVENTORY_TRANSFER"
      | "INVENTORY_RECONCILIATION_CORRECTION"
      | "INVENTORY_RESERVE"
      | "INVENTORY_RELEASE"
      | "INVENTORY_FULFILL";
    skuId: string;
    warehouseId?: string;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    reason?: string | null;
    requestId?: string | null;
    correlationId: string;
  }): Promise<void> {
    await this.record({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      actor_type: params.actorType,
      actor_id: params.actorId || null,
      action: params.action,
      entity_type: "inventory_balance",
      entity_id: params.skuId,
      before_state: params.beforeState || null,
      after_state: params.afterState || null,
      reason: params.reason || null,
      request_id: params.requestId || null,
      correlation_id: params.correlationId,
      created_at: new Date().toISOString(),
    });
  }

  // 2. Reconciliation
  async recordReconciliation(params: {
    organizationId: string;
    actorType: ActorType;
    actorId?: string | null;
    action:
      | "RECONCILIATION_RUN_STARTED"
      | "RECONCILIATION_RESULT_APPROVED"
      | "RECONCILIATION_RESULT_REJECTED";
    runIdOrResultId: string;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    reason?: string | null;
    requestId?: string | null;
    correlationId: string;
  }): Promise<void> {
    await this.record({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      actor_type: params.actorType,
      actor_id: params.actorId || null,
      action: params.action,
      entity_type: "reconciliation",
      entity_id: params.runIdOrResultId,
      before_state: params.beforeState || null,
      after_state: params.afterState || null,
      reason: params.reason || null,
      request_id: params.requestId || null,
      correlation_id: params.correlationId,
      created_at: new Date().toISOString(),
    });
  }

  // 3. Mapping changes
  async recordMappingChange(params: {
    organizationId: string;
    actorType: ActorType;
    actorId?: string | null;
    action: "MAPPING_CREATED" | "MAPPING_UPDATED" | "MAPPING_DELETED";
    mappingId: string;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    reason?: string | null;
    requestId?: string | null;
    correlationId: string;
  }): Promise<void> {
    await this.record({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      actor_type: params.actorType,
      actor_id: params.actorId || null,
      action: params.action,
      entity_type: "channel_product_mapping",
      entity_id: params.mappingId,
      before_state: params.beforeState || null,
      after_state: params.afterState || null,
      reason: params.reason || null,
      request_id: params.requestId || null,
      correlation_id: params.correlationId,
      created_at: new Date().toISOString(),
    });
  }

  // 4. Exception resolution
  async recordExceptionResolution(params: {
    organizationId: string;
    actorType: ActorType;
    actorId?: string | null;
    action:
      | "EXCEPTION_CREATED"
      | "EXCEPTION_RESOLVED"
      | "EXCEPTION_IGNORED"
      | "EXCEPTION_RETRIED"
      | "EXCEPTION_RECONCILED";
    exceptionId: string;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    reason?: string | null;
    requestId?: string | null;
    correlationId: string;
  }): Promise<void> {
    await this.record({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      actor_type: params.actorType,
      actor_id: params.actorId || null,
      action: params.action,
      entity_type: "exception",
      entity_id: params.exceptionId,
      before_state: params.beforeState || null,
      after_state: params.afterState || null,
      reason: params.reason || null,
      request_id: params.requestId || null,
      correlation_id: params.correlationId,
      created_at: new Date().toISOString(),
    });
  }

  // 5. Integration changes
  async recordIntegrationChange(params: {
    organizationId: string;
    actorType: ActorType;
    actorId?: string | null;
    action:
      | "INTEGRATION_CONNECTED"
      | "INTEGRATION_UPDATED"
      | "INTEGRATION_DISCONNECTED"
      | "INTEGRATION_CREDENTIALS_REFRESHED";
    channelAccountId: string;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    reason?: string | null;
    requestId?: string | null;
    correlationId: string;
  }): Promise<void> {
    await this.record({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      actor_type: params.actorType,
      actor_id: params.actorId || null,
      action: params.action,
      entity_type: "channel_account",
      entity_id: params.channelAccountId,
      before_state: params.beforeState || null,
      after_state: params.afterState || null,
      reason: params.reason || null,
      request_id: params.requestId || null,
      correlation_id: params.correlationId,
      created_at: new Date().toISOString(),
    });
  }

  // 6. Billing administrative actions
  async recordBillingAction(params: {
    organizationId: string;
    actorType: ActorType;
    actorId?: string | null;
    action:
      | "BILLING_PLAN_CHANGED"
      | "BILLING_SUBSCRIPTION_CANCELLED"
      | "BILLING_PAYMENT_METHOD_UPDATED"
      | "BILLING_ADMIN_OVERRIDE";
    billingId: string;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    reason?: string | null;
    requestId?: string | null;
    correlationId: string;
  }): Promise<void> {
    await this.record({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      actor_type: params.actorType,
      actor_id: params.actorId || null,
      action: params.action,
      entity_type: "billing",
      entity_id: params.billingId,
      before_state: params.beforeState || null,
      after_state: params.afterState || null,
      reason: params.reason || null,
      request_id: params.requestId || null,
      correlation_id: params.correlationId,
      created_at: new Date().toISOString(),
    });
  }

  // 7. Dangerous bulk operations
  async recordBulkOperation(params: {
    organizationId: string;
    actorType: ActorType;
    actorId?: string | null;
    action:
      | "BULK_INVENTORY_ADJUSTMENT"
      | "BULK_SYNC_TRIGGERED"
      | "BULK_MAPPING_UPDATED"
      | "BULK_RECOUNT_APPLIED";
    bulkOperationId: string;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    reason?: string | null;
    requestId?: string | null;
    correlationId: string;
  }): Promise<void> {
    await this.record({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      actor_type: params.actorType,
      actor_id: params.actorId || null,
      action: params.action,
      entity_type: "bulk_operation",
      entity_id: params.bulkOperationId,
      before_state: params.beforeState || null,
      after_state: params.afterState || null,
      reason: params.reason || null,
      request_id: params.requestId || null,
      correlation_id: params.correlationId,
      created_at: new Date().toISOString(),
    });
  }

  // 8. Admin actions
  async recordAdminAction(params: {
    organizationId: string;
    actorType: ActorType;
    actorId?: string | null;
    action:
      | "MEMBER_INVITED"
      | "MEMBER_UPDATED"
      | "MEMBER_REMOVED"
      | "ORGANIZATION_UPDATED"
      | "ROLE_CHANGED"
      | "SECURITY_POLICY_CHANGED";
    targetId: string;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
    reason?: string | null;
    requestId?: string | null;
    correlationId: string;
  }): Promise<void> {
    await this.record({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      actor_type: params.actorType,
      actor_id: params.actorId || null,
      action: params.action,
      entity_type: "organization_admin",
      entity_id: params.targetId,
      before_state: params.beforeState || null,
      after_state: params.afterState || null,
      reason: params.reason || null,
      request_id: params.requestId || null,
      correlation_id: params.correlationId,
      created_at: new Date().toISOString(),
    });
  }

  /**
   * Export audit trail in standard JSON or RFC 4180 CSV format.
   */
  async exportAuditLogs(
    organizationId: string,
    filter?: AuditLogFilter,
    format: "json" | "csv" = "json"
  ): Promise<string> {
    const { items } = await this.list(organizationId, {
      ...filter,
      limit: filter?.limit ?? 500,
    });

    if (format === "json") {
      return JSON.stringify(items, null, 2);
    }

    // RFC 4180 CSV formatting
    const headers = [
      "id",
      "created_at",
      "action",
      "actor_type",
      "actor_id",
      "entity_type",
      "entity_id",
      "correlation_id",
      "reason",
      "request_id",
      "before_state",
      "after_state",
    ];

    const escapeCsv = (val: unknown): string => {
      if (val === null || val === undefined) return "";
      const str = typeof val === "object" ? JSON.stringify(val) : String(val);
      if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = items.map((l) => [
      escapeCsv(l.id),
      escapeCsv(l.created_at),
      escapeCsv(l.action),
      escapeCsv(l.actor_type),
      escapeCsv(l.actor_id),
      escapeCsv(l.entity_type),
      escapeCsv(l.entity_id),
      escapeCsv(l.correlation_id),
      escapeCsv(l.reason),
      escapeCsv(l.request_id),
      escapeCsv(l.before_state),
      escapeCsv(l.after_state),
    ]);

    return [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
  }
}
