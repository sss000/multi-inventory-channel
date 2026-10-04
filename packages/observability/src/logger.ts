export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  correlationId?: string;
  organizationId?: string;
  userId?: string;
  jobId?: string;
  [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, error?: Error | unknown, context?: LogContext): void;
}

export class JsonStructuredLogger implements Logger {
  constructor(private readonly serviceName: string) {}

  private log(level: LogLevel, message: string, context?: LogContext, error?: unknown) {
    const entry = {
      timestamp: new Date().toISOString(),
      level,
      service: this.serviceName,
      message,
      ...(context ? { context: this.sanitize(context) } : {}),
      ...(error instanceof Error
        ? { error: { name: error.name, message: error.message, stack: error.stack } }
        : error
        ? { error }
        : {})
    };

    const output = JSON.stringify(entry);
    if (level === "error") {
      process.stderr.write(output + "\n");
    } else {
      process.stdout.write(output + "\n");
    }
  }

  private sanitize(obj: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = ["password", "secret", "token", "key", "authorization"];
    const sanitized: Record<string, unknown> = {};

    for (const [k, v] of Object.entries(obj)) {
      if (sensitiveKeys.some((s) => k.toLowerCase().includes(s))) {
        sanitized[k] = "[REDACTED]";
      } else if (typeof v === "object" && v !== null && !Array.isArray(v)) {
        sanitized[k] = this.sanitize(v as Record<string, unknown>);
      } else {
        sanitized[k] = v;
      }
    }
    return sanitized;
  }

  debug(message: string, context?: LogContext) {
    this.log("debug", message, context);
  }

  info(message: string, context?: LogContext) {
    this.log("info", message, context);
  }

  warn(message: string, context?: LogContext) {
    this.log("warn", message, context);
  }

  error(message: string, error?: Error | unknown, context?: LogContext) {
    this.log("error", message, context, error);
  }
}

export function createLogger(serviceName: string): Logger {
  return new JsonStructuredLogger(serviceName);
}
