/**
 * Depcheck JSON parser. Mirrors the contract documented at
 * https://github.com/depcheck/depcheck#api — we only consume the fields
 * Talos cares about.
 */

import type { DepcheckReport } from '../types/scan.js';
import { ShellParseError } from '../validation/errors.js';

export interface ParsedDepcheck {
  unusedDependencies: string[];
  unusedDevDependencies: string[];
}

export function parseDepcheckReport(raw: unknown): ParsedDepcheck {
  if (typeof raw !== 'object' || raw === null) {
    return { unusedDependencies: [], unusedDevDependencies: [] };
  }
  const report = raw as DepcheckReport;
  const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
  return {
    unusedDependencies: isStrArr(report.dependencies) ? report.dependencies : [],
    unusedDevDependencies: isStrArr(report.devDependencies) ? report.devDependencies : []
  };
}

export function parseDepcheckStdout(stdout: string): ParsedDepcheck {
  let json: unknown;
  try {
    json = JSON.parse(stdout);
  } catch {
    throw new ShellParseError('depcheck', 'not valid JSON', stdout);
  }
  return parseDepcheckReport(json);
}
