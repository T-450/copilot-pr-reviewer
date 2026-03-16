import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-http';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { trace, metrics } from '@opentelemetry/api';
import { randomUUID } from 'node:crypto';

let sdk: NodeSDK | null = null;

export const reviewRunId = randomUUID();

export async function initTelemetry(): Promise<void> {
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) {
    console.log('OTEL_EXPORTER_OTLP_ENDPOINT not set — telemetry disabled');
    return;
  }
  sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter(),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter(),
      exportIntervalMillis: 30_000,
    }),
  });
  await sdk.start();
}

export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
}

export function getTracer(): ReturnType<typeof trace.getTracer> {
  return trace.getTracer('copilot-pr-reviewer');
}

export function getMeter(): ReturnType<typeof metrics.getMeter> {
  return metrics.getMeter('copilot-pr-reviewer');
}
