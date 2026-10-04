# Authentication Specification — Multichannel Inventory Control Platform

## 1. Architectural Authority & Boundary

Authentication is governed by Section 46 of `01_ENGINEERING_SPEC.md` and Prompt 05 of `06_SEQUENTIAL_PROMPTS_V3_SUPABASE.md`.

### Core Architectural Principles
1. **Supabase Auth Authority**: Supabase Auth serves as the single source of truth for identity authentication, password hashing, session lifecycle, and JWT issuance/verification.
2. **No Second Credential Store**: Application tables never store raw passwords, hashed passwords, or duplicate credentials. Application-owned user profiles (`public.users`) link to Supabase Auth via matching UUIDs (`id REFERENCES auth.users(id)`).
3. **Authentication vs. Authorization Separation**:
   - **Authentication**: Confirms who the user is (identity verified by Supabase Auth).
   - **Authorization**: Confirms what the user can do within an organization (application-owned `memberships`, `roles`, and `permissions` in `@platform/security`).
4. **Secret Key Isolation**:
   - `SUPABASE_SECRET_KEY` (service-role) is strictly server-only and NEVER exposed in client bundles or public responses.
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is restricted by PostgreSQL Row Level Security (RLS) policies.

---

## 2. Application Authentication Contract

The API exposes seven application endpoints mapped directly to Supabase Auth operations:

| Method | Endpoint | Description | Session Impact |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/register` | Creates a new user and tenant organization | Issues session & sets cookies |
| `POST` | `/auth/login` | Authenticates with email & password (brute-force protected) | Issues session & sets cookies |
| `POST` | `/auth/logout` | Terminates active session | Clears cookies (`Max-Age=0`) |
| `POST` | `/auth/refresh` | Rotates access token using refresh token | Sets renewed session cookies |
| `POST` | `/auth/forgot-password` | Initiates email recovery flow without disclosing existence | None |
| `POST` | `/auth/reset-password` | Updates password using recovery token | Emits audit log |
| `GET` | `/auth/me` | Returns authenticated user profile and derived org context | None |

---

## 3. Cookie & SSR Architecture (`@supabase/ssr`)

Web applications (`apps/web` and `apps/admin`) interact with sessions using secure HTTP cookies:
- **`sb-access-token`**: `HttpOnly; Path=/; SameSite=Lax; Max-Age=<expires_in>; Secure (prod)`
- **`sb-refresh-token`**: `HttpOnly; Path=/; SameSite=Lax; Max-Age=2592000; Secure (prod)`

Tokens are never placed in unencrypted `localStorage` where they would be vulnerable to XSS exploitation.

---

## 4. Brute-Force Protection & Rate Limiting

The application layer implements an in-memory sliding-window limiter protecting `/auth/login`:
- **Threshold**: Maximum 5 consecutive failed attempts per `(IP + email)` identifier.
- **Lockout Window**: 15 minutes.
- **Response**: HTTP 429 Too Many Requests (`code: "RATE_LIMIT_EXCEEDED"`).
- **Reset**: Successful authentication immediately clears failed attempts.

---

## 5. Authentication Audit Events

All material authentication events are recorded with structured metadata:
- `AUTH_REGISTER`
- `AUTH_LOGIN_SUCCESS`
- `AUTH_LOGIN_FAILURE`
- `AUTH_LOGOUT`
- `AUTH_TOKEN_REFRESH`
- `AUTH_PASSWORD_RESET_REQUEST`
- `AUTH_PASSWORD_RESET_SUCCESS`
- `AUTH_BRUTE_FORCE_LOCKOUT`
