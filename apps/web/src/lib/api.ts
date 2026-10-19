import {
  type ChangePasswordRequest,
  type CreateShareLinkRequest,
  type Device,
  type ForgotPasswordRequest,
  type HealthResponse,
  type LoginRequest,
  type MeResponse,
  type PullResponse,
  type PushRequest,
  type PushResponse,
  type ResetPasswordRequest,
  type ShareLink,
  type SignupRequest,
  type VerifyEmailRequest,
  apiErrorSchema,
  devicesResponseSchema,
  healthResponseSchema,
  meResponseSchema,
  pullResponseSchema,
  pushResponseSchema,
  shareLinkSchema,
  shareLinksResponseSchema,
} from '@lamp/domain';
import { version } from '../../package.json';

/** This app's version, sent with every push and pull (§6.6). */
export const CLIENT_VERSION = version;

/** An answer from the API with its error body (§7.1); `errorCode` is what screens switch on. */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly errorCode: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }

  /** `details.retryAfterSeconds` of a lockout or a resend that came too soon. */
  get retryAfterSeconds(): number | undefined {
    const details = this.details as { retryAfterSeconds?: unknown } | undefined;
    return typeof details?.retryAfterSeconds === 'number' ? details.retryAfterSeconds : undefined;
  }
}

/** The request never got an answer: offline, or the server is down. */
export class NetworkError extends Error {
  constructor(cause: unknown) {
    super('The server could not be reached', { cause });
    this.name = 'NetworkError';
  }
}

async function request(
  method: 'GET' | 'POST' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<Response> {
  const init: RequestInit =
    body === undefined
      ? { method }
      : { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
  let res: Response;
  try {
    res = await fetch(path, init);
  } catch (error) {
    throw new NetworkError(error);
  }
  if (res.ok) return res;
  const parsed = apiErrorSchema.safeParse(await res.json().catch(() => null));
  // A proxy with no API behind it answers 502 or 504 without our error body.
  if (!parsed.success) {
    if (res.status === 502 || res.status === 504) throw new NetworkError(res.statusText);
    throw new ApiRequestError(res.status, 'UNKNOWN', `${method} ${path} returned ${res.status}`);
  }
  const { errorCode, message, details } = parsed.data;
  throw new ApiRequestError(res.status, errorCode, message, details);
}

/** `GET /api/health`, checked against the schema the API shares. */
export async function fetchHealth(): Promise<HealthResponse> {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error(`GET /api/health returned ${res.status}`);
  return healthResponseSchema.parse(await res.json());
}

/** The signed-in user, or null without a session. */
export async function fetchMe(): Promise<MeResponse | null> {
  try {
    const res = await request('GET', '/api/auth/me');
    return meResponseSchema.parse(await res.json());
  } catch (error) {
    if (error instanceof ApiRequestError && error.status === 401) return null;
    throw error;
  }
}

export async function signup(body: SignupRequest): Promise<MeResponse> {
  const res = await request('POST', '/api/auth/signup', body);
  return meResponseSchema.parse(await res.json());
}

export async function login(body: LoginRequest): Promise<MeResponse> {
  const res = await request('POST', '/api/auth/login', body);
  return meResponseSchema.parse(await res.json());
}

export async function logout(): Promise<void> {
  await request('POST', '/api/auth/logout');
}

export async function verifyEmail(body: VerifyEmailRequest): Promise<void> {
  await request('POST', '/api/auth/verify-email', body);
}

export async function resendVerification(): Promise<void> {
  await request('POST', '/api/auth/resend-verification', {});
}

export async function forgotPassword(body: ForgotPasswordRequest): Promise<void> {
  await request('POST', '/api/auth/forgot-password', body);
}

export async function resetPassword(body: ResetPasswordRequest): Promise<void> {
  await request('POST', '/api/auth/reset-password', body);
}

export async function changePassword(body: ChangePasswordRequest): Promise<void> {
  await request('POST', '/api/auth/change-password', body);
}

/** `POST /api/sync/push` (§6.2). */
export async function pushChanges(body: PushRequest): Promise<PushResponse> {
  const res = await request('POST', '/api/sync/push', body);
  return pushResponseSchema.parse(await res.json());
}

/** The device a pull comes from, so the server can list it (§6.6). */
export interface PullDevice {
  deviceId: string;
  deviceName: string;
}

/** `GET /api/sync/pull` (§6.3): one page after `cursor`. */
export async function pullChanges(cursor: number, device: PullDevice): Promise<PullResponse> {
  const query = new URLSearchParams({
    cursor: String(cursor),
    ...device,
    clientVersion: CLIENT_VERSION,
  });
  const res = await request('GET', `/api/sync/pull?${query}`);
  return pullResponseSchema.parse(await res.json());
}

/** `GET /api/account/devices`: the devices signed in to the account (§6.6). */
export async function fetchDevices(): Promise<Device[]> {
  const res = await request('GET', '/api/account/devices');
  return devicesResponseSchema.parse(await res.json()).devices;
}

/** `DELETE /api/account/devices/:id`: signs that device out; it keeps its notes. */
export async function signOutDevice(id: string): Promise<void> {
  await request('DELETE', `/api/account/devices/${id}`);
}

/** `GET /api/share-links`: the account's share links (F34), newest first. */
export async function fetchShareLinks(): Promise<ShareLink[]> {
  const res = await request('GET', '/api/share-links');
  return shareLinksResponseSchema.parse(await res.json()).links;
}

/** `POST /api/share-links`: a new link; `409 SHARE_LINK_EXISTS` when the target has one. */
export async function createShareLink(body: CreateShareLinkRequest): Promise<ShareLink> {
  const res = await request('POST', '/api/share-links', body);
  return shareLinkSchema.parse(await res.json());
}

/** `DELETE /api/share-links/:id`: turns the link off for good. */
export async function revokeShareLink(id: string): Promise<void> {
  await request('DELETE', `/api/share-links/${id}`);
}
