import { describe, expect, it } from "vitest";
import { findExercise } from "./exercises";
import {
  computeCoverage,
  effortFactor,
  estimateExerciseStimulus,
  gapMuscles,
  movementGaps,
  recentMuscleStressWithin,
  recentMusclesWithin,
  topFocus,
  weekContaining,
} from "./coverage";
import type { Exercise, SetEntry, Workout } from "./types";

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

describe("effortFactor", () => {
  const lift: Exercise = {
    name: "Test lift",
    primary: ["glutes"],
    secondary: ["hamstrings"],
    equipment: "barbell",
    pattern: "hinge",
  };
  const hold: Exercise = {
    name: "Test hold",
    primary: ["core"],
    secondary: [],
    equipment: "bodyweight",
    pattern: "core",
    tracksDuration: true,
  };
  const set = (overrides: Partial<SetEntry>): SetEntry => ({
    id: "s",
    reps: 10,
    weight: 100,
    unit: "lb",
    ...overrides,
  });

  it("is neutral at the reference weight, with no weight, or with no reference", () => {
    expect(effortFactor(lift, set({}), 100)).toBe(1);
    expect(effortFactor(lift, set({ weight: null }), 100)).toBe(1);
    expect(effortFactor(lift, set({}), null)).toBe(1);
    expect(effortFactor(lift, set({ reps: null, durationSec: 45 }), 100)).toBe(1);
    expect(effortFactor(hold, set({ reps: null, durationSec: 45 }), 100)).toBe(1);
  });

  it("discounts light ramp sets", () => {
    expect(effortFactor(lift, set({ weight: 75 }), 100)).toBe(0.8);
    expect(effortFactor(lift, set({ weight: 55 }), 100)).toBe(0.7);
  });

  it("discounts very low reps at light weight", () => {
    expect(effortFactor(lift, set({ reps: 3, weight: 75 }), 100)).toBe(0.7);
  });

  it("credits heavy low-rep top sets", () => {
    expect(effortFactor(lift, set({ reps: 5 }), 100)).toBe(1.25);
    expect(effortFactor(lift, set({ reps: 8 }), 100)).toBe(1);
  });

  it("normalizes kg against an lb-normalized reference", () => {
    // 45.36 kg ≈ 100 lb → at reference, factor 1.
    expect(effortFactor(lift, set({ weight: 45.36, unit: "kg" }), 100)).toBe(1);
  });
});

describe("effort-aware coverage", () => {
  const hipThrust = (sets: SetEntry[]): Workout => ({
    id: "effort-w1",
    date: "2026-05-05",
    source: "manual",
    createdAt: 1,
    updatedAt: 1,
    exercises: [
      {
        id: "effort-e1",
        exerciseName: "Barbell hip thrust",
        supersetGroup: null,
        sets,
      },
    ],
  });
  const window = weekContaining("2026-05-05");

  it("keeps uniform-weight logs at nominal stimulus", () => {
    const cov = computeCoverage(
      [
        hipThrust([
          { id: "u1", reps: 10, weight: 135, unit: "lb" },
          { id: "u2", reps: 10, weight: 135, unit: "lb" },
          { id: "u3", reps: 10, weight: 135, unit: "lb" },
        ]),
      ],
      window,
    );
    expect(cov.muscleStats.glutes?.primaryStimulus).toBeCloseTo(3 * 1.3);
    expect(cov.muscleStats.glutes?.asPrimarySets).toBe(3);
  });

  it("discounts warm-up ramp sets below full working stimulus", () => {
    const cov = computeCoverage(
      [
        hipThrust([
          { id: "r1", reps: 10, weight: 65, unit: "lb" },
          { id: "r2", reps: 8, weight: 75, unit: "lb" },
          { id: "r3", reps: 10, weight: 135, unit: "lb" },
          { id: "r4", reps: 10, weight: 135, unit: "lb" },
        ]),
      ],
      window,
    );
    const uniform = computeCoverage(
      [
        hipThrust(
          Array.from({ length: 4 }, (_, idx) => ({
            id: `u${idx}`,
            reps: 10,
            weight: 135,
            unit: "lb" as const,
          })),
        ),
      ],
      window,
    );
    // 65 and 75 lb ramps vs a 135 lb reference → 0.7 each; working sets → 1.
    expect(cov.muscleStats.glutes?.primaryStimulus).toBeCloseTo(3.4 * 1.3);
    expect(cov.muscleStats.glutes?.recoveryStress).toBeCloseTo(
      (uniform.muscleStats.glutes?.recoveryStress ?? 0) * (3.4 / 4),
    );
    expect(cov.muscleStats.glutes?.asPrimarySets).toBe(4);
  });

  it("credits heavy low-rep top sets above nominal", () => {
    const cov = computeCoverage(
      [
        hipThrust([
          { id: "t1", reps: 10, weight: 155, unit: "lb" },
          { id: "t2", reps: 5, weight: 185, unit: "lb" },
        ]),
      ],
      window,
    );
    // 155 lb back-off (~84% of 185) → 1; 5-rep top set at reference → 1.25.
    expect(cov.muscleStats.glutes?.primaryStimulus).toBeCloseTo(2.25 * 1.3);
  });

  it("keeps bodyweight and duration-only logs at nominal stimulus", () => {
    const workout = (name: string, sets: SetEntry[]): Workout => ({
      id: `effort-${name}`,
      date: "2026-05-05",
      source: "manual",
      createdAt: 1,
      updatedAt: 1,
      exercises: [
        {
          id: `effort-${name}-e`,
          exerciseName: name,
          supersetGroup: null,
          sets,
        },
      ],
    });
    const nominal = (name: string) => {
      const meta = findExercise(name);
      if (!meta) throw new Error(`missing exercise: ${name}`);
      return { muscle: meta.primary[0], perSet: estimateExerciseStimulus(meta).primaryPerSet };
    };

    const bodyweight = nominal("Push-up");
    const bwCov = computeCoverage(
      [
        workout("Push-up", [
          { id: "b1", reps: 12, weight: null, unit: "lb" },
          { id: "b2", reps: 12, weight: null, unit: "lb" },
        ]),
      ],
      window,
    );
    expect(bwCov.muscleStats[bodyweight.muscle]?.primaryStimulus).toBeCloseTo(
      2 * bodyweight.perSet,
    );

    const duration = nominal("Plank");
    const durCov = computeCoverage(
      [
        workout("Plank", [
          { id: "d1", reps: null, weight: null, unit: "lb", durationSec: 45 },
          { id: "d2", reps: null, weight: null, unit: "lb", durationSec: 45 },
        ]),
      ],
      window,
    );
    expect(durCov.muscleStats[duration.muscle]?.primaryStimulus).toBeCloseTo(
      2 * duration.perSet,
    );
  });
});
