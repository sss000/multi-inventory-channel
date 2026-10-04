import { describe, it, before, after } from "node:test";
import * as assert from "node:assert/strict";
import { Server } from "node:http";
import {
  BruteForceLimiter,
  createSessionCookies,
  createClearSessionCookies,
  parseSessionCookies,
  SupabaseAuthAdapter,
  InvalidCredentialsError,
  AccountAlreadyExistsError,
  BruteForceLockoutError,
  SessionExpiredError,
  authAuditEmitter,
  type AuthAuditEvent,
} from "@platform/security";
import { startApiServer } from "@platform/api";
import { createServerComponentClient } from "@platform/web";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Creates an in-memory client simulating the exact Supabase Auth API boundary
 * to test authentication flows deterministically without external network dependency.
 */
function createMockSupabaseAuthClient() {
  const users = new Map<
    string,
    {
      id: string;
      email: string;
      password: string;
      user_metadata: Record<string, unknown>;
    }
  >();

  // Pre-seed a test user
  users.set("existing@example.com", {
    id: "00000000-0000-0000-0000-000000000001",
    email: "existing@example.com",
    password: "Password123!",
    user_metadata: {
      name: "Existing Merchant",
      organization_name: "Existing Org",
      slug: "existing-org",
      organization_id: "00000000-0000-0000-0000-000000000001",
      role: "Owner",
    },
  });

  const activeSessions = new Map<
    string,
    {
      accessToken: string;
      refreshToken: string;
      userId: string;
      expiresAt: number;
    }
  >();

  const client = {
    auth: {
      async signUp(params: { email: string; password: string; options?: { data?: Record<string, unknown> } }) {
        if (users.has(params.email.toLowerCase())) {
          return {
            data: { user: null, session: null },
            error: { message: "User already registered", status: 422, code: "user_already_exists" },
          };
        }

        const id = `00000000-0000-0000-0000-${Date.now().toString(16).padStart(12, "0")}`;
        const user = {
          id,
          email: params.email,
          password: params.password,
          user_metadata: params.options?.data || {},
        };
        users.set(params.email.toLowerCase(), user);

        const accessToken = `jwt_access_${id}_${Date.now()}`;
        const refreshToken = `rt_${id}_${Date.now()}`;
        activeSessions.set(accessToken, {
          accessToken,
          refreshToken,
          userId: id,
          expiresAt: Date.now() + 3600 * 1000,
        });

        return {
          data: {
            user: {
              id: user.id,
              email: user.email,
              user_metadata: user.user_metadata,
            },
            session: {
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_in: 3600,
            },
          },
          error: null,
        };
      },

      async signInWithPassword(params: { email: string; password: string }) {
        const user = users.get(params.email.toLowerCase());
        if (!user || user.password !== params.password) {
          return {
            data: { user: null, session: null },
            error: { message: "Invalid login credentials", status: 400 },
          };
        }

        const accessToken = `jwt_access_${user.id}_${Date.now()}`;
        const refreshToken = `rt_${user.id}_${Date.now()}`;
        activeSessions.set(accessToken, {
          accessToken,
          refreshToken,
          userId: user.id,
          expiresAt: Date.now() + 3600 * 1000,
        });

        return {
          data: {
            user: {
              id: user.id,
              email: user.email,
              user_metadata: user.user_metadata,
            },
            session: {
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_in: 3600,
            },
          },
          error: null,
        };
      },

      async signOut() {
        return { error: null };
      },

      async refreshSession(params: { refresh_token: string }) {
        let foundUser: typeof users extends Map<unknown, infer V> ? V : never | null = null;
        for (const session of activeSessions.values()) {
          if (session.refreshToken === params.refresh_token) {
            foundUser = Array.from(users.values()).find((u) => u.id === session.userId) || null;
            break;
          }
        }

        if (!foundUser) {
          return {
            data: { user: null, session: null },
            error: { message: "Invalid or expired refresh token", status: 400 },
          };
        }

        const accessToken = `jwt_access_${foundUser.id}_${Date.now()}`;
        const refreshToken = `rt_${foundUser.id}_${Date.now()}`;
        activeSessions.set(accessToken, {
          accessToken,
          refreshToken,
          userId: foundUser.id,
          expiresAt: Date.now() + 3600 * 1000,
        });

        return {
          data: {
            user: {
              id: foundUser.id,
              email: foundUser.email,
              user_metadata: foundUser.user_metadata,
            },
            session: {
              access_token: accessToken,
              refresh_token: refreshToken,
              expires_in: 3600,
            },
          },
          error: null,
        };
      },

      async resetPasswordForEmail(_email: string) {
        return { data: {}, error: null };
      },

      async updateUser(params: { password?: string }) {
        return {
          data: {
            user: {
              id: "00000000-0000-0000-0000-000000000001",
              email: "existing@example.com",
            },
          },
          error: null,
        };
      },

      async getUser(jwtToken: string) {
        const session = activeSessions.get(jwtToken);
        if (!session || session.expiresAt < Date.now()) {
          return {
            data: { user: null },
            error: { message: "JWT expired or invalid", status: 401 },
          };
        }

        const user = Array.from(users.values()).find((u) => u.id === session.userId);
        if (!user) {
          return { data: { user: null }, error: { message: "User not found", status: 404 } };
        }

        return {
          data: {
            user: {
              id: user.id,
              email: user.email,
              user_metadata: user.user_metadata,
            },
          },
          error: null,
        };
      },
    },
  };

  return client as unknown as SupabaseClient;
}

describe("Phase 4: Authentication Acceptance Suite", () => {
  let mockSupabase: SupabaseClient;
  let authAdapter: SupabaseAuthAdapter;
  let limiter: BruteForceLimiter;

  before(() => {
    mockSupabase = createMockSupabaseAuthClient();
    limiter = new BruteForceLimiter({ maxAttempts: 5, lockoutDurationMs: 60000, windowMs: 60000 });
    authAdapter = new SupabaseAuthAdapter(mockSupabase, limiter);
  });

  describe("1. Brute-Force Protection & Rate Limiting", () => {
    it("should allow attempts below the maximum threshold", () => {
      const testLimiter = new BruteForceLimiter({ maxAttempts: 3, lockoutDurationMs: 5000, windowMs: 10000 });
      const status1 = testLimiter.checkStatus("ip:user1@example.com");
      assert.equal(status1.allowed, true);
      assert.equal(status1.remainingAttempts, 3);

      testLimiter.recordFailure("ip:user1@example.com");
      const status2 = testLimiter.checkStatus("ip:user1@example.com");
      assert.equal(status2.allowed, true);
      assert.equal(status2.remainingAttempts, 2);
    });

    it("should lock out account after reaching maximum attempts and reset on success", () => {
      const testLimiter = new BruteForceLimiter({ maxAttempts: 2, lockoutDurationMs: 5000, windowMs: 10000 });
      testLimiter.recordFailure("ip:user2@example.com");
      const lockStatus = testLimiter.recordFailure("ip:user2@example.com");

      assert.equal(lockStatus.allowed, false);
      assert.ok(lockStatus.retryAfterMs > 0);

      // Subsequent check returns not allowed
      const check = testLimiter.checkStatus("ip:user2@example.com");
      assert.equal(check.allowed, false);

      // Success resets the record
      testLimiter.recordSuccess("ip:user2@example.com");
      const postReset = testLimiter.checkStatus("ip:user2@example.com");
      assert.equal(postReset.allowed, true);
      assert.equal(postReset.remainingAttempts, 2);
    });
  });

  describe("2. Core Authentication Operations (Prompt 05)", () => {
    it("should register a new user and organization", async () => {
      const result = await authAdapter.register({
        email: "newmerchant@example.com",
        password: "SecurePassword123!",
        name: "New Merchant",
        organizationName: "Global Trade LLC",
      });

      assert.ok(result.user.id);
      assert.equal(result.user.email, "newmerchant@example.com");
      assert.equal(result.organization.name, "Global Trade LLC");
      assert.ok(result.session);
      assert.ok(result.session.accessToken);
    });

    it("should reject duplicate account registration", async () => {
      await assert.rejects(
        async () => {
          await authAdapter.register({
            email: "existing@example.com",
            password: "Password123!",
            name: "Duplicate User",
            organizationName: "Duplicate Org",
          });
        },
        AccountAlreadyExistsError
      );
    });

    it("should successfully log in with valid credentials", async () => {
      const result = await authAdapter.login({
        email: "existing@example.com",
        password: "Password123!",
      });

      assert.ok(result.user);
      assert.equal(result.user.email, "existing@example.com");
      assert.ok(result.session.accessToken);
      assert.equal(result.session.tokenType, "bearer");
    });

    it("should reject login with invalid credentials", async () => {
      await assert.rejects(
        async () => {
          await authAdapter.login({
            email: "existing@example.com",
            password: "WrongPassword!",
          });
        },
        InvalidCredentialsError
      );
    });

    it("should handle session token refresh", async () => {
      // First login to get a refresh token
      const loginRes = await authAdapter.login({
        email: "existing@example.com",
        password: "Password123!",
      });

      const refreshRes = await authAdapter.refresh({
        refreshToken: loginRes.session.refreshToken,
      });

      assert.ok(refreshRes.session.accessToken);
      assert.ok(refreshRes.session.refreshToken);
    });

    it("should reject invalid or expired refresh token", async () => {
      await assert.rejects(
        async () => {
          await authAdapter.refresh({
            refreshToken: "invalid_refresh_token",
          });
        },
        SessionExpiredError
      );
    });

    it("should support logout", async () => {
      const result = await authAdapter.logout();
      assert.equal(result.success, true);
    });

    it("should initiate forgot-password and reset-password", async () => {
      const forgot = await authAdapter.forgotPassword({ email: "existing@example.com" });
      assert.ok(forgot.message);

      const reset = await authAdapter.resetPassword({
        accessToken: "recovery_token_123",
        newPassword: "BrandNewPassword123!",
      });
      assert.equal(reset.success, true);
    });

    it("should return identity profile for getMe", async () => {
      const login = await authAdapter.login({
        email: "existing@example.com",
        password: "Password123!",
      });

      const me = await authAdapter.getMe(login.session.accessToken);
      assert.equal(me.user.email, "existing@example.com");
      assert.ok(me.organization);
      assert.ok(me.membership);
    });
  });

  describe("3. Secure Cookie & SSR Boundary", () => {
    it("should serialize session tokens with HttpOnly, SameSite, and Max-Age flags", () => {
      const session = {
        accessToken: "sample_access_token_xyz",
        refreshToken: "sample_refresh_token_abc",
        expiresIn: 3600,
        tokenType: "bearer" as const,
      };

      const cookies = createSessionCookies(session, { isProduction: true });
      assert.equal(cookies.length, 2);

      const accessCookie = cookies[0];
      assert.ok(accessCookie.includes("sb-access-token=sample_access_token_xyz"));
      assert.ok(accessCookie.includes("HttpOnly"));
      assert.ok(accessCookie.includes("Secure"));
      assert.ok(accessCookie.includes("SameSite=lax"));
      assert.ok(accessCookie.includes("Max-Age=3600"));

      const refreshCookie = cookies[1];
      assert.ok(refreshCookie.includes("sb-refresh-token=sample_refresh_token_abc"));
      assert.ok(refreshCookie.includes("HttpOnly"));
      assert.ok(refreshCookie.includes("Secure"));
    });

    it("should parse session cookies accurately", () => {
      const cookieHeader = "sb-access-token=my_access_token; sb-refresh-token=my_refresh_token; other=value";
      const parsed = parseSessionCookies(cookieHeader);

      assert.equal(parsed.accessToken, "my_access_token");
      assert.equal(parsed.refreshToken, "my_refresh_token");
    });

    it("should generate clearing cookies with Max-Age=0", () => {
      const clearCookies = createClearSessionCookies();
      for (const cookie of clearCookies) {
        assert.ok(cookie.includes("Max-Age=0"));
      }
    });

    it("should initialize server component client for SSR", () => {
      const { supabase, session } = createServerComponentClient("sb-access-token=sample_jwt; sb-refresh-token=sample_rt");
      assert.ok(supabase);
      assert.equal(session.accessToken, "sample_jwt");
      assert.equal(session.refreshToken, "sample_rt");
    });
  });

  describe("4. API HTTP Authentication Endpoints Integration", () => {
    let apiServer: Server;
    let baseUrl: string;

    before((_, done) => {
      // Start API on ephemeral port using mock auth adapter
      apiServer = startApiServer({
        portOverride: 0,
        authAdapter,
      });

      apiServer.on("listening", () => {
        const addr = apiServer.address();
        if (typeof addr === "object" && addr !== null) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
          done();
        }
      });
    });

    after((_, done) => {
      apiServer.close(() => done());
    });

    it("POST /auth/register should create user and set session cookies", async () => {
      const res = await fetch(`${baseUrl}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "apitest@example.com",
          password: "SecurePassword123!",
          name: "API Test User",
          organizationName: "API Test Org",
        }),
      });

      assert.equal(res.status, 201);
      const json = await res.json();
      assert.ok(json.data.user.id);
      assert.equal(json.data.user.email, "apitest@example.com");

      const cookies = res.headers.get("set-cookie");
      assert.ok(cookies, "Must return Set-Cookie headers");
      assert.ok(cookies.includes("sb-access-token"));
    });

    it("POST /auth/login should authenticate and return session", async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "existing@example.com",
          password: "Password123!",
        }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.data.user.email, "existing@example.com");
      assert.ok(json.data.session.accessToken);
    });

    it("POST /auth/login with invalid password should return 401", async () => {
      const res = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "existing@example.com",
          password: "BadPassword!",
        }),
      });

      assert.equal(res.status, 401);
      const json = await res.json();
      assert.equal(json.error.code, "INVALID_CREDENTIALS");
    });

    it("GET /auth/me with Bearer token should return identity", async () => {
      // First login
      const loginRes = await fetch(`${baseUrl}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "existing@example.com",
          password: "Password123!",
        }),
      });
      const loginData = await loginRes.json();
      const token = loginData.data.session.accessToken;

      const meRes = await fetch(`${baseUrl}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      assert.equal(meRes.status, 200);
      const meData = await meRes.json();
      assert.equal(meData.data.user.email, "existing@example.com");
    });

    it("POST /auth/logout should clear session cookies", async () => {
      const res = await fetch(`${baseUrl}/auth/logout`, {
        method: "POST",
      });

      assert.equal(res.status, 200);
      const cookies = res.headers.get("set-cookie");
      assert.ok(cookies);
      assert.ok(cookies.includes("Max-Age=0"));
    });

    it("POST /auth/forgot-password should return acknowledgement without user enumeration", async () => {
      const res = await fetch(`${baseUrl}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: "anyone@example.com" }),
      });

      assert.equal(res.status, 200);
      const json = await res.json();
      assert.ok(json.data.message);
    });
  });

  describe("5. Authentication Audit Trail", () => {
    it("should capture authentication audit events", () => {
      const events = authAuditEmitter.getRecentEvents();
      assert.ok(events.length > 0);

      const eventTypes = events.map((e) => e.eventType);
      assert.ok(eventTypes.includes("AUTH_REGISTER"));
      assert.ok(eventTypes.includes("AUTH_LOGIN_SUCCESS"));
      assert.ok(eventTypes.includes("AUTH_LOGIN_FAILURE"));
    });
  });
});
