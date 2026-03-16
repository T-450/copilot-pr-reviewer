import type { ChangedFile, ReviewConfig, RiskLevel } from "../shared/types";

const RISK_PRIORITY: Record<RiskLevel, number> = {
  HIGH_RISK: 0,
  DATA_RISK: 1,
  MEDIUM_RISK: 2,
  NORMAL: 3,
};

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".eot",
  ".mp3", ".mp4",
  ".zip", ".tar", ".gz",
  ".dll", ".exe", ".bin",
  ".pdf", ".wasm", ".map", ".webp",
]);

function isBinary(filePath: string): boolean {
  const lower = filePath.toLowerCase();
  return Array.from(BINARY_EXTENSIONS).some(ext => lower.endsWith(ext));
}

function matchesAnyPattern(path: string, patterns: string[]): boolean {
  return patterns.some(pattern => new Bun.Glob(pattern).match(path));
}

export function filterFiles(
  files: ChangedFile[],
  config: ReviewConfig,
): { included: ChangedFile[]; skipped: ChangedFile[] } {
  const eligible: ChangedFile[] = [];
  const filtered: ChangedFile[] = [];

  for (const f of files) {
    if (isBinary(f.path) || matchesAnyPattern(f.path, config.ignore)) {
      filtered.push(f);
    } else {
      eligible.push(f);
    }
  }

  const sorted = [...eligible].sort(
    (a, b) => RISK_PRIORITY[a.riskLevel] - RISK_PRIORITY[b.riskLevel],
  );
  const included = sorted.slice(0, config.maxFiles);
  const cappedOut = sorted.slice(config.maxFiles);

  return { included, skipped: [...cappedOut, ...filtered] };
}
