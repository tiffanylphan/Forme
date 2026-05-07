import { describe, expect, it } from "vitest";
import { generateNextWorkout } from "./generator";
import type { TrainingProfile, Workout } from "./types";

const profile: TrainingProfile = {
  goal: "physique",
  daysPerWeek: 4,
  equipment: "full_gym",
  experience: "beginner",
};

const workout = (
  id: string,
  date: string,
  exercises: { name: string; sets: number }[],
  planSlot?: Workout["planSlot"],
): Workout => ({
  id,
  date,
  source: "manual",
  planSlot,
  createdAt: 1,
  updatedAt: 1,
  exercises: exercises.map((exercise, exIdx) => ({
    id: `${id}-${exIdx}`,
    exerciseName: exercise.name,
    supersetGroup: null,
    sets: Array.from({ length: exercise.sets }, (_, setIdx) => ({
      id: `${id}-${exIdx}-${setIdx}`,
      reps: 10,
      weight: 50,
      unit: "lb" as const,
    })),
  })),
});

describe("generateNextWorkout", () => {
  it("starts a 4-day physique week on Lower A", () => {
    const draft = generateNextWorkout([], "2026-05-06", 123, profile);
    expect(draft.split.title).toBe("Lower A");
    expect(draft.rationale.some((line) => line.includes("Lower A"))).toBe(true);
  });

  it("advances the split based on logged workouts this week", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "DB Bulgarian split squat", sets: 3 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-06", 123, profile);
    expect(draft.split.title).toBe("Upper A");
  });

  it("reacts to already logged exercises and avoids repeating the same lift", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "Barbell Romanian deadlift", sets: 3 },
      ]),
      workout("w2", "2026-05-06", [
        { name: "Cable row", sets: 4 },
        { name: "DB lateral raise", sets: 3 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-07", 123, profile);
    const exerciseNames = draft.sections.flatMap((section) =>
      section.exercises.map((exercise) => exercise.name),
    );
    expect(draft.split.title).toBe("Lower B");
    expect(exerciseNames).not.toContain("Barbell hip thrust");
    expect(exerciseNames).not.toContain("Barbell Romanian deadlift");
  });

  it("respects equipment restrictions from the training profile", () => {
    const draft = generateNextWorkout([], "2026-05-06", 321, {
      ...profile,
      equipment: "home",
    });
    const allNames = draft.sections.flatMap((section) =>
      section.exercises.map((exercise) => exercise.name.toLowerCase()),
    );
    expect(allNames.some((name) => name.includes("barbell"))).toBe(false);
    expect(allNames.some((name) => name.includes("cable"))).toBe(false);
    expect(allNames.some((name) => name.includes("machine"))).toBe(false);
  });

  it("advances to the next slot when the current week already has the prior sessions logged", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "DB Bulgarian split squat", sets: 3 },
      ]),
      workout("w2", "2026-05-06", [
        { name: "Cable row", sets: 4 },
        { name: "DB lateral raise", sets: 3 },
      ]),
      workout("w3", "2026-05-07", [
        { name: "Goblet squat", sets: 4 },
        { name: "DB reverse lunge", sets: 3 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-08", 999, profile);
    expect(draft.split.title).toBe("Upper B");
  });

  it("includes weekly volume rationale for under-target slot muscles", () => {
    const workouts = [
      workout("w1", "2026-05-05", [{ name: "Barbell hip thrust", sets: 3 }]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-06", 555, profile);
    expect(
      draft.rationale.some((line) =>
        line.includes("Still building this slot's focus volume:"),
      ),
    ).toBe(true);
  });

  it("still produces a full-session upper day with enough exercises", () => {
    const workouts = [workout("w1", "2026-05-05", [
      { name: "Barbell hip thrust", sets: 4 },
      { name: "DB Bulgarian split squat", sets: 3 },
    ])];
    const draft = generateNextWorkout(workouts, "2026-05-06", 777, profile);
    const totalExercises = draft.sections.reduce(
      (count, section) => count + section.exercises.length,
      0,
    );
    expect(draft.split.title).toBe("Upper A");
    expect(totalExercises).toBeGreaterThanOrEqual(5);
  });

  it("fills the first incomplete split slot after a prior slot workout was deleted", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "DB Bulgarian split squat", sets: 3 },
      ], {
        slotId: "lower_glute_ham",
        title: "Lower A",
      }),
      workout("w2", "2026-05-06", [
        { name: "Cable row", sets: 4 },
        { name: "DB lateral raise", sets: 3 },
      ], {
        slotId: "upper_back_shoulder",
        title: "Upper A",
      }),
      workout("w4", "2026-05-08", [
        { name: "Lat pulldown", sets: 4 },
        { name: "DB overhead press", sets: 3 },
      ], {
        slotId: "upper_back_shoulder_arms",
        title: "Upper B",
      }),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-08", 4242, profile);
    expect(draft.split.title).toBe("Lower B");
  });
});
