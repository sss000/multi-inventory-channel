import {
  AuditRecord,
  ActorType,
  OrganizationId,
  UUID,
} from "./types.js";
import {
  AuditInvariantError,
  ImmutableAuditLogError,
} from "./errors.js";

/**
 * Audit Domain Service & Causal Reconstruction Engine
 * Canonical Specification: Sections 35, 36, 68, 114 of 01_ENGINEERING_SPEC.md & Prompt 21
 */

export interface CreateAuditRecordParams {
  id?: string;
  organizationId: OrganizationId;
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  entityType: string;
  entityId: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  reason?: string | null;
  requestId?: string | null;
  correlationId: UUID;
  createdAt?: Date;
}

/**
 * Validates and constructs an immutable audit record in pure domain space.
 */
export function createDomainAuditRecord(params: CreateAuditRecordParams): AuditRecord {
  if (!params.organizationId) {
    throw new AuditInvariantError("Audit record must have an organizationId.");
  }
  if (!params.actorType) {
    throw new AuditInvariantError("Audit record must have an actorType.");
  }
  if (!params.action || params.action.trim() === "") {
    throw new AuditInvariantError("Audit record must have a non-empty action.");
  }
  if (!params.entityType || params.entityType.trim() === "") {
    throw new AuditInvariantError("Audit record must have a non-empty entityType.");
  }
  if (!params.entityId || params.entityId.trim() === "") {
    throw new AuditInvariantError("Audit record must have a non-empty entityId.");
  }
  if (!params.correlationId) {
    throw new AuditInvariantError("Audit record must have a correlationId.");
  }

  return {
    id: params.id || `audit_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    organizationId: params.organizationId,
    actorType: params.actorType,
    actorId: params.actorId || undefined,
    action: params.action.trim(),
    entityType: params.entityType.trim(),
    entityId: params.entityId.trim(),
    beforeState: params.beforeState ?? undefined,
    afterState: params.afterState ?? undefined,
    reason: params.reason ?? undefined,
    requestId: params.requestId ?? undefined,
    correlationId: params.correlationId,
    createdAt: params.createdAt || new Date(),
  };
}

/**
 * Enforces the append-only invariant: modifying or deleting historical audit records is forbidden.
 */
export function assertAuditLogImmutable(action: "UPDATE" | "DELETE"): never {
  throw new ImmutableAuditLogError(
    `Audit logs are strictly append-only. Historical audit records cannot be ${
      action === "UPDATE" ? "modified" : "deleted"
    }.`
  );
}

export interface ReconstructedAuditTrail {
  entityType: string;
  entityId: string;
  correlationId: string;
  timestamp: string;
  before: Record<string, unknown> | null;
  event: string;
  actor: {
    type: ActorType;
    id: string | null;
  };
  reason: string | null;
  after: Record<string, unknown> | null;
  channelImpact: {
    channelAccountId?: string;
    channelName?: string;
    previousChannelQuantity?: number;
    targetChannelQuantity?: number;
    status: string;
  } | null;
  synchronizationResult: {
    syncJobId?: string;
    status: string;
    verifiedAt?: string | null;
    stage: string;
  } | null;
  resolution: {
    status: string;
    resolvedBy?: string | null;
    resolvedAt?: string | null;
    notes?: string | null;
  } | null;
  timeline: Array<{
    id: string;
    organizationId: string;
    actorType: ActorType;
    actorId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    beforeState: Record<string, unknown> | null;
    afterState: Record<string, unknown> | null;
    reason: string | null;
    requestId: string | null;
    correlationId: string;
    createdAt: string;
  }>;
}

/**
 * Canonical Acceptance Test Reconstruction (Section 114 & Prompt 21)
 *
 * For any inventory discrepancy or material event, reconstructs:
 * 1. before
 * 2. event
 * 3. actor
 * 4. reason
 * 5. after
 * 6. channel impact
 * 7. synchronization result
 * 8. resolution
 */
export interface AuditTrailInputRecord {
  id: string;
  organizationId?: string;
  organization_id?: string;
  actorType?: ActorType;
  actor_type?: ActorType;
  actorId?: string | null;
  actor_id?: string | null;
  action: string;
  entityType?: string;
  entity_type?: string;
  entityId?: string;
  entity_id?: string;
  beforeState?: Record<string, unknown> | null;
  before_state?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  reason?: string | null;
  requestId?: string | null;
  request_id?: string | null;
  correlationId?: string;
  correlation_id?: string;
  createdAt?: string | Date;
  created_at?: string | Date;
}

export function reconstructDiscrepancyTrail(
  records: AuditTrailInputRecord[]
): ReconstructedAuditTrail {
  if (!records || records.length === 0) {
    throw new AuditInvariantError("Cannot reconstruct audit trail from empty records.");
  }

  // Normalize each record
  const normalized = records.map((r) => ({
    id: r.id,
    organizationId: (r.organizationId || r.organization_id || "") as OrganizationId,
    actorType: (r.actorType || r.actor_type || "SYSTEM") as ActorType,
    actorId: r.actorId !== undefined ? r.actorId : (r.actor_id !== undefined ? r.actor_id : null),
    action: r.action,
    entityType: r.entityType || r.entity_type || "",
    entityId: r.entityId || r.entity_id || "",
    beforeState: r.beforeState !== undefined ? r.beforeState : (r.before_state !== undefined ? r.before_state : null),
    afterState: r.afterState !== undefined ? r.afterState : (r.after_state !== undefined ? r.after_state : null),
    reason: r.reason !== undefined ? r.reason : null,
    requestId: r.requestId !== undefined ? r.requestId : (r.request_id !== undefined ? r.request_id : null),
    correlationId: r.correlationId || r.correlation_id || "",
    createdAt: r.createdAt || r.created_at || new Date().toISOString(),
  }));

  // Sort chronologically ascending
  const sorted = [...normalized].sort((a, b) => {
    const timeA = new Date(a.createdAt).getTime();
    const timeB = new Date(b.createdAt).getTime();
    return timeA - timeB;
  });

  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;

  // 1. Before state: initial record's before_state, or first available beforeState
  const beforeState = first.beforeState || null;

  // 2. Event: the triggering or primary mutation action
  const eventAction = first.action;

  // 3. Actor: who initiated the event
  const actor = {
    type: first.actorType,
    id: first.actorId || null,
  };

  // 4. Reason: explanation recorded in the audit event
  const reason = first.reason || last.reason || null;

  // 5. After state: state after the initial event (or latest afterState in chain)
  let afterState = first.afterState || null;
  for (const r of sorted) {
    if (r.afterState) {
      afterState = r.afterState;
    }
  }

  // 6. Channel impact: check for channel account or marketplace events
  let channelImpact: ReconstructedAuditTrail["channelImpact"] = null;
  const channelEvent = sorted.find(
    (r) =>
      r.entityType.toLowerCase().includes("channel") ||
      Boolean(r.afterState?.["channelAccountId"]) ||
      Boolean(r.beforeState?.["channelAccountId"])
  );
  if (channelEvent) {
    const state = channelEvent.afterState || channelEvent.beforeState || {};
    channelImpact = {
      channelAccountId: (state["channelAccountId"] as string) || (channelEvent.entityId ?? undefined),
      channelName: (state["channelName"] as string) || undefined,
      previousChannelQuantity: typeof state["previousChannelQuantity"] === "number" ? state["previousChannelQuantity"] : undefined,
      targetChannelQuantity: typeof state["targetChannelQuantity"] === "number" ? state["targetChannelQuantity"] : undefined,
      status: (state["channelStatus"] as string) || (channelEvent.action.includes("CONFLICT") ? "CONFLICT" : "AFFECTED"),
    };
  }

  // 7. Synchronization result: check for synchronization job execution and verification outcome
  let synchronizationResult: ReconstructedAuditTrail["synchronizationResult"] = null;
  const syncRecord = [...sorted].reverse().find(
    (r) =>
      r.entityType === "sync_job" ||
      Boolean(r.afterState?.["syncJobId"]) ||
      r.action.includes("VERIF") ||
      r.action.includes("READ_BACK")
  ) || sorted.find((r) => r.action.startsWith("SYNC_"));
  if (syncRecord) {
    const sState = syncRecord.afterState || {};
    synchronizationResult = {
      syncJobId: (sState["syncJobId"] as string) || syncRecord.entityId,
      status: (sState["syncStatus"] as string) || (syncRecord.action.includes("FAILED") ? "FAILED" : "VERIFIED"),
      verifiedAt: (sState["verifiedAt"] as string) || (syncRecord.createdAt instanceof Date ? syncRecord.createdAt.toISOString() : String(syncRecord.createdAt)),
      stage: (sState["stage"] as string) || (syncRecord.action.includes("CONFLICT") ? "CONFLICT" : "VERIFIED"),
    };
  }

  // 8. Resolution: check for exception resolution, reconciliation approval, or manual fix
  let resolution: ReconstructedAuditTrail["resolution"] = null;
  const resolutionRecord = sorted.find(
    (r) =>
      r.action.includes("RESOLVED") ||
      r.action.includes("APPROVED") ||
      r.action.includes("RECONCILED") ||
      r.action.includes("CORRECTION")
  );
  if (resolutionRecord) {
    const rState = resolutionRecord.afterState || {};
    resolution = {
      status: (rState["status"] as string) || "RESOLVED",
      resolvedBy: resolutionRecord.actorId || null,
      resolvedAt:
        resolutionRecord.createdAt instanceof Date
          ? resolutionRecord.createdAt.toISOString()
          : String(resolutionRecord.createdAt),
      notes: resolutionRecord.reason || (rState["notes"] as string) || null,
    };
  }

  return {
    entityType: first.entityType,
    entityId: first.entityId,
    correlationId: first.correlationId,
    timestamp: first.createdAt instanceof Date ? first.createdAt.toISOString() : String(first.createdAt),
    before: beforeState,
    event: eventAction,
    actor,
    reason,
    after: afterState,
    channelImpact,
    synchronizationResult,
    resolution,
    timeline: sorted.map((r) => ({
      id: r.id,
      organizationId: r.organizationId,
      actorType: r.actorType,
      actorId: r.actorId || null,
      action: r.action,
      entityType: r.entityType,
      entityId: r.entityId,
      beforeState: r.beforeState || null,
      afterState: r.afterState || null,
      reason: r.reason || null,
      requestId: r.requestId || null,
      correlationId: r.correlationId,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt),
    })),
  };
}
