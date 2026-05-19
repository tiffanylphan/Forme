import { describe, expect, it } from "vitest";
import {
  computeCoverage,
  gapMuscles,
  movementGaps,
  recentMuscleStressWithin,
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
    expect(coverage.muscleStats.glutes?.primaryStimulus).toBeCloseTo(3.9);
    expect(coverage.muscleStats.back?.primaryStimulus).toBeCloseTo(2);
    expect(coverage.muscleStats.shoulders?.primaryStimulus).toBeCloseTo(1.3);
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

  it("weights compounds above accessories for stimulus and recovery", () => {
    const equalSetWorkouts: Workout[] = [
      {
        id: "compound",
        date: "2026-05-05",
        source: "manual",
        createdAt: 1,
        updatedAt: 1,
        exercises: [
          {
            id: "compound-e1",
            exerciseName: "Barbell hip thrust",
            supersetGroup: null,
            sets: Array.from({ length: 3 }, (_, idx) => ({
              id: `compound-s${idx}`,
              reps: 10,
              weight: 135,
              unit: "lb",
            })),
          },
        ],
      },
      {
        id: "accessory",
        date: "2026-05-06",
        source: "manual",
        createdAt: 2,
        updatedAt: 2,
        exercises: [
          {
            id: "accessory-e1",
            exerciseName: "DB lateral raise",
            supersetGroup: null,
            sets: Array.from({ length: 3 }, (_, idx) => ({
              id: `accessory-s${idx}`,
              reps: 15,
              weight: 15,
              unit: "lb",
            })),
          },
        ],
      },
    ];

    const coverage = computeCoverage(equalSetWorkouts, weekContaining("2026-05-06"));
    const recentStress = recentMuscleStressWithin(equalSetWorkouts, "2026-05-06", 48);

    expect(coverage.muscleStats.glutes?.asPrimarySets).toBe(3);
    expect(coverage.muscleStats.shoulders?.asPrimarySets).toBe(3);
    expect(coverage.muscleStats.glutes?.primaryStimulus).toBeGreaterThan(
      coverage.muscleStats.shoulders?.primaryStimulus ?? 0,
    );
    expect(recentStress.glutes).toBeGreaterThan(recentStress.shoulders ?? 0);
  });

  it("decays recent stress by recency instead of treating the whole window equally", () => {
    const recencyWorkouts: Workout[] = [
      {
        id: "recent",
        date: "2026-05-05",
        source: "manual",
        createdAt: 2,
        updatedAt: 2,
        exercises: [
          {
            id: "recent-e1",
            exerciseName: "Barbell hip thrust",
            supersetGroup: null,
            sets: Array.from({ length: 3 }, (_, idx) => ({
              id: `recent-s${idx}`,
              reps: 10,
              weight: 135,
              unit: "lb",
            })),
          },
        ],
      },
      {
        id: "older",
        date: "2026-05-02",
        source: "manual",
        createdAt: 1,
        updatedAt: 1,
        exercises: [
          {
            id: "older-e1",
            exerciseName: "Barbell hip thrust",
            supersetGroup: null,
            sets: Array.from({ length: 3 }, (_, idx) => ({
              id: `older-s${idx}`,
              reps: 10,
              weight: 135,
              unit: "lb",
            })),
          },
        ],
      },
    ];

    const recentOnlyStress = recentMuscleStressWithin(
      [recencyWorkouts[0]],
      "2026-05-06",
      96,
    );
    const olderOnlyStress = recentMuscleStressWithin(
      [recencyWorkouts[1]],
      "2026-05-06",
      96,
    );

    expect(recentOnlyStress.glutes).toBeGreaterThan(olderOnlyStress.glutes ?? 0);
    expect(olderOnlyStress.glutes).toBeGreaterThan(0);
  });

  it("propagates compound recovery stress into related overlap muscles", () => {
    const hingeWorkout: Workout[] = [
      {
        id: "hinge",
        date: "2026-05-05",
        source: "manual",
        createdAt: 1,
        updatedAt: 1,
        exercises: [
          {
            id: "hinge-e1",
            exerciseName: "Barbell Romanian deadlift",
            supersetGroup: null,
            sets: Array.from({ length: 3 }, (_, idx) => ({
              id: `hinge-s${idx}`,
              reps: 8,
              weight: 185,
              unit: "lb",
            })),
          },
        ],
      },
    ];

    const recentStress = recentMuscleStressWithin(hingeWorkout, "2026-05-06", 96);

    expect(recentStress.glutes).toBeGreaterThan(0);
    expect(recentStress.hamstrings).toBeGreaterThan(0);
    expect(recentStress.back).toBeGreaterThan(0);
    expect(recentStress.core).toBeGreaterThan(0);
  });
});
