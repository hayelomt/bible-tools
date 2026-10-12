import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ApiException, type ApiErrorBody, ErrorCode, errorCodeForStatus } from './errors.js';

/** Turns every thrown error into an `ApiErrorBody`. Unexpected errors are logged and never leak their message. */
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
    this.logger.error(exception);
    return {
      statusCode: 500,
      errorCode: ErrorCode.INTERNAL_ERROR,
      message: 'Internal server error',
    };
  }
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
