import { describe, it, expect } from 'vitest';
import { parseKnipReport, parseKnipStdout } from '../../src/infra/knip.js';
import { parseDepcheckReport, parseDepcheckStdout } from '../../src/infra/depcheck.js';

describe('parseKnipReport', () => {
  it('returns empty arrays for non-object input', () => {
    const out = parseKnipReport(null);
    expect(out.unusedFiles).toEqual([]);
    expect(out.unusedExports).toEqual([]);
    expect(out.unusedDependencies).toEqual([]);
  });

  it('extracts files, exports, dependencies', () => {
    const out = parseKnipReport({
      files: [{ path: 'src/foo.ts' }, { path: 'src/bar.ts' }],
      exports: [{ file: 'src/baz.ts', names: ['unusedFn', 'unusedConst'] }],
      dependencies: [{ name: 'leftpad' }]
    });
    expect(out.unusedFiles).toEqual(['src/foo.ts', 'src/bar.ts']);
    expect(out.unusedExports).toEqual([{ file: 'src/baz.ts', names: ['unusedFn', 'unusedConst'] }]);
    expect(out.unusedDependencies).toEqual(['leftpad']);
  });

  it('drops malformed entries silently', () => {
    const out = parseKnipReport({
      files: [{ path: 'ok.ts' }, { noPath: true }, null],
      exports: [{ file: 'ok.ts', names: ['a'] }, { file: 'no-names' }],
      dependencies: [null, { name: 5 }]
    });
    expect(out.unusedFiles).toEqual(['ok.ts']);
    expect(out.unusedExports).toEqual([{ file: 'ok.ts', names: ['a'] }]);
    expect(out.unusedDependencies).toEqual([]);
  });
});

describe('parseKnipStdout', () => {
  it('parses valid JSON stdout', () => {
    const stdout = JSON.stringify({ files: [{ path: 'x.ts' }] });
    expect(parseKnipStdout(stdout).unusedFiles).toEqual(['x.ts']);
  });

  it('throws ShellParseError on malformed JSON', () => {
    expect(() => parseKnipStdout('not json')).toThrow(/did not emit parseable output/);
  });
});

describe('parseDepcheckReport', () => {
  it('returns empty arrays for non-object input', () => {
    expect(parseDepcheckReport(null)).toEqual({ unusedDependencies: [], unusedDevDependencies: [] });
  });

  it('extracts dependencies and devDependencies', () => {
    const out = parseDepcheckReport({
      dependencies: ['lodash'],
      devDependencies: ['eslint']
    });
    expect(out.unusedDependencies).toEqual(['lodash']);
    expect(out.unusedDevDependencies).toEqual(['eslint']);
  });

  it('drops non-string entries', () => {
    const out = parseDepcheckReport({ dependencies: ['ok', 5, null] });
    // The current implementation uses isStrArr which rejects the whole
    // array if any element is non-string. This test pins that behaviour.
    expect(out.unusedDependencies).toEqual([]);
  });
});

describe('parseDepcheckStdout', () => {
  it('parses valid JSON stdout', () => {
    const stdout = JSON.stringify({ dependencies: ['x'] });
    expect(parseDepcheckStdout(stdout).unusedDependencies).toEqual(['x']);
  });

  it('throws ShellParseError on malformed JSON', () => {
    expect(() => parseDepcheckStdout('not json')).toThrow(/did not emit parseable output/);
  });
});
