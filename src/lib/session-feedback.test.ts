import { describe, expect, it } from "vitest";
import { effortAdjustmentReason, effortBudgetMultiplier } from "./session-feedback";
import type { SessionEffort, Workout } from "./types";

const TODAY = "2026-08-29";

const daysBefore = (n: number): string => {
  const d = new Date(2026, 7, 29);
  d.setDate(d.getDate() - n);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${da}`;
};

let counter = 0;
const workout = (date: string, sessionEffort?: SessionEffort): Workout => ({
  id: `w-${counter++}`,
  date,
  source: "manual",
  exercises: [],
  sessionEffort,
  createdAt: 0,
  updatedAt: 0,
});

describe("effortBudgetMultiplier", () => {
  it("returns 1.0 with no workouts", () => {
    expect(effortBudgetMultiplier([], TODAY)).toBe(1.0);
  });

  it("returns 1.0 when all workouts are unrated", () => {
    const workouts = [workout(daysBefore(1)), workout(daysBefore(3)), workout(daysBefore(5))];
    expect(effortBudgetMultiplier(workouts, TODAY)).toBe(1.0);
  });

  it("scales to 0.85 when the most recent rated workout within 2 days was brutal", () => {
    const workouts = [workout(daysBefore(1), "brutal"), workout(daysBefore(4), "right")];
    expect(effortBudgetMultiplier(workouts, TODAY)).toBe(0.85);
  });

  it("skips unrated workouts when finding the most recent rated session", () => {
    const workouts = [workout(daysBefore(0)), workout(daysBefore(1), "brutal")];
    expect(effortBudgetMultiplier(workouts, TODAY)).toBe(0.85);
  });

  it("does not apply the 0.85 rule when the brutal session is older than 2 days", () => {
    const workouts = [workout(daysBefore(3), "brutal"), workout(daysBefore(6), "right")];
    expect(effortBudgetMultiplier(workouts, TODAY)).toBe(1.0);
  });

  it("scales to 0.9 with 2 brutal sessions in the last 4 rated within 14 days", () => {
    const workouts = [
      workout(daysBefore(3), "brutal"),
      workout(daysBefore(5), "right"),
      workout(daysBefore(7), "brutal"),
      workout(daysBefore(9), "right"),
    ];
    expect(effortBudgetMultiplier(workouts, TODAY)).toBe(0.9);
  });

  it("scales to 1.1 with 3 easy sessions in the last 4 rated", () => {
    const workouts = [
      workout(daysBefore(2), "easy"),
      workout(daysBefore(4), "easy"),
      workout(daysBefore(6), "right"),
      workout(daysBefore(8), "easy"),
    ];
    expect(effortBudgetMultiplier(workouts, TODAY)).toBe(1.1);
  });

  it("ignores unrated workouts when counting the last 4 rated sessions", () => {
    const workouts = [
      workout(daysBefore(1)),
      workout(daysBefore(2), "easy"),
      workout(daysBefore(3)),
      workout(daysBefore(4), "easy"),
      workout(daysBefore(5)),
      workout(daysBefore(6), "easy"),
    ];
    expect(effortBudgetMultiplier(workouts, TODAY)).toBe(1.1);
  });

  it("ignores rated sessions older than 14 days", () => {
    const workouts = [
      workout(daysBefore(16), "brutal"),
      workout(daysBefore(18), "brutal"),
    ];
    expect(effortBudgetMultiplier(workouts, TODAY)).toBe(1.0);
  });

  it("only counts the 4 most recent rated sessions", () => {
    const workouts = [
      workout(daysBefore(3), "right"),
      workout(daysBefore(4), "right"),
      workout(daysBefore(5), "right"),
      workout(daysBefore(6), "right"),
      workout(daysBefore(8), "brutal"),
      workout(daysBefore(9), "brutal"),
    ];
    expect(effortBudgetMultiplier(workouts, TODAY)).toBe(1.0);
  });

  it("gives the recent-brutal rule precedence over the easy streak", () => {
    const workouts = [
      workout(daysBefore(1), "brutal"),
      workout(daysBefore(3), "easy"),
      workout(daysBefore(5), "easy"),
      workout(daysBefore(7), "easy"),
    ];
    expect(effortBudgetMultiplier(workouts, TODAY)).toBe(0.85);
  });

  it("never leaves the [0.85, 1.1] range", () => {
    const heavy = Array.from({ length: 8 }, (_, i) => workout(daysBefore(i + 1), "brutal"));
    const light = Array.from({ length: 8 }, (_, i) => workout(daysBefore(i + 3), "easy"));
    expect(effortBudgetMultiplier(heavy, TODAY)).toBe(0.85);
    expect(effortBudgetMultiplier(light, TODAY)).toBe(1.1);
  });
});

describe("effortAdjustmentReason", () => {
  it("returns null when the multiplier is 1.0", () => {
    expect(effortAdjustmentReason([], TODAY)).toBeNull();
    expect(effortAdjustmentReason([workout(daysBefore(1), "right")], TODAY)).toBeNull();
  });

  it("explains a brutal session yesterday", () => {
    const workouts = [workout(daysBefore(1), "brutal")];
    expect(effortAdjustmentReason(workouts, TODAY)).toBe(
      "Yesterday felt brutal — today is scaled back.",
    );
  });

  it("explains a run of brutal sessions", () => {
    const workouts = [workout(daysBefore(4), "brutal"), workout(daysBefore(7), "brutal")];
    expect(effortAdjustmentReason(workouts, TODAY)).toBe(
      "Several recent sessions felt brutal — easing today's load a little.",
    );
  });

  it("explains an easy streak", () => {
    const workouts = [
      workout(daysBefore(2), "easy"),
      workout(daysBefore(4), "easy"),
      workout(daysBefore(6), "easy"),
    ];
    expect(effortAdjustmentReason(workouts, TODAY)).toBe(
      "Recent sessions have felt easy — nudging today's work up.",
    );
  });
});
