import { describe, it, expect, mock, beforeEach } from "bun:test";

// Mock @opentelemetry/api-logs before importing events
const emittedLogs: { severityNumber: number; body: string; attributes: Record<string, unknown> }[] = [];

const mockLogger = {
  emit: mock((logRecord: { severityNumber: number; body: string; attributes: Record<string, unknown> }) => {
    emittedLogs.push(logRecord);
  }),
};

mock.module("@opentelemetry/api-logs", () => ({
  logs: {
    getLogger: () => mockLogger,
  },
  SeverityNumber: {
    DEBUG: 5,
    INFO: 9,
    WARN: 13,
    ERROR: 17,
  },
}));

const { events } = await import("./events");

describe("events", () => {
  beforeEach(() => {
    emittedLogs.length = 0;
    mockLogger.emit.mockClear();
  });

  const eventCases: [keyof typeof events, string, number][] = [
    ["reviewStarted", "prreviewer.run.started", 9],
    ["reviewCompleted", "prreviewer.run.completed", 9],
    ["reviewFailed", "prreviewer.run.failed", 17],
    ["configLoaded", "prreviewer.config.loaded", 9],
    ["configDefaulted", "prreviewer.config.invalid", 13],
    ["filesFiltered", "prreviewer.file.skipped", 9],
    ["fileReviewed", "prreviewer.file.reviewed", 9],
    ["findingEmitted", "prreviewer.finding.emitted", 9],
    ["findingSuppressed", "prreviewer.finding.suppressed", 9],
    ["threadCreated", "prreviewer.thread.created", 9],
    ["threadUpdated", "prreviewer.thread.updated", 9],
    ["threadResolved", "prreviewer.thread.resolved", 9],
    ["threadSkipped", "prreviewer.thread.deduped", 5],
    ["authFailed", "prreviewer.auth.failed", 17],
    ["rateLimited", "prreviewer.rate_limit.hit", 13],
  ];

  it("exports exactly 15 event emitters", () => {
    expect(Object.keys(events)).toHaveLength(15);
  });

  for (const [name, eventName, severity] of eventCases) {
    it(`${name}: emits event name "${eventName}" with severity ${severity}`, () => {
      expect(() => events[name]()).not.toThrow();
      expect(mockLogger.emit).toHaveBeenCalledTimes(1);
      const call = mockLogger.emit.mock.calls[0][0];
      expect(call.body).toBe(eventName);
      expect(call.severityNumber).toBe(severity);
      expect(call.attributes["event.name"]).toBe(eventName);
      mockLogger.emit.mockClear();
    });

    it(`${name}: passes extra attrs into attributes`, () => {
      events[name]({ foo: "bar", count: 42 });
      const call = mockLogger.emit.mock.calls[0][0];
      expect(call.attributes["foo"]).toBe("bar");
      expect(call.attributes["count"]).toBe(42);
      mockLogger.emit.mockClear();
    });
  }
});
