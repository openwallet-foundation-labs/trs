import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { AdapterError } from '@app/adapter-kit';

/** Converts any thrown error into an RFC 7807 `application/problem+json` response. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse();

    let status = 500;
    let title = 'Internal Server Error';
    let detail: string | undefined;
    const extra: Record<string, unknown> = {};

    if (exception instanceof AdapterError) {
      status = exception.status;
      title = exception.name;
      detail = exception.message;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        title = body;
      } else if (body && typeof body === 'object') {
        const b = body as Record<string, unknown>;
        title = (b.title as string) ?? (b.error as string) ?? 'Error';
        if (b.message) detail = Array.isArray(b.message) ? b.message.join(', ') : String(b.message);
        if (b.errors) extra.errors = b.errors;
      }
    } else if (exception instanceof Error) {
      detail = exception.message;
    }

    // `.send()` works on both Fastify (no `.json()`) and Express reply objects.
    res
      .status(status)
      .type('application/problem+json')
      .send({ type: 'about:blank', title, status, detail, ...extra });
  }
}
