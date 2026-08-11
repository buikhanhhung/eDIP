import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const { code, meta } = exception;

    const statusMap: Record<string, HttpStatus> = {
      P2002: HttpStatus.CONFLICT, // Unique constraint violation
      P2025: HttpStatus.NOT_FOUND, // Record not found
      P2003: HttpStatus.BAD_REQUEST, // Foreign key constraint violation
      P2000: HttpStatus.BAD_REQUEST, // Value too long for field
      P2001: HttpStatus.NOT_FOUND, // Record does not exist
      P2014: HttpStatus.BAD_REQUEST, // Required relation violation
      P2015: HttpStatus.NOT_FOUND, // Related record not found
      P2016: HttpStatus.BAD_REQUEST, // Query interpretation error
      P2017: HttpStatus.BAD_REQUEST, // Records not connected
      P2018: HttpStatus.BAD_REQUEST, // Required connected records not found
      P2019: HttpStatus.BAD_REQUEST, // Input error
    };

    const status = statusMap[code] || HttpStatus.INTERNAL_SERVER_ERROR;
    const message = this.getErrorMessage(code, meta);

    this.logger.error(`Prisma error [${code}]: ${message}`, exception.stack);

    response.status(status).json({
      success: false,
      error: {
        statusCode: status,
        message,
        code,
      },
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }

  private getErrorMessage(code: string, meta: Record<string, unknown> | undefined): string {
    const messages: Record<string, string> = {
      P2002: `Resource already exists. Field: ${meta?.target || 'unknown'}`,
      P2025: 'Resource not found',
      P2003: `Related resource not found. Field: ${meta?.field_name || 'unknown'}`,
      P2000: 'Input value too long for field',
      P2001: 'Record does not exist',
      P2014: 'Required relation missing',
      P2015: 'Related record not found',
    };

    return messages[code] || 'Database operation failed';
  }
}
