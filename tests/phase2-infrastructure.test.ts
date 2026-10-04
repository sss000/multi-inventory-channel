import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";

import {
  checkSystemLiveness,
  checkEnvironmentHealth,
  checkDatabaseHealth,
  checkSupabaseAuthHealth,
  checkSupabaseStorageHealth,
  checkRedisHealth,
  checkSystemReadiness
} from "@platform/database";
import { startWorker } from "@platform/worker";
import { startApiServer } from "@platform/api";

function fetchEndpoint(url: string): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, (res) => {
        let rawData = "";
        res.on("data", (chunk) => {
          rawData += chunk;
        });
        res.on("end", () => {
          try {
            const body = JSON.parse(rawData);
            resolve({ statusCode: res.statusCode ?? 0, body });
          } catch {
            resolve({ statusCode: res.statusCode ?? 0, body: { raw: rawData } });
          }
        });
      })
      .on("error", reject);
  });
}

describe("Phase 2: Infrastructure Acceptance Suite", () => {
  describe("1. Liveness & Environment Checks", () => {
    it("should return valid process liveness report", () => {
      const liveness = checkSystemLiveness();
      assert.equal(liveness.status, "ALIVE");
      assert.ok(liveness.uptimeSeconds >= 0);
      assert.ok(liveness.memoryUsageMb > 0);
      assert.ok(liveness.timestamp);
    });

    it("should report healthy environment configuration with valid defaults", () => {
      const envHealth = checkEnvironmentHealth();
      assert.equal(envHealth.status, "healthy");
      assert.ok(envHealth.latencyMs >= 0);
      assert.ok(envHealth.details);
    });
  });

  describe("2. Deep Dependency Checks Architecture", () => {
    it("should execute database connectivity check without throwing unhandled exceptions", async () => {
      const dbHealth = await checkDatabaseHealth(500);
      assert.ok(["healthy", "unhealthy"].includes(dbHealth.status));
      assert.ok(dbHealth.latencyMs >= 0);
      // Verify no secrets leaked in details
      assert.equal(JSON.stringify(dbHealth).includes("postgres:postgres"), false);
    });

    it("should execute Redis connectivity check without throwing unhandled exceptions", async () => {
      const redisHealth = await checkRedisHealth(500);
      assert.ok(["healthy", "unhealthy"].includes(redisHealth.status));
      assert.ok(redisHealth.latencyMs >= 0);
      assert.ok(redisHealth.details);
    });

    it("should execute Supabase Auth check and sanitize output", async () => {
      const authHealth = await checkSupabaseAuthHealth(500);
      assert.ok(["healthy", "degraded", "unhealthy", "unconfigured"].includes(authHealth.status));
      assert.ok(authHealth.latencyMs >= 0);
      // Verify secrets not leaked
      assert.equal(JSON.stringify(authHealth).includes("sb_secret"), false);
    });

    it("should execute Supabase Storage check and sanitize output", async () => {
      const storageHealth = await checkSupabaseStorageHealth(500);
      assert.ok(["healthy", "degraded", "unhealthy", "unconfigured"].includes(storageHealth.status));
      assert.ok(storageHealth.latencyMs >= 0);
    });

    it("should aggregate checks into a unified SystemReadinessReport", async () => {
      const readiness = await checkSystemReadiness();
      assert.ok(["READY", "NOT_READY"].includes(readiness.status));
      assert.ok(readiness.checks.environment);
      assert.ok(readiness.checks.database);
      assert.ok(readiness.checks.redis);
      assert.ok(readiness.checks.supabaseAuth);
      assert.ok(readiness.checks.supabaseStorage);
    });
  });

  describe("3. Worker Health Interface", () => {
    it("should provide health check on Worker instance", async () => {
      const worker = startWorker();
      const report = await worker.checkHealth();

      assert.ok(["healthy", "unhealthy"].includes(report.status));
      assert.equal(report.liveness.status, "ALIVE");
      assert.ok(report.checks.redis);
      assert.ok(report.checks.database);

      await worker.stop();
    });
  });

  describe("4. API Health, Liveness, and Readiness Endpoints", () => {
    it("should expose all required health probes over HTTP", async () => {
      const testPort = 4077;
      const server = startApiServer(testPort);

      try {
        // GET /health
        const health = await fetchEndpoint(`http://localhost:${testPort}/health`);
        assert.equal(health.statusCode, 200);
        assert.equal(health.body.status, "healthy");

        // GET /health/live
        const live = await fetchEndpoint(`http://localhost:${testPort}/health/live`);
        assert.equal(live.statusCode, 200);
        assert.equal(live.body.status, "ALIVE");

        // GET /health/ready
        const ready = await fetchEndpoint(`http://localhost:${testPort}/health/ready`);
        assert.ok([200, 503].includes(ready.statusCode));
        assert.ok(ready.body.checks);

        // GET /health/supabase
        const supabase = await fetchEndpoint(`http://localhost:${testPort}/health/supabase`);
        assert.ok([200, 503].includes(supabase.statusCode));
        assert.equal(supabase.body.service, "supabase");

        // GET /health/redis
        const redis = await fetchEndpoint(`http://localhost:${testPort}/health/redis`);
        assert.ok([200, 503].includes(redis.statusCode));
        assert.equal(redis.body.service, "redis");

        // GET /api/v1/status
        const status = await fetchEndpoint(`http://localhost:${testPort}/api/v1/status`);
        assert.equal(status.statusCode, 200);
        assert.ok(status.body.data);
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe("5. Configuration and Infrastructure Artifacts Verification", () => {
    it("should verify Supabase CLI config.toml exists and specifies expected ports", () => {
      const configPath = path.resolve("supabase/config.toml");
      assert.ok(fs.existsSync(configPath), "supabase/config.toml must exist");
      const content = fs.readFileSync(configPath, "utf-8");
      assert.ok(content.includes("port = 54321"), "API port 54321 must be defined");
      assert.ok(content.includes("port = 54322"), "Database port 54322 must be defined");
    });

    it("should verify redis.conf configures BullMQ noeviction and persistence", () => {
      const redisConfPath = path.resolve("infrastructure/redis/redis.conf");
      assert.ok(fs.existsSync(redisConfPath), "infrastructure/redis/redis.conf must exist");
      const content = fs.readFileSync(redisConfPath, "utf-8");
      assert.ok(content.includes("maxmemory-policy noeviction"));
      assert.ok(content.includes("appendonly yes"));
    });

    it("should verify docker-compose.yml coordinates all 5 services", () => {
      const composePath = path.resolve("docker-compose.yml");
      assert.ok(fs.existsSync(composePath), "docker-compose.yml must exist");
      const content = fs.readFileSync(composePath, "utf-8");
      assert.ok(content.includes("redis:"));
      assert.ok(content.includes("api:"));
      assert.ok(content.includes("worker:"));
      assert.ok(content.includes("web:"));
      assert.ok(content.includes("admin:"));
    });

    it("should verify all 4 application Dockerfiles exist", () => {
      assert.ok(fs.existsSync(path.resolve("apps/api/Dockerfile")));
      assert.ok(fs.existsSync(path.resolve("apps/worker/Dockerfile")));
      assert.ok(fs.existsSync(path.resolve("apps/web/Dockerfile")));
      assert.ok(fs.existsSync(path.resolve("apps/admin/Dockerfile")));
    });
  });
});
