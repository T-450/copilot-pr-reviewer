import { getMeter } from "./instrumentation";

function createMetrics() {
  const meter = getMeter();

  return {
    runs: meter.createCounter("review.runs", { description: "Total review runs" }),
    findings: meter.createCounter("review.findings", { description: "Total findings emitted" }),
    threadActions: meter.createCounter("review.thread_actions", { description: "Thread create/resolve/skip actions" }),
    files: meter.createCounter("review.files", { description: "Files reviewed" }),
    errors: meter.createCounter("review.errors", { description: "Errors encountered" }),

    reviewDuration: meter.createHistogram("review.duration_ms", { description: "Total review duration" }),
    adoApiDuration: meter.createHistogram("review.ado_api_duration_ms", { description: "ADO API call duration" }),
    llmDuration: meter.createHistogram("review.llm_duration_ms", { description: "LLM call duration" }),
    filesPerRun: meter.createHistogram("review.files_per_run", { description: "Files per review run" }),
    findingsPerRun: meter.createHistogram("review.findings_per_run", { description: "Findings per review run" }),
    commentPublishLatency: meter.createHistogram("review.comment_publish_latency_ms", { description: "Comment publish latency" }),
  };
}

export const reviewMetrics = createMetrics();
