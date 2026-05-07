import { describe, expect, it } from "vitest";
import {
  computeCoverage,
  gapMuscles,
  movementGaps,
  recentMusclesWithin,
  topFocus,
  weekContaining,
} from "./coverage";
import type { Workout } from "./types";

const workouts: Workout[] = [
  {
    id: "w1",
    date: "2026-05-04",
    source: "manual",
    createdAt: 1,
    updatedAt: 1,
    exercises: [
      {
        id: "e1",
        exerciseName: "Barbell hip thrust",
        supersetGroup: null,
        sets: [
          { id: "s1", reps: 10, weight: 135, unit: "lb" },
          { id: "s2", reps: 10, weight: 135, unit: "lb" },
          { id: "s3", reps: 8, weight: 145, unit: "lb" },
        ],
      },
      {
        id: "e2",
        exerciseName: "Cable row",
        supersetGroup: null,
        sets: [
          { id: "s4", reps: 12, weight: 70, unit: "lb" },
          { id: "s5", reps: 12, weight: 70, unit: "lb" },
        ],
      },
    ],
  },
  {
    id: "w2",
    date: "2026-05-06",
    source: "manual",
    createdAt: 2,
    updatedAt: 2,
    exercises: [
      {
        id: "e3",
        exerciseName: "DB lateral raise",
        supersetGroup: null,
        sets: [
          { id: "s6", reps: 15, weight: 12.5, unit: "lb" },
          { id: "s7", reps: 15, weight: 12.5, unit: "lb" },
        ],
      },
    ],
  },
];

describe("coverage", () => {
  it("computes weekly muscle and movement stats", () => {
    const coverage = computeCoverage(workouts, weekContaining("2026-05-06"));
    expect(coverage.workouts).toHaveLength(2);
    expect(coverage.movementStats.hinge?.sets).toBe(3);
    expect(coverage.movementStats.pull?.sets).toBe(2);
    expect(coverage.muscleStats.glutes?.asPrimarySets).toBe(3);
    expect(coverage.muscleStats.back?.asPrimarySets).toBe(2);
  });

  it("reports top focus and gaps", () => {
    const coverage = computeCoverage(workouts, weekContaining("2026-05-06"));
    expect(topFocus(coverage)[0]?.muscle).toBe("glutes");
    expect(movementGaps(coverage)).toContain("squat");
    expect(gapMuscles(coverage)).toContain("quads");
  });

  it("finds recent primary muscles", () => {
    const recent = recentMusclesWithin(workouts, "2026-05-06", 48);
    expect(recent.has("shoulders")).toBe(true);
    expect(recent.has("glutes")).toBe(true);
  });
});
