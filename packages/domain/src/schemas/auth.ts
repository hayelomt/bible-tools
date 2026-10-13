import { z } from 'zod';
import { idSchema, timestampSchema } from './common.ts';
import { USER_ROLES } from './entities.ts';

/** Auth requests and responses (TECH-DESIGN §7.1, §7.2). */

export const MIN_PASSWORD_LENGTH = 10;

const emailSchema = z.string().trim().max(254).pipe(z.email());
/** The length rule only; the server also checks the common-password list (§7.2). */
const passwordSchema = z.string().min(MIN_PASSWORD_LENGTH).max(256);
/** A password being checked rather than set, so the length rule doesn't apply. */
const currentPasswordSchema = z.string().min(1).max(256);
/** Email and session tokens: 32 random bytes, base64url. */
const tokenSchema = z.string().regex(/^[\w-]{43}$/, 'Not a valid token');

export const signupRequestSchema = z.strictObject({ email: emailSchema, password: passwordSchema });
export type SignupRequest = z.infer<typeof signupRequestSchema>;

/** Any non-empty password may try to log in; the length rule applies only when one is set. */
export const loginRequestSchema = z.strictObject({
  email: emailSchema,
  password: currentPasswordSchema,
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const verifyEmailRequestSchema = z.strictObject({ token: tokenSchema });
export type VerifyEmailRequest = z.infer<typeof verifyEmailRequestSchema>;

/** Sent by a signed-in user, so the email comes from the session. */
export const resendVerificationRequestSchema = z.strictObject({});

export const forgotPasswordRequestSchema = z.strictObject({ email: emailSchema });
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

export const resetPasswordRequestSchema = z.strictObject({
  token: tokenSchema,
  password: passwordSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

export const changePasswordRequestSchema = z.strictObject({
  currentPassword: currentPasswordSchema,
  newPassword: passwordSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/** `DELETE /api/account`: the password again, since nothing can undo it (§12). */
export const deleteAccountRequestSchema = z.strictObject({ password: currentPasswordSchema });
export type DeleteAccountRequest = z.infer<typeof deleteAccountRequestSchema>;

/** `GET /api/auth/me`, and the body of a successful sign-up or login. */
export const meResponseSchema = z.strictObject({
  id: idSchema,
  email: z.email(),
  emailVerifiedAt: timestampSchema.nullable(),
  role: z.enum(USER_ROLES),
});
export type MeResponse = z.infer<typeof meResponseSchema>;
