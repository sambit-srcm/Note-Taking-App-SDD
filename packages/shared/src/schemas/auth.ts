import { z } from 'zod';
import {
  EMAIL_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  REFRESH_TOKEN_MAX_LENGTH,
} from '../constants/auth.js';
import { normalizeEmail } from '../utils/email.js';

// Messages are fixed strings: they must never echo submitted input.
const emailSchema = z
  .string()
  .max(EMAIL_MAX_LENGTH, 'Email is too long.')
  .transform(normalizeEmail)
  .pipe(z.email('Email is not valid.'));

const codePointLength = (value: string): number => [...value].length;

const newPasswordSchema = z
  .string()
  .refine((v) => codePointLength(v) >= PASSWORD_MIN_LENGTH, 'Password is too short.')
  .refine((v) => codePointLength(v) <= PASSWORD_MAX_LENGTH, 'Password is too long.');

export const registerRequestSchema = z.object({
  email: emailSchema,
  password: newPasswordSchema,
});

// Login does not enforce the registration policy; it only bounds the input.
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z
    .string()
    .min(1, 'Password is required.')
    .refine((v) => codePointLength(v) <= PASSWORD_MAX_LENGTH, 'Password is too long.'),
});

export const refreshRequestSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'Refresh token is required.')
    .max(REFRESH_TOKEN_MAX_LENGTH, 'Refresh token is too long.'),
});

// Contract: logout carries the same body as refresh (RefreshRequest).
export const logoutRequestSchema = refreshRequestSchema;

export const userSchema = z.object({
  id: z.uuid(),
  email: z.string().min(1),
});

export const authTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
});
