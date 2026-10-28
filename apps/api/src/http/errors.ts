import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

/** Placeholder for endpoints from the sequence diagram that later sprints build. */
export const notImplemented =
  (sprint: number): RequestHandler =>
  (_req, res) => {
    res.status(501).json({ error: `Not implemented yet (planned for Sprint ${sprint})` });
  };

export const errorHandler =
  (isProduction: boolean): ErrorRequestHandler =>
  (err, _req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message, ...(err.details ? { details: err.details } : {}) });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid request', details: err.issues.map((i) => ({ path: i.path, message: i.message })) });
      return;
    }
    if (typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Malformed JSON' });
      return;
    }
    if (typeof err === 'object' && err !== null && 'type' in err && err.type === 'entity.too.large') {
      res.status(413).json({ error: 'Request too large' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error', ...(isProduction ? {} : { message: String(err) }) });
  };
