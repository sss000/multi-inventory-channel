import { z } from "zod";

export const RegisterRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required"),
  organizationName: z.string().min(1, "Organization name is required"),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, "Slug must contain lowercase alphanumeric characters and dashes").optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequestSchema>;

export const AuthSessionSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
  tokenType: z.literal("bearer").default("bearer"),
});
export type AuthSession = z.infer<typeof AuthSessionSchema>;

export const RegisterResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
  }),
  organization: z.object({
    id: z.string().uuid(),
    name: z.string(),
    slug: z.string(),
  }),
  session: AuthSessionSchema.nullable(),
});
export type RegisterResponse = z.infer<typeof RegisterResponseSchema>;

export const LoginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1, "Password is required"),
});
export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const LoginResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
  }),
  organization: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
      role: z.string(),
    })
    .nullable(),
  session: AuthSessionSchema,
});
export type LoginResponse = z.infer<typeof LoginResponseSchema>;

export const LogoutRequestSchema = z.object({
  accessToken: z.string().optional(),
});
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;

export const LogoutResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type LogoutResponse = z.infer<typeof LogoutResponseSchema>;

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;

export const RefreshTokenResponseSchema = z.object({
  session: AuthSessionSchema,
});
export type RefreshTokenResponse = z.infer<typeof RefreshTokenResponseSchema>;

export const ForgotPasswordRequestSchema = z.object({
  email: z.string().email(),
});
export type ForgotPasswordRequest = z.infer<typeof ForgotPasswordRequestSchema>;

export const ForgotPasswordResponseSchema = z.object({
  message: z.string(),
});
export type ForgotPasswordResponse = z.infer<typeof ForgotPasswordResponseSchema>;

export const ResetPasswordRequestSchema = z.object({
  accessToken: z.string().min(1, "Access token or recovery token is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;

export const ResetPasswordResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});
export type ResetPasswordResponse = z.infer<typeof ResetPasswordResponseSchema>;

export const AuthMeResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid(),
    email: z.string().email(),
    name: z.string(),
    status: z.string(),
  }),
  organization: z
    .object({
      id: z.string().uuid(),
      name: z.string(),
      slug: z.string(),
    })
    .nullable(),
  membership: z
    .object({
      role: z.string(),
      permissions: z.array(z.string()),
    })
    .nullable(),
});
export type AuthMeResponse = z.infer<typeof AuthMeResponseSchema>;
