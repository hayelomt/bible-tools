import type { ApiError } from '@lamp/domain';
import { HttpException, HttpStatus } from '@nestjs/common';

/** Machine-readable codes the web app switches on. Feature modules add their own. */
export const ErrorCode = {
  BAD_REQUEST: 'BAD_REQUEST',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  UPGRADE_REQUIRED: 'UPGRADE_REQUIRED',
  TOO_MANY_REQUESTS: 'TOO_MANY_REQUESTS',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/** The one error body every endpoint returns (`apiErrorSchema` in domain). */
export type ApiErrorBody = ApiError;

/**
 * An HttpException with details for the client. Any HttpException can set its code with Nest's own
 * `errorCode` option (`new ConflictException('…', { errorCode: 'TAG_EXISTS' })`); without one, the
 * code comes from the status.
 */
export class ApiException extends HttpException {
  constructor(
    status: HttpStatus,
    errorCode: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message, status, { errorCode });
  }
}

const codeByStatus: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.BAD_REQUEST,
  [HttpStatus.UNAUTHORIZED]: ErrorCode.UNAUTHORIZED,
  [HttpStatus.FORBIDDEN]: ErrorCode.FORBIDDEN,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.PAYLOAD_TOO_LARGE]: ErrorCode.PAYLOAD_TOO_LARGE,
  [426]: ErrorCode.UPGRADE_REQUIRED,
  [HttpStatus.TOO_MANY_REQUESTS]: ErrorCode.TOO_MANY_REQUESTS,
  [HttpStatus.SERVICE_UNAVAILABLE]: ErrorCode.SERVICE_UNAVAILABLE,
};

export function errorCodeForStatus(status: number): string {
  return codeByStatus[status] ?? (status >= 500 ? ErrorCode.INTERNAL_ERROR : ErrorCode.BAD_REQUEST);
}
