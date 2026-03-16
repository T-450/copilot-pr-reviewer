import { logs, SeverityNumber } from "@opentelemetry/api-logs";

export type EventAttrs = Record<string, string | number | boolean>;

function emitEvent(name: string, severity: SeverityNumber, attrs: EventAttrs = {}): void {
  try {
    const logger = logs.getLogger("copilot-pr-reviewer");
    logger.emit({
      severityNumber: severity,
      body: name,
      attributes: { "event.name": name, ...attrs },
    });
  } catch {
    // Noop if logs API unavailable
  }
}

export const events = {
  reviewStarted: (attrs?: EventAttrs) => emitEvent("prreviewer.run.started", SeverityNumber.INFO, attrs),
  reviewCompleted: (attrs?: EventAttrs) => emitEvent("prreviewer.run.completed", SeverityNumber.INFO, attrs),
  reviewFailed: (attrs?: EventAttrs) => emitEvent("prreviewer.run.failed", SeverityNumber.ERROR, attrs),
  configLoaded: (attrs?: EventAttrs) => emitEvent("prreviewer.config.loaded", SeverityNumber.INFO, attrs),
  configDefaulted: (attrs?: EventAttrs) => emitEvent("prreviewer.config.invalid", SeverityNumber.WARN, attrs),
  filesFiltered: (attrs?: EventAttrs) => emitEvent("prreviewer.file.skipped", SeverityNumber.INFO, attrs),
  fileReviewed: (attrs?: EventAttrs) => emitEvent("prreviewer.file.reviewed", SeverityNumber.INFO, attrs),
  findingEmitted: (attrs?: EventAttrs) => emitEvent("prreviewer.finding.emitted", SeverityNumber.INFO, attrs),
  findingSuppressed: (attrs?: EventAttrs) => emitEvent("prreviewer.finding.suppressed", SeverityNumber.INFO, attrs),
  threadCreated: (attrs?: EventAttrs) => emitEvent("prreviewer.thread.created", SeverityNumber.INFO, attrs),
  threadUpdated: (attrs?: EventAttrs) => emitEvent("prreviewer.thread.updated", SeverityNumber.INFO, attrs),
  threadResolved: (attrs?: EventAttrs) => emitEvent("prreviewer.thread.resolved", SeverityNumber.INFO, attrs),
  threadSkipped: (attrs?: EventAttrs) => emitEvent("prreviewer.thread.deduped", SeverityNumber.DEBUG, attrs),
  authFailed: (attrs?: EventAttrs) => emitEvent("prreviewer.auth.failed", SeverityNumber.ERROR, attrs),
  rateLimited: (attrs?: EventAttrs) => emitEvent("prreviewer.rate_limit.hit", SeverityNumber.WARN, attrs),
};
