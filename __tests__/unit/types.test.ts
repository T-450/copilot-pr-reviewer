import { describe, it, expect } from 'vitest';
import { fingerprint, ConfigSchema, loadEnv } from '../../src/types.js';

describe('fingerprint', () => {
  it('produces a stable sha256 prefix', () => {
    const a = fingerprint('src/a.ts', 10, 'null check');
    const b = fingerprint('src/a.ts', 10, 'null check');
    expect(a).toBe(b);
    expect(a).toMatch(/^sha256:[a-f0-9]{16}$/);
  });
  it('differs for different inputs', () => {
    const a = fingerprint('src/a.ts', 10, 'null check');
    const b = fingerprint('src/a.ts', 11, 'null check');
    expect(a).not.toBe(b);
  });
});

describe('ConfigSchema', () => {
  it('returns defaults for empty input', () => {
    const c = ConfigSchema.parse({});
    expect(c.severityThreshold).toBe('suggestion');
    expect(c.maxFiles).toBe(30);
    expect(c.ignore).toEqual([]);
  });
  it('accepts valid config', () => {
    const c = ConfigSchema.parse({
      ignore: ['**/*.min.js'],
      severityThreshold: 'warning',
      maxFiles: 10,
      securityOverrides: [{ path: 'src/payments/**', risk: 'HIGH_RISK' }],
    });
    expect(c.maxFiles).toBe(10);
  });
  it('rejects invalid severity', () => {
    expect(
      ConfigSchema.safeParse({ severityThreshold: 'invalid' }).success,
    ).toBe(false);
  });
});

describe('loadEnv', () => {
  it('throws on missing required env', () => {
    expect(() => loadEnv()).toThrow('Missing env: ADO_PAT');
  });
});
