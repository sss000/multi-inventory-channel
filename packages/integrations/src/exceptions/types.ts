import {
  ExceptionType,
  ExceptionSeverity,
  ExceptionStatus,
  DiagnosticExplanation,
} from "@platform/contracts";
import { ExceptionRow, ActorType } from "@platform/database";

export interface CreateEngineExceptionParams {
  organizationId: string;
  type: ExceptionType;
  severity?: ExceptionSeverity;
  entityType: string;
  entityId: string;
  title: string;
  description: string;
  rootCause?: Record<string, unknown>;
  recommendedAction?: Record<string, unknown>;
  diagnostic?: DiagnosticExplanation;
  automatable?: boolean;
  actorId?: string | null;
  actorType?: ActorType;
  correlationId?: string;
}

export interface ResolveEngineExceptionParams {
  organizationId: string;
  exceptionId: string;
  actorId?: string | null;
  actorType?: ActorType;
  notes?: string;
  reason?: string;
  correlationId?: string;
}

export interface IgnoreEngineExceptionParams {
  organizationId: string;
  exceptionId: string;
  actorId?: string | null;
  actorType?: ActorType;
  reason?: string;
  correlationId?: string;
}

export interface RetryEngineExceptionParams {
  organizationId: string;
  exceptionId: string;
  actorId?: string | null;
  actorType?: ActorType;
  reason?: string;
  idempotencyKey?: string;
  correlationId?: string;
}

export interface ReconcileEngineExceptionParams {
  organizationId: string;
  exceptionId: string;
  actorId?: string | null;
  actorType?: ActorType;
  correctionDirection?: string;
  targetQuantity?: number;
  warehouseId?: string;
  notes?: string;
  reason?: string;
  correlationId?: string;
}

export interface ExceptionWithDiagnostic extends ExceptionRow {
  diagnostic: DiagnosticExplanation;
}
