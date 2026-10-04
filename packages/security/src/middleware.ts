/**
 * API Authentication & Authorization Middleware
 * Canonical Specification: Prompt 05 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * Extracts Supabase JWT identity, derives TenantContext, and executes within runWithTenant boundary.
 */

import { IncomingMessage, ServerResponse } from "node:http";
import { SupabaseClient } from "@supabase/supabase-js";
import { OrganizationId, UserId } from "@platform/domain";
import { parseSessionCookies } from "./session.js";
import { runWithTenant, TenantContext } from "./tenant.js";
import { Permission, SystemRole, hasPermission } from "./permissions.js";

export interface AuthenticatedRequest extends IncomingMessage {
  user?: {
    id: string;
    email: string;
    role: SystemRole;
  };
  tenantContext?: TenantContext;
}

export interface AuthGuardOptions {
  requiredPermission?: Permission;
  requiredRole?: SystemRole;
}

/**
 * Extracts Bearer token from Authorization header or cookie.
 */
export function extractAuthToken(req: IncomingMessage): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }

  const cookies = parseSessionCookies(req.headers.cookie);
  if (cookies.accessToken) {
    return cookies.accessToken;
  }

  return null;
}

/**
 * Verifies Supabase identity and derives tenant context.
 */
export async function authenticateRequest(
  req: IncomingMessage,
  supabaseClient: SupabaseClient
): Promise<TenantContext | null> {
  const token = extractAuthToken(req);
  if (!token) {
    return null;
  }

  const { data, error } = await supabaseClient.auth.getUser(token);
  if (error || !data.user) {
    return null;
  }

  const user = data.user;
  const metadata = user.user_metadata || {};
  const orgId = (metadata.organization_id as string) || `00000000-0000-0000-0000-${user.id.slice(0, 12)}`;
  const role: SystemRole = (metadata.role as SystemRole) || "Owner";

  const context: TenantContext = {
    organizationId: orgId as unknown as OrganizationId,
    userId: user.id as unknown as UserId,
    role,
    permissions: [],
  };

  return context;
}

/**
 * Middleware wrapper enforcing authentication and optional permission/role checks.
 */
export function withAuth(
  supabaseClient: SupabaseClient,
  options: AuthGuardOptions = {}
) {
  return function (
    handler: (req: AuthenticatedRequest, res: ServerResponse) => Promise<void> | void
  ) {
    return async function (req: AuthenticatedRequest, res: ServerResponse): Promise<void> {
      const tenantContext = await authenticateRequest(req, supabaseClient);

      if (!tenantContext) {
        res.writeHead(401, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: {
              code: "UNAUTHORIZED",
              message: "Authentication required. Please provide a valid Bearer token or session cookie.",
            },
          })
        );
        return;
      }

      // Check role requirement
      if (options.requiredRole && tenantContext.role !== options.requiredRole) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: {
              code: "FORBIDDEN",
              message: `Insufficient role. Required: ${options.requiredRole}, current: ${tenantContext.role}`,
            },
          })
        );
        return;
      }

      // Check permission requirement
      if (options.requiredPermission && !hasPermission(tenantContext.role, options.requiredPermission)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            error: {
              code: "FORBIDDEN",
              message: `Missing required permission: ${options.requiredPermission}`,
            },
          })
        );
        return;
      }

      req.tenantContext = tenantContext;
      req.user = {
        id: tenantContext.userId as unknown as string,
        email: "",
        role: tenantContext.role,
      };

      // Execute within isolated tenant context
      await runWithTenant(tenantContext, async () => {
        await handler(req, res);
      });
    };
  };
}
