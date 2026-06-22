import { describe, expect, it } from "vitest";
import { EXERCISES, findExercise } from "./exercises";
import { FINISHER_TEMPLATES, generateNextWorkout } from "./generator";
import { movementOf } from "./movement";
import type { TrainingProfile, Workout } from "./types";

const profile: TrainingProfile = {
  goal: "physique",
  daysPerWeek: 4,
  equipment: "full_gym",
  experience: "beginner",
  intensity: "standard",
  blockedExercises: [],
  allowedExercises: [],
};

const threeDayProfile: TrainingProfile = {
  goal: "physique",
  daysPerWeek: 3,
  equipment: "full_gym",
  experience: "beginner",
  intensity: "standard",
  blockedExercises: [],
  allowedExercises: [],
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
    expect(draft.split.title).toBe("Lower A · Posterior");
    expect(draft.rationale.some((line) => line.includes("Lower A"))).toBe(true);
    expect(draft.split.summary).toBe("Lower session theme with posterior chain and upper-back support.");
  });

  it("starts a 3-day physique week on Lower A", () => {
    const draft = generateNextWorkout([], "2026-05-06", 123, threeDayProfile);
    expect(draft.split.title).toBe("Lower A · Posterior");
  });

  it("advances the split based on logged workouts this week", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "DB Bulgarian split squat", sets: 3 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-06", 123, profile);
    expect(draft.split.title).toBe("Upper A · Back/Shoulders");
  });

  it("returns ranked slot recommendations and can force a non-default slot", () => {
    const recommended = generateNextWorkout([], "2026-05-06", 123, profile);
    const forced = generateNextWorkout([], "2026-05-06", 123, profile, {
      forcedSlotId: "upper_back_shoulder",
    });

    expect(recommended.slotRecommendations[0]?.slotId).toBe("lower_glute_ham");
    expect(recommended.slotRecommendations[0]?.isRecommended).toBe(true);
    expect(forced.split.slotId).toBe("upper_back_shoulder");
    expect(forced.slotRecommendations[0]?.slotId).toBe("lower_glute_ham");
    expect(forced.slotRecommendations.some((slot) => slot.slotId === "upper_back_shoulder")).toBe(true);
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
    expect(draft.split.title).toBe("Lower B · Quad/Glute");
    expect(exerciseNames).not.toContain("Barbell hip thrust");
    expect(exerciseNames).not.toContain("Barbell Romanian deadlift");
  });

  it("prefers an upper pull day when recent lower fatigue is high but back work still lags", () => {
    const workouts = [
      workout("w1", "2026-05-15", [
        { name: "DB reverse fly", sets: 3 },
        { name: "DB single-arm row", sets: 3 },
        { name: "Concentration curl", sets: 3 },
        { name: "Lateral step-up", sets: 3 },
        { name: "Plank", sets: 3 },
      ]),
      workout("w2", "2026-05-18", [
        { name: "Angled machine leg press", sets: 3 },
        { name: "DB walking lunge", sets: 3 },
        { name: "DB flat bench press", sets: 3 },
        { name: "DB split squat to RDL", sets: 3 },
        { name: "Ski erg", sets: 3 },
      ]),
      workout("w3", "2026-05-20", [
        { name: "DB side lunge to high pull", sets: 3 },
        { name: "DB squat to reverse lunge", sets: 3 },
        { name: "DB overhead march", sets: 3 },
        { name: "Barbell Romanian deadlift", sets: 3 },
        { name: "Barbell incline bench press", sets: 3 },
        { name: "Box step-up", sets: 3 },
        { name: "DB skull crusher", sets: 3 },
        { name: "Butterfly sit-up", sets: 3 },
      ]),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-22", 123, profile);

    expect(draft.split.title).toBe("Upper A · Back/Shoulders");
    expect(draft.slotRecommendations[0]?.slotId).toBe("upper_back_shoulder");
  });

  it("re-biases Upper A toward pull-first work when lower and pressing fatigue are already high", () => {
    const workouts = [
      workout("w1", "2026-05-18", [
        { name: "Angled machine leg press", sets: 3 },
        { name: "DB walking lunge", sets: 3 },
        { name: "DB flat bench press", sets: 3 },
        { name: "DB split squat to RDL", sets: 3 },
        { name: "Ski erg", sets: 3 },
        { name: "Hand raise push-up", sets: 3 },
      ]),
      workout("w2", "2026-05-20", [
        { name: "DB side lunge to high pull", sets: 3 },
        { name: "Woman maker", sets: 3 },
        { name: "DB squat to reverse lunge", sets: 3 },
        { name: "DB overhead march", sets: 3 },
        { name: "Barbell Romanian deadlift", sets: 3 },
        { name: "Barbell incline bench press", sets: 3 },
        { name: "Box step-up", sets: 3 },
        { name: "DB skull crusher", sets: 3 },
        { name: "Butterfly sit-up", sets: 3 },
      ]),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-22", 123, profile);
    const names = draft.sections.flatMap((section) =>
      section.exercises.map((exercise) => exercise.name),
    );
    const finisherSection = draft.sections.find((section) => section.kind === "finisher");
    const finisherNames = finisherSection?.exercises.map((exercise) => exercise.name) ?? [];

    expect(draft.split.title).toBe("Upper A · Back/Shoulders");
    expect(names).not.toContain("DB prone press");
    expect(names).not.toContain("Hyperextension");
    expect(
      names.some((name) =>
        ["Chin-up", "Band-assisted pull-up", "Cable row", "T-bar row", "DB single-arm row"].includes(name),
      ),
    ).toBe(true);
    expect(findExercise(draft.sections[0]?.exercises[0]?.name ?? "")?.pattern).toBe("pull");
    expect(finisherNames.length).toBeGreaterThan(0);
    expect(
      finisherNames.some((name) => {
        const exercise = findExercise(name);
        return exercise?.pattern === "push" || name === "Push-up to renegade row";
      }),
    ).toBe(false);
  });

  it("does not bias Upper A toward minimal pressing just because rear-delt pull work recently trained shoulders", () => {
    // Recent sessions are pull-heavy (rows, reverse flies, face pulls) which train
    // "shoulders" as a secondary target — that should not be misread as recent
    // pressing fatigue and used to suppress a press-needing session's pressing.
    const workouts = [
      workout("w1", "2026-06-01", [
        { name: "Barbell back squat", sets: 8 },
        { name: "Goblet squat", sets: 6 },
        { name: "Leg extension", sets: 4 },
        { name: "DB Romanian deadlift", sets: 4 },
        { name: "Barbell bench press", sets: 4 },
        { name: "DB skull crusher", sets: 3 },
        { name: "DB lateral raise", sets: 6 },
        { name: "Cable lateral raise", sets: 8 },
      ]),
      workout("w2", "2026-06-03", [
        { name: "Bodyweight squat", sets: 6 },
        { name: "Lateral step-up", sets: 7 },
        { name: "Single-leg DB RDL", sets: 3 },
      ]),
      workout("w3", "2026-06-05", [
        { name: "Cable row", sets: 4 },
        { name: "Prone T raise", sets: 4 },
        { name: "DB reverse fly", sets: 4 },
        { name: "Band-assisted pull-up", sets: 4 },
        { name: "Cable curl", sets: 4 },
        { name: "Burpee", sets: 3 },
      ]),
      workout("w4", "2026-06-06", [
        { name: "Good morning", sets: 4 },
        { name: "Single-leg DB RDL", sets: 4 },
        { name: "Leg curl", sets: 4 },
        { name: "DB front raise", sets: 4 },
        { name: "Forward lunge", sets: 3 },
        { name: "Lateral lunge", sets: 3 },
        { name: "Reverse lunge", sets: 3 },
      ]),
    ];

    const draft = generateNextWorkout(
      workouts,
      "2026-06-07",
      7,
      { ...profile, daysPerWeek: 5, experience: "intermediate", intensity: "hard" },
      { forcedSlotId: "upper_back_shoulder" },
    );

    expect(draft.split.summary).not.toContain("minimal pressing");
    const names = draft.sections.flatMap((section) => section.exercises.map((exercise) => exercise.name));
    expect(names.some((name) => movementOf(findExercise(name)!) === "push")).toBe(true);
  });

  it("does not stack multiple vertical pulls in the same upper pull session", () => {
    const workouts = [
      workout("w1", "2026-05-18", [
        { name: "Angled machine leg press", sets: 3 },
        { name: "DB walking lunge", sets: 3 },
        { name: "DB flat bench press", sets: 3 },
        { name: "DB split squat to RDL", sets: 3 },
        { name: "Ski erg", sets: 3 },
        { name: "Hand raise push-up", sets: 3 },
      ]),
      workout("w2", "2026-05-20", [
        { name: "DB side lunge to high pull", sets: 3 },
        { name: "Woman maker", sets: 3 },
        { name: "DB squat to reverse lunge", sets: 3 },
        { name: "DB overhead march", sets: 3 },
        { name: "Barbell Romanian deadlift", sets: 3 },
        { name: "Barbell incline bench press", sets: 3 },
        { name: "Box step-up", sets: 3 },
        { name: "DB skull crusher", sets: 3 },
        { name: "Butterfly sit-up", sets: 3 },
      ]),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-22", 321, profile);
    const exerciseNames = draft.sections.flatMap((section) =>
      section.exercises.map((exercise) => exercise.name),
    );
    const verticalPullNames = [
      "Pull-up",
      "Chin-up",
      "Band-assisted pull-up",
      "Lat pulldown",
    ];
    const rowNames = [
      "Cable row",
      "DB single-arm row",
      "Chest-supported DB row",
      "Barbell bent-over row",
      "T-bar row",
      "DB bent-over row",
    ];

    expect(draft.split.title).toBe("Upper A · Back/Shoulders");
    expect(exerciseNames.filter((name) => verticalPullNames.includes(name)).length).toBeLessThanOrEqual(1);
    expect(exerciseNames.some((name) => rowNames.includes(name))).toBe(true);
  });

  it("does not stack multiple direct curl variations in the same upper session", () => {
    const workouts = [
      workout("w1", "2026-05-18", [
        { name: "Angled machine leg press", sets: 3 },
        { name: "DB walking lunge", sets: 3 },
        { name: "DB flat bench press", sets: 3 },
        { name: "DB split squat to RDL", sets: 3 },
        { name: "Ski erg", sets: 3 },
        { name: "Hand raise push-up", sets: 3 },
      ]),
      workout("w2", "2026-05-20", [
        { name: "DB side lunge to high pull", sets: 3 },
        { name: "Woman maker", sets: 3 },
        { name: "DB squat to reverse lunge", sets: 3 },
        { name: "DB overhead march", sets: 3 },
        { name: "Barbell Romanian deadlift", sets: 3 },
        { name: "Barbell incline bench press", sets: 3 },
        { name: "Box step-up", sets: 3 },
        { name: "DB skull crusher", sets: 3 },
        { name: "Butterfly sit-up", sets: 3 },
      ]),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-22", 654, profile);
    const exerciseNames = draft.sections.flatMap((section) =>
      section.exercises.map((exercise) => exercise.name),
    );
    const curlNames = [
      "DB hammer curl",
      "Barbell curl",
      "Concentration curl",
      "Cable curl",
      "Preacher curl",
      "Incline DB curl",
    ];

    expect(exerciseNames.filter((name) => curlNames.includes(name)).length).toBeLessThanOrEqual(1);
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

  it("treats cable pulls as core back options when cable is in homeGymEquipment", () => {
    const dumbbellProfile: TrainingProfile = {
      ...profile,
      equipment: "dumbbells",
      homeGymEquipment: ["cable"],
    };
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Angled machine leg press", sets: 3 },
        { name: "DB walking lunge", sets: 3 },
        { name: "DB flat bench press", sets: 3 },
        { name: "DB split squat to RDL", sets: 3 },
        { name: "Ski erg", sets: 3 },
        { name: "Hand raise push-up", sets: 3 },
      ]),
      workout("w2", "2026-05-20", [
        { name: "DB side lunge to high pull", sets: 3 },
        { name: "Woman maker", sets: 3 },
        { name: "DB squat to reverse lunge", sets: 3 },
        { name: "DB overhead march", sets: 3 },
        { name: "DB Romanian deadlift", sets: 3 },
        { name: "DB incline bench press", sets: 3 },
        { name: "Box step-up", sets: 3 },
        { name: "DB skull crusher", sets: 3 },
        { name: "Butterfly sit-up", sets: 3 },
      ]),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-22", 654, dumbbellProfile);
    const exerciseNames = draft.sections.flatMap((section) =>
      section.exercises.map((exercise) => exercise.name),
    );

    expect(draft.split.title).toBe("Upper A · Back/Shoulders");
    expect(
      exerciseNames.some((name) => name === "Cable row" || name === "Lat pulldown"),
    ).toBe(true);
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

  it("rerolls only the finisher when a finisherSeed override is given", () => {
    const seed = 123;
    const baseline = generateNextWorkout([], "2026-05-18", seed, profile);
    const reroll = generateNextWorkout([], "2026-05-18", seed, profile, { finisherSeed: 11 });

    const namesExcludingFinisher = (draft: ReturnType<typeof generateNextWorkout>) =>
      draft.sections
        .filter((section) => section.kind !== "finisher")
        .flatMap((section) => section.exercises.map((exercise) => exercise.name));
    const finisherNames = (draft: ReturnType<typeof generateNextWorkout>) =>
      draft.sections.find((section) => section.kind === "finisher")?.exercises.map((exercise) => exercise.name) ?? [];

    expect(namesExcludingFinisher(reroll)).toEqual(namesExcludingFinisher(baseline));
    expect(finisherNames(reroll)).not.toEqual(finisherNames(baseline));
  });

  it("can surface circuits that are a weaker slot-bias fit when shuffled enough", () => {
    const seed = 4242;
    const finisherNamesAt = (finisherSeed: number) =>
      generateNextWorkout([], "2026-05-18", seed, profile, { finisherSeed })
        .sections.find((section) => section.kind === "finisher")
        ?.exercises.map((exercise) => exercise.name) ?? [];

    const found = new Set<string>();
    for (let finisherSeed = 0; finisherSeed < 50; finisherSeed += 1) {
      finisherNamesAt(finisherSeed).forEach((name) => found.add(name));
    }

    expect(found.has("Hollow body hold")).toBe(true);
    expect(found.has("Farmer carry")).toBe(true);
  });

  it("excludes the currently-shown finisher template when asked to redraw", () => {
    const seed = 4242;
    const baseline = generateNextWorkout([], "2026-05-18", seed, profile, { finisherSeed: 0 });
    const baselineTemplateId = baseline.sections.find((section) => section.kind === "finisher")?.templateId;

    expect(baselineTemplateId).toBeTruthy();

    const redraw = generateNextWorkout([], "2026-05-18", seed, profile, {
      finisherSeed: 1,
      excludeFinisherTemplateIds: [baselineTemplateId!],
    });
    const redrawTemplateId = redraw.sections.find((section) => section.kind === "finisher")?.templateId;

    expect(redrawTemplateId).toBeTruthy();
    expect(redrawTemplateId).not.toBe(baselineTemplateId);
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
    expect(draft.split.title).toBe("Upper B · Upper/Arms");
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
    expect(draft.split.title).toBe("Upper A · Back/Shoulders");
    expect(totalExercises).toBeGreaterThanOrEqual(5);
  });

  it("treats 4-day physique upper days as upper-emphasis with controlled lower crossover", () => {
    const workouts = [workout("w1", "2026-05-05", [
      { name: "Barbell hip thrust", sets: 4 },
      { name: "DB Bulgarian split squat", sets: 3 },
    ])];
    const draft = generateNextWorkout(workouts, "2026-05-06", 777, profile);
    const allExercises = draft.sections.flatMap((section) => section.exercises);

    expect(draft.split.title).toBe("Upper A · Back/Shoulders");
    expect(draft.split.summary.toLowerCase()).toContain("upper session");
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
    expect(draft.split.title).toBe("Lower B · Quad/Glute");
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
    expect(draft.split.title).not.toBe("Lower B · Quad/Glute");
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
    expect(draft.split.title).not.toBe("Upper A · Back/Shoulders");
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
    expect(draft.split.title).toBe("Upper B · Upper/Arms");
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
    expect(draft.split.title).toBe("Lower A · Posterior");

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
    expect(secondDraft.split.title).toBe("Upper B · Upper/Arms");
  });

  it("includes a vertical pull in 3-day upper sessions when a row is the compound", () => {
    const workouts = [
      workout("w1", "2026-05-18", [
        { name: "Angled machine leg press", sets: 3 },
        { name: "DB walking lunge", sets: 3 },
        { name: "DB flat bench press", sets: 3 },
        { name: "DB split squat to RDL", sets: 3 },
      ]),
      workout("w2", "2026-05-20", [
        { name: "DB side lunge to high pull", sets: 3 },
        { name: "DB squat to reverse lunge", sets: 3 },
        { name: "Barbell Romanian deadlift", sets: 3 },
        { name: "Barbell incline bench press", sets: 3 },
        { name: "Box step-up", sets: 3 },
      ]),
    ];
    const verticalPullNames = ["Pull-up", "Chin-up", "Band-assisted pull-up", "Lat pulldown"];
    const seeds = [100, 200, 300, 400, 500];
    const anyHasVerticalPull = seeds.some((seed) => {
      const draft = generateNextWorkout(workouts, "2026-05-22", seed, threeDayProfile);
      const names = draft.sections.flatMap((s) => s.exercises.map((e) => e.name));
      return names.some((name) => verticalPullNames.includes(name));
    });
    expect(anyHasVerticalPull).toBe(true);
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
          "Broad jump",
          "Tuck-up",
          "Tuck jump",
          "Hanging knee raise",
          "V-up",
          "Side plank",
          "Alternating V-up",
          "Bird dog",
          "Single-side V-up",
          "Copenhagen plank",
          "Dead bug",
          "High plank",
          "DB overhead march",
          "Hanging leg raise",
          "Cable woodchop",
          "Bicycle crunch",
          "Side plank dip",
          "DB squat to clean",
          "Flutter kick",
          "Plank drag",
          "Woman maker",
          "Butterfly sit-up",
          "DB side plank rotation",
          "DB side lunge to high pull",
          "Oblique twist",
          "Russian twist",
          "Pallof press",
          "Ab wheel rollout",
        ].includes(exercise.name),
      ),
    ).toBe(true);
    expect(finisherSection?.rounds).toBeGreaterThanOrEqual(2);
    expect(finisherSection?.rounds).toBeLessThanOrEqual(4);
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
          "V-up",
          "Side plank",
          "Alternating V-up",
          "Bird dog",
          "Single-side V-up",
          "Copenhagen plank",
          "Dead bug",
          "High plank",
          "DB overhead march",
          "Hanging leg raise",
          "Cable woodchop",
          "Bicycle crunch",
          "Side plank dip",
          "DB squat to clean",
          "Flutter kick",
          "Plank drag",
          "Woman maker",
          "Butterfly sit-up",
          "DB side plank rotation",
          "DB side lunge to high pull",
          "Oblique twist",
          "Russian twist",
          "Pallof press",
          "Ab wheel rollout",
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
    expect(draft.split.title).toBe("Upper B · Upper/Arms");
  });

  it("keeps lower physique days glute-biased across the session", () => {
    const draft = generateNextWorkout([], "2026-05-06", 9292, profile);
    const glutePrimaryExercises = draft.sections
      .flatMap((section) => section.exercises)
      .filter((exercise) => exercise.primary.includes("glutes"));

    expect(draft.split.title).toBe("Lower A · Posterior");
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

    expect(draft.split.title).toBe("Lower B · Quad/Glute");
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

    expect(draft.split.title).toBe("Lower B · Quad/Glute");
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

    expect(draft.split.title).toBe("Lower B · Quad/Glute");
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

    expect(draft.split.title).toBe("Upper B · Upper/Arms");
    expect(directArmExercises.length).toBeGreaterThanOrEqual(1);
  });

  it("does not let the pull-biased upper-b allocation cap shoulder work below rear delts when shoulders are more deficient", () => {
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

    expect(draft.split.title).toBe("Upper B · Upper/Arms");
    expect(draft.split.summary).toContain("back and rear-delt catch-up");
    expect(draft.split.targetPrimaryStimulus.shoulders ?? 0).toBeGreaterThanOrEqual(
      draft.split.targetPrimaryStimulus.rear_delts ?? 0,
    );
  });

  it("favors an exercise for the muscle with the larger remaining weekly deficit when deficit-closure scores would otherwise tie", () => {
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
        { name: "Barbell bench press", sets: 4 },
        { name: "Cable triceps pushdown", sets: 3 },
        { name: "DB incline press", sets: 3 },
      ]),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-09", 9393, profile);

    expect(draft.split.title).toBe("Upper B · Upper/Arms");
    expect(draftExerciseNames(draft)).toContain("Face pull");
  });

  it("keeps the 5-day Accessory day's glute/shoulder focus and compound lower lift even when pull deficits are high", () => {
    const workouts = [
      workout("w1", "2026-05-04", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "DB Bulgarian split squat", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A" }),
      workout("w2", "2026-05-05", [
        { name: "Barbell bench press", sets: 4 },
        { name: "DB lateral raise", sets: 3 },
        { name: "Cable triceps pushdown", sets: 3 },
      ], { slotId: "upper_back_shoulder", title: "Upper A" }),
      workout("w3", "2026-05-06", [
        { name: "Goblet squat", sets: 4 },
        { name: "DB reverse lunge", sets: 3 },
      ], { slotId: "lower_glute_quad", title: "Lower B" }),
      workout("w4", "2026-05-07", [
        { name: "Barbell bent-over row", sets: 4 },
        { name: "DB curl", sets: 3 },
        { name: "Cable triceps pushdown", sets: 3 },
      ], { slotId: "upper_back_shoulder_arms", title: "Upper B" }),
    ];

    const draft = generateNextWorkout(
      workouts,
      "2026-05-08",
      9393,
      { ...profile, daysPerWeek: 5 },
      { forcedSlotId: "glute_shoulder_accessory" },
    );

    expect(draft.split.title).toBe("Accessory day");
    expect(draft.split.targetPrimaryStimulus.glutes ?? 0).toBeGreaterThan(0);
    const names = draftExerciseNames(draft);
    expect(
      names.some((name) => {
        const movement = movementOf(findExercise(name)!);
        return movement === "hinge" || movement === "single_leg";
      }),
    ).toBe(true);
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

    expect(draft.split.title).toBe("Lower B · Quad/Glute");
    expect(exerciseNames).not.toContain("Barbell hip thrust");
    expect(rotatedLowerReplacement).toBe(true);
    expect(
      draft.rationale.some((line) =>
        line.includes("Rotated off stalled lift: Barbell hip thrust."),
      ),
    ).toBe(true);
  });

  it("does not override cycle order to upper when upper already leads and lower slots remain", () => {
    // Accessory upper exercises stalling (3 stalled: push + pull pressure) while
    // Upper A was already done this cycle. Lower A has not been done. The stall
    // override should be suppressed because there are more incomplete lower slots
    // (Lower A, Lower B) than upper slots (Upper B) remaining.
    const workouts = [
      workout("w1", "2026-06-10", [
        { name: "Cable row", sets: 4, progressionStatus: "held" },
        { name: "DB lateral raise", sets: 3, progressionStatus: "held" },
        { name: "DB reverse fly", sets: 3, progressionStatus: "held" },
      ], {
        slotId: "upper_back_shoulder",
        title: "Upper A",
      }),
      workout("w2", "2026-06-12", [
        { name: "Cable row", sets: 4, progressionStatus: "missed" },
        { name: "DB lateral raise", sets: 3, progressionStatus: "missed" },
        { name: "DB reverse fly", sets: 3, progressionStatus: "missed" },
      ], {
        slotId: "upper_back_shoulder",
        title: "Upper A",
      }),
    ];

    const draft = generateNextWorkout(workouts, "2026-06-17", 42, profile);
    expect(draft.split.slotId).toMatch(/^lower_/);
  });

  it("offers to bring back a stalled conditioning finisher and can plan it back in", () => {
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Ski erg", sets: 3, progressionStatus: "held" },
        { name: "Barbell back squat", sets: 4 },
      ]),
      workout("w2", "2026-05-06", [
        { name: "Cable row", sets: 4 },
        { name: "DB overhead press", sets: 3 },
      ]),
      workout("w3", "2026-05-07", [
        { name: "Ski erg", sets: 3, progressionStatus: "missed" },
        { name: "DB Romanian deadlift", sets: 3 },
      ]),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-08", 9494, profile);
    expect(draftExerciseNames(draft)).not.toContain("Ski erg");
    expect(draft.rotatedOffLifts).toContain("Ski erg");
    expect(
      draft.rationale.some((line) => line.includes("Rotated off stalled lift") && line.includes("Ski erg")),
    ).toBe(true);

    const broughtBack = generateNextWorkout(workouts, "2026-05-08", 9494, profile, {
      preferredExercises: ["Ski erg"],
    });
    expect(draftExerciseNames(broughtBack)).toContain("Ski erg");
    // Preferred exercises stay in rotatedOffLifts so the UI can render them as
    // active chips (with a remove button).
    expect(broughtBack.rotatedOffLifts).toContain("Ski erg");
    // The finisher should have 3 exercises, not just the 1 preferred exercise.
    const finisherSection = broughtBack.sections.find((s) => s.kind === "finisher");
    expect(finisherSection?.exercises.length).toBeGreaterThanOrEqual(2);
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

    expect(draft.split.title).toBe("Upper B · Upper/Arms");
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

    expect(draft.split.title).toBe("Lower B · Quad/Glute");
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

    expect(draft.split.title).toBe("Lower A · Posterior");
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
          expect(draft.split.title).toBe("Lower B · Quad/Glute");
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
          expect(draft.split.title).toBe("Upper B · Upper/Arms");
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
          expect(draft.split.title).toBe("Lower B · Quad/Glute");
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
          expect(draft.split.title).toBe("Lower A · Posterior");
          // 4 main-session anchors, plus at most one more from a finisher
          // (e.g. "Bodyweight squat" in burpee_ladder).
          expect(costlyLowerAnchors.length).toBeLessThanOrEqual(5);
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

  it("does not recommend a slot completed at the end of the prior week when the new week starts", () => {
    // Lower A done Saturday, then a heavy lower trainer workout logged Monday (new week).
    // Without cross-week continuity the selector would forget Lower A and recommend it again.
    const workouts = [
      workout("w1", "2026-05-16", [
        { name: "Barbell Romanian deadlift", sets: 4 },
        { name: "Bench single-leg hip thrust", sets: 3 },
        { name: "Single-leg DB RDL", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A" }),
      workout("w2", "2026-05-18", [
        { name: "Leg press", sets: 4 },
        { name: "DB walking lunge", sets: 4 },
        { name: "DB flat bench press", sets: 3 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-18", 123, profile);
    expect(draft.split.title).toBe("Upper A · Back/Shoulders");
  });

  it("does not recommend Lower A the day after a lower-heavy trainer workout with no prior history", () => {
    // Trainer workout hits same muscles as Lower A (quads, glutes, hamstrings).
    // The muscle fatigue penalty should outweigh the deficit advantage.
    const workouts = [
      workout("w1", "2026-05-18", [
        { name: "Leg press", sets: 4 },
        { name: "DB walking lunge", sets: 4 },
        { name: "DB split squat to RDL", sets: 3 },
        { name: "DB flat bench press", sets: 3 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-18", 123, profile);
    expect(draft.split.title).toBe("Upper A · Back/Shoulders");
  });

  it("does not include two hip-thrust family exercises in the same lower session", () => {
    // Hip thrust variants (Barbell hip thrust, Bench single-leg hip thrust, Glute bridge)
    // are trainer-equivalent. Only one should appear per session.
    const seeds = [1111, 2222, 3333, 4444, 5555, 6666];
    for (const seed of seeds) {
      const draft = generateNextWorkout([], "2026-05-06", seed, profile);
      if (draft.split.title !== "Lower A · Posterior") continue;
      const names = draftExerciseNames(draft);
      const hipThrustFamilyNames = names.filter((name) => {
        const lower = name.toLowerCase();
        return lower.includes("hip thrust") || lower.includes("glute bridge");
      });
      expect(hipThrustFamilyNames.length).toBeLessThanOrEqual(1);
    }
  });

  it("does not stack two compound hinge families in the same physique lower session", () => {
    // A trainer would not program deadlift + RDL as back-to-back heavy compound hinges.
    // Only hinge-movement exercises are counted — "DB split squat to RDL" is squat-pattern
    // and excluded despite having "rdl" in its name.
    const seeds = [1111, 2222, 3333, 4444, 5555, 6666, 7777, 8888];
    for (const seed of seeds) {
      const draft = generateNextWorkout([], "2026-05-06", seed, profile);
      if (!["Lower A · Posterior", "Lower B · Quad/Glute"].includes(draft.split.title)) continue;
      const hingeExercises = draft.sections
        .filter((section) => section.kind !== "finisher")
        .flatMap((section) => section.exercises)
        .filter((ex) => ex.movement === "hinge");
      // Map each hinge exercise to its heavy-compound family (deadlift or rdl).
      // Light accessories (hyperextension, cable pull-through) map to "other" and are allowed.
      const heavyFamilies = hingeExercises
        .map((ex) => {
          const lower = ex.name.toLowerCase();
          if (lower.includes("romanian deadlift") || (lower.includes("rdl") && !lower.includes("split squat"))) return "rdl";
          if (lower.includes("deadlift") && !lower.includes("romanian")) return "deadlift";
          return "other";
        })
        .filter((f) => f !== "other");
      const uniqueHeavyFamilies = new Set(heavyFamilies);
      expect(uniqueHeavyFamilies.size).toBeLessThanOrEqual(1);
    }
  });

  it("strength lower sessions still allow two hinge exercises (deadlift + RDL)", () => {
    const strengthProfile: TrainingProfile = {
      ...profile,
      goal: "strength",
      daysPerWeek: 3,
    };
    const seeds = [9001, 9002, 9003, 9004, 9005];
    let foundTwoHinges = false;
    for (const seed of seeds) {
      const draft = generateNextWorkout([], "2026-05-06", seed, strengthProfile);
      const hingeExercises = draft.sections
        .flatMap((section) => section.exercises)
        .filter((ex) => ex.movement === "hinge");
      if (hingeExercises.length >= 2) {
        foundTwoHinges = true;
        break;
      }
    }
    expect(foundTwoHinges).toBe(true);
  });

  it("does not repeat a unilateral lower knee family that appeared in the last session", () => {
    // If the prior session had lunges, the next lower session should avoid lunges/step-ups/split-squats.
    const recentLungeSession = workout("w-lunge", "2026-05-04", [
      { name: "DB walking lunge", sets: 4 },
      { name: "DB reverse lunge", sets: 3 },
      { name: "DB Romanian deadlift", sets: 3 },
    ]);
    // Force a lower slot so we land on a lower session
    const draft = generateNextWorkout(
      [recentLungeSession],
      "2026-05-06",
      1234,
      profile,
      { forcedSlotId: "lower_glute_quad" },
    );
    const lowerUnilateralNames = draftExerciseNames(draft).filter((name) => {
      const lower = name.toLowerCase();
      return lower.includes("lunge") || lower.includes("split squat") || lower.includes("step-up");
    });
    // Recent lunge session should suppress another lunge-dominant unilateral lower day
    expect(lowerUnilateralNames.length).toBeLessThanOrEqual(1);
  });

  it("includes a carry/core exercise in every physique upper session", () => {
    const cableProfile: TrainingProfile = {
      ...profile,
      equipment: "dumbbells",
      homeGymEquipment: ["cable"],
    };
    const seeds = [111, 222, 333, 444, 555];
    for (const seed of seeds) {
      const draft = generateNextWorkout([], "2026-05-22", seed, cableProfile, {
        forcedSlotId: "upper_back_shoulder",
      });
      const hasCarryCore = draft.sections.some((section) =>
        section.exercises.some((ex) => ex.movement === "carry_core"),
      );
      expect(hasCarryCore).toBe(true);
    }
  });

  it("does not add a second carry/core block when the session already has one", () => {
    const workouts = [
      workout("w1", "2026-05-20", [
        { name: "Leg press", sets: 4 },
        { name: "DB Romanian deadlift", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A" }),
    ];
    const seeds = [111, 222, 333, 444, 555];
    for (const seed of seeds) {
      const draft = generateNextWorkout(workouts, "2026-05-22", seed, profile, {
        forcedSlotId: "lower_glute_quad",
      });
      const carryCoreSections = draft.sections.filter((section) =>
        section.exercises.some((ex) => ex.movement === "carry_core"),
      );
      expect(carryCoreSections.length).toBeLessThanOrEqual(2);
    }
  });

  it("picks the only remaining untouched slot when three slots are already logged this week", () => {
    const workouts = [
      workout("w1", "2026-05-18", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "Barbell Romanian deadlift", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A" }),
      workout("w2", "2026-05-19", [
        { name: "Lat pulldown", sets: 4 },
        { name: "DB lateral raise", sets: 3 },
        { name: "DB curl", sets: 2 },
      ], { slotId: "upper_back_shoulder_arms", title: "Upper B" }),
      workout("w3", "2026-05-20", [
        { name: "Goblet squat", sets: 4 },
        { name: "DB reverse lunge", sets: 3 },
      ], { slotId: "lower_glute_quad", title: "Lower B" }),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-21", 123, profile);
    expect(draft.split.slotId).toBe("upper_back_shoulder");
  });

  it("starts a fresh rotation on Lower A when all four slots from the prior week are past the slot-inference window", () => {
    const workouts = [
      workout("w1", "2026-05-11", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "Barbell Romanian deadlift", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A" }),
      workout("w2", "2026-05-12", [
        { name: "Cable row", sets: 4 },
        { name: "DB lateral raise", sets: 3 },
      ], { slotId: "upper_back_shoulder", title: "Upper A" }),
      workout("w3", "2026-05-13", [
        { name: "Goblet squat", sets: 4 },
        { name: "DB reverse lunge", sets: 3 },
      ], { slotId: "lower_glute_quad", title: "Lower B" }),
      workout("w4", "2026-05-14", [
        { name: "Lat pulldown", sets: 4 },
        { name: "DB curl", sets: 3 },
      ], { slotId: "upper_back_shoulder_arms", title: "Upper B" }),
    ];
    // All 4 slots logged Mon–Thu last week; this Monday restarts the cycle
    const draft = generateNextWorkout(workouts, "2026-05-18", 123, profile);
    expect(draft.split.slotId).toBe("lower_glute_ham");
  });

  it("continues the rotation from a prior-week slot even when it was logged 7 days ago", () => {
    const workouts = [
      workout("w1", "2026-05-11", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "Barbell Romanian deadlift", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A" }),
    ];
    // Lower A was logged 7 days ago; cross-week continuity should advance to Upper A
    const draft = generateNextWorkout(workouts, "2026-05-18", 123, profile);
    expect(draft.split.slotId).toBe("upper_back_shoulder");
  });

  it("gives every finisher-eligible exercise a home in a curated finisher template", () => {
    const accessibleConditioningFinisher = (ex: (typeof EXERCISES)[number]) =>
      ex.pattern === "conditioning" && ["bodyweight", "dumbbell", "band"].includes(ex.equipment);

    const accessibleMetabolicFinisher = (ex: (typeof EXERCISES)[number]) =>
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
      ].includes(ex.name);

    const finisherEligible = EXERCISES.filter(
      (ex) =>
        movementOf(ex) === "carry_core" ||
        accessibleConditioningFinisher(ex) ||
        accessibleMetabolicFinisher(ex),
    );

    const namesInTemplates = new Set(FINISHER_TEMPLATES.flatMap((t) => t.exercises));

    const missing = finisherEligible.filter((ex) => !namesInTemplates.has(ex.name));
    expect(missing.map((ex) => ex.name)).toEqual([]);
  });
});
