import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import { Response } from 'express';
import { ZodSerializationException } from 'nestjs-zod';
import { ZodError } from 'zod';

@Catch(ZodSerializationException)
export class ZodSerializationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ZodSerializationExceptionFilter.name);

  catch(exception: ZodSerializationException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest();

    const zodError = (exception as any).error as ZodError | undefined;
    const issues = zodError?.issues ?? [];

    this.logger.error(`Response validation failed on ${request.method} ${request.url}`);
    this.logger.error(`Zod issues: ${JSON.stringify(issues, null, 2)}`);

    const isProduction = process.env.NODE_ENV === 'production';

    response.status(500).json({
      message: 'Response validation failed',
      code: 'ERR_RESPONSE_VALIDATION',
      statusCode: 500,
      ...(isProduction
        ? {}
        : {
            issues: issues.map((i) => ({
              path: i.path.join('.'),
              code: i.code,
              expected: (i as any).expected,
              received: (i as any).received,
              message: i.message,
            })),
          }),
    });
  }
}
