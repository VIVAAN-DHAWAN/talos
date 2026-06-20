/**
 * Request validation schemas.
 *
 * Schemas are the single source of truth for the shape of inbound bodies.
 * Route handlers call `parseBody(...)` and get a typed value back, or a
 * `ValidationError` they can map directly to HTTP 400.
 */

import { z } from 'zod';
import { ValidationError } from './errors.js';

const SHA_PATTERN = /^[0-9a-f]{7,40}$/i;
const REASON_MAX = 1_000;

export const ScanRequestSchema = z.object({
  cleanup: z.boolean().optional().default(false),
  openPullRequest: z.boolean().optional().default(false),
  maxFileRemovals: z.number().int().min(0).max(1_000).optional()
}).strict();

export const RevertRequestSchema = z.object({
  sha: z.string().regex(SHA_PATTERN, 'sha must be a 7..40 char hex git SHA').optional(),
  reason: z.string().trim().min(3, 'reason is required and must be at least 3 characters').max(REASON_MAX)
}).strict();

export type ParsedScanRequest = z.infer<typeof ScanRequestSchema>;
export type ParsedRevertRequest = z.infer<typeof RevertRequestSchema>;

/** Parses an unknown body, throwing a `ValidationError` on failure. */
export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issues = result.error.issues.map((i) => ({
      path: i.path.join('.'),
      message: i.message
    }));
    throw new ValidationError('Request body failed validation', issues);
  }
  return result.data;
}
