-- ====================================================================
-- MIGRATION: 20260928000002_row_level_security.sql
-- DESCRIPTION: PostgreSQL Row Level Security (RLS) Policies for Multi-Tenant Isolation
-- CANONICAL SPECIFICATION: Section 10-22, 69 of 01_ENGINEERING_SPEC.md & Prompt 04 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
-- ====================================================================

-- 1. HELPER FUNCTION: Get Organization IDs for the current authenticated Supabase user
CREATE OR REPLACE FUNCTION current_user_organization_ids()
RETURNS SETOF UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT organization_id
    FROM memberships
    WHERE user_id = auth.uid();
$$;

-- 2. ENABLE ROW LEVEL SECURITY ON ALL APPLICABLE TABLES
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE skus ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_product_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE returns ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. POLICIES FOR GLOBAL REFERENCE TABLES
-- channels: Global reference table. Authenticated users can view channels.
CREATE POLICY "channels_read_policy" ON channels
    FOR SELECT TO authenticated
    USING (true);

-- 4. POLICIES FOR IDENTITY AND MEMBERSHIP
-- organizations: Members can view their own organization
CREATE POLICY "organizations_select_policy" ON organizations
    FOR SELECT TO authenticated
    USING (id IN (SELECT current_user_organization_ids()));

-- users: Users can view their own record and co-members in their organizations
CREATE POLICY "users_select_self_or_co_members" ON users
    FOR SELECT TO authenticated
    USING (
        id = auth.uid() OR
        id IN (
            SELECT user_id FROM memberships 
            WHERE organization_id IN (SELECT current_user_organization_ids())
        )
    );

-- memberships: Members can view memberships within their organizations
CREATE POLICY "memberships_select_policy" ON memberships
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

-- roles: View system roles (org is null) or organization-specific custom roles
CREATE POLICY "roles_select_policy" ON roles
    FOR SELECT TO authenticated
    USING (
        organization_id IS NULL OR 
        organization_id IN (SELECT current_user_organization_ids())
    );

-- 5. POLICIES FOR TENANT-SCOPED DOMAIN ENTITIES

-- products
CREATE POLICY "products_tenant_isolation_select" ON products
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

CREATE POLICY "products_tenant_isolation_modify" ON products
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- skus
CREATE POLICY "skus_tenant_isolation_select" ON skus
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

CREATE POLICY "skus_tenant_isolation_modify" ON skus
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- product_variants
CREATE POLICY "variants_tenant_isolation_select" ON product_variants
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

CREATE POLICY "variants_tenant_isolation_modify" ON product_variants
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- channel_accounts
CREATE POLICY "channel_accounts_tenant_isolation_select" ON channel_accounts
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

CREATE POLICY "channel_accounts_tenant_isolation_modify" ON channel_accounts
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- channel_product_mappings
CREATE POLICY "mappings_tenant_isolation_select" ON channel_product_mappings
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

CREATE POLICY "mappings_tenant_isolation_modify" ON channel_product_mappings
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- warehouses
CREATE POLICY "warehouses_tenant_isolation_select" ON warehouses
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

CREATE POLICY "warehouses_tenant_isolation_modify" ON warehouses
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- inventory_balances
CREATE POLICY "balances_tenant_isolation_select" ON inventory_balances
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

-- Note: Mutations to inventory balances are strictly controlled via domain/server transaction boundary.
-- Authenticated client direct mutations are restricted to authorized tenant rows:
CREATE POLICY "balances_tenant_isolation_modify" ON inventory_balances
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- inventory_reservations
CREATE POLICY "reservations_tenant_isolation_select" ON inventory_reservations
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

CREATE POLICY "reservations_tenant_isolation_modify" ON inventory_reservations
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- orders
CREATE POLICY "orders_tenant_isolation_select" ON orders
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

CREATE POLICY "orders_tenant_isolation_modify" ON orders
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- order_items (Transitively tenant isolated via orders)
CREATE POLICY "order_items_tenant_isolation_select" ON order_items
    FOR SELECT TO authenticated
    USING (
        order_id IN (
            SELECT id FROM orders 
            WHERE organization_id IN (SELECT current_user_organization_ids())
        )
    );

CREATE POLICY "order_items_tenant_isolation_modify" ON order_items
    FOR ALL TO authenticated
    USING (
        order_id IN (
            SELECT id FROM orders 
            WHERE organization_id IN (SELECT current_user_organization_ids())
        )
    )
    WITH CHECK (
        order_id IN (
            SELECT id FROM orders 
            WHERE organization_id IN (SELECT current_user_organization_ids())
        )
    );

-- inventory_events (Immutable audit ledger for inventory changes)
CREATE POLICY "events_tenant_isolation_select" ON inventory_events
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

-- Direct client updates/deletes to inventory_events are strictly disallowed.
-- Inserts are allowed only within tenant boundary.
CREATE POLICY "events_tenant_isolation_insert" ON inventory_events
    FOR INSERT TO authenticated
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- returns
CREATE POLICY "returns_tenant_isolation_select" ON returns
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

CREATE POLICY "returns_tenant_isolation_modify" ON returns
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- suppliers
CREATE POLICY "suppliers_tenant_isolation_select" ON suppliers
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

CREATE POLICY "suppliers_tenant_isolation_modify" ON suppliers
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- purchase_orders
CREATE POLICY "purchase_orders_tenant_isolation_select" ON purchase_orders
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

CREATE POLICY "purchase_orders_tenant_isolation_modify" ON purchase_orders
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- purchase_order_items (Transitively tenant isolated via purchase_orders)
CREATE POLICY "po_items_tenant_isolation_select" ON purchase_order_items
    FOR SELECT TO authenticated
    USING (
        purchase_order_id IN (
            SELECT id FROM purchase_orders 
            WHERE organization_id IN (SELECT current_user_organization_ids())
        )
    );

CREATE POLICY "po_items_tenant_isolation_modify" ON purchase_order_items
    FOR ALL TO authenticated
    USING (
        purchase_order_id IN (
            SELECT id FROM purchase_orders 
            WHERE organization_id IN (SELECT current_user_organization_ids())
        )
    )
    WITH CHECK (
        purchase_order_id IN (
            SELECT id FROM purchase_orders 
            WHERE organization_id IN (SELECT current_user_organization_ids())
        )
    );

-- sync_jobs
CREATE POLICY "sync_jobs_tenant_isolation_select" ON sync_jobs
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

CREATE POLICY "sync_jobs_tenant_isolation_modify" ON sync_jobs
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- reconciliation_runs
CREATE POLICY "reconciliation_runs_tenant_isolation_select" ON reconciliation_runs
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

CREATE POLICY "reconciliation_runs_tenant_isolation_modify" ON reconciliation_runs
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- reconciliation_results (Transitively tenant isolated via reconciliation_runs)
CREATE POLICY "reconciliation_results_tenant_isolation_select" ON reconciliation_results
    FOR SELECT TO authenticated
    USING (
        reconciliation_run_id IN (
            SELECT id FROM reconciliation_runs 
            WHERE organization_id IN (SELECT current_user_organization_ids())
        )
    );

CREATE POLICY "reconciliation_results_tenant_isolation_modify" ON reconciliation_results
    FOR ALL TO authenticated
    USING (
        reconciliation_run_id IN (
            SELECT id FROM reconciliation_runs 
            WHERE organization_id IN (SELECT current_user_organization_ids())
        )
    )
    WITH CHECK (
        reconciliation_run_id IN (
            SELECT id FROM reconciliation_runs 
            WHERE organization_id IN (SELECT current_user_organization_ids())
        )
    );

-- exceptions
CREATE POLICY "exceptions_tenant_isolation_select" ON exceptions
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));

CREATE POLICY "exceptions_tenant_isolation_modify" ON exceptions
    FOR ALL TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()))
    WITH CHECK (organization_id IN (SELECT current_user_organization_ids()));

-- audit_logs: STRICT APPEND-ONLY.
-- Authenticated users can view their tenant's audit trail.
-- Direct INSERT, UPDATE, DELETE are forbidden for authenticated role; mutations must originate from server/service_role.
CREATE POLICY "audit_logs_tenant_isolation_select" ON audit_logs
    FOR SELECT TO authenticated
    USING (organization_id IN (SELECT current_user_organization_ids()));
