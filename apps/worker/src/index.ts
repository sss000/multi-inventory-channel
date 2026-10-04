import { loadServerConfig } from "@platform/config";
import { createLogger } from "@platform/observability";
import {
  getDatabaseConnectionConfig,
  checkRedisHealth,
  checkDatabaseHealth,
  checkSystemLiveness,
  ComponentHealthResult,
  SystemLivenessReport,
} from "@platform/database";
import {
  DurableJobQueue,
  JobWorker,
  QueueMetrics,
} from "@platform/integrations";

const logger = createLogger("platform-worker");

export interface WorkerHealthReport {
  status: "healthy" | "unhealthy";
  liveness: SystemLivenessReport;
  checks: {
    redis: ComponentHealthResult;
    database: ComponentHealthResult;
  };
  queue?: QueueMetrics;
}

export interface WorkerInstance {
  queue: DurableJobQueue;
  worker: JobWorker;
  checkHealth(): Promise<WorkerHealthReport>;
  recoverOrphanedJobs(): Promise<number>;
  stop(): Promise<void>;
}

export interface StartWorkerOptions {
  queue?: DurableJobQueue;
  concurrency?: number;
  skipRecovery?: boolean;
}

export function startWorker(options: StartWorkerOptions = {}): WorkerInstance {
  const config = loadServerConfig();
  const dbConfig = getDatabaseConnectionConfig();

  const queue = options.queue || new DurableJobQueue();
  const worker = new JobWorker(queue, {
    concurrency: options.concurrency ?? 5,
    pollIntervalMs: 25,
  });

  logger.info("Starting Platform Asynchronous Worker...", {
    environment: config.NODE_ENV,
    redisHost: config.REDIS_HOST,
    redisPort: config.REDIS_PORT,
    databaseConfigured: dbConfig.isPoolerConfigured,
    concurrency: worker.concurrency,
  });

  // On worker startup, scan and recover any orphaned jobs from previous crashes/restarts
  if (!options.skipRecovery) {
    worker.recoverOrphanedJobs(0).then((recovered) => {
      if (recovered.length > 0) {
        logger.warn(`Recovered ${recovered.length} orphaned jobs on worker startup.`);
      }
    }).catch((err) => {
      logger.error("Error during initial worker recovery scan", { error: err });
    });
  }

  worker.start();

  return {
    queue,
    worker,
    async checkHealth(): Promise<WorkerHealthReport> {
      const [redis, database, queueMetrics] = await Promise.all([
        checkRedisHealth(),
        checkDatabaseHealth(),
        queue.getQueueMetrics(),
      ]);
      const isHealthy = redis.status === "healthy" && database.status === "healthy";
      return {
        status: isHealthy ? "healthy" : "unhealthy",
        liveness: checkSystemLiveness(),
        checks: { redis, database },
        queue: queueMetrics,
      };
    },
    async recoverOrphanedJobs(): Promise<number> {
      const recovered = await worker.recoverOrphanedJobs(0);
      return recovered.length;
    },
    async stop() {
      await worker.stop();
      logger.info("Platform Asynchronous Worker stopped gracefully.");
    },
  };
}

if (process.argv[1]?.endsWith("index.js") || process.argv[1]?.endsWith("index.ts")) {
  startWorker();
}
