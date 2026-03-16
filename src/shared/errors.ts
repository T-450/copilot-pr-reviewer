export class AuthError extends Error {
  constructor(public tokenType: "ado" | "copilot", message: string) {
    super(message);
    this.name = "AuthError";
  }
}

export class RateLimitError extends Error {
  constructor(public retryAfterMs?: number) {
    super("Rate limited by Azure DevOps API");
    this.name = "RateLimitError";
  }
}

export function logPipelineWarning(message: string): void {
  console.log(`##vso[task.logissue type=warning]${message}`);
}