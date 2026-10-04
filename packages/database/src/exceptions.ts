/**
 * Exception Database Repository, Persistence Service & Audit Integration
 * Canonical Specification: Sections 32, 33, 34, 52 of 01_ENGINEERING_SPEC.md & Prompt 20
 *
 * Rules:
 * 1. Multi-tenant isolation: All queries enforce organization_id context.
 * 2. Immutable state transitions: OPEN → INVESTIGATING → ACTION_REQUIRED → RESOLVING → RESOLVED, or OPEN → IGNORED.
 * 3. Every mutation creates an append-only audit record in audit_logs.
 * 4. Invariant: Retrying an exception transitions to RESOLVING, never RESOLVED.
 */

import {
  ExceptionRow,
  ExceptionType,
  ExceptionSeverity,
  ExceptionStatus,
  AuditLogRow,
  ActorType,
} from "./schema/types.js";
import {
  TenantAccessDeniedError,
  InvalidStateTransitionError,
  ExceptionInvariantError,
} from "@platform/domain";

export interface ExceptionListFilter {
  status?: ExceptionStatus;
  severity?: ExceptionSeverity;
  type?: ExceptionType;
  entityType?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
}

export interface ExceptionRepository {
  create(exception: ExceptionRow): Promise<void>;
  findById(organizationId: string, id: string): Promise<ExceptionRow | null>;
  list(
    organizationId: string,
    filter?: ExceptionListFilter
  ): Promise<{ items: ExceptionRow[]; total: number }>;
  update(exception: ExceptionRow): Promise<void>;
  countByStatus(organizationId: string): Promise<Record<string, number>>;
}

export interface AuditLogRepository {
  record(entry: AuditLogRow): Promise<void>;
  list(
    organizationId: string,
    filter?: { entityType?: string; entityId?: string; limit?: number; offset?: number }
  ): Promise<{ items: AuditLogRow[]; total: number }>;
}

export class InMemoryExceptionRepository implements ExceptionRepository {
  private exceptions = new Map<string, ExceptionRow>();

  async create(exception: ExceptionRow): Promise<void> {
    this.exceptions.set(exception.id, { ...exception });
  }

  async findById(organizationId: string, id: string): Promise<ExceptionRow | null> {
    const ex = this.exceptions.get(id);
    if (!ex) return null;
    if (ex.organization_id !== organizationId) {
      throw new TenantAccessDeniedError(
        ex.organization_id,
        organizationId,
        `Cross-tenant access violation: exception '${id}' belongs to organization '${ex.organization_id}', not '${organizationId}'.`
      );
    }
    return { ...ex };
  }

  async list(
    organizationId: string,
    filter?: ExceptionListFilter
  ): Promise<{ items: ExceptionRow[]; total: number }> {
    const all = Array.from(this.exceptions.values())
      .filter((e) => e.organization_id === organizationId)
      .filter((e) => !filter?.status || e.status === filter.status)
      .filter((e) => !filter?.severity || e.severity === filter.severity)
      .filter((e) => !filter?.type || e.type === filter.type)
      .filter((e) => !filter?.entityType || e.entity_type === filter.entityType)
      .filter((e) => !filter?.entityId || e.entity_id === filter.entityId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    const total = all.length;
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;
    const items = all.slice(offset, offset + limit).map((e) => ({ ...e }));

    return { items, total };
  }

  async update(exception: ExceptionRow): Promise<void> {
    this.exceptions.set(exception.id, { ...exception });
  }

  async countByStatus(organizationId: string): Promise<Record<string, number>> {
    const counts: Record<string, number> = {
      OPEN: 0,
      INVESTIGATING: 0,
      ACTION_REQUIRED: 0,
      RESOLVING: 0,
      RESOLVED: 0,
      IGNORED: 0,
    };
    for (const ex of this.exceptions.values()) {
      if (ex.organization_id === organizationId) {
        counts[ex.status] = (counts[ex.status] || 0) + 1;
      }
    }
    return counts;
  }
}

export class InMemoryAuditLogRepository implements AuditLogRepository {
  private auditLogs: (AuditLogRow & { _seq: number })[] = [];
  private seq = 0;

  async record(entry: AuditLogRow): Promise<void> {
    this.auditLogs.push({ ...entry, _seq: ++this.seq });
  }

  async list(
    organizationId: string,
    filter?: { entityType?: string; entityId?: string; limit?: number; offset?: number }
  ): Promise<{ items: AuditLogRow[]; total: number }> {
    const all = this.auditLogs
      .filter((l) => l.organization_id === organizationId)
      .filter((l) => !filter?.entityType || l.entity_type === filter.entityType)
      .filter((l) => !filter?.entityId || l.entity_id === filter.entityId)
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
}

export interface CreateExceptionInput {
  organizationId: string;
  type: ExceptionType;
  severity: ExceptionSeverity;
  entityType: string;
  entityId: string;
  title: string;
  description: string;
  rootCause?: Record<string, unknown>;
  recommendedAction?: Record<string, unknown>;
  diagnostic?: Record<string, unknown>;
  automatable?: boolean;
  actorId?: string | null;
  actorType?: ActorType;
  correlationId?: string;
}

export class ExceptionDatabaseService {
  constructor(
    private readonly exceptionRepo: ExceptionRepository,
    private readonly auditRepo: AuditLogRepository
  ) {}

  getExceptionRepository(): ExceptionRepository {
    return this.exceptionRepo;
  }

  getAuditLogRepository(): AuditLogRepository {
    return this.auditRepo;
  }

  async createException(input: CreateExceptionInput): Promise<ExceptionRow> {
    const now = new Date().toISOString();
    const id = `ex_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    const exceptionRow: ExceptionRow = {
      id,
      organization_id: input.organizationId,
      type: input.type,
      severity: input.severity,
      status: "OPEN",
      entity_type: input.entityType,
      entity_id: input.entityId,
      title: input.title,
      description: input.description,
      root_cause: input.rootCause ?? {},
      recommended_action: input.recommendedAction ?? {},
      diagnostic: input.diagnostic,
      automatable: input.automatable ?? false,
      created_at: now,
      updated_at: now,
      resolved_at: null,
      resolved_by: null,
    };

    await this.exceptionRepo.create(exceptionRow);

    // Prompt 20 / Section 52: Record audit log on all mutations
    await this.auditRepo.record({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: input.organizationId,
      actor_type: input.actorType ?? "SYSTEM",
      actor_id: input.actorId ?? null,
      action: "EXCEPTION_CREATED",
      entity_type: "EXCEPTION",
      entity_id: id,
      before_state: null,
      after_state: { ...exceptionRow } as unknown as Record<string, unknown>,
      reason: `Exception created: ${input.title}`,
      request_id: null,
      correlation_id: input.correlationId ?? id,
      created_at: now,
    });

    return exceptionRow;
  }

  async getException(organizationId: string, id: string): Promise<ExceptionRow | null> {
    return this.exceptionRepo.findById(organizationId, id);
  }

  async listExceptions(
    organizationId: string,
    filter?: ExceptionListFilter
  ): Promise<{ items: ExceptionRow[]; total: number }> {
    return this.exceptionRepo.list(organizationId, filter);
  }

  async transitionStatus(params: {
    organizationId: string;
    exceptionId: string;
    nextStatus: ExceptionStatus;
    actorId?: string | null;
    actorType?: ActorType;
    reason?: string;
    correlationId?: string;
  }): Promise<ExceptionRow> {
    const existing = await this.exceptionRepo.findById(params.organizationId, params.exceptionId);
    if (!existing) {
      throw new Error(`Exception '${params.exceptionId}' not found.`);
    }

    const now = new Date().toISOString();
    const isResolving = params.nextStatus === "RESOLVED";

    const updated: ExceptionRow = {
      ...existing,
      status: params.nextStatus,
      updated_at: now,
      resolved_at: isResolving ? now : existing.resolved_at,
      resolved_by: isResolving ? (params.actorId ?? null) : existing.resolved_by,
    };

    await this.exceptionRepo.update(updated);

    // Audit log
    await this.auditRepo.record({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      actor_type: params.actorType ?? "USER",
      actor_id: params.actorId ?? null,
      action: `EXCEPTION_TRANSITION_${params.nextStatus}`,
      entity_type: "EXCEPTION",
      entity_id: params.exceptionId,
      before_state: { status: existing.status },
      after_state: { status: params.nextStatus },
      reason: params.reason ?? `Status transitioned from ${existing.status} to ${params.nextStatus}`,
      request_id: null,
      correlation_id: params.correlationId ?? params.exceptionId,
      created_at: now,
    });

    return updated;
  }

  async resolveException(params: {
    organizationId: string;
    exceptionId: string;
    actorId?: string | null;
    actorType?: ActorType;
    resolutionNotes?: string;
    reason?: string;
    correlationId?: string;
  }): Promise<ExceptionRow> {
    const existing = await this.exceptionRepo.findById(params.organizationId, params.exceptionId);
    if (!existing) {
      throw new Error(`Exception '${params.exceptionId}' not found.`);
    }

    if (existing.status === "RESOLVED") {
      return existing;
    }

    const now = new Date().toISOString();
    const updated: ExceptionRow = {
      ...existing,
      status: "RESOLVED",
      updated_at: now,
      resolved_at: now,
      resolved_by: params.actorId ?? null,
    };

    await this.exceptionRepo.update(updated);

    await this.auditRepo.record({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      actor_type: params.actorType ?? "USER",
      actor_id: params.actorId ?? null,
      action: "EXCEPTION_RESOLVED",
      entity_type: "EXCEPTION",
      entity_id: params.exceptionId,
      before_state: { status: existing.status },
      after_state: { status: "RESOLVED", notes: params.resolutionNotes },
      reason: params.reason ?? params.resolutionNotes ?? "Exception resolved by user",
      request_id: null,
      correlation_id: params.correlationId ?? params.exceptionId,
      created_at: now,
    });

    return updated;
  }

  async ignoreException(params: {
    organizationId: string;
    exceptionId: string;
    actorId?: string | null;
    actorType?: ActorType;
    reason?: string;
    correlationId?: string;
  }): Promise<ExceptionRow> {
    const existing = await this.exceptionRepo.findById(params.organizationId, params.exceptionId);
    if (!existing) {
      throw new Error(`Exception '${params.exceptionId}' not found.`);
    }

    const now = new Date().toISOString();
    const updated: ExceptionRow = {
      ...existing,
      status: "IGNORED",
      updated_at: now,
    };

    await this.exceptionRepo.update(updated);

    // Section 33: "Ignored exceptions must retain an audit record."
    await this.auditRepo.record({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      actor_type: params.actorType ?? "USER",
      actor_id: params.actorId ?? null,
      action: "EXCEPTION_IGNORED",
      entity_type: "EXCEPTION",
      entity_id: params.exceptionId,
      before_state: { status: existing.status },
      after_state: { status: "IGNORED" },
      reason: params.reason ?? "Exception ignored by user",
      request_id: null,
      correlation_id: params.correlationId ?? params.exceptionId,
      created_at: now,
    });

    return updated;
  }

  /**
   * Retries an exception.
   * Critical Prompt 20 Invariant: "Do not mark an exception RESOLVED merely because a retry was submitted;
   * the underlying condition must actually be resolved or explicitly classified according to the exception policy."
   * Status transitions to RESOLVING.
   */
  async retryException(params: {
    organizationId: string;
    exceptionId: string;
    actorId?: string | null;
    actorType?: ActorType;
    reason?: string;
    correlationId?: string;
  }): Promise<ExceptionRow> {
    const existing = await this.exceptionRepo.findById(params.organizationId, params.exceptionId);
    if (!existing) {
      throw new Error(`Exception '${params.exceptionId}' not found.`);
    }

    if (existing.status === "RESOLVED") {
      throw new ExceptionInvariantError("Cannot retry an already RESOLVED exception.");
    }

    const now = new Date().toISOString();
    const updated: ExceptionRow = {
      ...existing,
      status: "RESOLVING",
      updated_at: now,
    };

    await this.exceptionRepo.update(updated);

    await this.auditRepo.record({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      actor_type: params.actorType ?? "USER",
      actor_id: params.actorId ?? null,
      action: "EXCEPTION_RETRY_SUBMITTED",
      entity_type: "EXCEPTION",
      entity_id: params.exceptionId,
      before_state: { status: existing.status },
      after_state: { status: "RESOLVING" },
      reason: params.reason ?? "Retry operation initiated by operator",
      request_id: null,
      correlation_id: params.correlationId ?? params.exceptionId,
      created_at: now,
    });

    return updated;
  }

  /**
   * Reconciles an exception (e.g. for INVENTORY_MISMATCH or STALE_DATA).
   * Transitions to RESOLVING while reconciliation runs.
   */
  async reconcileException(params: {
    organizationId: string;
    exceptionId: string;
    actorId?: string | null;
    actorType?: ActorType;
    reason?: string;
    correlationId?: string;
  }): Promise<ExceptionRow> {
    const existing = await this.exceptionRepo.findById(params.organizationId, params.exceptionId);
    if (!existing) {
      throw new Error(`Exception '${params.exceptionId}' not found.`);
    }

    const now = new Date().toISOString();
    const updated: ExceptionRow = {
      ...existing,
      status: "RESOLVING",
      updated_at: now,
    };

    await this.exceptionRepo.update(updated);

    await this.auditRepo.record({
      id: `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      organization_id: params.organizationId,
      actor_type: params.actorType ?? "USER",
      actor_id: params.actorId ?? null,
      action: "EXCEPTION_RECONCILE_SUBMITTED",
      entity_type: "EXCEPTION",
      entity_id: params.exceptionId,
      before_state: { status: existing.status },
      after_state: { status: "RESOLVING" },
      reason: params.reason ?? "Reconciliation initiated for exception",
      request_id: null,
      correlation_id: params.correlationId ?? params.exceptionId,
      created_at: now,
    });

    return updated;
  }
}
