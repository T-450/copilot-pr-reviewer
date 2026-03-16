import { reviewRunId } from './setup.js';

type EventBase = {
  event_name: string;
  review_run_id: string;
  [key: string]: unknown;
};

function emit(event: EventBase): void {
  console.log(
    JSON.stringify({ ...event, timestamp: new Date().toISOString() }),
  );
}

export function emitRunStarted(env: {
  adoOrg: string;
  adoProject: string;
  adoRepoId: string;
  adoPrId: string;
}): void {
  emit({
    event_name: 'prreviewer.run.started',
    review_run_id: reviewRunId,
    'ado.organization': env.adoOrg,
    'ado.project': env.adoProject,
    'ado.repository': env.adoRepoId,
    'ado.pull_request.id': env.adoPrId,
  });
}

export function emitRunCompleted(stats: {
  filesChanged: number;
  filesReviewed: number;
  findingsCount: number;
  threadsCreated: number;
  threadsResolved: number;
  threadsDeduped: number;
  durationMs: number;
}): void {
  emit({
    event_name: 'prreviewer.run.completed',
    review_run_id: reviewRunId,
    ...stats,
  });
}

export function emitRunFailed(error: string): void {
  emit({
    event_name: 'prreviewer.run.failed',
    review_run_id: reviewRunId,
    'error.type': error,
  });
}

export function emitFindingEmitted(finding: {
  filePath: string;
  severity: string;
  category: string;
  fingerprint: string;
  riskLevel: string;
  hasSuggestion: boolean;
}): void {
  emit({
    event_name: 'prreviewer.finding.emitted',
    review_run_id: reviewRunId,
    'file.path': finding.filePath,
    'finding.severity': finding.severity,
    'finding.category': finding.category,
    'finding.fingerprint': finding.fingerprint,
    'review.risk_level': finding.riskLevel,
    'finding.has_suggestion': finding.hasSuggestion,
  });
}
