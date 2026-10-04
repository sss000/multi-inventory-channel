import {
  ReconciliationPolicy,
  DiscrepancyEvidence,
  SourceOfTruth,
  CorrectionDirection,
  ActorType,
} from "@platform/domain";
import {
  ReconciliationRunRow,
  ReconciliationResultRow,
} from "@platform/database";
import { ChannelAdapter } from "../adapter.js";

export interface SkuMapping {
  skuId: string;
  externalSkuId: string;
  warehouseId?: string;
}

export interface RunReconciliationParams {
  organizationId: string;
  channelAccountId: string;
  warehouseId?: string;
  skuIds?: string[];
  policy?: Partial<ReconciliationPolicy>;
  sourceOfTruth?: SourceOfTruth;
  adapter?: ChannelAdapter;
  skuMappings?: SkuMapping[];
  evidenceMap?: Record<string, DiscrepancyEvidence> | Map<string, DiscrepancyEvidence>;
  actorId?: string;
  actorType?: ActorType;
  correlationId?: string;
}

export interface ReconciliationRunSummary {
  run: ReconciliationRunRow;
  results: ReconciliationResultRow[];
  totalEvaluated: number;
  matchedCount: number;
  discrepancyCount: number;
  autoResolvedCount: number;
  pendingApprovalCount: number;
}

export interface ApproveResultParams {
  organizationId: string;
  resultId: string;
  correctionDirection?: CorrectionDirection;
  targetQuantity?: number;
  warehouseId?: string;
  reason?: string;
  actorId?: string;
  actorType?: ActorType;
  correlationId?: string;
  adapter?: ChannelAdapter;
}

export interface RejectResultParams {
  organizationId: string;
  resultId: string;
  reason?: string;
  actorId?: string;
  actorType?: ActorType;
  correlationId?: string;
}

export interface ReconciliationAuditEvent {
  id: string;
  organizationId: string;
  action:
    | "RUN_STARTED"
    | "RUN_COMPLETED"
    | "AUTO_RESOLVED"
    | "MANUALLY_APPROVED"
    | "MANUALLY_REJECTED";
  entityType: "reconciliation_run" | "reconciliation_result";
  entityId: string;
  actorType?: ActorType;
  actorId?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}
