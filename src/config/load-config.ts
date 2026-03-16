import { readFile, access } from 'node:fs/promises';
import { parse } from 'yaml';
import { ConfigSchema, type ReviewConfig } from '../types.js';

export async function loadConfig(
  configPath: string,
  repoRoot: string,
): Promise<ReviewConfig> {
  const fullPath = `${repoRoot}/${configPath}`;

  try {
    await access(fullPath);
  } catch {
    return ConfigSchema.parse({});
  }

  try {
    const text = await readFile(fullPath, 'utf-8');
    const raw = parse(text) as unknown;
    const result = ConfigSchema.safeParse(raw);
    if (!result.success) {
      console.log(
        '##vso[task.logissue type=warning]Invalid .prreviewer.yml — using defaults',
      );
      console.warn(result.error.format());
      return ConfigSchema.parse({});
    }
    return result.data;
  } catch {
    console.log(
      '##vso[task.logissue type=warning]Failed to parse .prreviewer.yml — using defaults',
    );
    return ConfigSchema.parse({});
  }
}
