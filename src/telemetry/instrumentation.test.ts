import { describe, it, expect, beforeEach } from "bun:test";
import { initTelemetry, getTracer, getMeter } from "./instrumentation";

describe("initTelemetry", () => {
  beforeEach(() => {
    delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  });

  it("returns a shutdown function", async () => {
    const shutdown = await initTelemetry();
    expect(typeof shutdown).toBe("function");
  });

  it("shutdown function returns a Promise", async () => {
    const shutdown = await initTelemetry();
    const result = shutdown();
    expect(result).toBeInstanceOf(Promise);
    await result;
  });
});

describe("getTracer", () => {
  it("returns object with startSpan method", () => {
    const tracer = getTracer();
    expect(typeof tracer.startSpan).toBe("function");
  });

  it("accepts an optional name", () => {
    const tracer = getTracer("test-tracer");
    expect(typeof tracer.startSpan).toBe("function");
  });
});

describe("getMeter", () => {
  it("returns object with createCounter method", () => {
    const meter = getMeter();
    expect(typeof meter.createCounter).toBe("function");
  });

  it("accepts an optional name", () => {
    const meter = getMeter("test-meter");
    expect(typeof meter.createCounter).toBe("function");
  });
});
