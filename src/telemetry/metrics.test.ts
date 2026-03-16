import { describe, it, expect } from "bun:test";
import { reviewMetrics } from "./metrics";

describe("reviewMetrics", () => {
  describe("counters", () => {
    it("runs counter exists and add() does not throw", () => {
      expect(typeof reviewMetrics.runs.add).toBe("function");
      expect(() => reviewMetrics.runs.add(1)).not.toThrow();
    });

    it("findings counter exists and add() does not throw", () => {
      expect(typeof reviewMetrics.findings.add).toBe("function");
      expect(() => reviewMetrics.findings.add(1)).not.toThrow();
    });

    it("threadActions counter exists and add() does not throw", () => {
      expect(typeof reviewMetrics.threadActions.add).toBe("function");
      expect(() => reviewMetrics.threadActions.add(1)).not.toThrow();
    });

    it("files counter exists and add() does not throw", () => {
      expect(typeof reviewMetrics.files.add).toBe("function");
      expect(() => reviewMetrics.files.add(1)).not.toThrow();
    });

    it("errors counter exists and add() does not throw", () => {
      expect(typeof reviewMetrics.errors.add).toBe("function");
      expect(() => reviewMetrics.errors.add(1)).not.toThrow();
    });
  });

  describe("histograms", () => {
    it("reviewDuration histogram exists and record() does not throw", () => {
      expect(typeof reviewMetrics.reviewDuration.record).toBe("function");
      expect(() => reviewMetrics.reviewDuration.record(100)).not.toThrow();
    });

    it("adoApiDuration histogram exists and record() does not throw", () => {
      expect(typeof reviewMetrics.adoApiDuration.record).toBe("function");
      expect(() => reviewMetrics.adoApiDuration.record(50)).not.toThrow();
    });

    it("llmDuration histogram exists and record() does not throw", () => {
      expect(typeof reviewMetrics.llmDuration.record).toBe("function");
      expect(() => reviewMetrics.llmDuration.record(200)).not.toThrow();
    });

    it("filesPerRun histogram exists and record() does not throw", () => {
      expect(typeof reviewMetrics.filesPerRun.record).toBe("function");
      expect(() => reviewMetrics.filesPerRun.record(10)).not.toThrow();
    });

    it("findingsPerRun histogram exists and record() does not throw", () => {
      expect(typeof reviewMetrics.findingsPerRun.record).toBe("function");
      expect(() => reviewMetrics.findingsPerRun.record(3)).not.toThrow();
    });

    it("commentPublishLatency histogram exists and record() does not throw", () => {
      expect(typeof reviewMetrics.commentPublishLatency.record).toBe("function");
      expect(() => reviewMetrics.commentPublishLatency.record(75)).not.toThrow();
    });
  });
});
