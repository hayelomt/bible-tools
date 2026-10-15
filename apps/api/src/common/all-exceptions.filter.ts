import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import * as Sentry from '@sentry/nestjs';
import { ApiException, type ApiErrorBody, ErrorCode, errorCodeForStatus } from './errors.js';

/**
 * Turns every thrown error into an `ApiErrorBody`. Unexpected errors are logged and reported to
 * Sentry, and never leak their message.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const body = this.toBody(exception);
    const { httpAdapter } = this.adapterHost;
    httpAdapter.reply(host.switchToHttp().getResponse(), body, body.statusCode);
  }

  private toBody(exception: unknown): ApiErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const details = exception instanceof ApiException ? exception.details : undefined;
      return {
        statusCode: status,
        errorCode: exception.errorCode ?? errorCodeForStatus(status),
        message: messageOf(exception),
        ...(details === undefined ? {} : { details }),
      };
    }
    const bodyError = bodyParserError(exception);
    if (bodyError) return bodyError;
    this.logger.error(exception);
    // Only the unexpected: a client error is the client's (no-op unless Sentry was started).
    Sentry.captureException(exception);
    return {
      statusCode: 500,
      errorCode: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    };
  }
}

/**
 * Express's body parser fails before Nest sees the request, with a plain error carrying a client
 * status. Its message isn't passed on: a JSON syntax error can quote the body.
 */
function bodyParserError(exception: unknown): ApiErrorBody | undefined {
  if (typeof exception !== 'object' || exception === null) return undefined;
  const { type, status } = exception as { type?: unknown; status?: unknown };
  if (typeof type !== 'string' || !type.startsWith('entity.') || typeof status !== 'number') {
    return undefined;
  }
  if (status < 400 || status >= 500) return undefined;
  return {
    statusCode: status,
    errorCode: errorCodeForStatus(status),
    message:
      status === HttpStatus.PAYLOAD_TOO_LARGE
        ? 'The request body is too large'
        : 'The request body is not valid',
  };
}

function messageOf(exception: HttpException): string {
  const response = exception.getResponse();
  if (typeof response === 'object' && response !== null && 'message' in response) {
    const { message } = response;
    if (Array.isArray(message)) return message.join('; ');
    if (typeof message === 'string') return message;
  }
  return exception.message;
}
