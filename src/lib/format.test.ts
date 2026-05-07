import { describe, expect, it, vi } from "vitest";
import { formatDate, formatMuscle, todayISO, uid } from "./format";

describe("format helpers", () => {
  it("formats muscle names with spaces", () => {
    expect(formatMuscle("rear_delts")).toBe("rear delts");
  });

  it("formats iso dates without timezone drift", () => {
    expect(formatDate("2026-05-06")).toMatch(/May/);
  });

  it("builds local ISO dates", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 6, 10, 30));
    expect(todayISO()).toBe("2026-05-06");
    vi.useRealTimers();
  });

  it("generates unique ids with prefixes", () => {
    const a = uid("w");
    const b = uid("w");
    expect(a).toMatch(/^w_/);
    expect(b).toMatch(/^w_/);
    expect(a).not.toBe(b);
  });
});
