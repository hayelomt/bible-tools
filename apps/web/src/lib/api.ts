import {
  type ChangePasswordRequest,
  type ForgotPasswordRequest,
  type HealthResponse,
  type LoginRequest,
  type MeResponse,
  type ResetPasswordRequest,
  type SignupRequest,
  type VerifyEmailRequest,
  apiErrorSchema,
  healthResponseSchema,
  meResponseSchema,
} from '@lamp/domain';

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

async function request(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Response> {
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
