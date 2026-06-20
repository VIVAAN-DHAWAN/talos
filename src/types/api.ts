/**
 * Public API request and response contracts. These types are the source of
 * truth for both the route handlers and the validation schemas in
 * `src/validation/schemas.ts`.
 */

import type { ScanResult } from './scan.js';
import type { HistoryRecord } from './history.js';

export interface StatusResponse {
  repo: {
    name: string;
    root: string;
    headSha: string | null;
    branch: string | null;
    isClean: boolean;
  };
  package: {
    name: string;
    version: string;
    private: boolean;
  };
  stats: {
    sourceFileCount: number;
  };
  scan: ScanResult | null;
  scannerAvailable: boolean;
  fetchedAt: string;
}

export interface ScanRequest {
  /** When true, deletes unused files and uninstalls unused deps. Off by default. */
  cleanup?: boolean;
  /** When true and cleanup produced changes, opens a PR. Implies cleanup. */
  openPullRequest?: boolean;
  /** Optional limit on the number of files to remove in a single run. */
  maxFileRemovals?: number;
}

export interface ScanResponse {
  status: 'success' | 'failure' | 'no-changes' | 'partial';
  scan: ScanResult;
  cleanupPerformed: boolean;
  pullRequestUrl?: string;
  branch?: string;
}

export interface RevertRequest {
  /** Commit SHA to revert. Defaults to HEAD when omitted. */
  sha?: string;
  /** Operator-supplied justification. Required. */
  reason: string;
}

export interface RevertResponse {
  status: 'success' | 'failure';
  sha: string;
  branch?: string;
  pullRequestUrl?: string;
  message: string;
}

export interface HistoryResponse {
  records: readonly HistoryRecord[];
  count: number;
}

export interface HealthResponse {
  status: 'ok';
  version: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
