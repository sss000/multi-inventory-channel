# API Design Contract

## Core Principles

1. **REST APIs**: Standard JSON REST APIs for all client and external integrations.
2. **Server Authority**: The backend is authoritative for tenancy, authentication, role authorization, and inventory mutations.
3. **No Direct Inventory Mutations via Auto-CRUD**: All inventory mutations must pass through explicit, audited business endpoints (e.g., `/api/v1/inventory/adjust`, `/api/v1/orders/reserve`), not auto-generated CRUD routes.
4. **Standard Envelope**:
   - `data`: Payload on success.
   - `error`: `{ code, message, details, correlationId }` on error.
   - `meta`: `{ timestamp, pagination }` where applicable.
5. **Correlation Tracking**: Every request generates or propagates an `x-correlation-id` header logged across all layers.
