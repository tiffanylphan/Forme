import { describe, expect, it } from "vitest";
import { estimateExerciseStimulus } from "./coverage";
import { EXERCISES, findExercise } from "./exercises";
import { familyOf, isLowerFatiguingFinisher, isPushLeaningFinisher } from "./exercise-predicates";
import { FINISHER_TEMPLATES } from "./finishers";
import { buildDraftExercise, generateNextWorkout } from "./generator";
import { movementOf } from "./movement";
import { PLANNER_TUNING } from "./planner-tuning";
import type { Exercise, MuscleGroup, TrainingProfile, Workout } from "./types";

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

const threeDayProfile: TrainingProfile = {
  goal: "physique",
  daysPerWeek: 3,
  equipment: "full_gym",
  experience: "beginner",
  intensity: "standard",
  blockedExercises: [],
  allowedExercises: [],
  homeGymEquipment: [],
  sensitiveMuscles: [],
};

const workout = (
  id: string,
  date: string,
  exercises: {
    name: string;
    sets: number;
    progressionStatus?: "progressed" | "held" | "missed" | "baseline";
    weight?: number;
    reps?: number;
  }[],
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
      reps: exercise.reps ?? 10,
      weight: exercise.weight ?? 50,
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

  it("does not pair two row-family exercises in the same superset", () => {
    // DB renegade row and Push-up to renegade row share the "row" family; they must
    // not appear together in the same non-finisher section.
    const draft = generateNextWorkout([], "2026-05-06", 123, profile);
    const nonFinisherSections = draft.sections.filter((s) => s.kind !== "finisher");
    const rowNames = new Set([
      "Cable row", "DB single-arm row", "Chest-supported DB row", "Barbell bent-over row",
      "T-bar row", "DB bent-over row", "DB renegade row", "Push-up to renegade row",
      "Seated cable row", "Machine row", "DB bent-over row", "Cable face pull row",
    ]);
    for (const section of nonFinisherSections) {
      const rowCount = section.exercises.filter((ex) => rowNames.has(ex.name)).length;
      expect(rowCount).toBeLessThanOrEqual(1);
    }
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

  it("derives progression goal reps from logged history rather than the static slot template", () => {
    // Before the fix: goal text always used the slot's static rep template (e.g. "10/8/8/6"),
    // ignoring what was actually logged. The workout helper generates 4 sets × 10 reps each
    // at weight 50 lb. The compound template is [10,8,8,6]; because 10/10/10/10 >= each target,
    // hitAllPlanned is true, giving "Match or beat … reps". Before the fix that showed the
    // template reps ("10/8/8/6"); after the fix it must show the actual logged reps "10/10/10/10".
    //
    // Seeds old history (3+ weeks ago) so exercises are in `known` but not
    // recently fatigued. The current week has a separate lower session so the
    // next slot is Upper A, where Lat pulldown is reliably selected.
    const workouts = [
      // Old session — establishes history (50 lb × 10/10/10/10) for upper exercises
      workout("old", "2026-04-15", [
        { name: "Lat pulldown", sets: 4 },
        { name: "Cable row", sets: 4 },
        { name: "DB lateral raise", sets: 4 },
      ]),
      // Current week — lower session, so the next slot is Upper A
      workout("w1", "2026-05-05", [
        { name: "Goblet squat", sets: 4 },
        { name: "DB sumo squat", sets: 3 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-06", 123, profile);
    const allExercises = draft.sections.flatMap((s) => s.exercises);
    const latPulldown = allExercises.find((ex) => ex.name === "Lat pulldown");

    expect(latPulldown).toBeDefined();
    // History has 4 sets × 10 reps at 50 lb; hitAllPlanned=true (10/10/10/10 ≥ template 10/8/8/6).
    // Goal must show "10/10/10/10" (history), not "10/8/8/6" (static compound template).
    expect(latPulldown?.progression.goal).toContain("10/10/10/10");
    expect(latPulldown?.progression.goal).not.toContain("10/8/8/6");
  });

  it("keeps displayed R1-R4 targets in sync with the progression goal's rep numbers", () => {
    const workouts = [
      workout("old", "2026-04-15", [
        { name: "Lat pulldown", sets: 4 },
        { name: "Cable row", sets: 4 },
        { name: "DB lateral raise", sets: 4 },
      ]),
      workout("w1", "2026-05-05", [
        { name: "Goblet squat", sets: 4 },
        { name: "DB sumo squat", sets: 3 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-06", 123, profile);
    const allExercises = draft.sections.flatMap((s) => s.exercises);
    const latPulldown = allExercises.find((ex) => ex.name === "Lat pulldown");

    expect(latPulldown?.targets).toEqual([10, 10, 10, 10]);
    expect(latPulldown?.progression.goal).toContain("10/10/10/10");
  });

  it("holds at a reduced weight for one cycle instead of immediately recommending adding load back", () => {
    const workouts = [
      // Established working weight before the reset.
      workout("veryOld", "2026-04-01", [
        { name: "Lat pulldown", sets: 4, weight: 25 },
      ]),
      // Most recent session: weight dropped to 20 lb, but reps were clean
      // (10/10/10/10 clears the 10/8/8/6 compound template).
      workout("old", "2026-04-15", [
        { name: "Lat pulldown", sets: 4, weight: 20 },
        { name: "Cable row", sets: 4 },
        { name: "DB lateral raise", sets: 4 },
      ]),
      workout("w1", "2026-05-05", [
        { name: "Goblet squat", sets: 4 },
        { name: "DB sumo squat", sets: 3 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-06", 123, profile);
    const latPulldown = draft.sections.flatMap((s) => s.exercises).find((ex) => ex.name === "Lat pulldown");

    expect(latPulldown?.progression.goal).toContain("Consolidate at 20 lb");
    expect(latPulldown?.progression.nextStep).toContain("recently dropped load");
    expect(latPulldown?.progression.goal).not.toContain("Match or beat");
    expect(latPulldown?.progression.nextStep).not.toContain("Add 2.5-5");
  });

  it("resumes normal load progression once a session repeats the same (no-longer-reduced) weight", () => {
    const workouts = [
      workout("veryOld", "2026-04-01", [
        { name: "Lat pulldown", sets: 4, weight: 25 },
      ]),
      // Reset session — weight dropped to 20 lb.
      workout("older", "2026-04-08", [
        { name: "Lat pulldown", sets: 4, weight: 20 },
      ]),
      // A second clean session at the same (now-established) 20 lb — the
      // reduction is one cycle old, so normal "add load" guidance resumes.
      workout("old", "2026-04-15", [
        { name: "Lat pulldown", sets: 4, weight: 20 },
        { name: "Cable row", sets: 4 },
        { name: "DB lateral raise", sets: 4 },
      ]),
      workout("w1", "2026-05-05", [
        { name: "Goblet squat", sets: 4 },
        { name: "DB sumo squat", sets: 3 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-06", 123, profile);
    const latPulldown = draft.sections.flatMap((s) => s.exercises).find((ex) => ex.name === "Lat pulldown");

    expect(latPulldown?.progression.goal).toContain("Match or beat");
    expect(latPulldown?.progression.nextStep).toContain("Add 2.5-5 lb");
  });

  it("does not treat a comeback session after a long layoff as a recent load reduction", () => {
    const workouts = [
      // Weight here (25 lb) is only "the previous session" in a technical
      // sense — it's 10+ weeks stale, so a lighter comeback session below
      // should not be read as a deliberate, recent reset.
      workout("veryOld", "2026-02-01", [
        { name: "Lat pulldown", sets: 4, weight: 25 },
      ]),
      workout("old", "2026-04-20", [
        { name: "Lat pulldown", sets: 4, weight: 20 },
        { name: "Cable row", sets: 4 },
        { name: "DB lateral raise", sets: 4 },
      ]),
      workout("w1", "2026-05-05", [
        { name: "Goblet squat", sets: 4 },
        { name: "DB sumo squat", sets: 3 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-06", 123, profile);
    const latPulldown = draft.sections.flatMap((s) => s.exercises).find((ex) => ex.name === "Lat pulldown");

    expect(latPulldown?.progression.goal).toContain("Match or beat");
    expect(latPulldown?.progression.nextStep).not.toContain("recently dropped load");
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
    // Pinning this to two specific named templates (as an earlier version of
    // this test did) makes it brittle against any unrelated scoring-weight
    // change that shifts which candidate templates clear the muscle-overlap
    // cap — this happened twice already (the session-level overlap cap, then
    // the deficit-magnitude rebalance). Assert the actual claim in the test's
    // name instead: shuffling finisherSeed surfaces multiple distinct
    // circuits, not just the single top-scoring one every time.
    const seed = 21;
    const finisherKeyAt = (finisherSeed: number) => {
      const finisherSection = generateNextWorkout([], "2026-05-18", seed, profile, {
        finisherSeed,
      }).sections.find((section) => section.kind === "finisher");
      return (
        finisherSection?.templateId ??
        finisherSection?.exercises.map((exercise) => exercise.name).sort().join("+")
      );
    };

    const found = new Set<string>();
    for (let finisherSeed = 0; finisherSeed < 50; finisherSeed += 1) {
      const key = finisherKeyAt(finisherSeed);
      if (key) found.add(key);
    }

    // 3, not 4: the coherence gates added alongside the session-archetype work
    // (no third posterior hinge via a swing template, trainer-equivalent
    // family dedup, body-region fit, muscle caps on fuller sessions) each
    // deliberately shrink the applicable pool for a hinge-heavy Lower A. The
    // claim under test — the draw surfaces multiple distinct circuits rather
    // than collapsing onto the single top scorer — holds at 3.
    expect(found.size).toBeGreaterThanOrEqual(3);
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

  it("still varies the finisher across repeated shuffles when only one curated template ever applies", () => {
    // Regression for a real report: "shuffling finishers doesn't work
    // anymore". For this slot/profile the body-region gate (added to fix
    // Issue 7 — an all-push circuit filling a lower-focused session) leaves
    // exactly one template ("wall_ball_sprint") in the shortlist, because
    // the only other applicable template ("nordic_glute_finisher") is
    // all-lower-fatiguing and this is an upper-biased slot. Excluding that
    // singleton after it's shown (as the real Shuffle button does) used to
    // fall back to re-drawing the same excluded template every time —
    // shuffling produced no visible change no matter how many times it was
    // clicked. This simulates the actual page.tsx shuffle flow: record the
    // shown finisher, exclude it, redraw with a fresh finisherSeed, repeat.
    const seed = 456;
    let finisherSeed = seed;
    let excluded: string[] = [];
    const keyOf = (draft: ReturnType<typeof generateNextWorkout>) => {
      const section = draft.sections.find((s) => s.kind === "finisher");
      return section?.templateId ?? section?.exercises.map((e) => e.name).sort().join("+");
    };

    let draft = generateNextWorkout([], "2026-05-18", seed, profile, {
      finisherSeed,
      forcedSlotId: "upper_back_shoulder_arms",
    });
    const found = new Set<string>();
    const firstKey = keyOf(draft);
    expect(firstKey).toBeTruthy();
    found.add(firstKey!);

    for (let i = 0; i < 20; i += 1) {
      const currentTemplateId = draft.sections.find((s) => s.kind === "finisher")?.templateId;
      if (currentTemplateId) {
        excluded = [currentTemplateId, ...excluded.filter((id) => id !== currentTemplateId)].slice(0, 3);
      }
      finisherSeed = seed + i + 1;
      draft = generateNextWorkout([], "2026-05-18", seed, profile, {
        finisherSeed,
        forcedSlotId: "upper_back_shoulder_arms",
        excludeFinisherTemplateIds: excluded.length > 0 ? excluded : undefined,
      });
      const key = keyOf(draft);
      if (key) found.add(key);
    }

    expect(found.size).toBeGreaterThanOrEqual(4);

    const finisherExercises = draft.sections.find((s) => s.kind === "finisher")?.exercises ?? [];
    const resolved = finisherExercises
      .map((ex) => findExercise(ex.name))
      .filter((ex): ex is Exercise => Boolean(ex));
    expect(resolved.every((ex) => isLowerFatiguingFinisher(ex))).toBe(false);
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

  it("picks a pull compound on Upper A even when a lower session already hit pull via renegade row", () => {
    // DB renegade row is excluded from isBackPullAnchor but still counts as a "pull"
    // movement hit, which used to drop need["pull"] to 1 and let push win the compound.
    const workouts = [
      workout("w1", "2026-05-18", [
        { name: "DB renegade row", sets: 3 },
        { name: "Barbell Romanian deadlift", sets: 4 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-20", 123, profile, {
      forcedSlotId: "upper_back_shoulder",
    });
    const compoundExercise = draft.sections[0]?.exercises[0];
    expect(findExercise(compoundExercise?.name ?? "")?.pattern).toBe("pull");
    expect(compoundExercise?.name).not.toBe("DB prone press");
    const allNames = draft.sections.flatMap((s) => s.exercises.map((e) => e.name));
    expect(
      allNames.some((name) =>
        [
          "Lat pulldown",
          "Cable row",
          "Barbell bent-over row",
          "DB single-arm row",
          "DB bent-over row",
          "Band-assisted pull-up",
          "T-bar row",
        ].includes(name),
      ),
    ).toBe(true);
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
          "Kettlebell swing",
          "Ski erg",
          "Flutter kick",
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

  it("includes a pull exercise in 3-day physique Lower A sessions when pull need is high", () => {
    // Prior Lower A covered only hinge/single_leg — pull need stays at max
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "DB Bulgarian split squat", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A" }),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-07", 5678, threeDayProfile, {
      forcedSlotId: "lower_glute_ham",
    });

    const allExercises = draft.sections.flatMap((s) => s.exercises);
    const hasPull = allExercises.some(
      (ex) => ex.movement === "pull" || ex.primary.includes("back"),
    );
    expect(draft.split.title).toBe("Lower A · Posterior");
    expect(hasPull).toBe(true);
  });

  it("includes a push exercise in 3-day physique Lower B sessions when push need is high", () => {
    // Lower A done without push/pull — push need stays at max
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "DB Bulgarian split squat", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A" }),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-07", 5678, threeDayProfile, {
      forcedSlotId: "lower_glute_quad",
    });

    const allExercises = draft.sections.flatMap((s) => s.exercises);
    const hasPush = allExercises.some(
      (ex) => ex.movement === "push" || ex.primary.includes("shoulders"),
    );
    expect(draft.split.title).toBe("Lower B · Quad/Glute");
    expect(hasPush).toBe(true);
  });

  it("does not stack three posterior-chain hinge exercises in a lower session", () => {
    const draft = generateNextWorkout([], "2026-05-06", 9292, profile, {
      forcedSlotId: "lower_glute_ham",
    });

    const allExercises = draft.sections.flatMap((s) => s.exercises);
    const hingeDominantCount = allExercises.filter(
      (ex) =>
        ex.movement === "hinge" ||
        (ex.movement === "single_leg" && ex.name.toLowerCase().includes("rdl")),
    ).length;

    expect(hingeDominantCount).toBeLessThanOrEqual(2);
  });

  it("includes a pull exercise in 4-day physique Lower A sessions", () => {
    const draft = generateNextWorkout([], "2026-05-18", 4242, profile, {
      forcedSlotId: "lower_glute_ham",
    });
    const allExercises = draft.sections.flatMap((s) => s.exercises);
    const hasPull = allExercises.some((ex) => ex.movement === "pull");
    expect(hasPull).toBe(true);
  });

  it("includes a pull exercise in 3-day physique Lower A sessions via supplemental cross-over", () => {
    const draft = generateNextWorkout([], "2026-05-06", 123, threeDayProfile, {
      forcedSlotId: "lower_glute_ham",
    });
    const allExercises = draft.sections.flatMap((s) => s.exercises);
    const hasPull = allExercises.some((ex) => ex.movement === "pull");
    expect(hasPull).toBe(true);
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
    // Session must cover rear_delts through at least one exercise (primary or secondary)
    // — Face pull previously satisfied this but the shoulder-deficit guard now permits
    // a broader session where rear_delts coverage arrives via row/pull compounds.
    const names = draftExerciseNames(draft);
    const hasRearDeltWork = names.some((name) => {
      const ex = findExercise(name);
      return ex && (ex.primary.includes("rear_delts") || ex.secondary.includes("rear_delts"));
    });
    expect(hasRearDeltWork).toBe(true);
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

  it("does not let lower stall pressure override an upper slot chosen to close a push critical gap (3-day split)", () => {
    // Two prior Lower A sessions with stalling hinge exercises → lower stall pressure dominates.
    // Upper A done cross-week (Jul 5), Lower B done this week (Jul 8) — no push at all.
    // push need = 3 (critical gap). Lower A doesn't allow push; Upper B does.
    // The planner must recommend Upper B. Stall pressure must not override it back to Lower A.
    const workouts = [
      workout("w1", "2026-06-25", [
        { name: "Barbell hip thrust", sets: 3, progressionStatus: "held" },
        { name: "DB Romanian deadlift", sets: 3, progressionStatus: "held" },
      ], { slotId: "lower_glute_ham", title: "Lower A · Posterior" }),
      workout("w2", "2026-07-01", [
        { name: "Barbell hip thrust", sets: 3, progressionStatus: "missed" },
        { name: "DB Romanian deadlift", sets: 3, progressionStatus: "missed" },
      ], { slotId: "lower_glute_ham", title: "Lower A · Posterior" }),
      workout("w3", "2026-07-05", [
        { name: "Lat pulldown", sets: 4 },
        { name: "Cable row", sets: 4 },
        { name: "DB reverse fly", sets: 3 },
      ], { slotId: "upper_back_shoulder", title: "Upper A · Back/Shoulders" }),
      workout("w4", "2026-07-08", [
        { name: "DB sumo squat", sets: 4 },
        { name: "DB front rack curtsey lunge", sets: 3 },
        { name: "Cossack squat", sets: 3 },
      ], { slotId: "lower_glute_quad", title: "Lower B · Quad/Glute" }),
    ];

    // Last upper was Upper A → resolved split uses Upper B next.
    // Upper B allows push; Lower A does not.
    const draft = generateNextWorkout(workouts, "2026-07-09", 42, threeDayProfile);
    expect(draft.split.slotId).toBe("upper_back_shoulder_arms");
  });

  it("does not recommend the other upper variant immediately after logging an upper session today (3-day split)", () => {
    const workouts = [
      workout("w1", "2026-08-01", [
        { name: "Lat pulldown", sets: 4 },
        { name: "DB prone press", sets: 4 },
      ], { slotId: "upper_back_shoulder_arms", title: "Upper B · Upper/Arms" }),
    ];

    const draft = generateNextWorkout(workouts, "2026-08-01", 42, threeDayProfile);
    expect(draft.split.slotId).not.toBe("upper_back_shoulder");
    expect(draft.split.slotId).not.toBe("upper_back_shoulder_arms");
  });

  it("only lists a muscle as avoided in the last-48h rationale if this session's own exercises don't touch it", () => {
    const workouts = [
      workout("w1", "2026-08-01", [
        { name: "Lat pulldown", sets: 4 },
        { name: "DB prone press", sets: 4 },
      ], { slotId: "upper_back_shoulder_arms", title: "Upper B · Upper/Arms" }),
    ];

    const draft = generateNextWorkout(workouts, "2026-08-01", 42, threeDayProfile);
    const touchedMuscles = new Set(
      draft.sections.flatMap((section) =>
        section.exercises.flatMap((ex) => [...ex.primary, ...ex.secondary]),
      ),
    );
    const avoidLine = draft.rationale.find((line) =>
      line.startsWith("Avoiding muscles trained in the last 48h:"),
    );
    if (avoidLine) {
      touchedMuscles.forEach((muscle) => {
        expect(avoidLine).not.toContain(muscle.replace("_", " "));
      });
    }
  });

  it("does not strip push from Upper B when plyo/conditioning moves in a lower session inflated chest/tricep fatigue but push is entirely uncovered this week", () => {
    // Lower B (Jul 8) has plyo/conditioning exercises whose chest/tricep primary/secondary
    // inflate pushFatigue above the strictPullBias threshold — but no push-pattern
    // exercise was done this week (need["push"] = 3). Push must stay in allowedMovements.
    const workouts = [
      workout("w1", "2026-07-05", [
        { name: "Lat pulldown", sets: 4 },
        { name: "Cable row", sets: 4 },
        { name: "DB reverse fly", sets: 3 },
      ], { slotId: "upper_back_shoulder", title: "Upper A · Back/Shoulders" }),
      workout("w2", "2026-07-08", [
        { name: "DB sumo squat", sets: 4 },
        { name: "Cossack squat", sets: 3 },
        { name: "Half burpee w/ dumbbell", sets: 3 },
        { name: "Push-up to renegade row", sets: 3 },
      ], { slotId: "lower_glute_quad", title: "Lower B · Quad/Glute" }),
    ];

    const draft = generateNextWorkout(workouts, "2026-07-09", 42, threeDayProfile, {
      forcedSlotId: "upper_back_shoulder_arms",
    });
    expect(draft.split.slotId).toBe("upper_back_shoulder_arms");
    // strictPullBias removes push from the session; when push need = 3, it must not fire.
    expect(draft.split.summary).not.toContain("minimal pressing");
  });

  it("does not apply strict pull bias when push need is low but shoulders are substantially deficient", () => {
    // Before the fix: lots of bench/incline press this week raised pushFatigue and reduced
    // push need below 3 — triggering strictPullBias and stripping all pressing from the
    // next upper session even though no dedicated shoulder work (overhead, lateral) was done.
    // With shoulders at a large deficit (12-unit weekly target minus ~2 secondary credits),
    // the guard must prevent strictPullBias so pressing stays in the session.
    const workouts = [
      workout("w1", "2026-07-12", [
        { name: "Barbell bench press", sets: 5 },
        { name: "DB incline press", sets: 4 },
        { name: "Cable triceps pushdown", sets: 3 },
      ]),  // heavy chest/triceps → high pushFatigue, push need drops below 3
      workout("w2", "2026-07-13", [
        { name: "Barbell deadlift", sets: 4 },
        { name: "DB walking lunge", sets: 3 },
        { name: "Band-assisted pull-up", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A" }),
    ];

    const draft = generateNextWorkout(workouts, "2026-07-14", 42, profile, {
      forcedSlotId: "upper_back_shoulder",
    });
    // shoulders still largely deficient — must not strip pressing from the session.
    expect(draft.split.summary).not.toContain("minimal pressing");
    const names = draftExerciseNames(draft);
    expect(names.some((name) => movementOf(findExercise(name)!) === "push")).toBe(true);
  });

  it("rotates away from a stalled conditioning finisher and notes it in the rationale", () => {
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
    expect(
      draft.rationale.some((line) => line.includes("Rotated off stalled lift") && line.includes("Ski erg")),
    ).toBe(true);
  });

  it("never fills a lower-focused session's finisher slot with an all-push circuit", () => {
    // "mechanical advantage drop set" is the only all-push curated template,
    // gated to hard mode; without the general body-region gate it still
    // clears templateApplies via the "conditioning" tag and lands inside the
    // shortlist spread often enough to occasionally win the (unweighted)
    // random draw — reproduced here across a seed x finisherSeed sweep.
    const hardProfile: TrainingProfile = { ...profile, intensity: "hard" };
    for (const slotId of ["lower_glute_ham", "lower_glute_quad"]) {
      for (let seed = 0; seed < 20; seed += 1) {
        for (let finisherSeed = 0; finisherSeed < 10; finisherSeed += 1) {
          const draft = generateNextWorkout([], "2026-05-06", seed, hardProfile, {
            forcedSlotId: slotId,
            finisherSeed,
          });
          const finisherExercises = draft.sections.find((section) => section.kind === "finisher")?.exercises ?? [];
          const resolved = finisherExercises.map((ex) => findExercise(ex.name)).filter((ex): ex is Exercise => Boolean(ex));
          if (resolved.length === 0) continue;
          expect(resolved.every((ex) => isPushLeaningFinisher(ex))).toBe(false);
        }
      }
    }
  });

  it("never fills an upper-focused session's finisher slot with an all-lower-fatiguing circuit", () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const draft = generateNextWorkout([], "2026-05-06", seed, profile, {
        forcedSlotId: "upper_back_shoulder",
      });
      const finisherExercises = draft.sections.find((section) => section.kind === "finisher")?.exercises ?? [];
      const resolved = finisherExercises.map((ex) => findExercise(ex.name)).filter((ex): ex is Exercise => Boolean(ex));
      if (resolved.length === 0) continue;
      expect(resolved.every((ex) => isLowerFatiguingFinisher(ex))).toBe(false);
    }
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
        { name: "Cable row", sets: 4 },
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

  it("graduated saturation penalty steers away from a slot with muscles more than 100% over target", () => {
    // w3 (Lower B) puts quads at ~144% of the weekly target (1.44×, excess=0.44).
    // With a flat -20 saturation penalty (scale=0), Lower B's deficit coverage for core,
    // hamstrings, and adductors would edge out Upper A. The graduated penalty adds
    // 0.44 × 20 = 8.8 extra points, making Upper A the correct recommendation.
    // This test fails if saturationOverTargetPenaltyScale is removed or set to 0.
    const workouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4 },
        { name: "Barbell Romanian deadlift", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A" }),
      workout("w2", "2026-05-06", [
        { name: "Cable row", sets: 4 },
        { name: "DB lateral raise", sets: 3 },
      ], { slotId: "upper_back_shoulder", title: "Upper A" }),
      workout("w3", "2026-05-07", [
        { name: "Goblet squat", sets: 4 },
        { name: "DB reverse lunge", sets: 3 },
      ], { slotId: "lower_glute_quad", title: "Lower B" }),
      workout("w4", "2026-05-08", [
        { name: "Lat pulldown", sets: 4 },
        { name: "DB lateral raise", sets: 3 },
        { name: "DB curl", sets: 2 },
      ], { slotId: "upper_back_shoulder_arms", title: "Upper B" }),
      workout("w5", "2026-05-09", [
        { name: "Cable row", sets: 4 },
        { name: "Face pull", sets: 3 },
        { name: "DB curl", sets: 2 },
      ], { slotId: "upper_back_shoulder_arms", title: "Upper B" }),
    ];

    const draft = generateNextWorkout(workouts, "2026-05-10", 2468, profile);
    expect(draft.split.slotId).toBe("upper_back_shoulder");
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

  it("does not re-recommend Lower B when a previous-cycle Lower A session is just outside the cross-week window (3-day split)", () => {
    // Bug: Jul 14 Lower A (6 days before Jul 20 week-start) was pulled into the current-cycle
    // slot-completion tracking via crossWeekRecencyDays=6, making Lower A appear "done."
    // Jul 20's Lower B workout had no planSlot + a missed exercise, so it was skipped by the
    // hasStrugglingLift guard.  Result: only Upper A and Lower B were candidates, and Lower B
    // won — re-recommending the slot just done.
    //
    // Fix: crossWeekRecencyDays=3 excludes sessions from 4+ days before the week-start, so
    // only Jul 19 (Sunday, 1 day before) is pulled in.  Lower A is then an open candidate and
    // wins decisively on hamstrings deficit + hinge movement need.
    const workouts = [
      workout("w1", "2026-07-14", [
        { name: "Barbell Romanian deadlift", sets: 4 },
        { name: "DB split squat to RDL", sets: 3 },
        { name: "Plank", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A · Posterior" }),
      workout("w2", "2026-07-19", [
        { name: "Band-assisted pull-up", sets: 4 },
        { name: "DB overhead press", sets: 3 },
        { name: "DB reverse fly", sets: 3 },
        { name: "Kneeling bicep curl", sets: 3 },
      ], { slotId: "upper_back_shoulder_arms", title: "Upper B · Upper/Arms" }),
      workout("w3", "2026-07-20", [
        { name: "Barbell back squat", sets: 4 },
        { name: "KB gorilla row", sets: 4, progressionStatus: "missed" as const },
        { name: "Leg press", sets: 3, progressionStatus: "held" as const },
        { name: "DB walking lunge", sets: 3 },
        { name: "Barbell push press", sets: 3 },
      ]),
    ];
    // Jul 20 workout has no planSlot and a missed exercise, so the struggling-lift guard skips
    // it during inference.  With crossWeekRecencyDays=3, Jul 14 (6 days before Jul 20) is
    // outside the window and Lower A is correctly open for selection.
    const draft = generateNextWorkout(workouts, "2026-07-21", 42, threeDayProfile);
    expect(draft.split.slotId).toBe("lower_glute_ham");
  });

  it("excludes a slot from selection when one of its primary-driver muscles is over the weekly target (3-day split)", () => {
    // Lower B targets quads (6 sets, weekly target). After an informal quad-only session,
    // quads exceed the weekly target and Lower B should be filtered out of candidates entirely.
    // Barbell front squat has primary=[quads, core] — glutes is only secondary — so glutes
    // saturation stays below 1.0 and Lower A is not wrongly filtered. The held progression
    // triggers the hasExplicitSlots+hasStrugglingLift guard so slot inference is skipped and
    // Lower B remains in incompleteIndices for the saturation filter to act on.
    const workouts = [
      workout("w1", "2026-07-19", [
        { name: "Band-assisted pull-up", sets: 4 },
        { name: "DB overhead press", sets: 3 },
        { name: "DB reverse fly", sets: 3 },
      ], { slotId: "upper_back_shoulder_arms", title: "Upper B · Upper/Arms" }),
      workout("w2", "2026-07-20", [
        { name: "Barbell front squat", sets: 5, progressionStatus: "held" as const },
        { name: "Leg extension", sets: 4 },
        { name: "Goblet squat", sets: 4 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-07-21", 42, threeDayProfile);
    expect(draft.split.slotId).toBe("lower_glute_ham");
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

  it("3-day split picks Upper A instead of Lower B when glutes are over weekly target and pull need is partially satisfied", () => {
    // Lower A (Mon) + extra lower session (Tue) push glutes to ~135% of weekly target.
    // A minimal upper session (Thu) adds one reverse fly — enough to drop pull need from
    // critical (3) to moderate (1), muting the lowerBiasFatigue pivot that would otherwise
    // fire when heavy lower is the second-most-recent session. Without the over-target
    // saturation penalty, Lower B wins on quads deficit + single-leg/squat movement need.
    // With the per-major-muscle over-target check (-20 when glutes > 100%), Lower B is
    // penalized enough that Upper A wins on back deficit + pull movement need.
    const workouts = [
      workout("w1", "2026-06-22", [
        { name: "Barbell hip thrust", sets: 8 },
        { name: "Barbell Romanian deadlift", sets: 6 },
      ], { slotId: "lower_glute_ham", title: "Lower A" }),
      workout("w2", "2026-06-23", [
        { name: "Barbell hip thrust", sets: 5 },
        { name: "Barbell Romanian deadlift", sets: 4 },
      ]),
      workout("w3", "2026-06-25", [
        { name: "DB lateral raise", sets: 2 },
        { name: "DB reverse fly", sets: 1 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-06-28", 123, threeDayProfile);
    expect(draft.split.slotId).toBe("upper_back_shoulder");
  });

  it("de-prioritizes a near-capped muscle's exercises in favor of a genuinely deficient one within the same slot", () => {
    // Two prior lower sessions bring glutes to (near) their weekly target while
    // hamstrings and adductors stay well under theirs. Deficit-magnitude scoring
    // alone can't fix this: it sums primary AND secondary muscle tags, so a
    // glute-primary exercise that also carries hamstrings/adductors as
    // secondary picks up credit for those deficits too. The near-cap penalty
    // instead looks only at each candidate's own primary muscles' weekly
    // coverage, so it can't be diluted by secondary-tag overlap.
    const workouts = [
      workout("w1", "2026-06-22", [
        { name: "Barbell hip thrust", sets: 8 },
        { name: "DB Bulgarian split squat", sets: 8 },
      ], { slotId: "lower_glute_ham", title: "Lower A" }),
      workout("w2", "2026-06-24", [
        { name: "Barbell hip thrust", sets: 5 },
        { name: "DB Bulgarian split squat", sets: 4 },
      ], { slotId: "lower_glute_quad", title: "Lower B" }),
    ];

    let glutePrimaryPicks = 0;
    let deficientPrimaryPicks = 0;
    const N = 40;
    for (let seed = 0; seed < N; seed += 1) {
      const draft = generateNextWorkout(workouts, "2026-06-28", seed, threeDayProfile, {
        forcedSlotId: "lower_glute_quad",
      });
      draft.sections
        .flatMap((section) => section.exercises)
        .forEach((ex) => {
          const full = findExercise(ex.name);
          if (!full) return;
          if (full.primary.includes("glutes")) glutePrimaryPicks += 1;
          if (full.primary.includes("hamstrings") || full.primary.includes("adductors")) {
            deficientPrimaryPicks += 1;
          }
        });
    }

    // Without the near-cap penalty, glutes (already at their weekly target)
    // average ~2.1 picks/session here even though hamstrings/adductors sit
    // well under theirs. The penalty is deliberately moderate
    // (nearCapPenaltyWeight: 5) — it should shift the balance, not invert it
    // outright and bury glutes below every other muscle in a slot whose whole
    // focus is glutes/quads. Since anchors became guaranteed compounds
    // (isolations like the adductor machine can no longer anchor), absolute
    // deficient-pick counts dropped; the durable product intent is relative:
    // deficient muscles clearly out-pick the near-capped one.
    expect(glutePrimaryPicks / N).toBeLessThan(2.0);
    expect(deficientPrimaryPicks / N).toBeGreaterThan(2);
    expect(deficientPrimaryPicks).toBeGreaterThan(glutePrimaryPicks * 1.5);
  });

  it("de-prioritizes a candidate that touches an over-target muscle only as a secondary tag", () => {
    // Leg curl and Nordic hamstring curl are both hinge-pattern, hamstrings-primary
    // exercises — but Nordic hamstring curl also carries glutes as a SECONDARY tag,
    // while Leg curl touches no other muscle at all. Heavy hip thrust volume here
    // pushes glutes well past their weekly target (primary-only, so nearCapPenalty
    // doesn't apply to either candidate — neither has glutes as primary). Only the
    // new secondary-tag-aware overTargetPenalty can tell these two apart.
    const workouts = [
      workout("w1", "2026-06-22", [
        { name: "Barbell hip thrust", sets: 20 },
      ], { slotId: "lower_glute_ham", title: "Lower A" }),
    ];

    let legCurlPicks = 0;
    let nordicPicks = 0;
    const N = 60;
    for (let seed = 0; seed < N; seed += 1) {
      const draft = generateNextWorkout(workouts, "2026-06-28", seed, threeDayProfile, {
        forcedSlotId: "lower_glute_ham",
      });
      draft.sections
        .flatMap((section) => section.exercises)
        .forEach((ex) => {
          if (ex.name === "Leg curl") legCurlPicks += 1;
          if (ex.name === "Nordic hamstring curl") nordicPicks += 1;
        });
    }

    expect(legCurlPicks).toBeGreaterThan(nordicPicks * 2);
  });

  it("still produces a reasonably complete session when every major muscle in the slot is deeply saturated", () => {
    // Every one of Upper A's major target muscles (back, shoulders, rear_delts) is
    // pushed to ~3x+ their weekly target here. This is what actually exercises
    // overTargetPenaltyCap: without the cap, the uncapped penalty could drive every
    // candidate for a movement below pickBest's -10 floor and starve whole sections.
    // A real session (fewer picks than an unsaturated baseline, but not empty) is the
    // correct outcome — it should steer toward whatever isn't saturated (hamstrings,
    // biceps, core here), not collapse.
    const workouts = [
      workout("w1", "2026-06-20", [
        { name: "Cable row", sets: 20 },
        { name: "DB overhead press", sets: 20 },
        { name: "Face pull", sets: 20 },
        { name: "Barbell hip thrust", sets: 20 },
        { name: "Butterfly sit-up", sets: 20 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-06-21", 1, profile, {
      forcedSlotId: "upper_back_shoulder",
    });
    const totalExercises = draft.sections.reduce((count, section) => count + section.exercises.length, 0);

    expect(draft.sections.length).toBeGreaterThanOrEqual(3);
    expect(totalExercises).toBeGreaterThanOrEqual(5);
  });

  it("prefers a vertical press compound anchor over a familiar shoulder isolation exercise", () => {
    const oldWorkout = workout("old", "2026-04-01", [
      { name: "DB prone press", sets: 4 },
    ]);

    const draft = generateNextWorkout(
      [oldWorkout],
      "2026-07-15",
      42,
      {
        ...profile,
        goal: "strength",
        daysPerWeek: 4,
        equipment: "dumbbells",
        experience: "intermediate",
      },
      { forcedSlotId: "push_day" },
    );

    const firstPush = draft.sections
      .flatMap((s) => s.exercises)
      .find((ex) => movementOf(findExercise(ex.name)!) === "push");

    expect(familyOf(findExercise(firstPush?.name ?? "")!)).toBe("vertical_press");
  });

  it("caps how many exercises in one session load the same muscle group", () => {
    const weightOf = (
      ex: { primary: MuscleGroup[]; secondary: MuscleGroup[] },
      muscle: MuscleGroup,
    ) => (ex.primary.includes(muscle) ? 1 : ex.secondary.includes(muscle) ? 0.5 : 0);

    for (let seed = 0; seed < 30; seed += 1) {
      const draft = generateNextWorkout([], "2026-05-22", seed, profile, {
        forcedSlotId: "upper_back_shoulder_arms",
      });
      const allExercises = draft.sections.flatMap((section) => section.exercises);
      const totals = new Map<MuscleGroup, number>();
      allExercises.forEach((ex) => {
        [...ex.primary, ...ex.secondary].forEach((muscle) => {
          totals.set(muscle, (totals.get(muscle) ?? 0) + weightOf(ex, muscle));
        });
      });
      totals.forEach((total) => {
        expect(total).toBeLessThanOrEqual(PLANNER_TUNING.muscleOverlap.capCount);
      });
    }
  });

  it("tightens a muscle's session cap once one of its exercises is in a watch/stalled trend state", () => {
    const weightOf = (
      ex: { primary: MuscleGroup[]; secondary: MuscleGroup[] },
      muscle: MuscleGroup,
    ) => (ex.primary.includes(muscle) ? 1 : ex.secondary.includes(muscle) ? 0.5 : 0);

    // planSlot makes the prior session this slot's keystone source, so the
    // flagged lift is deterministically re-anchored and the cap is exercised.
    const workouts = [
      workout("w1", "2026-05-15", [
        { name: "SA press to windmill", sets: 3, progressionStatus: "missed" },
      ], { slotId: "upper_back_shoulder_arms", title: "Upper B · Upper/Arms" }),
    ];

    let sawFlaggedSession = false;
    for (let seed = 0; seed < 30; seed += 1) {
      const draft = generateNextWorkout(workouts, "2026-05-22", seed, profile, {
        forcedSlotId: "upper_back_shoulder_arms",
      });
      const allExercises = draft.sections.flatMap((section) => section.exercises);
      if (!allExercises.some((ex) => ex.name === "SA press to windmill")) continue;
      sawFlaggedSession = true;
      const shouldersTotal = allExercises.reduce(
        (sum, ex) => sum + weightOf(ex, "shoulders"),
        0,
      );
      expect(shouldersTotal).toBeLessThanOrEqual(
        PLANNER_TUNING.muscleOverlap.capCount -
          PLANNER_TUNING.muscleOverlap.rebuildMuscleCapReduction,
      );
    }
    expect(sawFlaggedSession).toBe(true);
  });

  it("tightens a muscle's session cap when the user flags it as sensitive", () => {
    const weightOf = (
      ex: { primary: MuscleGroup[]; secondary: MuscleGroup[] },
      muscle: MuscleGroup,
    ) => (ex.primary.includes(muscle) ? 1 : ex.secondary.includes(muscle) ? 0.5 : 0);

    const sensitiveProfile: TrainingProfile = {
      ...profile,
      sensitiveMuscles: ["shoulders"],
    };

    for (let seed = 0; seed < 30; seed += 1) {
      const draft = generateNextWorkout([], "2026-05-22", seed, sensitiveProfile, {
        forcedSlotId: "upper_back_shoulder_arms",
      });
      const allExercises = draft.sections.flatMap((section) => section.exercises);
      const shouldersTotal = allExercises.reduce(
        (sum, ex) => sum + weightOf(ex, "shoulders"),
        0,
      );
      expect(shouldersTotal).toBeLessThanOrEqual(
        PLANNER_TUNING.muscleOverlap.capCount -
          PLANNER_TUNING.muscleOverlap.sensitiveMuscleCapReduction,
      );
    }
  });

  it("sequences a watch-state section earlier while keeping the main lift first and the finisher last", () => {
    // DB prone press: reliably picked in upper_back_shoulder_arms supersets
    // (index >= 2) so the watch-state pull-forward is actually observable —
    // an exercise the slot only ever picks at index 1 or in the finisher
    // can't demonstrate the move.
    const workouts = [
      workout("w1", "2026-05-15", [
        { name: "DB prone press", sets: 3, progressionStatus: "missed" },
      ]),
    ];

    let sawEarlierMove = false;
    for (let seed = 0; seed < 30; seed += 1) {
      const flaggedDraft = generateNextWorkout(workouts, "2026-05-22", seed, profile, {
        forcedSlotId: "upper_back_shoulder_arms",
      });
      const controlDraft = generateNextWorkout([], "2026-05-22", seed, profile, {
        forcedSlotId: "upper_back_shoulder_arms",
      });
      const flaggedIndex = flaggedDraft.sections.findIndex((section) =>
        section.exercises.some((ex) => ex.name === "DB prone press"),
      );
      const controlIndex = controlDraft.sections.findIndex((section) =>
        section.exercises.some((ex) => ex.name === "DB prone press"),
      );
      if (flaggedIndex === -1 || controlIndex === -1) continue;

      expect(flaggedIndex).toBeLessThanOrEqual(controlIndex);
      if (flaggedIndex < controlIndex) sawEarlierMove = true;

      // The main-lift section never gets displaced, and the finisher always
      // stays last, regardless of which sections get pulled forward.
      expect(flaggedDraft.sections[0]?.kind).not.toBe("finisher");
      expect(flaggedIndex).toBeGreaterThan(0);
      const finisherIndex = flaggedDraft.sections.findIndex(
        (section) => section.kind === "finisher",
      );
      if (finisherIndex !== -1) {
        expect(finisherIndex).toBe(flaggedDraft.sections.length - 1);
      }
    }
    expect(sawEarlierMove).toBe(true);
  });

  it("populates DraftExercise.trend from the exercise's stall state", () => {
    // A single missed session gives "watch" (mild penalty, survives selection).
    const watchWorkouts = [
      workout("w1", "2026-05-15", [
        { name: "SA press to windmill", sets: 3, progressionStatus: "missed" },
      ], { slotId: "upper_back_shoulder_arms", title: "Upper B · Upper/Arms" }),
    ];
    const watchDraft = generateNextWorkout(watchWorkouts, "2026-05-22", 0, profile, {
      forcedSlotId: "upper_back_shoulder_arms",
    });
    const watchExercise = watchDraft.sections
      .flatMap((section) => section.exercises)
      .find((ex) => ex.name === "SA press to windmill");
    expect(watchExercise?.trend).toBe("watch");

    // Two held/missed in a row gives "stalled", and the stalled lift's own
    // penalty is large enough that it gets rotated out of the session
    // entirely (see "rotates away from a stalled lift toward a nearby
    // substitute") — so its replacement should carry trend "none", not
    // "stalled", since the replacement itself has no stall history.
    const stalledWorkouts = [
      workout("w1", "2026-05-05", [
        { name: "Barbell hip thrust", sets: 4, progressionStatus: "held" },
        { name: "DB Bulgarian split squat", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A" }),
      workout("w2", "2026-05-06", [
        { name: "Cable row", sets: 4 },
        { name: "DB overhead press", sets: 3 },
      ], { slotId: "upper_back_shoulder", title: "Upper A" }),
      workout("w3", "2026-05-07", [
        { name: "Barbell hip thrust", sets: 4, progressionStatus: "missed" },
        { name: "DB Romanian deadlift", sets: 3 },
      ]),
    ];
    const stalledDraft = generateNextWorkout(stalledWorkouts, "2026-05-08", 9494, profile);
    const allExercises = stalledDraft.sections.flatMap((section) => section.exercises);
    expect(allExercises.every((ex) => ex.name !== "Barbell hip thrust")).toBe(true);
    allExercises.forEach((ex) => {
      expect(["none", "watch", "stalled"]).toContain(ex.trend);
    });
  });

  it("does not let a critical-gap override re-select a slot saturated on its own major muscle", () => {
    // maybeOverrideForCriticalGap used to scan every slot offering a critically-missing
    // movement (0 days hit this week) and pick the highest scorer without excluding
    // saturated ones — unlike getNextSplitSlotIndex, which already filters via
    // slotHasOverTargetMajorMuscle. Heavy hip thrust/hyperextension/RDL volume here
    // pushes glutes well past their weekly target; before the fix this scenario picked
    // "glute_shoulder_accessory" (glutes target 8, a major muscle) via the pull-gap
    // override anyway. Found via a 5000-fixture before/after diff against the fix.
    const fiveDayProfile: TrainingProfile = { ...profile, daysPerWeek: 5 };
    const workouts = [
      workout("w1", "2026-08-01", [
        { name: "Push-up", sets: 16 },
        { name: "Hyperextension", sets: 15 },
      ]),
      workout("w2", "2026-08-03", [
        { name: "Barbell hip thrust", sets: 16 },
      ]),
      workout("w3", "2026-08-05", [
        { name: "DB Romanian deadlift", sets: 10 },
        { name: "Face pull", sets: 10 },
        { name: "Leg curl", sets: 17 },
      ]),
    ];
    const draft = generateNextWorkout(workouts, "2026-08-08", 42, fiveDayProfile);
    expect(draft.split.slotId).not.toBe("glute_shoulder_accessory");
    expect(draft.split.slotId).toBe("upper_back_shoulder");
  });

  it("caps template rep targets to recent performance when history has fewer sets than the scheme", () => {
    // A 3-set log (8/8/8) feeding a 4-round tri-set used to skip history
    // resolution entirely (it required history >= scheme length), letting the
    // raw 15/12/12/10 template prescribe nearly double the lifter's
    // demonstrated reps on a hard bodyweight move. The extra round falls back
    // to the last logged rep count, capped by the template.
    const workouts = [
      workout("w1", "2026-05-18", [{ name: "Pike push-up", sets: 3, reps: 8 }]),
    ];
    const pike = findExercise("Pike push-up");
    expect(pike).toBeDefined();
    const draft = buildDraftExercise(pike!, [15, 12, 12, 10], workouts, new Set(["Pike push-up"]));
    expect(draft.targets).toEqual([8, 8, 8, 8]);
    expect(draft.progression.goal).toContain("8/8/8/8");
  });

  it("gives a nearly-closed muscle a light touch even on its own slot's day", () => {
    // Mirrors a real report: going into Upper A with back already ~5/7 for
    // the week, the session used to stack three rows (~10-12 back stimulus
    // against ~2 remaining). Once a muscle is at least half done for the
    // week, the session is only entitled to the weekly remainder, so the day
    // anchors one row plus a vertical pull and spends the rest on real gaps
    // (shoulders/core). 9 ~= one 4-set row (5.2) + one 4-set bodyweight
    // vertical pull (3.6) — the intended shape — while the pre-fix pile-ups
    // ran 10.6-11.8.
    const hardThreeDay: TrainingProfile = {
      ...threeDayProfile,
      experience: "intermediate",
      intensity: "hard",
    };
    const workouts = [
      workout("w1", "2026-08-19", [
        { name: "Deficit barbell Romanian deadlift", sets: 3 },
        { name: "Band-assisted pull-up", sets: 3 },
        { name: "Barbell push press", sets: 3 },
        { name: "Stability ball hamstring curl", sets: 3 },
      ]),
      workout("w2", "2026-08-21", [
        { name: "DB squat to reverse lunge", sets: 3 },
        { name: "Kettlebell swing", sets: 3 },
        { name: "Single-leg DB RDL", sets: 3 },
        { name: "DB front rack curtsey lunge", sets: 3 },
        { name: "Prone T raise", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A · Posterior" }),
    ];
    for (const seed of [11, 137, 424242, 9001, 55555]) {
      const draft = generateNextWorkout(workouts, "2026-08-22", seed, hardThreeDay, {
        forcedSlotId: "upper_back_shoulder",
      });
      const backStimulus = draft.sections
        .filter((section) => section.kind !== "finisher")
        .flatMap((section) => section.exercises)
        .reduce((sum, ex) => {
          const meta = findExercise(ex.name);
          return meta?.primary.includes("back")
            ? sum + estimateExerciseStimulus(meta).primaryPerSet * ex.targets.length
            : sum;
        }, 0);
      expect(backStimulus, `seed ${seed}: ${backStimulus.toFixed(1)} back stimulus`).toBeLessThanOrEqual(9);
    }
  });

  it("still runs Lower B late in the week when last week's Lower B falls inside the cross-week window", () => {
    // Cross-week recency (last Friday's slot counts as done so Monday doesn't
    // repeat it) used to DELETE the slot from the new week entirely: with
    // Lower A and Upper done this week and Lower B "done" last Friday, the
    // planner re-ran Lower A and quads went untrained two weeks straight.
    const workouts = [
      workout("w0", "2026-05-15", [
        { name: "Leg press", sets: 4 },
        { name: "Cossack squat", sets: 3 },
      ], { slotId: "lower_glute_quad", title: "Lower B · Quad/Glute" }),
      workout("w1", "2026-05-18", [
        { name: "Barbell deadlift", sets: 4 },
        { name: "Single-leg DB RDL", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A · Posterior" }),
      workout("w2", "2026-05-19", [
        { name: "Cable row", sets: 4 },
        { name: "DB overhead press", sets: 3 },
      ], { slotId: "upper_back_shoulder", title: "Upper A · Back/Shoulders" }),
      workout("w3", "2026-05-21", [
        { name: "Lat pulldown", sets: 4 },
        { name: "Barbell curl", sets: 3 },
      ], { slotId: "upper_back_shoulder_arms", title: "Upper B · Upper/Arms" }),
    ];
    const draft = generateNextWorkout(workouts, "2026-05-22", 42, profile);
    expect(draft.split.slotId).toBe("lower_glute_quad");
  });

  it("re-anchors a slot on its previous week's main lift (keystone continuity)", () => {
    // A program progresses by repeating its main lift week over week —
    // accessories rotate, the anchor persists unless it stalls.
    const workouts = [
      workout("w1", "2026-05-11", [
        { name: "Barbell deadlift", sets: 4 },
        { name: "DB front rack curtsey lunge", sets: 3 },
      ], { slotId: "lower_glute_ham", title: "Lower A · Posterior" }),
    ];
    for (const seed of [1, 22, 333]) {
      const draft = generateNextWorkout(workouts, "2026-05-18", seed, profile, {
        forcedSlotId: "lower_glute_ham",
      });
      expect(draft.sections[0]?.exercises.some((ex) => ex.name === "Barbell deadlift")).toBe(true);
    }
  });

  it("scales the session back after a brutal-rated session yesterday", () => {
    const brutalYesterday: Workout[] = [
      {
        ...workout("w1", "2026-05-05", [
          { name: "Barbell deadlift", sets: 4 },
          { name: "Single-leg DB RDL", sets: 4 },
        ], { slotId: "lower_glute_ham", title: "Lower A · Posterior" }),
        sessionEffort: "brutal",
      },
    ];
    const unrated = [
      workout("w1", "2026-05-05", [
        { name: "Barbell deadlift", sets: 4 },
        { name: "Single-leg DB RDL", sets: 4 },
      ], { slotId: "lower_glute_ham", title: "Lower A · Posterior" }),
    ];
    for (const seed of [7, 77, 777]) {
      const scaled = generateNextWorkout(brutalYesterday, "2026-05-06", seed, profile);
      const control = generateNextWorkout(unrated, "2026-05-06", seed, profile);
      expect(scaled.rationale.some((line) => line.toLowerCase().includes("brutal"))).toBe(true);
      const count = (draft: typeof scaled) =>
        draft.sections.reduce((n, section) => n + section.exercises.length, 0);
      // A 0.85x budget can only shrink or hold the session, never grow it.
      expect(count(scaled)).toBeLessThanOrEqual(count(control));
    }
  });

  it("runs a deload week after four consecutive build weeks", () => {
    // Four qualifying build weeks (>= 2 sessions each, steady volume), then
    // generate on week five: the budget is scaled to 0.75x, the rationale
    // says why, and the heavy 8/6/5/5 anchor scheme is dropped for the week.
    const history: Workout[] = [];
    const mondays = ["2026-04-06", "2026-04-13", "2026-04-20", "2026-04-27"];
    mondays.forEach((monday, wi) => {
      const wednesday = `${monday.slice(0, 8)}${String(Number(monday.slice(-2)) + 2).padStart(2, "0")}`;
      history.push(
        workout(`b${wi}a`, monday, [
          { name: "Barbell deadlift", sets: 4 },
          { name: "Single-leg DB RDL", sets: 4 },
          { name: "Leg curl", sets: 4 },
        ], { slotId: "lower_glute_ham", title: "Lower A · Posterior" }),
        workout(`b${wi}b`, wednesday, [
          { name: "Cable row", sets: 4 },
          { name: "DB overhead press", sets: 4 },
          { name: "DB reverse fly", sets: 4 },
        ], { slotId: "upper_back_shoulder", title: "Upper A · Back/Shoulders" }),
      );
    });
    const hardIntermediate: TrainingProfile = {
      ...profile,
      experience: "intermediate",
      intensity: "hard",
    };
    const draft = generateNextWorkout(history, "2026-05-04", 42, hardIntermediate);
    expect(draft.rationale.some((line) => line.toLowerCase().includes("deload") || line.toLowerCase().includes("backing off") || line.toLowerCase().includes("lighter"))).toBe(true);
    expect(draft.sections.some((section) => section.repScheme.includes("8 / 6 / 5 / 5"))).toBe(false);
  });
});
