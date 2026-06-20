/**
 * Audit history record types. Stored in `.dark-matter/history.json` and
 * surfaced via `GET /api/history`.
 */

export type HistoryKind = 'scan' | 'revert' | 'system';
export type HistoryStatus = 'success' | 'failure' | 'partial';

export interface HistoryRecord {
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** What kind of action this record describes. */
  kind: HistoryKind;
  /** Outcome of the action. */
  status: HistoryStatus;
  /** Short human-readable label. */
  message: string;
  /** SHA targeted by a revert, when applicable. */
  sha?: string;
  /** Reason supplied by the operator, when applicable. */
  reason?: string;
  /** PR URL opened as a result of the action, when applicable. */
  pullRequestUrl?: string;
  /** Branch created by the action, when applicable. */
  branch?: string;
  /** Counts surfaced by a scan, when applicable. */
  summary?: HistoryScanSummary;
}

export interface HistoryScanSummary {
  unusedFiles: number;
  unusedDependencies: number;
  unusedExports: number;
  cleanup: boolean;
}

export type HistoryFile = readonly HistoryRecord[];
