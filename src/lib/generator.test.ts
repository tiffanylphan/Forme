import { describe, expect, it } from "vitest";
import { findExercise } from "./exercises";
import { generateNextWorkout } from "./generator";
import { movementOf } from "./movement";
import type { TrainingProfile, Workout } from "./types";

const profile: TrainingProfile = {
  goal: "physique",
  daysPerWeek: 4,
  equipment: "full_gym",
  experience: "beginner",
  intensity: "standard",
  blockedExercises: [],
};

const threeDayProfile: TrainingProfile = {
  goal: "physique",
  daysPerWeek: 3,
  equipment: "full_gym",
  experience: "beginner",
  intensity: "standard",
  blockedExercises: [],
};

const workout = (
  id: string,
  date: string,
  exercises: { name: string; sets: number; progressionStatus?: "progressed" | "held" | "missed" | "baseline" }[],
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
    progressionStatus: exercise.progressionStatus,
    sets: Array.from({ length: exercise.sets }, (_, setIdx) => ({
      id: `${id}-${exIdx}-${setIdx}`,
      reps: 10,
      weight: 50,
      unit: "lb" as const,
    })),
  })),
});

const draftExerciseNames = (
  draft: ReturnType<typeof generateNextWorkout>,
): string[] => draft.sections.flatMap((section) => section.exercises.map((exercise) => exercise.name));

describe("generateNextWorkout", () => {
  it("starts a 4-day physique week on Lower A", () => {
    const draft = generateNextWorkout([], "2026-05-06", 123, profile);
    expect(draft.split.title).toBe("Lower A");
    expect(draft.rationale.some((line) => line.includes("Lower A"))).toBe(true);
    expect(draft.split.summary).toBe("Lower emphasis with posterior chain and upper-back support.");
  });

  it("starts a 3-day physique week on Lower A", () => {
    const draft = generateNextWorkout([], "2026-05-06", 123, threeDayProfile);
    expect(draft.split.title).toBe("Lower A");
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

  it("builds progression guidance from the last logged performance", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-06", 123, profile);
    const allExercises = draft.sections.flatMap((section) => section.exercises);
    const firstExercise = allExercises[0];

    expect(firstExercise?.progression.goal.length).toBeGreaterThan(0);
    expect(firstExercise?.progression.nextStep.length).toBeGreaterThan(0);
    expect(Array.isArray(firstExercise?.progression.recentHistory)).toBe(true);
  });

  it("adds a mobility warm-up and cooldown based on the session focus", () => {
    const draft = generateNextWorkout([], "2026-05-06", 123, profile);

    expect(draft.mobility.title).toBe("5-minute warm-up");
    expect(draft.mobility.items.length).toBeGreaterThan(0);
    expect(Array.isArray(draft.mobility.complementary)).toBe(true);
    expect(draft.cooldown.title).toBe("Cooldown and stretch");
    expect(draft.cooldown.items.length).toBeGreaterThan(0);
    expect(Array.isArray(draft.cooldown.complementary)).toBe(true);
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

  it("limits the dumbbells profile to dumbbells plus home tools, cable, and leg press", () => {
    const draft = generateNextWorkout([], "2026-05-06", 654, {
      ...profile,
      equipment: "dumbbells",
    });
    const allExercises = draft.sections.flatMap((section) => section.exercises);
    const libraryMatches = allExercises
      .map((exercise) => findExercise(exercise.name))
      .filter((exercise) => Boolean(exercise));

    expect(
      libraryMatches.every((exercise) =>
        exercise?.equipment === "dumbbell" ||
        exercise?.equipment === "kettlebell" ||
        exercise?.equipment === "bodyweight" ||
        exercise?.equipment === "band" ||
        exercise?.equipment === "cable" ||
        exercise?.name === "Leg press",
      ),
    ).toBe(true);
    expect(allExercises.some((exercise) => exercise.name === "Nordic hamstring curl")).toBe(false);
    expect(allExercises.some((exercise) => exercise.name === "Pull-up")).toBe(false);
    expect(allExercises.some((exercise) => exercise.name === "Chin-up")).toBe(false);
    expect(allExercises.some((exercise) => exercise.name === "Band-assisted pull-up")).toBe(false);
    expect(allExercises.some((exercise) => exercise.name === "Dip")).toBe(false);
    expect(allExercises.some((exercise) => exercise.name === "Inverted row")).toBe(false);
    expect(allExercises.some((exercise) => exercise.name === "Hanging knee raise")).toBe(false);
    expect(allExercises.some((exercise) => exercise.name === "Hanging leg raise")).toBe(false);
    expect(allExercises.some((exercise) => exercise.name === "Hyperextension")).toBe(false);
  });

  it("respects blocked exercises from the training profile", () => {
    const draft = generateNextWorkout([], "2026-05-06", 123, {
      ...profile,
      blockedExercises: ["Hack squat", "Nordic hamstring curl"],
    });
    const allExercises = draft.sections.flatMap((section) => section.exercises);

    expect(allExercises.some((exercise) => exercise.name === "Hack squat")).toBe(false);
    expect(allExercises.some((exercise) => exercise.name === "Nordic hamstring curl")).toBe(false);
  });

  it("keeps home dumbbell suggestions capped and uses higher-rep home schemes", () => {
    const workouts = [
      workout("w1", "2026-05-05", [{ name: "DB Romanian deadlift", sets: 4 }]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-06", 7777, {
      ...profile,
      equipment: "home",
    });
    const dumbbellExercise = draft.sections
      .flatMap((section) => section.exercises)
      .find((exercise) => exercise.name === "DB Romanian deadlift");

    expect(
      draft.sections.some((section) => section.repScheme.includes("lighter load")),
    ).toBe(true);
    expect(dumbbellExercise?.suggestedWeight == null || dumbbellExercise.suggestedWeight <= 15).toBe(true);
  });

  it("makes hard mode tougher with a paired opener while capping barbell use", () => {
    const draft = generateNextWorkout([], "2026-05-06", 456, {
      ...profile,
      intensity: "hard",
    });

    const finisherSection = draft.sections.find((section) => section.kind === "finisher");
    const barbellExercises = draft.sections
      .flatMap((section) => section.exercises)
      .map((exercise) => findExercise(exercise.name))
      .filter((exercise) => exercise?.equipment === "barbell");
    expect(draft.rationale.some((line) => line.includes("Hard mode is on"))).toBe(true);
    expect(draft.sections[0]?.kind).toBe("superset");
    expect(draft.sections[0]?.exercises).toHaveLength(2);
    expect(
      draft.sections[0]?.exercises.filter((exercise) =>
        findExercise(exercise.name)?.equipment === "barbell",
      ).length,
    ).toBeLessThanOrEqual(1);
    expect(barbellExercises.length).toBeLessThanOrEqual(2);
    expect(draft.sections.some((section) => section.rounds >= 4)).toBe(true);
    expect(finisherSection?.rounds).toBeGreaterThanOrEqual(2);
    expect(finisherSection?.exercises.length).toBeGreaterThanOrEqual(2);
  });

  it("avoids repeating the exact same finisher from a recent workout", () => {
    const seed = 456;
    const baselineDraft = generateNextWorkout([], "2026-05-18", seed, profile);
    const baselineFinisher = baselineDraft.sections.find((section) => section.kind === "finisher");
    const baselineNames = baselineFinisher?.exercises.map((exercise) => exercise.name) ?? [];

    expect(baselineNames.length).toBeGreaterThan(0);

    const repeatDraft = generateNextWorkout(
      [
        workout(
          "w-repeat",
          "2026-05-16",
          baselineNames.map((name) => ({ name, sets: 2 })),
        ),
      ],
      "2026-05-18",
      seed,
      profile,
    );
    const repeatFinisher = repeatDraft.sections.find((section) => section.kind === "finisher");
    const repeatNames = repeatFinisher?.exercises.map((exercise) => exercise.name) ?? [];

    expect(repeatNames).not.toEqual(baselineNames);
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
        line.includes("Still building this slot's focus stimulus:"),
      ),
    ).toBe(true);
  });

  it("explains when recent overlap or fatigue budgeting keeps the session more restrained", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "Barbell Romanian deadlift", sets: 4 },
        { name: "Cable row", sets: 3 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-06", 556, profile);

    expect(
      draft.rationale.some((line) =>
        line.includes("Recent overlap is high") ||
        line.includes("Kept total session fatigue in check") ||
        line.includes("Capped the total load a bit"),
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

  it("treats 4-day physique upper days as upper-emphasis with controlled lower crossover", () => {
    const workouts = [workout("w1", "2026-05-05", [
      { name: "Barbell hip thrust", sets: 4 },
      { name: "DB Bulgarian split squat", sets: 3 },
    ])];
    const draft = generateNextWorkout(workouts, "2026-05-06", 777, profile);
    const allExercises = draft.sections.flatMap((section) => section.exercises);

    expect(draft.split.title).toBe("Upper A");
    expect(draft.split.summary).toBe("Upper emphasis with back, shoulders, and glute support.");
    expect(
      allExercises.some((exercise) =>
        exercise.primary.includes("glutes") ||
        exercise.secondary.includes("glutes"),
      ),
    ).toBe(true);
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

  it("infers split progression from manual workouts without planSlot metadata", () => {
    const workouts = [
      workout("w1", "2026-05-11", [
        { name: "Barbell deadlift", sets: 4 },
        { name: "Band-assisted pull-up", sets: 4 },
        { name: "DB bent-over row", sets: 3 },
        { name: "Bench single-leg hip thrust", sets: 3 },
      ]),
      workout("w2", "2026-05-13", [
        { name: "DB Arnold press", sets: 3 },
        { name: "DB sumo squat", sets: 3 },
        { name: "Barbell Romanian deadlift", sets: 3 },
        { name: "Barbell bench press", sets: 3 },
        { name: "DB forward lunge", sets: 3 },
      ]),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-14", 123, profile);
    expect(draft.split.title).not.toBe("Lower B");
    expect(draft.split.title.startsWith("Upper")).toBe(true);
  });

  it("prefers an upper slot after two lower-heavy mixed workouts in the same week", () => {
    const workouts = [
      workout("w1", "2026-05-11", [
        { name: "Barbell deadlift", sets: 4 },
        { name: "Bench single-leg hip thrust", sets: 3 },
        { name: "Band-assisted pull-up", sets: 4 },
        { name: "DB bent-over row", sets: 3 },
      ]),
      workout("w2", "2026-05-13", [
        { name: "DB sumo squat", sets: 3 },
        { name: "Barbell Romanian deadlift", sets: 3 },
        { name: "DB forward lunge", sets: 3 },
        { name: "DB Arnold press", sets: 3 },
        { name: "Barbell bench press", sets: 3 },
      ]),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-14", 321, profile);
    expect(draft.split.title.startsWith("Upper")).toBe(true);
  });

  it("treats mixed full-body sessions with strong lower anchors as lower exposure for split progression", () => {
    const workouts = [
      workout("w1", "2026-05-11", [
        { name: "Barbell deadlift", sets: 4 },
        { name: "Band-assisted pull-up", sets: 4 },
        { name: "DB bent-over row", sets: 3 },
        { name: "Bench single-leg hip thrust", sets: 3 },
        { name: "DB renegade row", sets: 3 },
        { name: "Push-up", sets: 3 },
        { name: "Half burpee w/ dumbbell", sets: 3 },
      ]),
      workout("w2", "2026-05-13", [
        { name: "DB Arnold press", sets: 3 },
        { name: "DB sumo squat", sets: 3 },
        { name: "Barbell Romanian deadlift", sets: 3 },
        { name: "Barbell bench press", sets: 3 },
        { name: "DB forward lunge", sets: 3 },
      ]),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-14", 123, profile);
    expect(draft.split.title.startsWith("Upper")).toBe(true);
  });

  it("lets a clearly manual upper workout advance an open slot in a mixed planned week", () => {
    const workouts = [
      workout("w1", "2026-05-12", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "DB Bulgarian split squat", sets: 3 },
      ], {
        slotId: "lower_glute_ham",
        title: "Lower A",
      }),
      workout("w2", "2026-05-13", [
        { name: "Lat pulldown", sets: 4 },
        { name: "Cable row", sets: 4 },
        { name: "DB lateral raise", sets: 3 },
        { name: "DB hammer curl", sets: 3 },
      ]),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-14", 456, profile);
    expect(draft.split.title).not.toBe("Upper A");
  });

  it("does not duplicate an exercise inside a generated workout", () => {
    const workouts = [
      workout("w1", "2026-05-11", [
        { name: "Barbell deadlift", sets: 4 },
        { name: "Band-assisted pull-up", sets: 4 },
        { name: "DB bent-over row", sets: 3 },
        { name: "Bench single-leg hip thrust", sets: 3 },
        { name: "DB renegade row", sets: 3 },
        { name: "Push-up", sets: 3 },
        { name: "Half burpee w/ dumbbell", sets: 3 },
      ]),
      workout("w2", "2026-05-13", [
        { name: "DB Arnold press", sets: 3 },
        { name: "DB sumo squat", sets: 3 },
        { name: "Barbell Romanian deadlift", sets: 3 },
        { name: "Barbell bench press", sets: 3 },
        { name: "DB forward lunge", sets: 3 },
      ]),
      workout("w3", "2026-05-15", [
        { name: "DB reverse fly", sets: 4 },
        { name: "DB prone press", sets: 4 },
        { name: "DB single-arm row", sets: 4 },
        { name: "DB lateral raise", sets: 4 },
        { name: "Concentration curl", sets: 4 },
        { name: "Lateral step-up", sets: 4 },
        { name: "Plank", sets: 3 },
        { name: "Plank to push-up", sets: 3 },
        { name: "Plank jack", sets: 3 },
      ], {
        slotId: "upper_back_shoulder_arms",
        title: "Upper B",
      }),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-16", 2026, profile);
    const names = draft.sections.flatMap((section) =>
      section.exercises.map((exercise) => exercise.name),
    );

    expect(new Set(names).size).toBe(names.length);
  });

  it("prefers an open upper slot when pull is still untouched this week", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "DB Bulgarian split squat", sets: 3 },
      ], {
        slotId: "lower_glute_ham",
        title: "Lower A",
      }),
      workout("w2", "2026-05-06", [
        { name: "DB overhead press", sets: 4 },
        { name: "DB lateral raise", sets: 3 },
      ], {
        slotId: "upper_back_shoulder",
        title: "Upper A",
      }),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-07", 5150, profile);
    expect(draft.split.title).toBe("Upper B");
  });

  it("alternates the 3-day upper slot to include direct arms across weeks", () => {
    const workouts = [
      workout("w1", "2026-05-01", [
        { name: "Cable row", sets: 4 },
        { name: "DB overhead press", sets: 3 },
      ], {
        slotId: "upper_back_shoulder",
        title: "Upper A",
      }),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-06", 8080, threeDayProfile);
    expect(draft.split.title).toBe("Lower A");

    const secondDraft = generateNextWorkout([
      ...workouts,
      workout("w2", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "DB Bulgarian split squat", sets: 3 },
      ], {
        slotId: "lower_glute_ham",
        title: "Lower A",
      }),
    ], "2026-05-06", 8081, threeDayProfile);
    expect(secondDraft.split.title).toBe("Upper B");
  });

  it("allows a short conditioning finisher on 3-day lower sessions", () => {
    const draft = generateNextWorkout([], "2026-05-06", 9090, threeDayProfile);
    const finisherSection = draft.sections.find((section) => section.kind === "finisher");

    expect(finisherSection).toBeDefined();
    expect(finisherSection?.exercises.length).toBeGreaterThanOrEqual(1);
    expect(
      finisherSection?.exercises.every((exercise) =>
        [
          "Half burpee w/ dumbbell",
          "Burpee",
          "Squat thrust",
          "High knees",
          "Mountain climber",
          "Bear crawl",
          "Bear plank shoulder tap",
          "Plank to push-up",
          "Push-up to renegade row",
          "DB renegade row",
          "DB snatch",
          "Skater hop",
          "Squat jump",
          "Forward lunge",
          "Lateral lunge",
          "Reverse lunge",
          "Banded wall sit abduction pulses",
          "Archer push-up",
          "Push-up",
          "Incline push-up",
          "Hollow body hold",
          "Superman hold",
          "Plank",
          "Plank jack",
          "Shoulder tap",
          "Bodyweight squat",
          "Wall ball shot",
          "Medicine ball slam",
          "Tall-kneeling rotational medicine ball slam",
          "Farmer carry",
          "Suitcase carry",
        ].includes(exercise.name),
      ),
    ).toBe(true);
    expect(finisherSection?.rounds).toBe(3);
  });

  it("avoids specialized machine finishers when accessible options exist", () => {
    const draft = generateNextWorkout([], "2026-05-06", 1234, profile);
    const finisherExercises = draft.sections.find((section) => section.kind === "finisher")?.exercises ?? [];

    expect(finisherExercises.length).toBeGreaterThanOrEqual(1);
    expect(
      finisherExercises.some((exercise) =>
        [
          "Half burpee w/ dumbbell",
          "Burpee",
          "Squat thrust",
          "High knees",
          "Mountain climber",
          "Bear crawl",
          "Bear plank shoulder tap",
          "Plank to push-up",
          "Push-up to renegade row",
          "DB renegade row",
          "DB snatch",
          "Skater hop",
          "Squat jump",
          "Forward lunge",
          "Lateral lunge",
          "Reverse lunge",
          "Banded wall sit abduction pulses",
          "Archer push-up",
          "Push-up",
          "Incline push-up",
          "Hollow body hold",
          "Superman hold",
          "Plank",
          "Plank jack",
          "Shoulder tap",
          "Bodyweight squat",
          "Wall ball shot",
          "Medicine ball slam",
          "Tall-kneeling rotational medicine ball slam",
          "Farmer carry",
          "Suitcase carry",
        ].includes(exercise.name),
      ),
    ).toBe(true);
    expect(
      finisherExercises.every((exercise) =>
        ![
          "Assault bike",
          "Battle ropes",
          "Sled push",
          "Ski erg",
          "Rowing machine",
          "Jump rope",
        ].includes(exercise.name),
      ),
    ).toBe(true);
  });

  it("produces more than two hard-mode finisher templates across different seeds", () => {
    const labels = new Set(
      Array.from({ length: 12 }, (_, index) =>
        generateNextWorkout([], "2026-05-06", 5000 + index, {
          ...profile,
          intensity: "hard",
        }).sections.find((section) => section.kind === "finisher")?.repScheme,
      ).filter((value): value is string => Boolean(value)),
    );

    expect(labels.size).toBeGreaterThan(2);
  });

  it("overrides lower-b-in-order when pull is still untouched this week", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "DB Bulgarian split squat", sets: 3 },
      ], {
        slotId: "lower_glute_ham",
        title: "Lower A",
      }),
      workout("w2", "2026-05-06", [
        { name: "DB overhead press", sets: 4 },
        { name: "DB lateral raise", sets: 3 },
      ], {
        slotId: "upper_back_shoulder",
        title: "Upper A",
      }),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-07", 9191, threeDayProfile);
    expect(draft.split.title).toBe("Upper B");
  });

  it("keeps lower physique days glute-biased across the session", () => {
    const draft = generateNextWorkout([], "2026-05-06", 9292, profile);
    const glutePrimaryExercises = draft.sections
      .flatMap((section) => section.exercises)
      .filter((exercise) => exercise.primary.includes("glutes"));

    expect(draft.split.title).toBe("Lower A");
    expect(glutePrimaryExercises.length).toBeGreaterThanOrEqual(2);
  });

  it("avoids stacking multiple knee-dominant unilateral lower families in one lower-b session", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "Barbell Romanian deadlift", sets: 3 },
      ], {
        slotId: "lower_glute_ham",
        title: "Lower A",
      }),
      workout("w2", "2026-05-06", [
        { name: "Cable row", sets: 4 },
        { name: "DB overhead press", sets: 3 },
      ], {
        slotId: "upper_back_shoulder",
        title: "Upper A",
      }),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-07", 123, profile);
    const lowerUnilateralFamilies = draft.sections
      .flatMap((section) => section.exercises)
      .map((exercise) => exercise.name.toLowerCase())
      .filter(
        (name) =>
          name.includes("split squat") ||
          name.includes("bulgarian") ||
          name.includes("lunge") ||
          name.includes("step-up"),
      );

    expect(draft.split.title).toBe("Lower B");
    expect(lowerUnilateralFamilies.length).toBeLessThanOrEqual(1);
  });

  it("uses a real lower anchor instead of an isolation lift to open lower-b sessions", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "Barbell Romanian deadlift", sets: 3 },
      ], {
        slotId: "lower_glute_ham",
        title: "Lower A",
      }),
      workout("w2", "2026-05-06", [
        { name: "Cable row", sets: 4 },
        { name: "DB overhead press", sets: 3 },
      ], {
        slotId: "upper_back_shoulder",
        title: "Upper A",
      }),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-07", 123, profile);
    const opener = draft.sections[0]?.exercises[0]?.name;

    expect(draft.split.title).toBe("Lower B");
    expect(opener).toBeDefined();
    expect(["Leg extension", "Leg curl", "Banded clamshell"]).not.toContain(opener);
  });

  it("keeps activation drills out of standard lower-b main-session slots when better options exist", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "Barbell Romanian deadlift", sets: 3 },
      ], {
        slotId: "lower_glute_ham",
        title: "Lower A",
      }),
      workout("w2", "2026-05-06", [
        { name: "Cable row", sets: 4 },
        { name: "DB overhead press", sets: 3 },
      ], {
        slotId: "upper_back_shoulder",
        title: "Upper A",
      }),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-07", 123, profile);
    const exerciseNames = draft.sections.flatMap((section) =>
      section.exercises.map((exercise) => exercise.name),
    );

    expect(draft.split.title).toBe("Lower B");
    expect(exerciseNames).not.toContain("Banded clamshell");
    expect(exerciseNames).not.toContain("Banded fire hydrant");
    expect(exerciseNames).not.toContain("Banded walkout");
  });

  it("inserts direct arm work on upper-b physique days", () => {
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
        { name: "DB overhead press", sets: 3 },
      ], {
        slotId: "upper_back_shoulder",
        title: "Upper A",
      }),
      workout("w3", "2026-05-07", [
        { name: "Goblet squat", sets: 4 },
        { name: "DB reverse lunge", sets: 3 },
      ], {
        slotId: "lower_glute_quad",
        title: "Lower B",
      }),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-08", 9393, profile);
    const directArmExercises = draft.sections
      .flatMap((section) => section.exercises)
      .filter(
        (exercise) =>
          exercise.primary.includes("biceps") || exercise.primary.includes("triceps"),
      );

    expect(draft.split.title).toBe("Upper B");
    expect(directArmExercises.length).toBeGreaterThanOrEqual(1);
  });

  it("rotates away from a stalled lift toward a nearby substitute", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4, progressionStatus: "held" },
        { name: "DB Bulgarian split squat", sets: 3 },
      ], {
        slotId: "lower_glute_ham",
        title: "Lower A",
      }),
      workout("w2", "2026-05-06", [
        { name: "Cable row", sets: 4 },
        { name: "DB overhead press", sets: 3 },
      ], {
        slotId: "upper_back_shoulder",
        title: "Upper A",
      }),
      workout("w3", "2026-05-07", [
        { name: "Barbell hip thrust", sets: 4, progressionStatus: "missed" },
        { name: "DB Romanian deadlift", sets: 3 },
      ]),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-08", 9494, profile);
    const exerciseNames = draft.sections.flatMap((section) =>
      section.exercises.map((exercise) => exercise.name),
    );
    const rotatedLowerReplacement = exerciseNames
      .map((name) => findExercise(name))
      .filter((exercise) => Boolean(exercise))
      .some(
        (exercise) =>
          exercise?.name !== "Barbell hip thrust" &&
          exercise?.primary.includes("glutes") &&
          (exercise?.pattern === "hinge" || exercise?.pattern === "squat"),
      );

    expect(draft.split.title).toBe("Lower B");
    expect(exerciseNames).not.toContain("Barbell hip thrust");
    expect(rotatedLowerReplacement).toBe(true);
    expect(
      draft.rationale.some((line) =>
        line.includes("Rotated off stalled lift: Barbell hip thrust."),
      ),
    ).toBe(true);
  });

  it("does not fall back to naive modulo rotation once all slots are represented", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "Barbell Romanian deadlift", sets: 3 },
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
      workout("w3", "2026-05-07", [
        { name: "Goblet squat", sets: 4 },
        { name: "DB reverse lunge", sets: 3 },
      ], {
        slotId: "lower_glute_quad",
        title: "Lower B",
      }),
      workout("w4", "2026-05-08", [
        { name: "Lat pulldown", sets: 4 },
        { name: "DB lateral raise", sets: 3 },
        { name: "DB curl", sets: 2 },
      ], {
        slotId: "upper_back_shoulder_arms",
        title: "Upper B",
      }),
      workout("w5", "2026-05-09", [
        { name: "Cable row", sets: 4 },
        { name: "Face pull", sets: 3 },
        { name: "DB curl", sets: 2 },
      ], {
        slotId: "upper_back_shoulder_arms",
        title: "Upper B",
      }),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-10", 2468, profile);

    expect(draft.split.title).toMatch(/^Lower/);
  });

  it("does not let a hybrid manual session consume a new split slot too aggressively", () => {
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
        { name: "DB overhead press", sets: 3 },
      ], {
        slotId: "upper_back_shoulder",
        title: "Upper A",
      }),
      workout("w3", "2026-05-07", [
        { name: "Goblet squat", sets: 4 },
        { name: "DB reverse lunge", sets: 3 },
      ], {
        slotId: "lower_glute_quad",
        title: "Lower B",
      }),
      workout("w4", "2026-05-08", [
        { name: "Goblet squat", sets: 3 },
        { name: "Cable row", sets: 3 },
        { name: "DB overhead press", sets: 2 },
      ]),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-09", 5312, profile);

    expect(draft.split.title).toBe("Upper B");
  });

  it("prefers a fresher quad or single-leg opener over another posterior-chain hinge", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "Barbell Romanian deadlift", sets: 3 },
      ], {
        slotId: "lower_glute_ham",
        title: "Lower A",
      }),
      workout("w2", "2026-05-06", [
        { name: "Cable row", sets: 4 },
        { name: "DB overhead press", sets: 3 },
      ], {
        slotId: "upper_back_shoulder",
        title: "Upper A",
      }),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-07", 8642, profile);
    const opener = draft.sections[0]?.exercises[0];
    const openerMeta = opener ? findExercise(opener.name) : null;

    expect(draft.split.title).toBe("Lower B");
    expect(movementOf(openerMeta!)).not.toBe("hinge");
  });

  it("keeps hard-mode lower sessions from overstacking costly lower anchors", () => {
    const hardProfile: TrainingProfile = {
      ...profile,
      intensity: "hard",
    };
    const draft = generateNextWorkout([], "2026-05-07", 97531, hardProfile);
    const allExercises = draft.sections.flatMap((section) => section.exercises);
    const costlyLowerAnchors = allExercises.filter((exercise) => {
      const movement = movementOf(findExercise(exercise.name)!);
      return movement === "hinge" || movement === "squat" || movement === "single_leg";
    });

    expect(draft.split.title).toBe("Lower A");
    expect(costlyLowerAnchors.length).toBeLessThanOrEqual(4);
  });

  it("holds representative planner calibration scenarios", () => {
    const scenarios: Array<{
      name: string;
      workouts: Workout[];
      date: string;
      activeProfile?: TrainingProfile;
      assert: (draft: ReturnType<typeof generateNextWorkout>) => void;
    }> = [
      {
        name: "deficit-led lower slot beats naive rotation after lower and upper work",
        workouts: [
          workout("s1-w1", "2026-05-05", [
            { name: "Barbell hip thrust", sets: 4 },
            { name: "Barbell Romanian deadlift", sets: 3 },
          ], {
            slotId: "lower_glute_ham",
            title: "Lower A",
          }),
          workout("s1-w2", "2026-05-06", [
            { name: "Cable row", sets: 4 },
            { name: "DB lateral raise", sets: 3 },
          ], {
            slotId: "upper_back_shoulder",
            title: "Upper A",
          }),
        ],
        date: "2026-05-07",
        assert: (draft) => {
          expect(draft.split.title).toBe("Lower B");
        },
      },
      {
        name: "hybrid manual session does not consume the last open split slot",
        workouts: [
          workout("s2-w1", "2026-05-05", [
            { name: "Barbell hip thrust", sets: 4 },
            { name: "DB Bulgarian split squat", sets: 3 },
          ], {
            slotId: "lower_glute_ham",
            title: "Lower A",
          }),
          workout("s2-w2", "2026-05-06", [
            { name: "Cable row", sets: 4 },
            { name: "DB overhead press", sets: 3 },
          ], {
            slotId: "upper_back_shoulder",
            title: "Upper A",
          }),
          workout("s2-w3", "2026-05-07", [
            { name: "Goblet squat", sets: 4 },
            { name: "DB reverse lunge", sets: 3 },
          ], {
            slotId: "lower_glute_quad",
            title: "Lower B",
          }),
          workout("s2-w4", "2026-05-08", [
            { name: "Goblet squat", sets: 3 },
            { name: "Cable row", sets: 3 },
            { name: "DB overhead press", sets: 2 },
          ]),
        ],
        date: "2026-05-09",
        assert: (draft) => {
          expect(draft.split.title).toBe("Upper B");
        },
      },
      {
        name: "recent posterior-chain overlap redirects the opener away from another hinge",
        workouts: [
          workout("s3-w1", "2026-05-05", [
            { name: "Barbell hip thrust", sets: 4 },
            { name: "Barbell Romanian deadlift", sets: 3 },
          ], {
            slotId: "lower_glute_ham",
            title: "Lower A",
          }),
          workout("s3-w2", "2026-05-06", [
            { name: "Cable row", sets: 4 },
            { name: "DB overhead press", sets: 3 },
          ], {
            slotId: "upper_back_shoulder",
            title: "Upper A",
          }),
        ],
        date: "2026-05-07",
        assert: (draft) => {
          const opener = draft.sections[0]?.exercises[0];
          const openerMeta = opener ? findExercise(opener.name) : null;
          expect(draft.split.title).toBe("Lower B");
          expect(movementOf(openerMeta!)).not.toBe("hinge");
        },
      },
      {
        name: "hard lower days stay within the fatigue budget instead of stacking anchors endlessly",
        workouts: [],
        date: "2026-05-07",
        activeProfile: { ...profile, intensity: "hard" },
        assert: (draft) => {
          const costlyLowerAnchors = draftExerciseNames(draft).filter((name) => {
            const exercise = findExercise(name);
            const movement = exercise ? movementOf(exercise) : null;
            return movement === "hinge" || movement === "squat" || movement === "single_leg";
          });
          expect(draft.split.title).toBe("Lower A");
          expect(costlyLowerAnchors.length).toBeLessThanOrEqual(4);
        },
      },
    ];

    scenarios.forEach((scenario) => {
      const draft = generateNextWorkout(
        scenario.workouts,
        scenario.date,
        424242,
        scenario.activeProfile ?? profile,
      );
      scenario.assert(draft);
    });
  });
});
