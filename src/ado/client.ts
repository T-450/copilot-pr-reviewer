import { setTimeout as sleep } from 'node:timers/promises';
import type { Env } from '../types.js';

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export function createAdoClient(env: Env) {
  const baseUrl = `${env.adoOrg}/${env.adoProject}/_apis/git/repositories/${env.adoRepoId}`;
  const headers: Record<string, string> = {
    Authorization: `Basic ${Buffer.from(`:${env.adoPat}`).toString('base64')}`,
    'Content-Type': 'application/json',
  };

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${baseUrl}${path}`;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const res = await fetch(url, {
        ...init,
        headers: { ...headers, ...init?.headers },
      });

      if (res.status === 401) {
        console.log(
          '##vso[task.logissue type=warning]ADO PAT returned 401 — token may be expired',
        );
        throw new Error('ADO auth failed (401)');
      }
      if (res.status === 429 && attempt < MAX_RETRIES) {
        const delay = BASE_DELAY_MS * 2 ** attempt;
        console.warn(`ADO rate limited, retrying in ${delay}ms...`);
        await sleep(delay);
        continue;
      }
      if (!res.ok) throw new Error(`ADO API ${res.status}: ${url}`);
      return (await res.json()) as T;
    }
    throw new Error(`ADO API exhausted retries: ${path}`);
  }

  return { request, baseUrl };
}

export type AdoClient = ReturnType<typeof createAdoClient>;
