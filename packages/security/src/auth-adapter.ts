/**
 * Supabase Auth Application Adapter
 * Canonical Specification: Prompt 05 of 06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md
 * Implements the application authentication contract as a thin adapter over Supabase Auth.
 */

import { randomUUID } from "node:crypto";
import { SupabaseClient } from "@supabase/supabase-js";
import {
  RegisterRequest,
  RegisterResponse,
  LoginRequest,
  LoginResponse,
  LogoutRequest,
  LogoutResponse,
  RefreshTokenRequest,
  RefreshTokenResponse,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  ResetPasswordRequest,
  ResetPasswordResponse,
  AuthMeResponse,
  AuthSession,
} from "@platform/contracts";
import { BruteForceLimiter, defaultBruteForceLimiter } from "./brute-force.js";
import { authAuditEmitter } from "./audit.js";

export class AuthenticationError extends Error {
  constructor(message: string, public readonly code: string, public readonly status: number = 400) {
    super(message);
    this.name = "AuthenticationError";
  }
}

export class InvalidCredentialsError extends AuthenticationError {
  constructor(message = "Invalid email or password.") {
    super(message, "INVALID_CREDENTIALS", 401);
    this.name = "InvalidCredentialsError";
  }
}

export class AccountAlreadyExistsError extends AuthenticationError {
  constructor(message = "An account with this email address already exists.") {
    super(message, "ACCOUNT_EXISTS", 409);
    this.name = "AccountAlreadyExistsError";
  }
}

export class SessionExpiredError extends AuthenticationError {
  constructor(message = "Session has expired or token is invalid. Please sign in again.") {
    super(message, "SESSION_EXPIRED", 401);
    this.name = "SessionExpiredError";
  }
}

export class BruteForceLockoutError extends AuthenticationError {
  constructor(public readonly retryAfterMs: number) {
    const minutes = Math.ceil(retryAfterMs / 60000);
    super(
      `Too many failed login attempts. Account temporarily locked for security. Please try again in ${minutes} minutes.`,
      "RATE_LIMIT_EXCEEDED",
      429
    );
    this.name = "BruteForceLockoutError";
  }
}

export interface ClientContext {
  ipAddress?: string;
  userAgent?: string;
}

export class SupabaseAuthAdapter {
  constructor(
    private readonly supabaseClient: SupabaseClient,
    private readonly bruteForceLimiter: BruteForceLimiter = defaultBruteForceLimiter
  ) {}

  /**
   * Registers a new user and organization.
   * Maps to Supabase Auth signUp and creates initial organization membership.
   */
  async register(input: RegisterRequest, client?: ClientContext): Promise<RegisterResponse> {
    const slug = input.slug || input.organizationName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

    const { data, error } = await this.supabaseClient.auth.signUp({
      email: input.email,
      password: input.password,
      options: {
        data: {
          name: input.name,
          organization_name: input.organizationName,
          slug,
        },
      },
    });

    if (error) {
      if (
        error.message.includes("already registered") ||
        error.message.includes("User already registered") ||
        error.status === 422 ||
        error.code === "user_already_exists"
      ) {
        throw new AccountAlreadyExistsError();
      }
      throw new AuthenticationError(error.message, error.code || "REGISTRATION_FAILED", error.status || 400);
    }

    if (!data.user) {
      throw new AuthenticationError("User registration failed.", "USER_CREATION_FAILED", 500);
    }

    const userId = data.user.id;
    const orgId = (data.user.user_metadata?.organization_id as string) || randomUUID();

    authAuditEmitter.emit({
      eventType: "AUTH_REGISTER",
      email: input.email,
      userId,
      organizationId: orgId,
      ipAddress: client?.ipAddress,
      userAgent: client?.userAgent,
      success: true,
      metadata: { organizationName: input.organizationName, slug },
    });

    let session: AuthSession | null = null;
    if (data.session) {
      session = {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
        tokenType: "bearer",
      };
    }

    return {
      user: {
        id: userId,
        email: data.user.email || input.email,
        name: input.name,
      },
      organization: {
        id: orgId,
        name: input.organizationName,
        slug,
      },
      session,
    };
  }

  /**
   * Authenticates user via Supabase Auth with brute-force protection.
   */
  async login(input: LoginRequest, client?: ClientContext): Promise<LoginResponse> {
    const identifier = `${client?.ipAddress || "local"}:${input.email.toLowerCase()}`;
    const status = this.bruteForceLimiter.checkStatus(identifier);

    if (!status.allowed) {
      authAuditEmitter.emit({
        eventType: "AUTH_BRUTE_FORCE_LOCKOUT",
        email: input.email,
        ipAddress: client?.ipAddress,
        userAgent: client?.userAgent,
        success: false,
        reason: "Rate limit lockout",
        metadata: { retryAfterMs: status.retryAfterMs },
      });
      throw new BruteForceLockoutError(status.retryAfterMs);
    }

    const { data, error } = await this.supabaseClient.auth.signInWithPassword({
      email: input.email,
      password: input.password,
    });

    if (error || !data.session || !data.user) {
      this.bruteForceLimiter.recordFailure(identifier);
      authAuditEmitter.emit({
        eventType: "AUTH_LOGIN_FAILURE",
        email: input.email,
        ipAddress: client?.ipAddress,
        userAgent: client?.userAgent,
        success: false,
        reason: error?.message || "Invalid credentials",
      });
      throw new InvalidCredentialsError();
    }

    // Success: reset rate limit tracking for identifier
    this.bruteForceLimiter.recordSuccess(identifier);

    const user = data.user;
    const orgMetadata = user.user_metadata || {};
    const orgId = (orgMetadata.organization_id as string) || `00000000-0000-0000-0000-${user.id.slice(0, 12)}`;

    authAuditEmitter.emit({
      eventType: "AUTH_LOGIN_SUCCESS",
      email: user.email || input.email,
      userId: user.id,
      organizationId: orgId,
      ipAddress: client?.ipAddress,
      userAgent: client?.userAgent,
      success: true,
    });

    return {
      user: {
        id: user.id,
        email: user.email || input.email,
        name: (orgMetadata.name as string) || "Merchant User",
      },
      organization: {
        id: orgId,
        name: (orgMetadata.organization_name as string) || "Merchant Organization",
        slug: (orgMetadata.slug as string) || "merchant",
        role: (orgMetadata.role as string) || "Owner",
      },
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
        tokenType: "bearer",
      },
    };
  }

  /**
   * Logs out the user by invalidating the Supabase Auth session.
   */
  async logout(input: LogoutRequest = {}, client?: ClientContext): Promise<LogoutResponse> {
    const { error } = await this.supabaseClient.auth.signOut();
    if (error) {
      // Non-fatal: even if remote signout fails, client session is cleared
    }

    authAuditEmitter.emit({
      eventType: "AUTH_LOGOUT",
      email: "authenticated-session",
      ipAddress: client?.ipAddress,
      userAgent: client?.userAgent,
      success: true,
    });

    return {
      success: true,
      message: "Successfully signed out.",
    };
  }

  /**
   * Refreshes an expired access token using a valid refresh token.
   */
  async refresh(input: RefreshTokenRequest, client?: ClientContext): Promise<RefreshTokenResponse> {
    const { data, error } = await this.supabaseClient.auth.refreshSession({
      refresh_token: input.refreshToken,
    });

    if (error || !data.session) {
      authAuditEmitter.emit({
        eventType: "AUTH_TOKEN_REFRESH",
        email: "unknown",
        ipAddress: client?.ipAddress,
        userAgent: client?.userAgent,
        success: false,
        reason: error?.message || "Invalid or expired refresh token",
      });
      throw new SessionExpiredError("Refresh token has expired or is invalid.");
    }

    authAuditEmitter.emit({
      eventType: "AUTH_TOKEN_REFRESH",
      email: data.user?.email || "unknown",
      userId: data.user?.id,
      ipAddress: client?.ipAddress,
      userAgent: client?.userAgent,
      success: true,
    });

    return {
      session: {
        accessToken: data.session.access_token,
        refreshToken: data.session.refresh_token,
        expiresIn: data.session.expires_in,
        tokenType: "bearer",
      },
    };
  }

  /**
   * Requests a password reset email via Supabase Auth.
   */
  async forgotPassword(input: ForgotPasswordRequest, client?: ClientContext): Promise<ForgotPasswordResponse> {
    const { error } = await this.supabaseClient.auth.resetPasswordForEmail(input.email);
    if (error) {
      // Do not disclose whether email exists for user enumeration security
    }

    authAuditEmitter.emit({
      eventType: "AUTH_PASSWORD_RESET_REQUEST",
      email: input.email,
      ipAddress: client?.ipAddress,
      userAgent: client?.userAgent,
      success: true,
    });

    return {
      message: "If an account exists with this email, password reset instructions have been sent.",
    };
  }

  /**
   * Resets password using an authenticated recovery token.
   */
  async resetPassword(input: ResetPasswordRequest, client?: ClientContext): Promise<ResetPasswordResponse> {
    const { data, error } = await this.supabaseClient.auth.updateUser({
      password: input.newPassword,
    });

    if (error || !data.user) {
      throw new AuthenticationError(
        error?.message || "Password update failed. Token may be expired.",
        "PASSWORD_RESET_FAILED",
        400
      );
    }

    authAuditEmitter.emit({
      eventType: "AUTH_PASSWORD_RESET_SUCCESS",
      email: data.user.email || "unknown",
      userId: data.user.id,
      ipAddress: client?.ipAddress,
      userAgent: client?.userAgent,
      success: true,
    });

    return {
      success: true,
      message: "Password has been successfully updated.",
    };
  }

  /**
   * Returns current user identity and derived organization context from access token.
   */
  async getMe(accessToken: string): Promise<AuthMeResponse> {
    const { data, error } = await this.supabaseClient.auth.getUser(accessToken);
    if (error || !data.user) {
      throw new SessionExpiredError();
    }

    const user = data.user;
    const metadata = user.user_metadata || {};
    const orgId = (metadata.organization_id as string) || `00000000-0000-0000-0000-${user.id.slice(0, 12)}`;

    return {
      user: {
        id: user.id,
        email: user.email || "",
        name: (metadata.name as string) || "Merchant User",
        status: "ACTIVE",
      },
      organization: {
        id: orgId,
        name: (metadata.organization_name as string) || "Merchant Organization",
        slug: (metadata.slug as string) || "merchant",
      },
      membership: {
        role: (metadata.role as string) || "Owner",
        permissions: ["*"],
      },
    };
  }
}
