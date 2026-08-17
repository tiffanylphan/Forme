import { describe, expect, it } from "vitest";
import { computeCoverage, weekContaining } from "./coverage";
import type { Coverage } from "./coverage";
import { buildMuscleTargetRows, getMuscleTargetRows } from "./splits";
import type { TrainingProfile, Workout } from "./types";

const makeCoverage = (muscleStats: Coverage["muscleStats"]): Coverage => ({
  window: weekContaining("2026-08-08"),
  workouts: [],
  muscleStats,
  patternStats: {},
  movementStats: {},
});

describe("buildMuscleTargetRows", () => {
  it("computes pct, remaining, and null overPct when under target", () => {
    const coverage = makeCoverage({
      back: { daysHit: [], asPrimarySets: 3, asSecondarySets: 0, primaryStimulus: 3, secondaryStimulus: 0, recoveryStress: 0, exercises: [] },
    });
    const rows = buildMuscleTargetRows({ back: 6 }, coverage);
    expect(rows).toEqual([
      { muscle: "back", target: 6, done: 3, pct: 50, remaining: 3, overPct: null },
    ]);
  });

  it("computes overPct and zero remaining when over target", () => {
    const coverage = makeCoverage({
      glutes: { daysHit: [], asPrimarySets: 10, asSecondarySets: 0, primaryStimulus: 10, secondaryStimulus: 0, recoveryStress: 0, exercises: [] },
    });
    const rows = buildMuscleTargetRows({ glutes: 8 }, coverage);
    expect(rows).toEqual([
      { muscle: "glutes", target: 8, done: 10, pct: 100, remaining: 0, overPct: 125 },
    ]);
  });

  it("excludes muscles with a zero or missing target", () => {
    const coverage = makeCoverage({});
    const rows = buildMuscleTargetRows({ back: 0, shoulders: undefined, glutes: 5 }, coverage);
    expect(rows.map((r) => r.muscle)).toEqual(["glutes"]);
  });

  it("sorts rows by target descending", () => {
    const coverage = makeCoverage({});
    const rows = buildMuscleTargetRows({ back: 3, glutes: 8, core: 5 }, coverage);
    expect(rows.map((r) => r.muscle)).toEqual(["glutes", "core", "back"]);
  });
});

describe("getMuscleTargetRows", () => {
  const profile: TrainingProfile = {
    goal: "physique",
    daysPerWeek: 4,
    equipment: "full_gym",
    experience: "beginner",
    intensity: "standard",
    blockedExercises: [],
    allowedExercises: [],
    homeGymEquipment: [],
    sensitiveMuscles: [],
  };

  it("derives rows from the profile's resolved split and real coverage", () => {
    const workouts: Workout[] = [
      {
        id: "w1",
        date: "2026-08-04",
        source: "manual",
        createdAt: 1,
        updatedAt: 1,
        exercises: [
          {
            id: "w1-0",
            exerciseName: "Cable row",
            supersetGroup: null,
            sets: [
              { id: "s1", reps: 10, weight: 50, unit: "lb" },
              { id: "s2", reps: 10, weight: 50, unit: "lb" },
            ],
          },
        ],
      },
    ];
    const coverage = computeCoverage(workouts, weekContaining("2026-08-08"));
    const rows = getMuscleTargetRows(profile, coverage);
    const back = rows.find((r) => r.muscle === "back");
    expect(back).toBeDefined();
    expect(back!.done).toBeGreaterThan(0);
  });
});
