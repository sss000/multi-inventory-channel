# Organizations and RBAC Specification — Multichannel Inventory Control Platform

## 1. Architectural Authority & Invariants

Governed by Section 10, Section 47, and Section 69 of `01_ENGINEERING_SPEC.md` and Prompt 06 of `06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md`.

### Core Invariants
1. **Server-Side Tenant Derivation**: The platform **NEVER** trusts a frontend-provided organization ID. Organization context (`organizationId`) is strictly derived from verified session authentication and membership records.
2. **Deterministic Isolation**: Every tenant-scoped entity (products, inventory, orders, exceptions, integrations, audit records) is strictly segregated. An organization context cannot access, query, or mutate resources belonging to another organization.
3. **Defense-in-Depth**:
   - **Application Boundary**: `validateTenantAccess(context, resourceOrgId)` and `TenantIsolatedRepository`.
   - **Database Boundary**: PostgreSQL Row Level Security (RLS) policies using `current_user_organization_ids()`.

---

## 2. Canonical System Roles & RBAC Matrix

The system provides 5 standard roles:
- `OWNER`: Full administrative ownership, billing, member management, and dangerous bulk operations.
- `ADMIN`: High-level operational administration, member management, channel sync, and reconciliation.
- `MANAGER`: Day-to-day operations: inventory mutations, orders, channel sync, reconciliation.
- `OPERATOR`: Operational execution: inventory recount/adjustments, order fulfillment, exception resolution.
- `VIEWER`: Read-only access across inventory, orders, channels, reconciliation, and exceptions.

### Permission Mapping

| Permission | Description | OWNER | ADMIN | MANAGER | OPERATOR | VIEWER |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `inventory:read` | View inventory levels & SKU details | Yes | Yes | Yes | Yes | Yes |
| `inventory:write` | Create SKUs and product variants | Yes | Yes | Yes | No | No |
| `inventory:adjust` | Manual stock adjustments & recount | Yes | Yes | Yes | Yes | No |
| `inventory:bulk_operation`| Dangerous bulk inventory adjustments | Yes | Yes | No | No | No |
| `orders:read` | View orders and customer information | Yes | Yes | Yes | Yes | Yes |
| `orders:fulfill` | Mark orders fulfilled / trigger release | Yes | Yes | Yes | Yes | No |
| `channels:read` | View connected channels and health | Yes | Yes | Yes | Yes | Yes |
| `channels:sync` | Trigger outbound channel sync jobs | Yes | Yes | Yes | No | No |
| `channels:write` | Connect/disconnect sales channels | Yes | Yes | No | No | No |
| `reconciliation:read` | View truth reconciliation run results | Yes | Yes | Yes | Yes | Yes |
| `reconciliation:write`| Run reconciliation & auto-resolve | Yes | Yes | Yes | No | No |
| `exceptions:read` | View exception inbox | Yes | Yes | Yes | Yes | Yes |
| `exceptions:resolve` | Resolve/acknowledge exceptions | Yes | Yes | Yes | Yes | No |
| `organization:manage`| Update organization profile & settings | Yes | Yes | No | No | No |
| `users:manage` | Invite, update role, and remove members | Yes | Yes | No | No | No |
| `billing:manage` | Manage Stripe subscription and plans | Yes | Yes | No | No | No |
| `admin:action` | Administrative overrides | Yes | Yes | No | No | No |

---

## 3. Organization Management API Contract

| Method | Endpoint | Required Permission | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/organizations/current` | Active Member | Fetch current organization profile |
| `PATCH` | `/organizations/current` | `organization:manage` | Update organization name / settings |
| `GET` | `/organizations/current/members` | Active Member | List members within current organization |
| `POST` | `/organizations/current/members` | `users:manage` | Invite / add a new member with specified role |
| `PATCH` | `/organizations/current/members/:id`| `users:manage` | Update member role |
| `DELETE`| `/organizations/current/members/:id`| `users:manage` | Remove member from organization |

---

## 4. Cross-Tenant Isolation Enforcement

Any attempt by a user from **Organization A** to access resources of **Organization B** produces:
- Direct Domain Layer: Throws `TenantAccessDeniedError`.
- API HTTP Layer: Responds with `403 Forbidden` (`FORBIDDEN: Tenant isolation violation`).
- Database Layer: PostgreSQL RLS filters out rows (returns empty result set or denies write).
