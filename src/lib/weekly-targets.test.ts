import { describe, expect, it } from "vitest";
import { PLANNER_TUNING } from "./planner-tuning";
import type { ExperienceLevel, GoalMode, TrainingDaysPerWeek, TrainingProfile } from "./types";
import { MUSCLE_GROUPS } from "./types";
import {
  bandFloors,
  bandStatus,
  getWeeklyTargetBand,
  isMajorTarget,
} from "./weekly-targets";

const profile = (overrides: Partial<TrainingProfile> = {}): TrainingProfile => ({
  goal: "physique",
  daysPerWeek: 4,
  equipment: "full_gym",
  experience: "beginner",
  intensity: "standard",
  blockedExercises: [],
  allowedExercises: [],
  homeGymEquipment: [],
  sensitiveMuscles: [],
  muscleEmphasis: {},
  ...overrides,
});

const GOALS: GoalMode[] = ["physique", "balanced", "strength"];
const DAYS: TrainingDaysPerWeek[] = [3, 4, 5];
const LEVELS: ExperienceLevel[] = ["beginner", "intermediate"];

const everyProfile = (): TrainingProfile[] =>
  GOALS.flatMap((goal) =>
    DAYS.flatMap((daysPerWeek) =>
      LEVELS.map((experience) => profile({ goal, daysPerWeek, experience })),
    ),
  );

describe("getWeeklyTargetBand", () => {
  it("gives every planned muscle a band whose ceiling sits comfortably above its floor", () => {
    const threshold = PLANNER_TUNING.exerciseSelection.overTargetHighThreshold;
    everyProfile().forEach((p) => {
      const band = getWeeklyTargetBand(p);
      MUSCLE_GROUPS.forEach((muscle) => {
        const b = band[muscle];
        expect(b, `${p.goal}/${p.daysPerWeek}/${p.experience} ${muscle}`).toBeDefined();
        expect(b!.ceiling).toBeGreaterThanOrEqual(Math.max(b!.floor + 1, b!.floor * threshold));
      });
    });
  });

  it("keeps the sum of floors inside what the week's fatigue budget can carry", () => {
    const base = {
      3: PLANNER_TUNING.fatigueBudget.baseThreeDay,
      4: PLANNER_TUNING.fatigueBudget.baseFourDay,
      5: PLANNER_TUNING.fatigueBudget.baseFiveDay,
    } as const;
    everyProfile().forEach((p) => {
      const floors = Object.values(bandFloors(getWeeklyTargetBand(p))).reduce((a, b) => a + b, 0);
      const budget = base[p.daysPerWeek] * p.daysPerWeek;
      expect(floors, `${p.goal}/${p.daysPerWeek}/${p.experience}`).toBeLessThanOrEqual(budget);
    });
  });

  it("scales with training frequency and experience", () => {
    const three = getWeeklyTargetBand(profile({ daysPerWeek: 3 }));
    const five = getWeeklyTargetBand(profile({ daysPerWeek: 5 }));
    const intermediate = getWeeklyTargetBand(profile({ experience: "intermediate" }));
    const beginner = getWeeklyTargetBand(profile());
    expect(five.back!.floor).toBeGreaterThan(three.back!.floor);
    expect(intermediate.back!.floor).toBeGreaterThan(beginner.back!.floor);
    expect(intermediate.back!.ceiling).toBeGreaterThan(beginner.back!.ceiling);
  });

  it("applies muscle emphasis to both floor and ceiling", () => {
    const plain = getWeeklyTargetBand(profile());
    const emphasized = getWeeklyTargetBand(profile({ muscleEmphasis: { glutes: "high", core: "low" } }));
    expect(emphasized.glutes!.floor).toBeGreaterThanOrEqual(Math.max(plain.glutes!.floor + 1, plain.glutes!.floor * 1.4));
    expect(emphasized.glutes!.ceiling).toBeGreaterThanOrEqual(plain.glutes!.ceiling * 1.4);
    expect(emphasized.core!.floor).toBeLessThanOrEqual(Math.ceil(plain.core!.floor * 0.6));
    expect(emphasized.core!.ceiling).toBeLessThanOrEqual(Math.ceil(plain.core!.ceiling * 0.6));
    expect(emphasized.hamstrings).toEqual(plain.hamstrings);
  });

  it("lowers only the ceiling for sensitive muscles", () => {
    const plain = getWeeklyTargetBand(profile());
    const sensitive = getWeeklyTargetBand(profile({ sensitiveMuscles: ["shoulders"] }));
    expect(sensitive.shoulders!.floor).toBe(plain.shoulders!.floor);
    expect(sensitive.shoulders!.ceiling).toBeLessThan(plain.shoulders!.ceiling);
    expect(sensitive.shoulders!.ceiling).toBeGreaterThanOrEqual(sensitive.shoulders!.floor);
  });

  it("omits zero floors from the floor map but keeps the ceiling in the band", () => {
    const band = getWeeklyTargetBand(profile());
    expect(band.hip_flexors!.floor).toBe(0);
    expect(band.hip_flexors!.ceiling).toBeGreaterThan(0);
    expect(bandFloors(band).hip_flexors).toBeUndefined();
    expect(bandFloors(band).back).toBe(band.back!.floor);
  });

  it("reports band status relative to floor and ceiling", () => {
    const b = { floor: 8, ceiling: 14 };
    expect(bandStatus(b, 0)).toBe("below");
    expect(bandStatus(b, 7.9)).toBe("below");
    expect(bandStatus(b, 8)).toBe("in_range");
    expect(bandStatus(b, 13.9)).toBe("in_range");
    expect(bandStatus(b, 14)).toBe("over");
  });

  it("treats a floor at or above the major-muscle threshold as major", () => {
    const threshold = PLANNER_TUNING.splitSelection.saturationOverTargetMajorMuscleThreshold;
    expect(isMajorTarget({ floor: threshold, ceiling: threshold * 2 })).toBe(true);
    expect(isMajorTarget({ floor: threshold - 0.5, ceiling: threshold * 2 })).toBe(false);
  });
});
