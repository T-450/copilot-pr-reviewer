import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { SimpleLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { trace, metrics, type Tracer, type Meter } from "@opentelemetry/api";

const SERVICE_NAME = "copilot-pr-reviewer";
let sdk: NodeSDK | null = null;

export async function initTelemetry(): Promise<() => Promise<void>> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;

  if (!endpoint) {
    return async () => {};
  }

  const pkg = JSON.parse(await Bun.file(new URL("../../package.json", import.meta.url)).text()) as { version?: string };

  sdk = new NodeSDK({
    serviceName: process.env.OTEL_SERVICE_NAME ?? SERVICE_NAME,
    resourceAttributes: {
      "service.version": pkg.version ?? "unknown",
    },
    traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${endpoint}/v1/metrics` }),
    }),
    logRecordProcessors: [new SimpleLogRecordProcessor(new OTLPLogExporter({ url: `${endpoint}/v1/logs` }))],
  });

  sdk.start();

  return async () => {
    await sdk?.shutdown();
  };
}

export function getTracer(name?: string): Tracer {
  return trace.getTracer(name ?? SERVICE_NAME);
}

export function getMeter(name?: string): Meter {
  return metrics.getMeter(name ?? SERVICE_NAME);
}
