import type { NextFunction, Request, Response } from 'express';
import { HttpError } from '../errors.js';

type AsyncHandler = (req: Request, res: Response) => Promise<void>;

/** Wrap an async route handler so rejections reach the error middleware. */
export function wrap(fn: AsyncHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res).catch(next);
  };
}

export function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new HttpError(400, `${field} is required`);
  }
  return value.trim();
}

export function decodeHeader(value: string | undefined): string {
  if (!value) return '';
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
