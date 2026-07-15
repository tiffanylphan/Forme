import type { MovementPattern, MuscleGroup, TrainingProfile, Workout } from "./types";

export type SplitSlot = {
  id: string;
  title: string;
  summary: string;
  focusMuscles: MuscleGroup[];
  preferredMovements: MovementPattern[];
  allowedMovements: MovementPattern[];
  // Movements added to exercise selection only — excluded from slot scoring and
  // override logic so they don't compete with dedicated upper/lower slots.
  supplementalMovements?: MovementPattern[];
  targetPrimaryStimulus: Partial<Record<MuscleGroup, number>>;
};

export const PHYSIQUE_UPPER_A_SLOT: SplitSlot = {
  id: "upper_back_shoulder",
  title: "Upper A · Back/Shoulders",
  summary: "Upper session theme with back, shoulders, and glute support.",
  focusMuscles: ["back", "shoulders", "rear_delts", "glutes", "core"],
  preferredMovements: ["pull", "push"],
  allowedMovements: ["pull", "push", "hinge", "carry_core"],
  targetPrimaryStimulus: { back: 7, shoulders: 5, rear_delts: 4, glutes: 2, core: 3 },
};

export const PHYSIQUE_UPPER_B_SLOT: SplitSlot = {
  id: "upper_back_shoulder_arms",
  title: "Upper B · Upper/Arms",
  summary: "Upper session theme with shoulders, arms, and lower-body support.",
  focusMuscles: ["back", "shoulders", "rear_delts", "biceps", "triceps", "glutes", "core"],
  preferredMovements: ["pull", "push"],
  allowedMovements: ["pull", "push", "single_leg", "carry_core"],
  targetPrimaryStimulus: { back: 6, shoulders: 5, rear_delts: 4, biceps: 3, triceps: 2, glutes: 2, core: 2 },
};

export const isLowerSlot = (slot: SplitSlot): boolean =>
  slot.preferredMovements.some((movement) =>
    movement === "hinge" || movement === "squat" || movement === "single_leg",
  );

export const isUpperSlot = (slot: SplitSlot): boolean =>
  slot.preferredMovements.some((movement) => movement === "pull" || movement === "push");

export const compareWorkoutsDesc = (a: Workout, b: Workout): number =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt;

export const getSplitTemplate = (
  profile: TrainingProfile,
): SplitSlot[] => {
  if (profile.goal === "physique") {
    if (profile.daysPerWeek === 3) {
      return [
        {
          id: "lower_glute_ham",
          title: "Lower A · Posterior",
          summary: "Lower session theme with glute and hamstring emphasis.",
          focusMuscles: ["glutes", "hamstrings", "core"],
          preferredMovements: ["hinge", "single_leg", "squat"],
          allowedMovements: ["hinge", "single_leg", "squat", "carry_core"],
          supplementalMovements: ["pull"],
          targetPrimaryStimulus: { glutes: 8, hamstrings: 6, core: 4 },
        },
        PHYSIQUE_UPPER_A_SLOT,
        {
          id: "lower_glute_quad",
          title: "Lower B · Quad/Glute",
          summary: "Lower session theme with glute and quad emphasis.",
          focusMuscles: ["glutes", "quads", "hamstrings", "adductors", "core"],
          preferredMovements: ["single_leg", "squat", "hinge"],
          allowedMovements: ["single_leg", "squat", "hinge", "carry_core"],
          supplementalMovements: ["push"],
          targetPrimaryStimulus: { glutes: 7, quads: 6, hamstrings: 4, adductors: 2, core: 4 },
        },
      ];
    }
    if (profile.daysPerWeek === 4) {
      return [
        {
          id: "lower_glute_ham",
          title: "Lower A · Posterior",
          summary: "Lower session theme with posterior chain and upper-back support.",
          focusMuscles: ["glutes", "hamstrings", "back", "core"],
          preferredMovements: ["hinge", "single_leg", "squat"],
          allowedMovements: ["hinge", "single_leg", "squat", "pull", "carry_core"],
          targetPrimaryStimulus: { glutes: 7, hamstrings: 6, back: 2, core: 4 },
        },
        PHYSIQUE_UPPER_A_SLOT,
        {
          id: "lower_glute_quad",
          title: "Lower B · Quad/Glute",
          summary: "Lower session theme with quads, glutes, and shoulder support.",
          focusMuscles: ["glutes", "quads", "hamstrings", "adductors", "shoulders", "core"],
          preferredMovements: ["single_leg", "squat", "hinge"],
          allowedMovements: ["single_leg", "squat", "hinge", "push", "carry_core"],
          targetPrimaryStimulus: { glutes: 6, quads: 6, hamstrings: 4, adductors: 2, shoulders: 2, core: 4 },
        },
        PHYSIQUE_UPPER_B_SLOT,
      ];
    }
    return [
      {
        id: "lower_glute_ham",
        title: "Lower A · Posterior",
        summary: "Lower session theme with glute and hamstring emphasis.",
        focusMuscles: ["glutes", "hamstrings", "core"],
        preferredMovements: ["hinge", "single_leg", "squat"],
        allowedMovements: ["hinge", "single_leg", "squat", "carry_core"],
        targetPrimaryStimulus: { glutes: 8, hamstrings: 6, core: 4 },
      },
      PHYSIQUE_UPPER_A_SLOT,
      {
        id: "lower_glute_quad",
        title: "Lower B · Quad/Glute",
        summary: "Lower session theme with glute and quad emphasis.",
        focusMuscles: ["glutes", "quads", "hamstrings", "adductors", "core"],
        preferredMovements: ["single_leg", "squat", "hinge"],
        allowedMovements: ["single_leg", "squat", "hinge", "carry_core"],
        targetPrimaryStimulus: { glutes: 7, quads: 6, hamstrings: 4, adductors: 2, core: 4 },
      },
      PHYSIQUE_UPPER_B_SLOT,
      {
        id: "glute_shoulder_accessory",
        title: "Accessory day",
        summary: "Glute and shoulder accessory volume.",
        focusMuscles: ["glutes", "shoulders", "rear_delts", "core"],
        preferredMovements: ["single_leg", "hinge", "push", "pull"],
        allowedMovements: ["single_leg", "hinge", "push", "pull", "carry_core"],
        targetPrimaryStimulus: { glutes: 8, shoulders: 6, rear_delts: 4, core: 4 },
      },
    ];
  }

  if (profile.goal === "strength") {
    if (profile.daysPerWeek === 3) {
      return [
        {
          id: "lower_strength",
          title: "Lower strength",
          summary: "Squat and hinge focus.",
          focusMuscles: ["quads", "glutes", "hamstrings", "core"],
          preferredMovements: ["squat", "hinge"],
          allowedMovements: ["squat", "hinge", "carry_core"],
          targetPrimaryStimulus: { quads: 7, glutes: 5, hamstrings: 5, core: 3 },
        },
        {
          id: "upper_strength",
          title: "Upper strength",
          summary: "Push and pull focus.",
          focusMuscles: ["back", "shoulders", "chest", "triceps"],
          preferredMovements: ["pull", "push"],
          allowedMovements: ["pull", "push", "carry_core"],
          targetPrimaryStimulus: { back: 6, shoulders: 5, chest: 5, triceps: 3, core: 2 },
        },
        {
          id: "full_strength",
          title: "Full body strength",
          summary: "Heavy full-body practice.",
          focusMuscles: ["glutes", "back", "quads", "shoulders", "core"],
          preferredMovements: ["hinge", "squat", "pull", "push"],
          allowedMovements: ["hinge", "squat", "pull", "push", "carry_core"],
          targetPrimaryStimulus: { glutes: 5, back: 5, quads: 4, shoulders: 4, core: 3 },
        },
      ];
    }
    return [
      {
        id: "squat_day",
        title: "Squat day",
        summary: "Squat-dominant lower body work.",
        focusMuscles: ["quads", "glutes", "core"],
        preferredMovements: ["squat", "single_leg"],
        allowedMovements: ["squat", "single_leg", "carry_core"],
        targetPrimaryStimulus: { quads: 7, glutes: 5, core: 3 },
      },
      {
        id: "push_day",
        title: "Push day",
        summary: "Pressing focus.",
        focusMuscles: ["shoulders", "chest", "triceps", "core"],
        preferredMovements: ["push"],
        allowedMovements: ["push", "carry_core"],
        targetPrimaryStimulus: { shoulders: 6, chest: 5, triceps: 4, core: 3 },
      },
      {
        id: "hinge_day",
        title: "Hinge day",
        summary: "Posterior chain focus.",
        focusMuscles: ["hamstrings", "glutes", "back", "core"],
        preferredMovements: ["hinge"],
        allowedMovements: ["hinge", "single_leg", "carry_core"],
        targetPrimaryStimulus: { hamstrings: 7, glutes: 5, back: 4, core: 3 },
      },
      {
        id: "pull_day",
        title: "Pull day",
        summary: "Back and row focus.",
        focusMuscles: ["back", "rear_delts", "biceps", "core"],
        preferredMovements: ["pull"],
        allowedMovements: ["pull", "carry_core"],
        targetPrimaryStimulus: { back: 8, rear_delts: 4, biceps: 4, core: 3 },
      },
    ];
  }

  if (profile.daysPerWeek === 3) {
    return [
      {
        id: "full_a",
        title: "Full body A",
        summary: "Lower plus upper balance.",
        focusMuscles: ["glutes", "back", "shoulders", "core"],
        preferredMovements: ["hinge", "pull", "push"],
        allowedMovements: ["hinge", "squat", "single_leg", "pull", "push", "carry_core"],
        targetPrimaryStimulus: { glutes: 6, back: 5, shoulders: 4, core: 3 },
      },
      {
        id: "full_b",
        title: "Full body B",
        summary: "Single-leg and upper balance.",
        focusMuscles: ["glutes", "quads", "back", "shoulders", "core"],
        preferredMovements: ["single_leg", "pull", "push"],
        allowedMovements: ["hinge", "squat", "single_leg", "pull", "push", "carry_core"],
        targetPrimaryStimulus: { glutes: 5, quads: 5, back: 4, shoulders: 4, core: 3 },
      },
      {
        id: "full_c",
        title: "Full body C",
        summary: "Squat and pull balance.",
        focusMuscles: ["quads", "glutes", "back", "core"],
        preferredMovements: ["squat", "pull", "push"],
        allowedMovements: ["hinge", "squat", "single_leg", "pull", "push", "carry_core"],
        targetPrimaryStimulus: { quads: 5, glutes: 4, back: 5, core: 3 },
      },
    ];
  }

  return [
    {
      id: "lower_balanced",
      title: "Lower body",
      summary: "Balanced lower-body work.",
      focusMuscles: ["glutes", "quads", "hamstrings", "adductors", "core"],
      preferredMovements: ["hinge", "squat", "single_leg"],
      allowedMovements: ["hinge", "squat", "single_leg", "carry_core"],
      targetPrimaryStimulus: { glutes: 6, quads: 5, hamstrings: 4, adductors: 1, core: 3 },
    },
    {
      id: "upper_balanced",
      title: "Upper body",
      summary: "Balanced upper-body work.",
      focusMuscles: ["back", "shoulders", "chest", "core"],
      preferredMovements: ["pull", "push"],
      allowedMovements: ["pull", "push", "carry_core"],
      targetPrimaryStimulus: { back: 6, shoulders: 4, chest: 4, core: 3 },
    },
    {
      id: "full_balanced",
      title: "Full body",
      summary: "Full-body catch-up day.",
      focusMuscles: ["glutes", "back", "shoulders", "core"],
      preferredMovements: ["hinge", "single_leg", "pull", "push"],
      allowedMovements: ["hinge", "squat", "single_leg", "pull", "push", "carry_core"],
      targetPrimaryStimulus: { glutes: 5, back: 5, shoulders: 4, core: 3 },
    },
    {
      id: "upper_pull_bias",
      title: "Upper pull bias",
      summary: "Back and shoulder balance.",
      focusMuscles: ["back", "shoulders", "rear_delts", "core"],
      preferredMovements: ["pull", "push"],
      allowedMovements: ["pull", "push", "carry_core"],
      targetPrimaryStimulus: { back: 6, shoulders: 4, rear_delts: 3, core: 3 },
    },
  ];
};

export const resolveSplitVariants = (
  split: SplitSlot[],
  profile: TrainingProfile,
  workouts: Workout[],
): SplitSlot[] => {
  if (!(profile.goal === "physique" && profile.daysPerWeek === 3)) return split;

  const lastUpperSlotId = [...workouts]
    .sort(compareWorkoutsDesc)
    .map((workout) => workout.planSlot?.slotId)
    .find((slotId) =>
      slotId === PHYSIQUE_UPPER_A_SLOT.id || slotId === PHYSIQUE_UPPER_B_SLOT.id,
    );

  const upperSlot =
    lastUpperSlotId === PHYSIQUE_UPPER_A_SLOT.id
      ? PHYSIQUE_UPPER_B_SLOT
      : PHYSIQUE_UPPER_A_SLOT;

  return split.map((slot, index) => (index === 1 ? upperSlot : slot));
};

export function getWeeklyTargetStimulus(
  profile: TrainingProfile,
  workouts: Workout[],
): Partial<Record<MuscleGroup, number>> {
  const split = resolveSplitVariants(getSplitTemplate(profile), profile, workouts);
  const totals: Partial<Record<MuscleGroup, number>> = {};

  split.forEach((slot) => {
    Object.entries(slot.targetPrimaryStimulus).forEach(([muscle, sets]) => {
      if (typeof sets !== "number" || sets <= 0) return;
      const key = muscle as MuscleGroup;
      totals[key] = (totals[key] ?? 0) + sets;
    });
  });

  return totals;
}

export const getWeeklyTargetSets = getWeeklyTargetStimulus;
