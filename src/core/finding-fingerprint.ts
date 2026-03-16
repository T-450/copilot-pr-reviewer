type FingerprintInput = {
  filePath: string;
  startLine: number;
  endLine: number;
  title: string;
  category: string;
};

export function generateFingerprint(finding: FingerprintInput): string {
  const normalizedPath = finding.filePath.replace(/^\//, "").toLowerCase();
  const normalizedTitle = finding.title.trim().toLowerCase();
  const input = `${normalizedPath}:${finding.startLine}:${finding.endLine}:${normalizedTitle}:${finding.category}`;
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(input);
  return `sha256:${hasher.digest("hex")}`;
}
