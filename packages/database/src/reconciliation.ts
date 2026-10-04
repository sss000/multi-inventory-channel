/**
 * Reconciliation Database Repository & Persistence Service
 * Canonical Specification: Sections 29, 30, 31, 53 of 01_ENGINEERING_SPEC.md & Prompt 19
 *
 * Rules:
 * 1. Multi-tenant isolation: All queries enforce organization_id context.
 * 2. Immutable run transitions: started_at, completed_at, counts, and statuses.
 * 3. Cascade/integrity: results reference parent runs.
 */

import {
  ReconciliationRunRow,
  ReconciliationResultRow,
  ReconciliationStatus,
  ReconciliationClassification,
  ReconciliationResultStatus,
} from "./schema/types.js";
import { TenantAccessDeniedError } from "@platform/domain";

export interface ReconciliationRepository {
  createRun(run: ReconciliationRunRow): Promise<void>;
  getRun(organizationId: string, runId: string): Promise<ReconciliationRunRow | null>;
  updateRun(run: ReconciliationRunRow): Promise<void>;
  listRuns(
    organizationId: string,
    filter?: {
      channelAccountId?: string;
      status?: ReconciliationStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ items: ReconciliationRunRow[]; total: number }>;
  createResults(results: ReconciliationResultRow[]): Promise<void>;
  getResult(
    organizationId: string,
    resultId: string
  ): Promise<{ result: ReconciliationResultRow; run: ReconciliationRunRow } | null>;
  updateResult(result: ReconciliationResultRow): Promise<void>;
  listResults(
    organizationId: string,
    runId: string,
    filter?: {
      status?: ReconciliationResultStatus;
      classification?: ReconciliationClassification;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ items: ReconciliationResultRow[]; total: number }>;
}

export class InMemoryReconciliationRepository implements ReconciliationRepository {
  private runs = new Map<string, ReconciliationRunRow>();
  private results = new Map<string, ReconciliationResultRow>();

  async createRun(run: ReconciliationRunRow): Promise<void> {
    this.runs.set(run.id, { ...run });
  }

  async getRun(organizationId: string, runId: string): Promise<ReconciliationRunRow | null> {
    const run = this.runs.get(runId);
    if (!run) return null;
    if (run.organization_id !== organizationId) {
      throw new TenantAccessDeniedError(
        run.organization_id,
        organizationId,
        `Cross-tenant access violation: run '${runId}' belongs to organization '${run.organization_id}', not '${organizationId}'.`
      );
    }
    return { ...run };
  }

  async updateRun(run: ReconciliationRunRow): Promise<void> {
    this.runs.set(run.id, { ...run });
  }

  async listRuns(
    organizationId: string,
    filter?: {
      channelAccountId?: string;
      status?: ReconciliationStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ items: ReconciliationRunRow[]; total: number }> {
    const all = Array.from(this.runs.values())
      .filter((r) => r.organization_id === organizationId)
      .filter((r) => !filter?.channelAccountId || r.channel_account_id === filter.channelAccountId)
      .filter((r) => !filter?.status || r.status === filter.status)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());

    const total = all.length;
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;
    const items = all.slice(offset, offset + limit).map((r) => ({ ...r }));

    return { items, total };
  }

  async createResults(results: ReconciliationResultRow[]): Promise<void> {
    for (const res of results) {
      this.results.set(res.id, { ...res });
    }
  }

  async getResult(
    organizationId: string,
    resultId: string
  ): Promise<{ result: ReconciliationResultRow; run: ReconciliationRunRow } | null> {
    const res = this.results.get(resultId);
    if (!res) return null;

    const run = this.runs.get(res.reconciliation_run_id);
    if (!run) return null;

    if (run.organization_id !== organizationId) {
      throw new TenantAccessDeniedError(
        run.organization_id,
        organizationId,
        `Cross-tenant access violation: result '${resultId}' belongs to organization '${run.organization_id}', not '${organizationId}'.`
      );
    }

    return { result: { ...res }, run: { ...run } };
  }

  async updateResult(result: ReconciliationResultRow): Promise<void> {
    this.results.set(result.id, { ...result });
  }

  async listResults(
    organizationId: string,
    runId: string,
    filter?: {
      status?: ReconciliationResultStatus;
      classification?: ReconciliationClassification;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ items: ReconciliationResultRow[]; total: number }> {
    const run = await this.getRun(organizationId, runId);
    if (!run) {
      return { items: [], total: 0 };
    }

    const all = Array.from(this.results.values())
      .filter((res) => res.reconciliation_run_id === runId)
      .filter((res) => !filter?.status || res.status === filter.status)
      .filter((res) => !filter?.classification || res.classification === filter.classification)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    const total = all.length;
    const offset = filter?.offset ?? 0;
    const limit = filter?.limit ?? 50;
    const items = all.slice(offset, offset + limit).map((r) => ({ ...r }));

    return { items, total };
  }
}

export interface StartReconciliationRunParams {
  id?: string;
  organizationId: string;
  channelAccountId: string;
  warehouseId?: string | null;
}

export interface CompleteReconciliationRunParams {
  organizationId: string;
  runId: string;
  totalEvaluated: number;
  matchedCount: number;
  discrepancyCount: number;
}

export class ReconciliationDatabaseService {
  constructor(private readonly repository: ReconciliationRepository) {}

  getRepository(): ReconciliationRepository {
    return this.repository;
  }

  async startRun(params: StartReconciliationRunParams): Promise<ReconciliationRunRow> {
    const runId = params.id || `rec_run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const now = new Date().toISOString();

    const runRow: ReconciliationRunRow = {
      id: runId,
      organization_id: params.organizationId,
      channel_account_id: params.channelAccountId,
      warehouse_id: params.warehouseId ?? null,
      status: "RUNNING",
      started_at: now,
      completed_at: null,
      total_evaluated: 0,
      matched_count: 0,
      discrepancy_count: 0,
      created_at: now,
    };

    await this.repository.createRun(runRow);
    return runRow;
  }

  async completeRun(params: CompleteReconciliationRunParams): Promise<ReconciliationRunRow> {
    const run = await this.repository.getRun(params.organizationId, params.runId);
    if (!run) {
      throw new Error(`Reconciliation run '${params.runId}' not found.`);
    }

    const now = new Date().toISOString();
    const updatedRun: ReconciliationRunRow = {
      ...run,
      status: "COMPLETED",
      completed_at: now,
      total_evaluated: params.totalEvaluated,
      matched_count: params.matchedCount,
      discrepancy_count: params.discrepancyCount,
    };

    await this.repository.updateRun(updatedRun);
    return updatedRun;
  }

  async failRun(organizationId: string, runId: string): Promise<ReconciliationRunRow> {
    const run = await this.repository.getRun(organizationId, runId);
    if (!run) {
      throw new Error(`Reconciliation run '${runId}' not found.`);
    }

    const now = new Date().toISOString();
    const updatedRun: ReconciliationRunRow = {
      ...run,
      status: "FAILED",
      completed_at: now,
    };

    await this.repository.updateRun(updatedRun);
    return updatedRun;
  }

  async getRun(organizationId: string, runId: string): Promise<ReconciliationRunRow | null> {
    return this.repository.getRun(organizationId, runId);
  }

  async listRuns(
    organizationId: string,
    filter?: {
      channelAccountId?: string;
      status?: ReconciliationStatus;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ items: ReconciliationRunRow[]; total: number }> {
    return this.repository.listRuns(organizationId, filter);
  }

  async saveResults(
    organizationId: string,
    runId: string,
    results: ReconciliationResultRow[]
  ): Promise<void> {
    const run = await this.repository.getRun(organizationId, runId);
    if (!run) {
      throw new Error(`Reconciliation run '${runId}' not found.`);
    }

    await this.repository.createResults(results);
  }

  async getResult(
    organizationId: string,
    resultId: string
  ): Promise<{ result: ReconciliationResultRow; run: ReconciliationRunRow } | null> {
    return this.repository.getResult(organizationId, resultId);
  }

  async listResults(
    organizationId: string,
    runId: string,
    filter?: {
      status?: ReconciliationResultStatus;
      classification?: ReconciliationClassification;
      limit?: number;
      offset?: number;
    }
  ): Promise<{ items: ReconciliationResultRow[]; total: number }> {
    return this.repository.listResults(organizationId, runId, filter);
  }

  async updateResultStatus(
    organizationId: string,
    resultId: string,
    status: ReconciliationResultStatus,
    resolvedBy?: string | null
  ): Promise<ReconciliationResultRow> {
    const fetched = await this.repository.getResult(organizationId, resultId);
    if (!fetched) {
      throw new Error(`Reconciliation result '${resultId}' not found.`);
    }

    const now = new Date().toISOString();
    const updated: ReconciliationResultRow = {
      ...fetched.result,
      status,
      resolved_at: status !== "PENDING" ? now : null,
      resolved_by: resolvedBy ?? fetched.result.resolved_by ?? null,
    };

    await this.repository.updateResult(updated);
    return updated;
  }
}
