import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config/load-config.js';
import { writeFile, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('loadConfig', () => {
  const tmp = join(tmpdir(), `pr-reviewer-test-config-${Date.now()}`);

  it('returns defaults when file is missing', async () => {
    const config = await loadConfig('.prreviewer.yml', '/nonexistent');
    expect(config.severityThreshold).toBe('suggestion');
    expect(config.maxFiles).toBe(30);
  });

  it('parses valid YAML', async () => {
    await mkdir(tmp, { recursive: true });
    await writeFile(
      join(tmp, '.prreviewer.yml'),
      'severityThreshold: warning\nmaxFiles: 5\n',
    );
    const config = await loadConfig('.prreviewer.yml', tmp);
    expect(config.severityThreshold).toBe('warning');
    expect(config.maxFiles).toBe(5);
    await rm(tmp, { recursive: true, force: true });
  });

  it('returns defaults on malformed YAML', async () => {
    await mkdir(tmp, { recursive: true });
    await writeFile(join(tmp, '.prreviewer.yml'), '{{invalid yaml');
    const config = await loadConfig('.prreviewer.yml', tmp);
    expect(config.severityThreshold).toBe('suggestion');
    await rm(tmp, { recursive: true, force: true });
  });
});
