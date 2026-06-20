/**
 * Knip JSON parser. Knip emits a top-level object whose keys vary by
 * reporter version; we tolerate missing fields and surface a structured
 * result the scan service can consume.
 */

import type { KnipReport, ScanResult } from '../types/scan.js';
import { ShellParseError } from '../validation/errors.js';

export interface ParsedKnip {
  unusedFiles: string[];
  unusedExports: Array<{ file: string; names: string[] }>;
  unusedDependencies: string[];
}

export function parseKnipReport(raw: unknown): ParsedKnip {
  if (typeof raw !== 'object' || raw === null) {
    return { unusedFiles: [], unusedExports: [], unusedDependencies: [] };
  }
  const report = raw as KnipReport;
  const unusedFiles: string[] = [];
  const unusedExports: ParsedKnip['unusedExports'] = [];
  const unusedDependencies: string[] = [];

  if (Array.isArray(report.files)) {
    for (const f of report.files) {
      if (f && typeof f === 'object' && typeof f.path === 'string') unusedFiles.push(f.path);
    }
  }
  if (Array.isArray(report.exports)) {
    for (const e of report.exports) {
      if (e && typeof e === 'object' && typeof e.file === 'string' && Array.isArray(e.names)) {
        unusedExports.push({ file: e.file, names: e.names.filter((n): n is string => typeof n === 'string') });
      }
    }
  }
  if (Array.isArray(report.dependencies)) {
    for (const d of report.dependencies) {
      if (d && typeof d === 'object' && typeof d.name === 'string') unusedDependencies.push(d.name);
    }
  }
  return { unusedFiles, unusedExports, unusedDependencies };
}

/** Parses Knip stdout as JSON; throws a structured error on malformed output. */
export function parseKnipStdout(stdout: string): ParsedKnip {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    throw new ShellParseError('knip', 'not valid JSON', stdout);
  }
  return parseKnipReport(json);
}

export function emptyScanResult(sourceFileCount: number): ScanResult {
  return {
    sourceFileCount,
    unusedFiles: [],
    unusedExports: [],
    unusedDependencies: [],
    unusedDevDependencies: [],
    healthScore: 100
  };
}
