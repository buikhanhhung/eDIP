import { HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { ZodError } from 'zod';

// AppError
export class AppError extends Error {
  private statusCode: number = 500;
  private rootCause?: Error;

  private details: Record<string, any> = {};
  private internalDetails: Record<string, any> = {}; // Not expose when production and pass to sentry
  private logMessage?: string;
  private code?: string;

  private constructor(err: Error) {
    super(err.message);
  }

  // Factory method (Design Pattern)
  static from(err: Error, statusCode: number = 500, code?: string) {
    if (err instanceof AppError) {
      return err;
    }

    const appError = new AppError(err);
    appError.statusCode = statusCode;
    appError.code = code;
    return appError;
  }

  getRootCause(): Error | null {
    if (this.rootCause) {
      return this.rootCause instanceof AppError ? this.rootCause.getRootCause() : this.rootCause;
    }

    return this;
  }

  // Wrapper (Design Pattern)
  wrap(rootCause: Error): AppError {
    const appError = AppError.from(this, this.statusCode, this.code);
    appError.rootCause = rootCause;
    return appError;
  }

  // setter chain
  withDetail(key: string, value: any): AppError {
    this.details[key] = value;
    return this;
  }

  withInternalDetail(key: string, value: any): AppError {
    this.internalDetails[key] = value;
    return this;
  }

  withCode(code: string): AppError {
    this.code = code;
    return this;
  }

  withLog(logMessage: string): AppError {
    this.logMessage = logMessage;
    return this;
  }

  withMessage(message: string): AppError {
    this.message = message;
    return this;
  }

  toJSON(isProduction: boolean = true) {
    const rootCause = this.getRootCause();

    return isProduction
      ? {
          message: this.message,
          code: this.code,
          statusCode: this.statusCode,
          details: this.details,
        }
      : {
          message: this.message,
          statusCode: this.statusCode,
          code: this.code,
          rootCause: rootCause ? rootCause.message : this.message,
          details: this.details,
          internalDetails: this.internalDetails,
          logMessage: this.logMessage,
        };
  }

  getStatusCode(): number {
    return this.statusCode;
  }
}

// Util error function
export const responseErr = (err: Error, res: Response, requestId?: string) => {
  const isProduction = process.env.NODE_ENV === 'production';
  !isProduction && console.error(err.stack);

  if (err instanceof AppError) {
    const appErr = err as AppError;
    res.status(appErr.getStatusCode()).json({
      ...appErr.toJSON(isProduction),
      traceId: requestId,
    });
    return;
  }

  if (err instanceof ZodError) {
    const zErr = err as ZodError;
    const appErr = ErrInvalidRequest.wrap(zErr);

    zErr.issues.forEach((issue) => {
      appErr.withDetail(issue.path.join('.'), issue.message);
    });

    res.status(appErr.getStatusCode()).json({
      ...appErr.toJSON(isProduction),
      traceId: requestId,
    });
    return;
  }

  const appErr = ErrInternalServer.wrap(err);
  res.status(appErr.getStatusCode()).json({
    ...appErr.toJSON(isProduction),
    traceId: requestId,
  });
};

// Common Error
export const ErrInternalServer = AppError.from(
  new Error('Something went wrong, please try again later.'),
  HttpStatus.INTERNAL_SERVER_ERROR,
  'ERR_INTERNAL_SERVER',
);
export const ErrInvalidRequest = AppError.from(
  new Error('Invalid request'),
  HttpStatus.BAD_REQUEST,
  'ERR_INVALID_REQUEST',
);
export const ErrUnauthorized = AppError.from(
  new Error('Unauthorized'),
  HttpStatus.UNAUTHORIZED,
  'ERR_UNAUTHORIZED',
);
export const ErrForbidden = AppError.from(
  new Error('Forbidden'),
  HttpStatus.FORBIDDEN,
  'ERR_FORBIDDEN',
);
export const ErrNotFound = AppError.from(
  new Error('Not found'),
  HttpStatus.NOT_FOUND,
  'ERR_NOT_FOUND',
);
export const ErrMethodNotAllowed = AppError.from(
  new Error('Method not allowed'),
  HttpStatus.METHOD_NOT_ALLOWED,
  'ERR_METHOD_NOT_ALLOWED',
);
export const ErrTokenInvalid = AppError.from(
  new Error('Token is invalid'),
  HttpStatus.UNAUTHORIZED,
  'ERR_TOKEN_INVALID',
);
