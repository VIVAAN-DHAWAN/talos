/**
 * Route handlers — thin controllers only.
 *
 * Each handler:
 *   1. validates input via `src/validation/schemas.ts`
 *   2. delegates to a service
 *   3. maps service errors to HTTP responses via `sendError`
 *
 * No business logic, no shell calls, no direct filesystem writes here.
 */

import type { Request, Response, NextFunction } from 'express';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config/env.js';
import { TalosError, ValidationError } from '../validation/errors.js';
import type { CodebaseService } from '../services/codebase.js';
import type { ScanService } from '../services/scan-service.js';
import type { PanicService } from '../services/panic-service.js';
import type { HistoryStore } from '../services/history-store.js';
import type {
  ApiError,
  HealthResponse,
  HistoryResponse,
  ScanResponse,
  StatusResponse,
  RevertResponse
} from '../types/api.js';
import { parseBody, RevertRequestSchema, ScanRequestSchema } from '../validation/schemas.js';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PUBLIC_DIR = path.join(PROJECT_ROOT, 'public');

export interface Services {
  codebase: CodebaseService;
  scan: ScanService;
  panic: PanicService;
  history: HistoryStore;
  /** Pre-resolved GitHub availability, computed at startup. */
  githubAvailable: boolean;
}

export function sendError(res: Response, err: unknown): void {
  if (err instanceof TalosError) {
    const body: ApiError = {
      error: {
        code: err.code,
        message: err.message,
        ...(err.details !== undefined ? { details: err.details } : {})
      }
    };
    res.status(err.httpStatus).json(body);
    return;
  }
  const fallback: ApiError = {
    error: { code: 'INTERNAL_ERROR', message: 'Unexpected internal error.' }
  };
  res.status(500).json(fallback);
}

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/** GET / — dashboard for browsers, greeting JSON for API clients. */
export function root(_services: Services) {
  return asyncHandler(async (req: Request, res: Response) => {
    const wantsHtml = req.accepts(['html', 'json']) === 'html';
    if (!wantsHtml) {
      res.json({ name: 'talos', version: '2.0.0', endpoints: listEndpoints() });
      return;
    }
    // Stream the file rather than buffering; small enough that either is fine,
    // but streaming keeps memory steady when public/ grows.
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  });
}

export function health(): (req: Request, res: Response) => void {
  return (_req, res) => {
    const body: HealthResponse = { status: 'ok', version: '2.0.0' };
    res.json(body);
  };
}

export function status(services: Services) {
  return asyncHandler(async (_req: Request, res: Response) => {
    const snapshot = await services.codebase.snapshot();
    const scan = await services.scan.analyze(snapshot.sourceFileCount, { dryRun: config.disableSpawn });
    const body: StatusResponse = {
      repo: snapshot.repo,
      package: snapshot.package,
      stats: { sourceFileCount: snapshot.sourceFileCount },
      scan,
      scannerAvailable: !config.disableSpawn,
      fetchedAt: new Date().toISOString()
    };
    res.json(body);
  });
}

export function scan(services: Services) {
  return asyncHandler(async (req: Request, res: Response) => {
    const parsed = parseBody(ScanRequestSchema, req.body);
    const wantsCleanup = parsed.cleanup || parsed.openPullRequest;

    const snapshot = await services.codebase.snapshot();
    const scanResult = await services.scan.analyze(snapshot.sourceFileCount, { dryRun: config.disableSpawn });

    let cleanupPerformed = false;
    let branch: string | undefined;
    let pullRequestUrl: string | undefined;
    let status: ScanResponse['status'] = 'success';

    if (wantsCleanup && !config.disableSpawn) {
      try {
        const cleanupResult = await services.scan.runCleanup();
        cleanupPerformed = cleanupResult.changesMade;
        if (parsed.openPullRequest && cleanupResult.changesMade) {
          const pr = await services.scan.openPullRequest();
          branch = pr.branch;
          pullRequestUrl = pr.pullRequestUrl;
        }
        if (!cleanupResult.changesMade) status = 'no-changes';
      } catch (err) {
        await services.history.append({
          kind: 'scan',
          status: 'failure',
          message: `cleanup failed: ${err instanceof Error ? err.message : String(err)}`,
          summary: {
            unusedFiles: scanResult.unusedFiles.length,
            unusedDependencies: scanResult.unusedDependencies.length,
            unusedExports: scanResult.unusedExports.reduce((n, e) => n + e.names.length, 0),
            cleanup: true
          }
        });
        throw err;
      }
    }

    await services.history.append({
      kind: 'scan',
      status: cleanupPerformed ? 'success' : status === 'no-changes' ? 'partial' : 'success',
      message: describeScan(scanResult, cleanupPerformed, Boolean(pullRequestUrl)),
      ...(branch !== undefined ? { branch } : {}),
      ...(pullRequestUrl !== undefined ? { pullRequestUrl } : {}),
      summary: {
        unusedFiles: scanResult.unusedFiles.length,
        unusedDependencies: scanResult.unusedDependencies.length,
        unusedExports: scanResult.unusedExports.reduce((n, e) => n + e.names.length, 0),
        cleanup: cleanupPerformed
      }
    });

    const body: ScanResponse = {
      status,
      scan: scanResult,
      cleanupPerformed,
      ...(branch !== undefined ? { branch } : {}),
      ...(pullRequestUrl !== undefined ? { pullRequestUrl } : {})
    };
    res.json(body);
  });
}

export function revert(services: Services) {
  return asyncHandler(async (req: Request, res: Response) => {
    const parsed = parseBody(RevertRequestSchema, req.body);
    if (parsed.reason.trim().length < 3) {
      throw new ValidationError('reason must be at least 3 characters');
    }

    const plan = await services.panic.planRevert(parsed.sha);
    const outcome = await services.panic.performRevert(plan);
    let branch: string | undefined = outcome.branch;
    let pullRequestUrl: string | undefined;

    try {
      const pr = await services.panic.openRecoveryPlan(plan, outcome, parsed.reason);
      branch = pr.branch;
      pullRequestUrl = pr.pullRequestUrl;
    } catch (err) {
      // The revert succeeded locally; the PR step failed. Record both
      // outcomes so the operator knows the local revert happened.
      await services.history.append({
        kind: 'revert',
        status: 'partial',
        message: `Revert of ${plan.sha} succeeded locally but PR creation failed: ${err instanceof Error ? err.message : String(err)}`,
        sha: plan.sha,
        reason: parsed.reason,
        branch: outcome.branch
      });
      const body: RevertResponse = {
        status: 'failure',
        sha: plan.sha,
        branch: outcome.branch,
        message: 'Revert succeeded locally; PR creation failed. See audit history.'
      };
      res.status(502).json(body);
      return;
    }

    await services.history.append({
      kind: 'revert',
      status: 'success',
      message: `Reverted ${plan.sha} and opened recovery PR.`,
      sha: plan.sha,
      reason: parsed.reason,
      branch,
      ...(pullRequestUrl !== undefined ? { pullRequestUrl } : {})
    });

    const body: RevertResponse = {
      status: 'success',
      sha: plan.sha,
      ...(branch !== undefined ? { branch } : {}),
      ...(pullRequestUrl !== undefined ? { pullRequestUrl } : {}),
      message: 'Revert complete; recovery PR opened.'
    };
    res.json(body);
  });
}

export function history(services: Services) {
  return asyncHandler(async (_req: Request, res: Response) => {
    const records = services.history.list();
    const body: HistoryResponse = { records, count: records.length };
    res.json(body);
  });
}

function describeScan(result: { unusedFiles: readonly string[]; unusedDependencies: readonly string[]; unusedExports: ReadonlyArray<{ names: readonly string[] }> }, cleanup: boolean, openedPr: boolean): string {
  const files = result.unusedFiles.length;
  const deps = result.unusedDependencies.length;
  const exportsCount = result.unusedExports.reduce((n, e) => n + e.names.length, 0);
  const parts = [`${files} unused file(s)`, `${deps} unused dep(s)`, `${exportsCount} unused export(s)`];
  const action = openedPr ? 'cleanup + PR opened' : cleanup ? 'cleanup performed' : 'audit only';
  return `Scan complete: ${parts.join(', ')} — ${action}.`;
}

function listEndpoints(): Array<{ method: string; path: string }> {
  return [
    { method: 'GET', path: '/health' },
    { method: 'GET', path: '/api/status' },
    { method: 'POST', path: '/api/scan' },
    { method: 'POST', path: '/api/revert' },
    { method: 'GET', path: '/api/history' }
  ];
}
