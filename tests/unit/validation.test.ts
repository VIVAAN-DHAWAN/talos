import { describe, it, expect } from 'vitest';
import { parseBody, ScanRequestSchema, RevertRequestSchema } from '../../src/validation/schemas.js';
import { ValidationError } from '../../src/validation/errors.js';

describe('ScanRequestSchema', () => {
  it('accepts an empty object and applies defaults', () => {
    const out = parseBody(ScanRequestSchema, {});
    expect(out.cleanup).toBe(false);
    expect(out.openPullRequest).toBe(false);
    expect(out.maxFileRemovals).toBeUndefined();
  });

  it('accepts cleanup + openPullRequest booleans', () => {
    const out = parseBody(ScanRequestSchema, { cleanup: true, openPullRequest: true });
    expect(out.cleanup).toBe(true);
    expect(out.openPullRequest).toBe(true);
  });

  it('rejects unknown keys (strict mode)', () => {
    expect(() => parseBody(ScanRequestSchema, { unexpected: 1 })).toThrow(ValidationError);
  });

  it('rejects non-boolean cleanup', () => {
    expect(() => parseBody(ScanRequestSchema, { cleanup: 'yes' })).toThrow(ValidationError);
  });

  it('rejects maxFileRemovals out of range', () => {
    expect(() => parseBody(ScanRequestSchema, { maxFileRemovals: -1 })).toThrow(ValidationError);
    expect(() => parseBody(ScanRequestSchema, { maxFileRemovals: 5000 })).toThrow(ValidationError);
  });
});

describe('RevertRequestSchema', () => {
  it('accepts reason only (sha optional)', () => {
    const out = parseBody(RevertRequestSchema, { reason: 'bad commit' });
    expect(out.reason).toBe('bad commit');
    expect(out.sha).toBeUndefined();
  });

  it('accepts a 7-char abbreviated SHA', () => {
    const out = parseBody(RevertRequestSchema, { reason: 'rollback', sha: 'abcdef1' });
    expect(out.sha).toBe('abcdef1');
  });

  it('accepts a 40-char full SHA', () => {
    const sha = 'a'.repeat(40);
    const out = parseBody(RevertRequestSchema, { reason: 'rollback', sha });
    expect(out.sha).toBe(sha);
  });

  it('rejects a SHA with non-hex characters', () => {
    expect(() => parseBody(RevertRequestSchema, { reason: 'r', sha: 'xyz1234' })).toThrow(ValidationError);
  });

  it('rejects a SHA shorter than 7 chars', () => {
    expect(() => parseBody(RevertRequestSchema, { reason: 'r', sha: 'abc' })).toThrow(ValidationError);
  });

  it('rejects a missing reason', () => {
    expect(() => parseBody(RevertRequestSchema, {})).toThrow(ValidationError);
  });

  it('rejects a too-short reason', () => {
    expect(() => parseBody(RevertRequestSchema, { reason: 'ab' })).toThrow(ValidationError);
  });

  it('rejects an over-long reason', () => {
    expect(() => parseBody(RevertRequestSchema, { reason: 'x'.repeat(1001) })).toThrow(ValidationError);
  });
});
