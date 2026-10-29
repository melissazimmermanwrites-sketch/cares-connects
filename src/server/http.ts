import type { NextFunction, Request, Response } from 'express';
import type { z } from 'zod';

/** Wraps async handlers so thrown errors reach the error middleware. */
export const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next);

/** An error whose message is safe to show the user, with its HTTP status. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Validates a request body against a zod schema, turning the first issue into a 400. */
export function parse<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new HttpError(400, `${issue.path.join('.') || 'input'}: ${issue.message}`);
  }
  return result.data;
}
