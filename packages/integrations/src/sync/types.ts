import { SyncJobRow, SyncStatus } from "@platform/database";
import { VerificationStage, VerificationStageInfo } from "@platform/contracts";
import { ChannelAdapter } from "../adapter.js";
import { ClassifiedSyncError } from "./error-classifier.js";

export interface ExecuteSyncJobParams {
  organizationId: string;
  jobId: string;
  adapter: ChannelAdapter;
  externalSkuId: string;
  maxAttempts?: number;
  skipVerificationCheck?: boolean;
  onStageChange?: (stage: VerificationStage, stageInfo: VerificationStageInfo) => void;
}

export interface SyncExecutionOutcome {
  job: SyncJobRow;
  finalState: SyncStatus;
  stage: VerificationStage;
  stageInfo: VerificationStageInfo;
  isSuccess: boolean;
  error?: ClassifiedSyncError;
  verifiedQuantity?: number;
  observedAt?: Date;
  receivedAt?: Date;
  verifiedAt?: Date;
  isStale?: boolean;
  durationMs: number;
}
