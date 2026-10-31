import { z } from "zod";
import { IsoDateSchema, UlidSchema } from "./common";

export const EmailSchema = z
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

export const PasswordSchema = z.string().min(8).max(128);

export const UsernameSchema = z
  .string()
  .min(3)
  .max(32)
  .regex(/^[a-z0-9_]+$/);

export const PublicNameSchema = z.string().trim().min(1).max(80);

export const DevicePlatformSchema = z.enum([
  "web",
  "android",
  "ios",
  "desktop"
]);

export const AuthUserSchema = z
  .object({
    id: UlidSchema,
    name: z.string().min(1).max(80),
    email: EmailSchema,
    emailVerified: z.boolean(),
    image: z.url().max(2048).nullable(),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema
  })
  .strict();

export const ProfileSchema = z
  .object({
    userId: UlidSchema,
    username: UsernameSchema.nullable(),
    publicName: PublicNameSchema,
    avatarUrl: z.url().max(2048).nullable(),
    locale: z.string().min(2).max(16),
    timezone: z.string().min(1).max(64),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema
  })
  .strict();

export const SessionSchema = z
  .object({
    id: UlidSchema,
    userId: UlidSchema,
    deviceId: UlidSchema.nullable(),
    createdAt: IsoDateSchema,
    updatedAt: IsoDateSchema,
    expiresAt: IsoDateSchema
  })
  .strict();

export const DeviceSchema = z
  .object({
    id: UlidSchema,
    userId: UlidSchema,
    name: z.string().trim().min(1).max(120),
    platform: DevicePlatformSchema,
    appVersion: z.string().min(1).max(32),
    lastSeenAt: IsoDateSchema,
    createdAt: IsoDateSchema,
    revokedAt: IsoDateSchema.nullable()
  })
  .strict();

export const LinkDeviceRequestSchema = z
  .object({
    id: UlidSchema.optional(),
    name: z.string().trim().min(1).max(120),
    platform: DevicePlatformSchema,
    appVersion: z.string().min(1).max(32)
  })
  .strict();

export const SignUpRequestSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    publicName: PublicNameSchema
  })
  .strict();

export const SignInRequestSchema = z
  .object({
    email: EmailSchema,
    password: PasswordSchema,
    deviceName: z.string().trim().min(1).max(120).optional(),
    platform: DevicePlatformSchema.optional()
  })
  .strict();

export const ForgotPasswordRequestSchema = z
  .object({
    email: EmailSchema
  })
  .strict();

export const ResetPasswordRequestSchema = z
  .object({
    token: z.string().min(32).max(1024),
    newPassword: PasswordSchema
  })
  .strict();

export const AuthSessionDataSchema = z
  .object({
    user: AuthUserSchema,
    profile: ProfileSchema,
    session: SessionSchema
  })
  .strict();

// La eliminación es irreversible: exige reautenticación explícita además de
// la sesión activa.
export const DeleteAccountRequestSchema = z
  .object({
    password: z.string().min(1).max(128)
  })
  .strict();

export const DeleteAccountDataSchema = z
  .object({
    deleted: z.literal(true),
    deletedAt: IsoDateSchema
  })
  .strict();

export type AuthUser = z.infer<typeof AuthUserSchema>;
export type Profile = z.infer<typeof ProfileSchema>;
export type Session = z.infer<typeof SessionSchema>;
export type Device = z.infer<typeof DeviceSchema>;
export type LinkDeviceRequest = z.infer<typeof LinkDeviceRequestSchema>;
export type SignUpRequest = z.infer<typeof SignUpRequestSchema>;
export type SignInRequest = z.infer<typeof SignInRequestSchema>;
export type ForgotPasswordRequest = z.infer<
  typeof ForgotPasswordRequestSchema
>;
export type ResetPasswordRequest = z.infer<typeof ResetPasswordRequestSchema>;
export type AuthSessionData = z.infer<typeof AuthSessionDataSchema>;
export type DeleteAccountRequest = z.infer<
  typeof DeleteAccountRequestSchema
>;
export type DeleteAccountData = z.infer<typeof DeleteAccountDataSchema>;
