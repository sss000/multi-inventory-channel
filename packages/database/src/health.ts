import { Socket } from "node:net";
import { loadServerConfig } from "@platform/config";
import { getDatabaseConnectionConfig } from "./connection.js";

export type ComponentHealthStatus = "healthy" | "degraded" | "unhealthy" | "unconfigured";

export interface ComponentHealthResult {
  status: ComponentHealthStatus;
  latencyMs: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface SystemReadinessReport {
  status: "READY" | "NOT_READY";
  timestamp: string;
  uptimeSeconds: number;
  checks: {
    environment: ComponentHealthResult;
    database: ComponentHealthResult;
    supabaseAuth: ComponentHealthResult;
    supabaseStorage: ComponentHealthResult;
    redis: ComponentHealthResult;
  };
}

export interface SystemLivenessReport {
  status: "ALIVE";
  timestamp: string;
  uptimeSeconds: number;
  memoryUsageMb: number;
}

/**
 * Checks environment configuration validity.
 */
export function checkEnvironmentHealth(): ComponentHealthResult {
  const start = Date.now();
  try {
    const config = loadServerConfig();
    return {
      status: "healthy",
      latencyMs: Date.now() - start,
      details: {
        environment: config.NODE_ENV,
        configuredPort: config.PORT
      }
    };
  } catch (error) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - start,
      message: error instanceof Error ? error.message : "Invalid environment"
    };
  }
}

/**
 * Verifies Supabase Postgres TCP reachability on the configured host & port.
 */
export async function checkDatabaseHealth(timeoutMs = 2000): Promise<ComponentHealthResult> {
  const start = Date.now();
  const dbConfig = getDatabaseConnectionConfig();

  try {
    const parsedUrl = new URL(dbConfig.pooledUrl);
    const host = parsedUrl.hostname || "127.0.0.1";
    const port = Number(parsedUrl.port) || 54322;

    await testTcpConnection(host, port, timeoutMs);

    return {
      status: "healthy",
      latencyMs: Date.now() - start,
      details: {
        host,
        port,
        poolerConfigured: dbConfig.isPoolerConfigured
      }
    };
  } catch (error) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - start,
      message: `Database connection failed: ${error instanceof Error ? error.message : String(error)}`,
      details: {
        poolerConfigured: dbConfig.isPoolerConfigured
      }
    };
  }
}

/**
 * Verifies Supabase Auth endpoint health.
 */
export async function checkSupabaseAuthHealth(timeoutMs = 2000): Promise<ComponentHealthResult> {
  const start = Date.now();
  const config = loadServerConfig();

  if (!config.NEXT_PUBLIC_SUPABASE_URL || !config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return {
      status: "unconfigured",
      latencyMs: 0,
      message: "Supabase Auth URL or publishable key missing"
    };
  }

  const healthUrl = `${config.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/auth/v1/health`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(healthUrl, {
      signal: controller.signal,
      headers: {
        apikey: config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      }
    });
    clearTimeout(timeout);

    if (res.ok) {
      return {
        status: "healthy",
        latencyMs: Date.now() - start,
        details: {
          endpoint: healthUrl,
          statusCode: res.status
        }
      };
    }

    return {
      status: "degraded",
      latencyMs: Date.now() - start,
      message: `Supabase Auth responded with HTTP ${res.status}`,
      details: { statusCode: res.status }
    };
  } catch (error) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - start,
      message: `Supabase Auth check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Verifies Supabase Storage endpoint health.
 */
export async function checkSupabaseStorageHealth(timeoutMs = 2000): Promise<ComponentHealthResult> {
  const start = Date.now();
  const config = loadServerConfig();

  if (!config.NEXT_PUBLIC_SUPABASE_URL) {
    return {
      status: "unconfigured",
      latencyMs: 0,
      message: "Supabase URL missing"
    };
  }

  const storageUrl = `${config.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "")}/storage/v1/status`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(storageUrl, {
      signal: controller.signal,
      headers: {
        apikey: config.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
      }
    });
    clearTimeout(timeout);

    return {
      status: res.ok ? "healthy" : "degraded",
      latencyMs: Date.now() - start,
      details: {
        endpoint: storageUrl,
        statusCode: res.status
      }
    };
  } catch (error) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - start,
      message: `Supabase Storage check failed: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

/**
 * Verifies Redis connectivity with standard PING -> PONG over TCP.
 */
export async function checkRedisHealth(timeoutMs = 2000): Promise<ComponentHealthResult> {
  const start = Date.now();
  const config = loadServerConfig();
  const host = config.REDIS_HOST;
  const port = config.REDIS_PORT;

  try {
    await testRedisPing(host, port, timeoutMs);
    return {
      status: "healthy",
      latencyMs: Date.now() - start,
      details: {
        host,
        port
      }
    };
  } catch (error) {
    return {
      status: "unhealthy",
      latencyMs: Date.now() - start,
      message: `Redis PING failed: ${error instanceof Error ? error.message : String(error)}`,
      details: { host, port }
    };
  }
}

/**
 * Aggregates all readiness checks into a single system readiness report.
 */
export async function checkSystemReadiness(): Promise<SystemReadinessReport> {
  const [envCheck, dbCheck, authCheck, storageCheck, redisCheck] = await Promise.all([
    Promise.resolve(checkEnvironmentHealth()),
    checkDatabaseHealth(),
    checkSupabaseAuthHealth(),
    checkSupabaseStorageHealth(),
    checkRedisHealth()
  ]);

  const isCriticalHealthy =
    envCheck.status === "healthy" &&
    dbCheck.status === "healthy" &&
    redisCheck.status === "healthy";

  return {
    status: isCriticalHealthy ? "READY" : "NOT_READY",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    checks: {
      environment: envCheck,
      database: dbCheck,
      supabaseAuth: authCheck,
      supabaseStorage: storageCheck,
      redis: redisCheck
    }
  };
}

/**
 * Returns basic process liveness.
 */
export function checkSystemLiveness(): SystemLivenessReport {
  const memoryUsage = process.memoryUsage();
  return {
    status: "ALIVE",
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    memoryUsageMb: Math.round(memoryUsage.heapUsed / (1024 * 1024))
  };
}

// Helpers
function testTcpConnection(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let isSettled = false;

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      isSettled = true;
      socket.destroy();
      resolve();
    });

    socket.on("timeout", () => {
      if (!isSettled) {
        isSettled = true;
        socket.destroy();
        reject(new Error(`TCP connection to ${host}:${port} timed out after ${timeoutMs}ms`));
      }
    });

    socket.on("error", (err) => {
      if (!isSettled) {
        isSettled = true;
        socket.destroy();
        reject(err);
      }
    });

    socket.connect(port, host);
  });
}

function testRedisPing(host: string, port: number, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    let isSettled = false;

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      socket.write("*1\r\n$4\r\nPING\r\n");
    });

    socket.on("data", (data) => {
      if (!isSettled) {
        isSettled = true;
        const response = data.toString();
        socket.destroy();
        if (response.includes("+PONG")) {
          resolve();
        } else {
          reject(new Error(`Unexpected Redis response: ${response.trim()}`));
        }
      }
    });

    socket.on("timeout", () => {
      if (!isSettled) {
        isSettled = true;
        socket.destroy();
        reject(new Error(`Redis PING to ${host}:${port} timed out after ${timeoutMs}ms`));
      }
    });

    socket.on("error", (err) => {
      if (!isSettled) {
        isSettled = true;
        socket.destroy();
        reject(err);
      }
    });

    socket.connect(port, host);
  });
}
