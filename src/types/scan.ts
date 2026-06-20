/**
 * Scanner output types. The shape mirrors what `knip --reporter json` and
 * `depcheck --json` emit, narrowed to the fields Talos actually consumes.
 */

export interface KnipIssue {
  file?: string;
  name?: string;
  type?: string;
  line?: number;
}

/** Knip groups issues by category; we keep the canonical top-level keys. */
export interface KnipReport {
  files?: Array<{ path: string }>;
  dependencies?: Array<{ name: string }>;
  exports?: Array<{ file: string; names: string[] }>;
  types?: Array<{ file: string; names: string[] }>;
  issues?: Record<string, KnipIssue[]>;
}

export interface DepcheckReport {
  dependencies?: string[];
  devDependencies?: string[];
  missing?: Record<string, string[]>;
  invalidFiles?: Record<string, string>;
  invalidDirs?: Record<string, string>;
}

export interface ScanResult {
  /** Number of `ts/tsx/js/jsx` files in `src/`. */
  sourceFileCount: number;
  /** Knip-reported files that are unreferenced. */
  unusedFiles: readonly string[];
  /** Knip-reported unused exports grouped by file. */
  unusedExports: ReadonlyArray<{ file: string; names: readonly string[] }>;
  /** Depcheck-reported unused production deps. */
  unusedDependencies: readonly string[];
  /** Depcheck-reported unused dev deps. */
  unusedDevDependencies: readonly string[];
  /** 0..100 health score derived from the above. */
  healthScore: number;
}
