# Monitoring & Observability Infrastructure

## Architecture

- **OpenTelemetry:** Distributed tracing across HTTP endpoints (`apps/api`), queue jobs (`apps/worker`), and external provider requests (`packages/integrations`).
- **Structured Logging:** JSON-formatted structured logging with correlation IDs (`traceId`, `spanId`, `tenantId`, `jobId`).
- **Metrics:** Prometheus/OpenTelemetry metrics for queue depth, job latency, sync verification rates, and API error rates.
- **Error Reporting:** Sentry or equivalent error grouping with tenant/context scrubbing.
