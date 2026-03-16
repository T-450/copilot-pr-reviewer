import { describe, it, expect } from "bun:test";
import { TraceAttrs } from "./trace-attrs";

describe("TraceAttrs", () => {
  it("all values are strings", () => {
    for (const val of Object.values(TraceAttrs)) {
      expect(typeof val).toBe("string");
    }
  });

  it("has no duplicate values", () => {
    const values = Object.values(TraceAttrs);
    expect(new Set(values).size).toBe(values.length);
  });

  it("is frozen", () => {
    expect(Object.isFrozen(TraceAttrs)).toBe(true);
  });
});
