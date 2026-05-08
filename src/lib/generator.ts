import { EXERCISES } from "./exercises";
import { movementOf } from "./movement";
import { MOVEMENT_PATTERNS, MUSCLE_GROUPS } from "./types";
import {
  computeCoverage,
  recentMusclesWithin,
  weekContaining,
} from "./coverage";
import { getExerciseHistory, getRecentProgressionStatuses } from "./progression";
import type { ExerciseHistoryEntry } from "./progression";
import type {
  Exercise,
  GoalMode,
  MovementPattern,
  MuscleGroup,
  Pattern,
  TrainingProfile,
  TrainingEnvironment,
  WeightUnit,
  Workout,
} from "./types";

export type DraftSection = {
  kind: "compound" | "accessory" | "superset" | "finisher";
  rounds: number;
  repScheme: string;
  exercises: DraftExercise[];
};

export type DraftExercise = {
  name: string;
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  pattern: Pattern;
  movement: MovementPattern | null;
  // One target per round; numbers = reps, strings = "30s" etc.
  targets: (number | string)[];
  suggestedWeight: number | null;
  unit: WeightUnit;
  isFamiliar: boolean;
  progression: {
    lastSummary: string | null;
    goal: string;
    nextStep: string;
    recentHistory: ExerciseHistoryEntry[];
  };
};

export type WorkoutDraft = {
  split: {
    slotId: string;
    title: string;
    summary: string;
    sessionIndex: number;
    totalSessions: number;
    targetPrimarySets: Partial<Record<MuscleGroup, number>>;
  };
  rationale: string[];
  sections: DraftSection[];
};

type SplitSlot = {
  id: string;
  title: string;
  summary: string;
  focusMuscles: MuscleGroup[];
  preferredMovements: MovementPattern[];
  allowedMovements: MovementPattern[];
  targetPrimarySets: Partial<Record<MuscleGroup, number>>;
};

const PHYSIQUE_UPPER_A_SLOT: SplitSlot = {
  id: "upper_back_shoulder",
  title: "Upper A",
  summary: "Back and shoulder emphasis.",
  focusMuscles: ["back", "shoulders", "rear_delts", "core"],
  preferredMovements: ["pull", "push"],
  allowedMovements: ["pull", "push", "carry_core"],
  targetPrimarySets: { back: 8, shoulders: 5, rear_delts: 4, core: 3 },
};

const PHYSIQUE_UPPER_B_SLOT: SplitSlot = {
  id: "upper_back_shoulder_arms",
  title: "Upper B",
  summary: "Back, shoulder, and arm emphasis.",
  focusMuscles: ["back", "shoulders", "rear_delts", "biceps", "triceps"],
  preferredMovements: ["pull", "push"],
  allowedMovements: ["pull", "push", "carry_core"],
  targetPrimarySets: { back: 7, shoulders: 5, rear_delts: 4, biceps: 3, triceps: 2, core: 2 },
};

// Deterministic PRNG so a given seed → same output.
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const lastWorkingWeight = (
  name: string,
  workouts: Workout[],
): { weight: number; unit: WeightUnit } | null => {
  const sorted = [...workouts].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt,
  );
  for (const w of sorted) {
    for (const e of w.exercises) {
      if (e.exerciseName !== name) continue;
      const weighted = e.sets.filter(
        (s): s is typeof s & { weight: number } => typeof s.weight === "number",
      );
      if (weighted.length > 0) {
        const last = weighted[weighted.length - 1];
        return { weight: last.weight, unit: last.unit };
      }
    }
  }
  return null;
};

const lastPerformance = (
  name: string,
  workouts: Workout[],
): { date: string; reps: (number | null)[]; weight: number | null; unit: WeightUnit } | null => {
  const sorted = [...workouts].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt,
  );
  for (const w of sorted) {
    for (const e of w.exercises) {
      if (e.exerciseName !== name) continue;
      const weightedSets = e.sets.filter(
        (s): s is typeof s & { weight: number } => typeof s.weight === "number",
      );
      const lastWeightedSet = weightedSets[weightedSets.length - 1];
      return {
        date: w.date,
        reps: e.sets.map((set) => set.reps),
        weight: lastWeightedSet?.weight ?? null,
        unit: lastWeightedSet?.unit ?? "lb",
      };
    }
  }
  return null;
};

const summarizePerformance = (performance: ReturnType<typeof lastPerformance>): string | null => {
  if (!performance) return null;
  const repList = performance.reps
    .map((rep) => (typeof rep === "number" ? rep.toString() : "—"))
    .join("/");
  const load = performance.weight != null ? `${performance.weight} ${performance.unit}` : "bodyweight";
  return `${load} x ${repList}`;
};

const buildProgression = (
  ex: Exercise,
  targets: (number | string)[],
  workouts: Workout[],
): DraftExercise["progression"] => {
  const performance = lastPerformance(ex.name, workouts);
  const recentHistory = getExerciseHistory(ex.name, workouts, undefined, 3);
  const recentStatuses = getRecentProgressionStatuses(ex.name, workouts, undefined, 3);
  const latestStatus = recentStatuses[0];
  const repeatedStall =
    recentStatuses.length >= 2 &&
    recentStatuses.slice(0, 2).every((status) => status === "held" || status === "missed");
  const numericTargets = targets.filter((target): target is number => typeof target === "number");
  const timedTargets = targets.filter((target): target is string => typeof target === "string");
  const lastSummary = summarizePerformance(performance);
  const plannedRepSummary = numericTargets.join("/");

  if (numericTargets.length === 0 && timedTargets.length > 0) {
    return {
      lastSummary,
      goal: `Complete ${timedTargets.join(" / ")} with steady form.`,
      nextStep: repeatedStall
        ? "You have been flat here. Keep the intervals even and clean before pushing pace again."
        : performance
          ? "Keep the effort smooth and extend the pace only if the rounds feel controlled."
          : "Start controlled and keep all timed rounds even.",
      recentHistory,
    };
  }

  if (latestStatus === "missed" && repeatedStall && performance?.weight != null) {
    return {
      lastSummary,
      goal: `Rebuild ${plannedRepSummary} reps with clean form.`,
      nextStep: `You have missed this twice. Drop 5-10 ${performance.unit} or reduce effort, then rebuild the reps cleanly.`,
      recentHistory,
    };
  }

  if (latestStatus === "missed" && performance?.weight != null) {
    return {
      lastSummary,
      goal: `Recover ${plannedRepSummary} reps before pushing load.`,
      nextStep: `Missed last time. Hold at ${performance.weight} ${performance.unit} and win back the reps first.`,
      recentHistory,
    };
  }

  if (latestStatus === "held" && repeatedStall && performance?.weight != null) {
    return {
      lastSummary,
      goal: `Break past ${plannedRepSummary} reps.`,
      nextStep: `This lift has been flat. Keep ${performance.weight} ${performance.unit} and beat total reps before you add load.`,
      recentHistory,
    };
  }

  if (latestStatus === "progressed" && performance?.weight != null) {
    return {
      lastSummary,
      goal: `Consolidate the last jump with ${plannedRepSummary} reps.`,
      nextStep: `You progressed last time. Stay aggressive, and add load again only if today's sets stay crisp.`,
      recentHistory,
    };
  }

  const hitAllPlanned =
    performance &&
    numericTargets.length > 0 &&
    numericTargets.every((target, index) => {
      const actual = performance.reps[index];
      return typeof actual === "number" && actual >= target;
    });

  if (performance?.weight != null && hitAllPlanned) {
    return {
      lastSummary,
      goal: `Match or beat ${plannedRepSummary} reps with solid form.`,
      nextStep: `Last time cleared the target. Add 2.5-5 ${performance.unit} if technique stays crisp.`,
      recentHistory,
    };
  }

  if (performance?.weight != null) {
    return {
      lastSummary,
      goal: `Work toward ${plannedRepSummary} reps before increasing load.`,
      nextStep: `Stay at ${performance.weight} ${performance.unit} and add 1-2 total reps across the work sets.`,
      recentHistory,
    };
  }

  return {
    lastSummary,
    goal: numericTargets.length > 0
      ? `Work toward ${plannedRepSummary} reps with repeatable form.`
      : "Build a repeatable baseline.",
    nextStep: "Start conservative and leave 1-2 reps in reserve on each set.",
    recentHistory,
  };
};

const COMPOUND_MOVEMENTS: MovementPattern[] = ["squat", "hinge", "push", "pull"];
const ACCESSORY_MOVEMENTS: MovementPattern[] = [
  "squat",
  "hinge",
  "push",
  "pull",
  "single_leg",
];

const MOVEMENT_PRIORITY: Record<MovementPattern, number> = {
  squat: 0.8,
  hinge: 1.4,
  push: 0.8,
  pull: 1.2,
  single_leg: 1.3,
  carry_core: 0.9,
};

const PRIMARY_MUSCLE_PRIORITY: Partial<Record<MuscleGroup, number>> = {
  glutes: 1.8,
  hamstrings: 1.2,
  back: 1.5,
  shoulders: 1.5,
  rear_delts: 1.2,
  core: 1.1,
  quads: 0.7,
  chest: 0.3,
  triceps: 0.2,
};

const SECONDARY_MUSCLE_PRIORITY: Partial<Record<MuscleGroup, number>> = {
  glutes: 0.7,
  hamstrings: 0.5,
  back: 0.6,
  shoulders: 0.6,
  rear_delts: 0.5,
  core: 0.5,
};

const isHeavyEquipment = (ex: Exercise): boolean =>
  ex.equipment === "barbell" ||
  ex.equipment === "dumbbell" ||
  ex.equipment === "machine";

const isTechnicalBarbell = (ex: Exercise): boolean =>
  ex.equipment === "barbell" &&
  (ex.name.includes("deadlift") ||
    ex.name.includes("squat") ||
    ex.name.includes("overhead press") ||
    ex.name.includes("walking lunge"));

const environmentAllows = (
  ex: Exercise,
  environment: TrainingEnvironment,
): boolean => {
  if (environment === "full_gym") return true;
  if (environment === "dumbbells") {
    return ["dumbbell", "bodyweight", "band", "kettlebell"].includes(
      ex.equipment,
    );
  }
  return ["dumbbell", "bodyweight", "band"].includes(ex.equipment);
};

const formatMovement = (m: MovementPattern): string =>
  m === "carry_core"
    ? "carry/core"
    : m === "single_leg"
      ? "single-leg"
      : m;

const hasPrimary = (ex: Exercise, muscle: MuscleGroup): boolean =>
  ex.primary.includes(muscle);

const hasSecondary = (ex: Exercise, muscle: MuscleGroup): boolean =>
  ex.secondary.includes(muscle);

const hasAnyMuscle = (ex: Exercise, muscles: MuscleGroup[]): boolean =>
  muscles.some((muscle) => hasPrimary(ex, muscle) || hasSecondary(ex, muscle));

const isChestDominantPush = (ex: Exercise): boolean =>
  ex.pattern === "push" &&
  (hasPrimary(ex, "chest") ||
    (hasPrimary(ex, "triceps") && !hasPrimary(ex, "shoulders")));

const isShoulderBiasedPush = (ex: Exercise): boolean =>
  ex.pattern === "push" &&
  (hasPrimary(ex, "shoulders") ||
    hasPrimary(ex, "rear_delts") ||
    ex.name === "Landmine press");

const isGluteBiasedLower = (ex: Exercise): boolean =>
  (movementOf(ex) === "hinge" || movementOf(ex) === "single_leg") &&
  hasAnyMuscle(ex, ["glutes", "hamstrings"]);

const isBackOrShoulderFocused = (ex: Exercise): boolean =>
  hasAnyMuscle(ex, ["back", "shoulders", "rear_delts"]);

const isDirectArmFocus = (ex: Exercise): boolean =>
  hasPrimary(ex, "biceps") || hasPrimary(ex, "triceps");

const isDirectGluteFocus = (ex: Exercise): boolean =>
  hasPrimary(ex, "glutes") &&
  (movementOf(ex) === "hinge" || movementOf(ex) === "single_leg");

const isPhysiqueFriendly = (ex: Exercise): boolean => {
  const movement = movementOf(ex);
  if (!movement) return false;
  if (isChestDominantPush(ex)) return false;
  if (movement === "push") return isShoulderBiasedPush(ex);
  return true;
};

const familyOf = (ex: Exercise): string => {
  const name = ex.name.toLowerCase();
  if (name.includes("hip thrust") || name.includes("glute bridge")) return "hip_thrust";
  if (name.includes("romanian deadlift") || name.includes("rdl")) return "rdl";
  if (name.includes("deadlift")) return "deadlift";
  if (name.includes("split squat") || name.includes("bulgarian")) return "split_squat";
  if (name.includes("lunge")) return "lunge";
  if (name.includes("step-up")) return "step_up";
  if (name.includes("row")) return "row";
  if (name.includes("pulldown") || name.includes("pull-up") || name.includes("chin-up"))
    return "vertical_pull";
  if (name.includes("face pull") || name.includes("reverse fly") || name.includes("pull-apart"))
    return "rear_delt";
  if (name.includes("lateral raise") || name.includes("front raise") || name.includes("arnold"))
    return "shoulder_isolation";
  if (name.includes("overhead press") || name.includes("landmine press"))
    return "vertical_press";
  if (name.includes("squat") || name.includes("leg press") || name.includes("hack squat"))
    return "squat_pattern";
  if (name.includes("leg curl")) return "leg_curl";
  if (name.includes("carry")) return "carry";
  if (ex.pattern === "core") return "core";
  return `${ex.pattern}_${ex.equipment}`;
};

const getIncompleteSplitSlotIndices = (
  split: SplitSlot[],
  workouts: Workout[],
): number[] => {
  const completedSlotIds = new Set(
    workouts
      .map((workout) => workout.planSlot?.slotId)
      .filter((slotId): slotId is string => Boolean(slotId)),
  );

  if (completedSlotIds.size > 0) {
    const incompleteIndices = split
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => !completedSlotIds.has(slot.id))
      .map(({ index }) => index);
    if (incompleteIndices.length > 0) return incompleteIndices;
  }

  return [];
};

const scoreSplitSlot = (
  slot: SplitSlot,
  index: number,
  need: Record<MovementPattern, number>,
): number => {
  const preferredScores = slot.preferredMovements
    .map((movement) => (need[movement] ?? 0) * (MOVEMENT_PRIORITY[movement] ?? 1))
    .sort((a, b) => b - a);
  const allowedScores = slot.allowedMovements
    .filter((movement) => !slot.preferredMovements.includes(movement))
    .map((movement) => (need[movement] ?? 0) * (MOVEMENT_PRIORITY[movement] ?? 1))
    .sort((a, b) => b - a);

  let score = 0;
  if (preferredScores[0]) score += preferredScores[0] * 5;
  if (preferredScores[1]) score += preferredScores[1] * 2;
  if (allowedScores[0]) score += allowedScores[0];

  // Keep a slight bias toward the earliest missing slot so the split does not
  // drift unless another slot closes a more urgent weekly gap.
  score -= index * 0.25;

  return score;
};

const getNextSplitSlotIndex = (
  split: SplitSlot[],
  workouts: Workout[],
  need: Record<MovementPattern, number>,
): number => {
  const incompleteIndices = getIncompleteSplitSlotIndices(split, workouts);

  if (incompleteIndices.length > 0) {
    let bestIndex = incompleteIndices[0];
    let bestScore = -Infinity;

    for (const index of incompleteIndices) {
      const score = scoreSplitSlot(split[index], index, need);
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    }

    if (bestScore > 0) return bestIndex;
    const firstIncompleteIndex = incompleteIndices[0];
    if (firstIncompleteIndex >= 0) return firstIncompleteIndex;
  }

  return workouts.length % split.length;
};

const maybeOverrideForCriticalGap = (
  split: SplitSlot[],
  baseIndex: number,
  need: Record<MovementPattern, number>,
): number => {
  const baseSlot = split[baseIndex];
  const criticalMovements = MOVEMENT_PATTERNS
    .filter((movement) => (need[movement] ?? 0) >= 3)
    .sort(
      (a, b) => (MOVEMENT_PRIORITY[b] ?? 0) - (MOVEMENT_PRIORITY[a] ?? 0),
    );

  if (criticalMovements.length === 0) return baseIndex;

  for (const movement of criticalMovements) {
    if (baseSlot.allowedMovements.includes(movement)) return baseIndex;

    let bestIndex = baseIndex;
    let bestScore = scoreSplitSlot(baseSlot, baseIndex, need);

    split.forEach((slot, index) => {
      if (!slot.allowedMovements.includes(movement)) return;
      let score = scoreSplitSlot(slot, index, need);
      if (slot.preferredMovements.includes(movement)) score += 6;
      if (score > bestScore) {
        bestIndex = index;
        bestScore = score;
      }
    });

    if (bestIndex !== baseIndex) return bestIndex;
  }

  return baseIndex;
};

const compareWorkoutsDesc = (a: Workout, b: Workout): number =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt;

const resolveSplitVariants = (
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

const isStrengthFriendly = (ex: Exercise): boolean => {
  if (!isHeavyEquipment(ex)) return false;
  if (ex.name.includes("raise") || ex.name.includes("fly")) return false;
  return movementOf(ex) !== null;
};

const goalAllows = (ex: Exercise, goal: GoalMode): boolean => {
  if (goal === "physique") return isPhysiqueFriendly(ex);
  if (goal === "strength") return isStrengthFriendly(ex);
  return movementOf(ex) !== null;
};

const getSplitTemplate = (
  profile: TrainingProfile,
): SplitSlot[] => {
  if (profile.goal === "physique") {
    if (profile.daysPerWeek === 3) {
      return [
        {
          id: "lower_glute_ham",
          title: "Lower A",
          summary: "Glute and hamstring emphasis.",
          focusMuscles: ["glutes", "hamstrings", "core"],
          preferredMovements: ["hinge", "single_leg", "squat"],
          allowedMovements: ["hinge", "single_leg", "squat", "carry_core"],
          targetPrimarySets: { glutes: 8, hamstrings: 6, core: 4 },
        },
        PHYSIQUE_UPPER_A_SLOT,
        {
          id: "lower_glute_quad",
          title: "Lower B",
          summary: "Glute and quad emphasis.",
          focusMuscles: ["glutes", "quads", "hamstrings", "core"],
          preferredMovements: ["single_leg", "squat", "hinge"],
          allowedMovements: ["single_leg", "squat", "hinge", "carry_core"],
          targetPrimarySets: { glutes: 7, quads: 6, hamstrings: 4, core: 4 },
        },
      ];
    }
    if (profile.daysPerWeek === 4) {
      return [
        {
          id: "lower_glute_ham",
          title: "Lower A",
          summary: "Glute and hamstring emphasis.",
          focusMuscles: ["glutes", "hamstrings", "core"],
          preferredMovements: ["hinge", "single_leg", "squat"],
          allowedMovements: ["hinge", "single_leg", "squat", "carry_core"],
          targetPrimarySets: { glutes: 8, hamstrings: 6, core: 4 },
        },
        PHYSIQUE_UPPER_A_SLOT,
        {
          id: "lower_glute_quad",
          title: "Lower B",
          summary: "Glute and quad emphasis.",
          focusMuscles: ["glutes", "quads", "hamstrings", "core"],
          preferredMovements: ["single_leg", "squat", "hinge"],
          allowedMovements: ["single_leg", "squat", "hinge", "carry_core"],
          targetPrimarySets: { glutes: 7, quads: 6, hamstrings: 4, core: 4 },
        },
        PHYSIQUE_UPPER_B_SLOT,
      ];
    }
    return [
      {
        id: "lower_glute_ham",
        title: "Lower A",
        summary: "Glute and hamstring emphasis.",
        focusMuscles: ["glutes", "hamstrings", "core"],
        preferredMovements: ["hinge", "single_leg", "squat"],
        allowedMovements: ["hinge", "single_leg", "squat", "carry_core"],
        targetPrimarySets: { glutes: 8, hamstrings: 6, core: 4 },
      },
      PHYSIQUE_UPPER_A_SLOT,
      {
        id: "lower_glute_quad",
        title: "Lower B",
        summary: "Glute and quad emphasis.",
        focusMuscles: ["glutes", "quads", "hamstrings", "core"],
        preferredMovements: ["single_leg", "squat", "hinge"],
        allowedMovements: ["single_leg", "squat", "hinge", "carry_core"],
        targetPrimarySets: { glutes: 7, quads: 6, hamstrings: 4, core: 4 },
      },
      PHYSIQUE_UPPER_B_SLOT,
      {
        id: "glute_shoulder_accessory",
        title: "Accessory day",
        summary: "Glute and shoulder accessory volume.",
        focusMuscles: ["glutes", "shoulders", "rear_delts", "core"],
        preferredMovements: ["single_leg", "hinge", "push", "pull"],
        allowedMovements: ["single_leg", "hinge", "push", "pull", "carry_core"],
        targetPrimarySets: { glutes: 8, shoulders: 6, rear_delts: 4, core: 4 },
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
          targetPrimarySets: { quads: 7, glutes: 5, hamstrings: 5, core: 3 },
        },
        {
          id: "upper_strength",
          title: "Upper strength",
          summary: "Push and pull focus.",
          focusMuscles: ["back", "shoulders", "chest", "triceps"],
          preferredMovements: ["pull", "push"],
          allowedMovements: ["pull", "push", "carry_core"],
          targetPrimarySets: { back: 6, shoulders: 5, chest: 5, triceps: 3, core: 2 },
        },
        {
          id: "full_strength",
          title: "Full body strength",
          summary: "Heavy full-body practice.",
          focusMuscles: ["glutes", "back", "quads", "shoulders", "core"],
          preferredMovements: ["hinge", "squat", "pull", "push"],
          allowedMovements: ["hinge", "squat", "pull", "push", "carry_core"],
          targetPrimarySets: { glutes: 5, back: 5, quads: 4, shoulders: 4, core: 3 },
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
        targetPrimarySets: { quads: 7, glutes: 5, core: 3 },
      },
      {
        id: "push_day",
        title: "Push day",
        summary: "Pressing focus.",
        focusMuscles: ["shoulders", "chest", "triceps", "core"],
        preferredMovements: ["push"],
        allowedMovements: ["push", "carry_core"],
        targetPrimarySets: { shoulders: 6, chest: 5, triceps: 4, core: 3 },
      },
      {
        id: "hinge_day",
        title: "Hinge day",
        summary: "Posterior chain focus.",
        focusMuscles: ["hamstrings", "glutes", "back", "core"],
        preferredMovements: ["hinge"],
        allowedMovements: ["hinge", "single_leg", "carry_core"],
        targetPrimarySets: { hamstrings: 7, glutes: 5, back: 4, core: 3 },
      },
      {
        id: "pull_day",
        title: "Pull day",
        summary: "Back and row focus.",
        focusMuscles: ["back", "rear_delts", "biceps", "core"],
        preferredMovements: ["pull"],
        allowedMovements: ["pull", "carry_core"],
        targetPrimarySets: { back: 8, rear_delts: 4, biceps: 4, core: 3 },
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
        targetPrimarySets: { glutes: 6, back: 5, shoulders: 4, core: 3 },
      },
      {
        id: "full_b",
        title: "Full body B",
        summary: "Single-leg and upper balance.",
        focusMuscles: ["glutes", "quads", "back", "shoulders", "core"],
        preferredMovements: ["single_leg", "pull", "push"],
        allowedMovements: ["hinge", "squat", "single_leg", "pull", "push", "carry_core"],
        targetPrimarySets: { glutes: 5, quads: 5, back: 4, shoulders: 4, core: 3 },
      },
      {
        id: "full_c",
        title: "Full body C",
        summary: "Squat and pull balance.",
        focusMuscles: ["quads", "glutes", "back", "core"],
        preferredMovements: ["squat", "pull", "push"],
        allowedMovements: ["hinge", "squat", "single_leg", "pull", "push", "carry_core"],
        targetPrimarySets: { quads: 5, glutes: 4, back: 5, core: 3 },
      },
    ];
  }

  return [
    {
      id: "lower_balanced",
      title: "Lower body",
      summary: "Balanced lower-body work.",
      focusMuscles: ["glutes", "quads", "hamstrings", "core"],
      preferredMovements: ["hinge", "squat", "single_leg"],
      allowedMovements: ["hinge", "squat", "single_leg", "carry_core"],
      targetPrimarySets: { glutes: 6, quads: 5, hamstrings: 4, core: 3 },
    },
    {
      id: "upper_balanced",
      title: "Upper body",
      summary: "Balanced upper-body work.",
      focusMuscles: ["back", "shoulders", "chest", "core"],
      preferredMovements: ["pull", "push"],
      allowedMovements: ["pull", "push", "carry_core"],
      targetPrimarySets: { back: 6, shoulders: 4, chest: 4, core: 3 },
    },
    {
      id: "full_balanced",
      title: "Full body",
      summary: "Full-body catch-up day.",
      focusMuscles: ["glutes", "back", "shoulders", "core"],
      preferredMovements: ["hinge", "single_leg", "pull", "push"],
      allowedMovements: ["hinge", "squat", "single_leg", "pull", "push", "carry_core"],
      targetPrimarySets: { glutes: 5, back: 5, shoulders: 4, core: 3 },
    },
    {
      id: "upper_pull_bias",
      title: "Upper pull bias",
      summary: "Back and shoulder balance.",
      focusMuscles: ["back", "shoulders", "rear_delts", "core"],
      preferredMovements: ["pull", "push"],
      allowedMovements: ["pull", "push", "carry_core"],
      targetPrimarySets: { back: 6, shoulders: 4, rear_delts: 3, core: 3 },
    },
  ];
};

// Public helper — lets the UI build a DraftExercise from a library exercise
// without re-running the full generator (used by the per-exercise swap feature).
export function buildDraftExercise(
  ex: Exercise,
  targets: (number | string)[],
  workouts: Workout[],
  knownNames: Set<string>,
): DraftExercise {
  const last = lastWorkingWeight(ex.name, workouts);
  return {
    name: ex.name,
    primary: ex.primary,
    secondary: ex.secondary,
    pattern: ex.pattern,
    movement: movementOf(ex),
    targets,
    suggestedWeight: last?.weight ?? null,
    unit: last?.unit ?? "lb",
    isFamiliar: knownNames.has(ex.name),
    progression: buildProgression(ex, targets, workouts),
  };
}

export function generateNextWorkout(
  workouts: Workout[],
  todayISO: string,
  seed: number = Date.now(),
  profile?: TrainingProfile | null,
): WorkoutDraft {
  const activeProfile: TrainingProfile = profile ?? {
    goal: "physique",
    daysPerWeek: 4,
    equipment: "full_gym",
    experience: "beginner",
  };
  const window = weekContaining(todayISO);
  const coverage = computeCoverage(workouts, window);
  const recent = recentMusclesWithin(workouts, todayISO, 48);
  const rng = mulberry32(seed);
  const split = resolveSplitVariants(
    getSplitTemplate(activeProfile),
    activeProfile,
    workouts,
  );

  // Movement neediness: 0 days → 3, 1 day → 1, 2+ → 0.
  const need: Record<MovementPattern, number> = {} as Record<
    MovementPattern,
    number
  >;
  MOVEMENT_PATTERNS.forEach((mp) => {
    const days = coverage.movementStats[mp]?.daysHit.length ?? 0;
    need[mp] = days === 0 ? 3 : days === 1 ? 1 : 0;
  });

  const sessionIndex = maybeOverrideForCriticalGap(
    split,
    getNextSplitSlotIndex(split, coverage.workouts, need),
    need,
  );
  const slot = split[sessionIndex];
  const currentWeekExerciseNames = new Set(
    coverage.workouts.flatMap((workout) =>
      workout.exercises.map((exercise) => exercise.exerciseName),
    ),
  );
  const currentWeekFamilies = new Set(
    coverage.workouts.flatMap((workout) =>
      workout.exercises
        .map((exercise) => EXERCISES.find((candidate) => candidate.name === exercise.exerciseName))
        .filter((exercise): exercise is Exercise => Boolean(exercise))
        .map((exercise) => familyOf(exercise)),
    ),
  );

  const known = new Set<string>();
  workouts.forEach((w) =>
    w.exercises.forEach((e) => known.add(e.exerciseName)),
  );

  const used = new Set<string>();
  const claimedMovements: Record<MovementPattern, number> = {} as Record<
    MovementPattern,
    number
  >;
  MOVEMENT_PATTERNS.forEach((mp) => (claimedMovements[mp] = 0));

  const scoreExercise = (ex: Exercise): number => {
    const movement = movementOf(ex);
    if (!movement) return -10; // plyo/conditioning/calf — never a planned pick
    if (!environmentAllows(ex, activeProfile.equipment)) return -10;
    if (!goalAllows(ex, activeProfile.goal)) return -10;
    if (!slot.allowedMovements.includes(movement)) return -10;
    const remaining = Math.max(
      0,
      need[movement] - claimedMovements[movement],
    );
    let s = remaining * 5;
    const physiqueFactor =
      activeProfile.goal === "physique"
        ? 1
        : activeProfile.goal === "balanced"
          ? 0.35
          : 0;
    s += (MOVEMENT_PRIORITY[movement] ?? 0) * (physiqueFactor || 0.2);

    ex.primary.forEach((m) => {
      s += (PRIMARY_MUSCLE_PRIORITY[m] ?? 0) * physiqueFactor;
      if (recent.has(m)) s -= 5;
    });
    ex.secondary.forEach((m) => {
      s += (SECONDARY_MUSCLE_PRIORITY[m] ?? 0) * physiqueFactor;
      if (recent.has(m)) s -= 1.5;
    });

    if (activeProfile.goal === "physique") {
      if (movement === "push" && ex.primary.includes("chest")) s -= 0.8;
      if (movement === "push" && ex.primary.includes("triceps")) s -= 0.6;
      if (movement === "hinge" && ex.primary.includes("glutes")) s += 0.8;
      if (movement === "single_leg" && ex.primary.includes("glutes")) s += 0.8;
      if (isDirectGluteFocus(ex)) s += 0.7;
      if (movement === "pull" && ex.primary.includes("back")) s += 0.7;
      if (ex.primary.includes("shoulders") || ex.primary.includes("rear_delts")) {
        s += 0.5;
      }
      if (armBiasSlot && isDirectArmFocus(ex)) s += 1.2;
    }

    if (activeProfile.goal === "strength" && isHeavyEquipment(ex)) {
      s += 1.4;
    }
    if (activeProfile.equipment === "full_gym") {
      if (ex.equipment === "barbell") s += 0.8;
      if (ex.equipment === "machine" || ex.equipment === "cable") s += 0.5;
    }
    if (activeProfile.experience === "beginner") {
      if (isTechnicalBarbell(ex)) s -= 1.2;
      if (!known.has(ex.name)) s -= 0.8;
    }

    if (known.has(ex.name)) s += 1;
    if (slot.preferredMovements.includes(movement)) s += 1.4;
    if (currentWeekExerciseNames.has(ex.name)) s -= activeProfile.goal === "strength" ? 0.6 : 2.4;
    if (currentWeekFamilies.has(familyOf(ex))) s -= activeProfile.goal === "strength" ? 0.4 : 1.2;
    ex.primary.forEach((m) => {
      if (slot.focusMuscles.includes(m)) s += 1.1;
      const target = slot.targetPrimarySets[m] ?? 0;
      const done = coverage.muscleStats[m]?.asPrimarySets ?? 0;
      if (target > 0) {
        const remainingSets = Math.max(0, target - done);
        s += remainingSets * 0.45;
        if (done >= target) s -= 0.5;
      }
    });
    ex.secondary.forEach((m) => {
      if (slot.focusMuscles.includes(m)) s += 0.35;
    });
    s += rng() * 0.5;
    return s;
  };

  const pickBest = (filter: (ex: Exercise) => boolean): Exercise | null => {
    let best: Exercise | null = null;
    let bestScore = -Infinity;
    for (const ex of EXERCISES) {
      if (used.has(ex.name)) continue;
      if (!filter(ex)) continue;
      const s = scoreExercise(ex);
      if (s > bestScore) {
        best = ex;
        bestScore = s;
      }
    }
    return best && bestScore > -10 ? best : null;
  };

  const claim = (ex: Exercise) => {
    used.add(ex.name);
    const m = movementOf(ex);
    if (m) claimedMovements[m] = claimedMovements[m] + 1;
  };

  const makeDraftEx = (
    ex: Exercise,
    targets: (number | string)[],
  ): DraftExercise => {
    const last = lastWorkingWeight(ex.name, workouts);
    return {
      name: ex.name,
      primary: ex.primary,
      secondary: ex.secondary,
      pattern: ex.pattern,
      movement: movementOf(ex),
      targets,
      suggestedWeight: last?.weight ?? null,
      unit: last?.unit ?? "lb",
      isFamiliar: known.has(ex.name),
      progression: buildProgression(ex, targets, workouts),
    };
  };

  const sections: DraftSection[] = [];
  const movementsHit: MovementPattern[] = [];
  const secondaryRounds = activeProfile.daysPerWeek === 5 ? 2 : 3;
  const accessoryRounds = activeProfile.daysPerWeek === 5 ? 2 : 3;
  const finisherRounds = activeProfile.daysPerWeek === 3 ? 2 : 1;
  const compoundMovements = COMPOUND_MOVEMENTS.filter((movement) =>
    slot.allowedMovements.includes(movement),
  );
  const accessoryMovements = ACCESSORY_MOVEMENTS.filter((movement) =>
    slot.allowedMovements.includes(movement),
  );
  const lowerBiasSlot =
    slot.preferredMovements.includes("hinge") ||
    slot.preferredMovements.includes("squat") ||
    slot.preferredMovements.includes("single_leg");
  const upperBiasSlot =
    slot.preferredMovements.includes("pull") ||
    slot.preferredMovements.includes("push");
  const armBiasSlot =
    slot.focusMuscles.includes("biceps") || slot.focusMuscles.includes("triceps");

  // Pre-generate per-movement noise so sort comparators are pure functions.
  // JavaScript sort calls comparators a variable number of times, so calling
  // rng() inside a comparator produces non-deterministic results for the same seed.
  const movementNoise: Partial<Record<MovementPattern, number>> = {};
  MOVEMENT_PATTERNS.forEach((mp) => (movementNoise[mp] = rng()));

  const sortedByNeed = (candidates: MovementPattern[]): MovementPattern[] =>
    [...candidates].sort(
      (a, b) =>
        need[b] - need[a] +
        ((movementNoise[b] ?? 0) - (movementNoise[a] ?? 0)) * 0.01,
    );

  const pushMovement = (movement: MovementPattern | null) => {
    if (movement) movementsHit.push(movement);
  };

  const pickForMovement = (
    candidates: MovementPattern[],
    filter?: (ex: Exercise) => boolean,
  ): { movement: MovementPattern; exercise: Exercise } | null => {
    for (const movement of sortedByNeed(candidates)) {
      const exercise = pickBest(
        (ex) => movementOf(ex) === movement && (filter ? filter(ex) : true),
      );
      if (exercise) return { movement, exercise };
    }
    return null;
  };

  const addSuperset = (
    allowed: MovementPattern[],
    rounds: number,
    repScheme: string,
    targets: (number | string)[],
    filter?: (ex: Exercise) => boolean,
  ): boolean => {
    const first = pickForMovement(allowed, filter);
    if (!first) return false;

    let second = pickForMovement(
      allowed.filter((movement) => movement !== first.movement),
      filter,
    );
    if (!second) {
      second = pickForMovement(allowed, filter);
    }
    if (!second) return false;

    claim(first.exercise);
    pushMovement(first.movement);
    claim(second.exercise);
    pushMovement(second.movement);
    sections.push({
      kind: "superset",
      rounds,
      repScheme,
      exercises: [
        makeDraftEx(first.exercise, targets),
        makeDraftEx(second.exercise, targets),
      ],
    });
    return true;
  };

  const addAccessoryBlock = (
    allowed: MovementPattern[],
    rounds: number,
    repScheme: string,
    targets: (number | string)[],
    filter?: (ex: Exercise) => boolean,
  ): boolean => {
    const pick = pickForMovement(allowed, filter);
    if (!pick) return false;
    claim(pick.exercise);
    pushMovement(pick.movement);
    sections.push({
      kind: "accessory",
      rounds,
      repScheme,
      exercises: [makeDraftEx(pick.exercise, targets)],
    });
    return true;
  };

  // 1. Main lift — the most-needed heavy compound among squat, hinge, push, pull.
  const compoundPick = pickForMovement(
    compoundMovements,
    (ex) =>
      environmentAllows(ex, activeProfile.equipment) &&
      isHeavyEquipment(ex) &&
      goalAllows(ex, activeProfile.goal),
  );
  if (compoundPick) {
    claim(compoundPick.exercise);
    pushMovement(compoundPick.movement);
    sections.push({
      kind: "compound",
      rounds: 4,
      repScheme: "10 / 8 / 8 / 6 — build weight",
      exercises: [makeDraftEx(compoundPick.exercise, [10, 8, 8, 6])],
    });
  }

  // 2. Secondary lift — add another focused block before accessories.
  let secondaryPick = pickForMovement(
    accessoryMovements.filter(
      (movement) => movement !== compoundPick?.movement,
    ),
    (ex) =>
      environmentAllows(ex, activeProfile.equipment) &&
      goalAllows(ex, activeProfile.goal) &&
      isGluteBiasedLower(ex),
  );
  if (!secondaryPick) {
      secondaryPick = pickForMovement(
      accessoryMovements.filter(
        (movement) => movement !== compoundPick?.movement,
      ),
      (ex) =>
        environmentAllows(ex, activeProfile.equipment) &&
        goalAllows(ex, activeProfile.goal) &&
        isBackOrShoulderFocused(ex),
    );
  }
  if (!secondaryPick) {
    secondaryPick = pickForMovement(
      accessoryMovements.filter(
        (movement) => movement !== compoundPick?.movement,
      ),
      (ex) =>
        environmentAllows(ex, activeProfile.equipment) &&
        goalAllows(ex, activeProfile.goal),
    );
  }
  if (secondaryPick) {
    claim(secondaryPick.exercise);
    pushMovement(secondaryPick.movement);
    sections.push({
      kind: "accessory",
      rounds: secondaryRounds,
      repScheme: "8–10 reps — controlled working sets",
      exercises: [
        makeDraftEx(
          secondaryPick.exercise,
          secondaryRounds === 2 ? [10, 8] : [10, 8, 8],
        ),
      ],
    });
  }

  // 3. First accessory superset — prioritize uncovered movements.
  addSuperset(
    accessoryMovements,
    accessoryRounds,
    "10–12 reps · superset",
    accessoryRounds === 2 ? [12, 10] : [12, 10, 10],
    (ex) =>
      environmentAllows(ex, activeProfile.equipment) &&
      goalAllows(ex, activeProfile.goal) &&
      (activeProfile.goal !== "physique" ||
        (!isChestDominantPush(ex) &&
          ((lowerBiasSlot &&
            (isGluteBiasedLower(ex) || isDirectGluteFocus(ex))) ||
            (upperBiasSlot &&
              (isBackOrShoulderFocused(ex) ||
                (armBiasSlot && isDirectArmFocus(ex))))))),
  );

  // 4. Second accessory superset — add enough volume for a fuller session.
  addSuperset(
    accessoryMovements,
    accessoryRounds,
    "12–15 reps · short rest",
    accessoryRounds === 2 ? [15, 12] : [15, 12, 12],
    (ex) =>
      environmentAllows(ex, activeProfile.equipment) &&
      goalAllows(ex, activeProfile.goal) &&
      (activeProfile.goal !== "physique" ||
        ((lowerBiasSlot &&
          (isGluteBiasedLower(ex) ||
            isDirectGluteFocus(ex) ||
            isBackOrShoulderFocused(ex))) ||
          (upperBiasSlot &&
            (isBackOrShoulderFocused(ex) ||
              (armBiasSlot && isDirectArmFocus(ex)))))),
  );

  // 5. Finisher — for 3-day physique plans, allow short conditioning on lower
  // days. Otherwise keep it carry/core.
  const lowerDay =
    slot.preferredMovements.includes("hinge") ||
    slot.preferredMovements.includes("squat") ||
    slot.preferredMovements.includes("single_leg");
  const allowConditioningFinisher =
    activeProfile.goal === "physique" &&
    activeProfile.daysPerWeek === 3 &&
    lowerDay;
  const fin = pickBest((ex) => {
    if (!environmentAllows(ex, activeProfile.equipment)) return false;
    if (movementOf(ex) === "carry_core") return true;
    if (!allowConditioningFinisher) return false;
    return ex.pattern === "conditioning";
  });
  if (fin) {
    claim(fin);
    if (movementOf(fin) === "carry_core") pushMovement("carry_core");
    const isCarry = fin.pattern === "carry";
    const isConditioning = fin.pattern === "conditioning";
    sections.push({
      kind: "finisher",
      rounds: finisherRounds,
      repScheme: isCarry
        ? "40–60 sec walk"
        : isConditioning
          ? "45 sec hard / 45 sec easy"
          : "12–15 reps",
      exercises: [
        makeDraftEx(
          fin,
          isCarry || isConditioning
            ? Array.from({ length: finisherRounds }, () => "45s")
            : finisherRounds === 2
              ? [15, 12]
              : [15],
        ),
      ],
    });
  }

  const totalExercises = (): number =>
    sections.reduce((count, section) => count + section.exercises.length, 0);

  const hasDirectArmWork = (): boolean =>
    sections.some((section) =>
      section.exercises.some((exercise) =>
        exercise.primary.includes("biceps") || exercise.primary.includes("triceps"),
      ),
    );

  if (totalExercises() < 5) {
    addAccessoryBlock(
      accessoryMovements,
      accessoryRounds,
      "12–15 reps — finishing volume",
      accessoryRounds === 2 ? [15, 12] : [15, 12, 12],
      (ex) =>
        environmentAllows(ex, activeProfile.equipment) &&
        goalAllows(ex, activeProfile.goal) &&
        slot.focusMuscles.some(
          (muscle) => ex.primary.includes(muscle) || ex.secondary.includes(muscle),
        ),
    );
  }

  if (activeProfile.goal === "physique" && armBiasSlot && !hasDirectArmWork()) {
    addAccessoryBlock(
      accessoryMovements,
      2,
      "12–15 reps — direct arm finish",
      [15, 12],
      (ex) =>
        environmentAllows(ex, activeProfile.equipment) &&
        goalAllows(ex, activeProfile.goal) &&
        isDirectArmFocus(ex),
    );
  }

  // ---- Rationale ----
  const rationale: string[] = [];
  const zeroDay = MOVEMENT_PATTERNS.filter(
    (mp) => (coverage.movementStats[mp]?.daysHit.length ?? 0) === 0,
  );
  const oneDay = MOVEMENT_PATTERNS.filter(
    (mp) => (coverage.movementStats[mp]?.daysHit.length ?? 0) === 1,
  );

  if (movementsHit.length > 0) {
    rationale.push(
      `Covers: ${movementsHit.map(formatMovement).join(", ")}.`,
    );
  }
  if (sections.length > 0) {
    rationale.push(
      "Built as a fuller 45-minute session: main lift, secondary lift, two accessory blocks, then a short finisher.",
    );
  }
  rationale.push(
    `This is ${slot.title}: ${slot.summary}`,
  );
  const remainingFocus = slot.focusMuscles
    .map((muscle) => {
      const target = slot.targetPrimarySets[muscle] ?? 0;
      if (target <= 0) return null;
      const done = coverage.muscleStats[muscle]?.asPrimarySets ?? 0;
      return done < target ? `${muscle.replace("_", " ")} ${done}/${target}` : null;
    })
    .filter((value): value is string => Boolean(value));
  if (remainingFocus.length > 0) {
    rationale.push(`Still building this slot's focus volume: ${remainingFocus.join(", ")}.`);
  }
  if (activeProfile.goal === "physique") {
    rationale.push(
      "Biased toward glutes, shoulders, back, hamstrings, and core for a lean-muscle physique focus.",
    );
  } else if (activeProfile.goal === "strength") {
    rationale.push(
      "Biased toward stable compound lifts and slightly lower per-session accessory volume for strength work.",
    );
  } else {
    rationale.push(
      "Balanced across weekly movement coverage while keeping the routine practical for your setup.",
    );
  }
  rationale.push(
    `Configured for ${activeProfile.daysPerWeek} training days, ${activeProfile.equipment.replace("_", " ")}, ${activeProfile.experience} level.`,
  );
  if (zeroDay.length > 0) {
    rationale.push(
      `Untouched this week: ${zeroDay.map(formatMovement).join(", ")}.`,
    );
  }
  if (oneDay.length > 0) {
    rationale.push(
      `Hit only once: ${oneDay.map(formatMovement).join(", ")}.`,
    );
  }
  if (recent.size > 0) {
    const list = [...recent]
      .filter((m) => MUSCLE_GROUPS.includes(m as (typeof MUSCLE_GROUPS)[number]))
      .map((m) => m.replace("_", " "));
    if (list.length > 0) {
      rationale.push(
        `Avoiding muscles trained in the last 48h: ${list.join(", ")}.`,
      );
    }
  }
  if (rationale.length === 0) {
    rationale.push("All movement patterns are well covered — balanced session.");
  }

  return {
    split: {
      slotId: slot.id,
      title: slot.title,
      summary: slot.summary,
      sessionIndex: sessionIndex + 1,
      totalSessions: split.length,
      targetPrimarySets: slot.targetPrimarySets,
    },
    sections,
    rationale,
  };
}

// ---------- Pending-draft handoff to /log ----------

const PENDING_KEY = "workout.pending-draft.v1";

export type PendingDraft = {
  source: "manual" | "class";
  draft: WorkoutDraft;
};

export const stashDraft = (d: PendingDraft): void => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(d));
};

export const popDraft = (): PendingDraft | null => {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(PENDING_KEY);
  try {
    return JSON.parse(raw) as PendingDraft;
  } catch {
    return null;
  }
};
