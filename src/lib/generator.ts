import { EXERCISES } from "./exercises";
import { environmentAllowsExercise } from "./exercise-availability";
import {
  directionOf,
  ACCESSORY_MOVEMENTS,
  COMPOUND_MOVEMENTS,
  capSuggestedWeight,
  familyOf,
  formatMovement,
  goalAllows,
  hasAnyMuscle,
  hasPrimary,
  hasSecondary,
  isAccessibleConditioningFinisher,
  isAccessibleMetabolicFinisher,
  isActivationLowerAccessory,
  isBackOrShoulderFocused,
  isBackPullAnchor,
  isVerticalPressAnchor,
  isChestDominantPush,
  isDirectArmFocus,
  isDirectGluteFocus,
  isGluteBiasedLower,
  isHeavyEquipment,
  isHomeConditioningFriendly,
  isLowerFatiguingFinisher,
  isLowerIsolation,
  isPhysiqueFriendly,
  isPreferredAccessibleFinisher,
  isPushLeaningFinisher,
  isStrongLowerAnchor,
  isTechnicalBarbell,
  lowerUnilateralKneeFamilyOf,
  MOVEMENT_PRIORITY,
  PRIMARY_MUSCLE_PRIORITY,
  SECONDARY_MUSCLE_PRIORITY,
} from "./exercise-predicates";
import {
  compareWorkoutsDesc,
  getSplitTemplate,
  isLowerSlot,
  isUpperSlot,
  PHYSIQUE_UPPER_A_SLOT,
  PHYSIQUE_UPPER_B_SLOT,
  resolveSplitVariants,
} from "./splits";
import type { SplitSlot } from "./splits";
export { getWeeklyTargetStimulus, getWeeklyTargetSets } from "./splits";
import {
  bandFloors,
  getWeeklyTargetBand,
  isMajorTarget,
  roundHalf,
  type WeeklyTargetBand,
} from "./weekly-targets";
import { FINISHER_TEMPLATES } from "./finishers";
import { effortAdjustmentReason, effortBudgetMultiplier } from "./session-feedback";
import { getWeekPhase } from "./periodization";
import type { FinisherTemplate } from "./finishers";
export { FINISHER_TEMPLATES } from "./finishers";
import { movementOf, muscleSetToMovements } from "./movement";
import { PLANNER_TUNING } from "./planner-tuning";
import { DEFAULT_PROFILE } from "./profile";
import { MOVEMENT_PATTERNS, MUSCLE_GROUPS } from "./types";
import {
  type DirectionKey,
  computeCoverage,
  distributeRecoveryStress,
  estimateExerciseStimulus,
  recentMuscleStressWithin,
  recentMusclesWithin,
  weekContaining,
} from "./coverage";
import {
  getExerciseHistory,
  getRecentProgressionStatuses,
  getStallState,
} from "./progression";
import type { ExerciseHistoryEntry, StallState } from "./progression";
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
  templateId?: string;
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
  suggestedDuration: number | null;
  unit: WeightUnit;
  isFamiliar: boolean;
  trend: StallState;
  progression: {
    lastSummary: string | null;
    goal: string;
    nextStep: string;
    recentHistory: ExerciseHistoryEntry[];
  };
};

export type SessionComposition = {
  baseSlotId: string;
  loggedSessions: number;
  remainingSessions: number;
  priorWeight: number;
  todayTargets: Partial<Record<MuscleGroup, number>>;
  closes: MuscleGroup[];
  covered: MuscleGroup[];
  avoid: MuscleGroup[];
  requiredMovements: MovementPattern[];
};

export type WorkoutDraft = {
  split: {
    slotId: string;
    title: string;
    summary: string;
    focusLabel: string | null;
    sessionIndex: number;
    totalSessions: number;
    targetPrimaryStimulus: Partial<Record<MuscleGroup, number>>;
    targetPrimarySets: Partial<Record<MuscleGroup, number>>;
  };
  composition: SessionComposition | null;
  slotRecommendations: Array<{
    slotId: string;
    title: string;
    summary: string;
    rank: number;
    score: number;
    isRecommended: boolean;
    targetPrimaryStimulus: Partial<Record<MuscleGroup, number>>;
    targetPrimarySets: Partial<Record<MuscleGroup, number>>;
    topMuscles: MuscleGroup[];
    allowedMovements: MovementPattern[];
    note: string;
    caution: string | null;
  }>;
  rationale: string[];
  mobility: {
    title: string;
    items: string[];
    complementary: string[];
  };
  cooldown: {
    title: string;
    items: string[];
    complementary: string[];
  };
  sections: DraftSection[];
};

export type GeneratorOverrides = {
  forcedSlotId?: string;
  focusedMovements?: MovementPattern[];
  focusedMuscles?: MuscleGroup[];
  finisherSeed?: number;
  excludeFinisherTemplateIds?: string[];
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

const previousWorkingWeight = (
  name: string,
  workouts: Workout[],
): { weight: number; unit: WeightUnit; date: string } | null => {
  const sorted = [...workouts].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt,
  );
  let skippedMostRecent = false;
  for (const w of sorted) {
    for (const e of w.exercises) {
      if (e.exerciseName !== name) continue;
      const weighted = e.sets.filter(
        (s): s is typeof s & { weight: number } => typeof s.weight === "number",
      );
      if (weighted.length === 0) continue;
      if (!skippedMostRecent) {
        skippedMostRecent = true;
        break;
      }
      const last = weighted[weighted.length - 1];
      return { weight: last.weight, unit: last.unit, date: w.date };
    }
  }
  return null;
};

const lastWorkingDuration = (name: string, workouts: Workout[]): number | null => {
  const sorted = [...workouts].sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt,
  );
  for (const w of sorted) {
    for (const e of w.exercises) {
      if (e.exerciseName !== name) continue;
      const durations = e.sets
        .map((s) => s.durationSec)
        .filter((d): d is number => typeof d === "number" && d > 0);
      if (durations.length > 0) return Math.max(...durations);
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

const findExerciseByName = (name: string): Exercise | null =>
  EXERCISES.find((exercise) => exercise.name === name) ?? null;

const buildProgression = (
  ex: Exercise,
  targets: (number | string)[],
  workouts: Workout[],
): DraftExercise["progression"] => {
  const performance = lastPerformance(ex.name, workouts);
  const previousWeight = previousWorkingWeight(ex.name, workouts);
  // Only treat this as a deliberate, recent reset — not just "whatever the
  // last two logged occurrences happened to be" — so a comeback session
  // after a long layoff doesn't get told it "recently" dropped load.
  const daysSincePreviousWeight =
    performance && previousWeight
      ? (Date.parse(performance.date) - Date.parse(previousWeight.date)) / (1000 * 60 * 60 * 24)
      : Infinity;
  const justReducedLoad =
    performance?.weight != null &&
    previousWeight != null &&
    performance.weight < previousWeight.weight &&
    daysSincePreviousWeight <= 14;
  const recentHistory = getExerciseHistory(ex.name, workouts, undefined, 3);
  const recentStatuses = getRecentProgressionStatuses(ex.name, workouts, undefined, 3);
  const latestStatus = recentStatuses[0];
  const repeatedStall =
    recentStatuses.length >= 2 &&
    recentStatuses.slice(0, 2).every((status) => status === "held" || status === "missed");
  const numericTargets = targets.filter((target): target is number => typeof target === "number");
  const timedTargets = targets.filter((target): target is string => typeof target === "string");
  const lastSummary = summarizePerformance(performance);
  const historyReps = (performance?.reps ?? []).filter((r): r is number => typeof r === "number");
  const effectiveRepSummary =
    numericTargets.length > 0 && historyReps.length >= numericTargets.length
      ? historyReps.slice(0, numericTargets.length)
      : numericTargets;
  const plannedRepSummary = effectiveRepSummary.join("/");

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

  if (performance?.weight != null && hitAllPlanned && justReducedLoad) {
    return {
      lastSummary,
      goal: `Consolidate at ${performance.weight} ${performance.unit} with ${plannedRepSummary} reps.`,
      nextStep: `You recently dropped load here — hold this weight for one more clean session before adding back.`,
      recentHistory,
    };
  }

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

// Keeps the displayed R1-R4 targets consistent with the rep numbers baked
// into buildProgression's goal text, which already substitutes last-logged
// reps for the static slot template once enough history exists. Must not be
// used as the `targets` passed into buildProgression itself — that function's
// progressed/held/missed classification depends on comparing performance
// against the static template, not against itself.
const resolveDisplayTargets = (
  targets: (number | string)[],
  workouts: Workout[],
  exerciseName: string,
): (number | string)[] => {
  const performance = lastPerformance(exerciseName, workouts);
  const numericTargets = targets.filter((t): t is number => typeof t === "number");
  const historyReps = (performance?.reps ?? []).filter((r): r is number => typeof r === "number");
  if (numericTargets.length === 0 || historyReps.length === 0) return targets;
  // When history has fewer sets than the scheme (a 3-set log feeding a 4-round
  // circuit), fill the extra rounds with the last logged rep count, capped by
  // the template — otherwise the raw template leaks through and prescribes
  // reps far past what the lifter actually did (15 chin-ups after a 10/8/8).
  let cursor = 0;
  return targets.map((t) => {
    if (typeof t !== "number") return t;
    const idx = cursor;
    cursor += 1;
    return idx < historyReps.length
      ? historyReps[idx]
      : Math.min(t, historyReps[historyReps.length - 1]);
  });
};




const WARMUP_BY_MUSCLE: Partial<Record<MuscleGroup, string[]>> = {
  glutes: ["Banded glute bridge x 15", "Banded lateral walk x 10/side"],
  hamstrings: ["Bodyweight RDL reach x 8/side", "Hamstring sweep x 8/side"],
  quads: ["Split squat iso hold x 20s/side", "Bodyweight squat x 10"],
  back: ["Band row x 15", "Cat-cow x 6"],
  shoulders: ["Band shoulder external rotation x 12/side", "Arm circles x 20s each way"],
  rear_delts: ["Band pull-apart x 15", "Face-pull pattern x 10"],
  chest: ["Scap push-up x 8", "Chest opener reach x 6/side"],
  biceps: ["Band curl x 15", "Wrist and elbow prep x 20s"],
  triceps: ["Overhead reach x 20s/side", "Band pressdown x 15"],
  core: ["Dead bug x 6/side", "Bear plank hold x 20s"],
  hip_flexors: ["Half-kneeling hip flexor pulse x 8/side", "Marching bridge x 8/side"],
  adductors: ["Lateral squat x 8/side", "Adductor rock x 8/side"],
};

const COOLDOWN_BY_MUSCLE: Partial<Record<MuscleGroup, string[]>> = {
  glutes: ["Figure-4 stretch x 30s/side", "Pigeon or seated glute stretch x 30s/side"],
  hamstrings: ["Supine hamstring stretch x 30s/side", "Toe-elevated hinge stretch x 30s"],
  quads: ["Standing quad stretch x 30s/side", "Couch stretch x 30s/side"],
  back: ["Child's pose reach x 30s", "Lat stretch on bench x 30s"],
  shoulders: ["Cross-body shoulder stretch x 30s/side", "Wall pec/shoulder opener x 30s/side"],
  rear_delts: ["Cross-body rear delt stretch x 30s/side", "Thread-the-needle x 30s/side"],
  chest: ["Doorway pec stretch x 30s/side", "Open-book rotation x 5/side"],
  biceps: ["Wall biceps stretch x 20s/side", "Forearm extension stretch x 20s/side"],
  triceps: ["Overhead triceps stretch x 30s/side", "Child's pose side reach x 20s/side"],
  core: ["Crocodile breathing x 5 breaths", "Supine twist x 30s/side"],
  hip_flexors: ["Half-kneeling hip flexor stretch x 30s/side", "90/90 breathing x 4 breaths"],
  adductors: ["Butterfly stretch x 45s", "Lateral lunge stretch x 30s/side"],
};

const buildSessionBookend = (
  title: string,
  source: Partial<Record<MuscleGroup, string[]>>,
  focusMuscles: MuscleGroup[],
  fallback: string[],
): { title: string; items: string[]; complementary: string[] } => {
  const seen = new Set<string>();
  const items: string[] = [];
  const complementary: string[] = [];

  for (const muscle of focusMuscles) {
    for (const item of source[muscle] ?? []) {
      if (seen.has(item)) continue;
      seen.add(item);
      if (items.length < 4) {
        items.push(item);
      } else if (complementary.length < 2) {
        complementary.push(item);
      }
      if (items.length >= 4 && complementary.length >= 2) {
        return { title, items, complementary };
      }
    }
  }

  for (const item of fallback) {
    if (seen.has(item)) continue;
    seen.add(item);
    if (items.length < 4) {
      items.push(item);
    } else if (complementary.length < 2) {
      complementary.push(item);
    }
    if (items.length >= 4 && complementary.length >= 2) break;
  }

  return { title, items, complementary };
};

type InferredWorkoutBias = "lower" | "upper" | "mixed";

type WorkoutSlotSummary = {
  lowerSets: number;
  upperSets: number;
  strongLowerSets: number;
  directArmSets: number;
  quadSets: number;
  posteriorSets: number;
};

type WorkoutStimulusProfile = {
  primary: Partial<Record<MuscleGroup, number>>;
  secondary: Partial<Record<MuscleGroup, number>>;
  lowerStimulus: number;
  upperStimulus: number;
  strongLowerStress: number;
  directArmStimulus: number;
  quadStimulus: number;
  posteriorStimulus: number;
};

const LOWER_BIAS_MUSCLES: MuscleGroup[] = [
  "quads",
  "glutes",
  "hamstrings",
  "adductors",
  "hip_flexors",
];

const UPPER_BIAS_MUSCLES: MuscleGroup[] = [
  "chest",
  "back",
  "shoulders",
  "rear_delts",
  "biceps",
  "triceps",
];

const summarizeWorkoutStimulusProfile = (workout: Workout): WorkoutStimulusProfile => {
  const primary: Partial<Record<MuscleGroup, number>> = {};
  const secondary: Partial<Record<MuscleGroup, number>> = {};
  let lowerStimulus = 0;
  let upperStimulus = 0;
  let strongLowerStress = 0;
  let directArmStimulus = 0;
  let quadStimulus = 0;
  let posteriorStimulus = 0;

  workout.exercises.forEach((logEx) => {
    const exercise = EXERCISES.find((candidate) => candidate.name === logEx.exerciseName);
    if (!exercise) return;

    const sets = logEx.sets.length;
    const stimulus = estimateExerciseStimulus(exercise);
    const primaryDose = sets * stimulus.primaryPerSet;
    const secondaryDose = sets * stimulus.secondaryPerSet;
    const recoveryDose = sets * stimulus.recoveryPerSet;
    const movement = movementOf(exercise);

    exercise.primary.forEach((muscle) => {
      primary[muscle] = (primary[muscle] ?? 0) + primaryDose;
      if (LOWER_BIAS_MUSCLES.includes(muscle)) lowerStimulus += primaryDose;
      if (UPPER_BIAS_MUSCLES.includes(muscle)) upperStimulus += primaryDose;
    });
    exercise.secondary.forEach((muscle) => {
      secondary[muscle] = (secondary[muscle] ?? 0) + secondaryDose;
      if (LOWER_BIAS_MUSCLES.includes(muscle)) lowerStimulus += secondaryDose * 0.35;
      if (UPPER_BIAS_MUSCLES.includes(muscle)) upperStimulus += secondaryDose * 0.35;
    });

    if (isStrongLowerAnchor(exercise)) strongLowerStress += recoveryDose;
    if (isDirectArmFocus(exercise)) directArmStimulus += primaryDose;
    if (hasAnyMuscle(exercise, ["quads"])) quadStimulus += primaryDose;
    if (hasAnyMuscle(exercise, ["glutes", "hamstrings"])) posteriorStimulus += primaryDose;
  });

  return {
    primary,
    secondary,
    lowerStimulus,
    upperStimulus,
    strongLowerStress,
    directArmStimulus,
    quadStimulus,
    posteriorStimulus,
  };
};

const summarizeWorkoutForSlotInference = (workout: Workout): WorkoutSlotSummary => {
  const profile = summarizeWorkoutStimulusProfile(workout);

  return {
    lowerSets: profile.lowerStimulus,
    upperSets: profile.upperStimulus,
    strongLowerSets: profile.strongLowerStress,
    directArmSets: profile.directArmStimulus,
    quadSets: profile.quadStimulus,
    posteriorSets: profile.posteriorStimulus,
  };
};

const inferWorkoutBias = (workout: Workout): InferredWorkoutBias => {
  const profile = summarizeWorkoutStimulusProfile(workout);
  const lowerStress =
    profile.lowerStimulus +
    profile.strongLowerStress * PLANNER_TUNING.workoutBias.strongLowerStressMultiplier;
  const upperStress =
    profile.upperStimulus +
    profile.directArmStimulus * PLANNER_TUNING.workoutBias.directArmStimulusMultiplier;

  if (lowerStress >= upperStress + PLANNER_TUNING.workoutBias.lowerLeadThreshold) return "lower";
  if (
    upperStress >= lowerStress + PLANNER_TUNING.workoutBias.upperLeadThreshold &&
    profile.strongLowerStress < PLANNER_TUNING.workoutBias.upperStrongLowerCap
  ) return "upper";
  return "mixed";
};

type WeeklyBiasBalance = {
  lower: number;
  upper: number;
};

type MuscleDeficitMap = Partial<Record<MuscleGroup, number>>;
type BiasPressure = {
  lower: number;
  upper: number;
};

const getSlotBias = (slot: SplitSlot): InferredWorkoutBias =>
  isLowerSlot(slot) ? "lower" : isUpperSlot(slot) ? "upper" : "mixed";

const summarizeStalledBiasPressure = (exerciseNames: Iterable<string>): BiasPressure => {
  let lower = 0;
  let upper = 0;

  for (const name of exerciseNames) {
    const exercise = EXERCISES.find((candidate) => candidate.name === name);
    if (!exercise) continue;
    const movement = movementOf(exercise);
    if (movement === "hinge" || movement === "squat" || movement === "single_leg") lower += 1;
    if (movement === "push" || movement === "pull") upper += 1;
  }

  return { lower, upper };
};

const summarizeWeeklyBiasBalance = (
  split: SplitSlot[],
  workouts: Workout[],
): WeeklyBiasBalance => {
  let lower = 0;
  let upper = 0;

  workouts.forEach((workout) => {
    const explicitSlot = split.find((slot) => slot.id === workout.planSlot?.slotId);
    if (explicitSlot) {
      const bias = getSlotBias(explicitSlot);
      if (bias === "lower") lower += 1;
      else if (bias === "upper") upper += 1;
      return;
    }

    const summary = summarizeWorkoutForSlotInference(workout);
    if (
      summary.strongLowerSets >= PLANNER_TUNING.weeklyBiasBalance.strongLowerFloor &&
      summary.lowerSets >= PLANNER_TUNING.weeklyBiasBalance.lowerStimulusFloor
    ) {
      lower += PLANNER_TUNING.weeklyBiasBalance.strongLowerSplitLower;
      upper += PLANNER_TUNING.weeklyBiasBalance.strongLowerSplitUpper;
      return;
    }
    if (summary.lowerSets >= summary.upperSets + PLANNER_TUNING.weeklyBiasBalance.sideLeadThreshold) {
      lower += 1;
      return;
    }
    if (summary.upperSets >= summary.lowerSets + PLANNER_TUNING.weeklyBiasBalance.sideLeadThreshold) {
      upper += 1;
      return;
    }
    if (summary.strongLowerSets > 0 && summary.lowerSets >= summary.upperSets) {
      lower += PLANNER_TUNING.weeklyBiasBalance.strongLowerSplitLower;
      upper += PLANNER_TUNING.weeklyBiasBalance.strongLowerSplitUpper;
      return;
    }

    lower += PLANNER_TUNING.weeklyBiasBalance.mixedSplit;
    upper += PLANNER_TUNING.weeklyBiasBalance.mixedSplit;
  });

  return { lower, upper };
};

const scoreWorkoutForSlot = (workout: Workout, slot: SplitSlot): number => {
  let score = 0;
  const slotLower = isLowerSlot(slot);
  const slotUpper = isUpperSlot(slot);
  const armBiasSlot =
    slot.focusMuscles.includes("biceps") || slot.focusMuscles.includes("triceps");
  const summary = summarizeWorkoutForSlotInference(workout);
  const profile = summarizeWorkoutStimulusProfile(workout);
  let directArmSets = 0;

  const targetMatch = (Object.entries(slot.targetPrimaryStimulus) as [MuscleGroup, number][])
    .filter(([, target]) => target > 0)
    .reduce((total, [muscle, target]) => {
      const primary = profile.primary[muscle] ?? 0;
      const secondary = profile.secondary[muscle] ?? 0;
      const effective = primary + secondary * 0.35;
      const weight = PRIMARY_MUSCLE_PRIORITY[muscle] ?? 1;
      return total + Math.min(target, effective) * weight;
    }, 0);
  const focusMatch = slot.focusMuscles.reduce((total, muscle) => {
    const primary = profile.primary[muscle] ?? 0;
    const secondary = profile.secondary[muscle] ?? 0;
    return total + primary * 1.2 + secondary * 0.35;
  }, 0);
  const offTargetPrimary = (MUSCLE_GROUPS as readonly MuscleGroup[]).reduce((total, muscle) => {
    if (slot.focusMuscles.includes(muscle) || (slot.targetPrimaryStimulus[muscle] ?? 0) > 0) {
      return total;
    }
    return total + (profile.primary[muscle] ?? 0);
  }, 0);

  score += targetMatch * PLANNER_TUNING.slotInference.targetMatchWeight;
  score += focusMatch * PLANNER_TUNING.slotInference.focusMatchWeight;
  score -= offTargetPrimary * PLANNER_TUNING.slotInference.offTargetPrimaryPenalty;

  workout.exercises.forEach((logEx) => {
    const exercise = EXERCISES.find((candidate) => candidate.name === logEx.exerciseName);
    if (!exercise) return;

    const sets = logEx.sets.length;
    const stimulus = estimateExerciseStimulus(exercise);
    const primaryDose = sets * stimulus.primaryPerSet;
    const secondaryDose = sets * stimulus.secondaryPerSet;
    const recoveryDose = sets * stimulus.recoveryPerSet;
    const movement = movementOf(exercise);

    if (movement && slot.preferredMovements.includes(movement)) {
      score += primaryDose * PLANNER_TUNING.slotInference.preferredMovementWeight;
    }
    else if (movement && slot.allowedMovements.includes(movement)) {
      const isLowerMovement =
        movement === "hinge" || movement === "squat" || movement === "single_leg";
      const isUpperMovement = movement === "pull" || movement === "push";
      if ((slotUpper && isLowerMovement) || (slotLower && isUpperMovement)) {
        score += primaryDose * PLANNER_TUNING.slotInference.crossBiasMovementWeight;
      } else score += primaryDose * PLANNER_TUNING.slotInference.allowedMovementWeight;
    }

    if (movement === "carry_core" && slot.focusMuscles.includes("core")) {
      score += primaryDose * PLANNER_TUNING.slotInference.carryCoreFocusWeight;
    }

    if (slotUpper && isStrongLowerAnchor(exercise)) {
      score -= recoveryDose * PLANNER_TUNING.slotInference.upperStrongLowerPenalty;
    }
    if (slotLower && isBackOrShoulderFocused(exercise)) {
      score -= primaryDose * PLANNER_TUNING.slotInference.lowerBackShoulderPenalty;
    }
    if (slotLower && isDirectArmFocus(exercise)) {
      score -= primaryDose * PLANNER_TUNING.slotInference.lowerDirectArmPenalty;
    }
    if (isDirectArmFocus(exercise)) directArmSets += primaryDose;

    exercise.primary.forEach((muscle) => {
      if (slot.focusMuscles.includes(muscle)) {
        score += primaryDose * PLANNER_TUNING.slotInference.focusPrimaryWeight;
      }
      if ((slot.targetPrimaryStimulus[muscle] ?? 0) > 0) {
        score += primaryDose * PLANNER_TUNING.slotInference.targetPrimaryWeight;
      }
    });
    exercise.secondary.forEach((muscle) => {
      if (slot.focusMuscles.includes(muscle)) {
        score += secondaryDose * PLANNER_TUNING.slotInference.focusSecondaryWeight;
      }
    });

    if (isLowerSlot(slot) && isStrongLowerAnchor(exercise)) {
      score += recoveryDose * PLANNER_TUNING.slotInference.lowerStrongAnchorBonus;
    }
    if (isUpperSlot(slot) && isBackOrShoulderFocused(exercise)) {
      score += primaryDose * PLANNER_TUNING.slotInference.upperBackShoulderBonus;
    }
    if (isUpperSlot(slot) && isDirectArmFocus(exercise)) {
      score += primaryDose * PLANNER_TUNING.slotInference.upperDirectArmBonus;
    }
  });

  if (slot.id === "lower_glute_ham") {
    if (summary.posteriorSets === 0) score -= PLANNER_TUNING.slotInference.lowerPosteriorGapPenalty;
    else score += summary.posteriorSets * PLANNER_TUNING.slotInference.lowerPosteriorPresentBonus;
    if (summary.quadSets >= summary.posteriorSets + 4) {
      score -= PLANNER_TUNING.slotInference.lowerQuadImbalancePenalty;
    }
  }

  if (slot.id === "lower_glute_quad") {
    if (summary.quadSets === 0) score -= PLANNER_TUNING.slotInference.lowerQuadGapPenalty;
    else score += summary.quadSets * PLANNER_TUNING.slotInference.lowerQuadPresentBonus;
    if (summary.posteriorSets >= summary.quadSets + 4) {
      score -= PLANNER_TUNING.slotInference.lowerPosteriorImbalancePenalty;
    }
  }

  if (slotUpper && summary.strongLowerSets >= PLANNER_TUNING.slotInference.upperStrongLowerSetThreshold) {
    score -= summary.strongLowerSets * PLANNER_TUNING.slotInference.upperStrongLowerSetPenalty;
    if (summary.lowerSets >= summary.upperSets - 1) {
      score -= PLANNER_TUNING.slotInference.upperMixedLowerPenalty;
    }
  }

  if (armBiasSlot && directArmSets === 0) score -= PLANNER_TUNING.slotInference.armBiasNoDirectPenalty;
  if (armBiasSlot && directArmSets > 0) {
    score += directArmSets * PLANNER_TUNING.slotInference.armBiasDirectBonus;
  }

  return score;
};

const inferCompletedSlotIds = (
  split: SplitSlot[],
  workouts: Workout[],
): Set<string> => {
  const completed = new Set(
    workouts
      .map((workout) => workout.planSlot?.slotId)
      .filter((slotId): slotId is string => Boolean(slotId)),
  );
  const available = new Set(
    split.map((slot) => slot.id).filter((slotId) => !completed.has(slotId)),
  );
  const hasExplicitSlots = workouts.some((workout) => Boolean(workout.planSlot?.slotId));
  const sorted = [...workouts].sort((a, b) =>
    a.date > b.date ? 1 : a.date < b.date ? -1 : a.createdAt - b.createdAt,
  );

  sorted.forEach((workout, index) => {
    const explicitSlotId = workout.planSlot?.slotId;
    if (explicitSlotId && split.some((slot) => slot.id === explicitSlotId)) {
      completed.add(explicitSlotId);
      available.delete(explicitSlotId);
      return;
    }
    if (
      explicitSlotId &&
      (explicitSlotId === PHYSIQUE_UPPER_A_SLOT.id || explicitSlotId === PHYSIQUE_UPPER_B_SLOT.id)
    ) {
      // The current split may have swapped in the other upper variant (see
      // resolveSplitVariants) since this workout was logged. Only credit the
      // swapped-in slot on this workout's behalf if nothing has been logged
      // since (this is the most recent workout overall) — that's the "you
      // just did an upper session, don't immediately recommend the other
      // upper variant too" case. If a different session happened after this
      // one (e.g. a Lower day), the swapped-in upper variant is a genuinely
      // separate, not-yet-done session and should stay incomplete.
      const currentUpperSlot =
        index === sorted.length - 1
          ? split.find(
              (slot) => slot.id === PHYSIQUE_UPPER_A_SLOT.id || slot.id === PHYSIQUE_UPPER_B_SLOT.id,
            )
          : undefined;
      if (currentUpperSlot) {
        completed.add(currentUpperSlot.id);
        available.delete(currentUpperSlot.id);
      }
      return;
    }
    const hasStrugglingLift = workout.exercises.some(
      (exercise) =>
        exercise.progressionStatus === "held" || exercise.progressionStatus === "missed",
    );
    if (hasExplicitSlots && hasStrugglingLift) {
      return;
    }

    const workoutBias = inferWorkoutBias(workout);
    const eligibleSlots = split.filter((slot) => available.has(slot.id));
    const candidates = split
      .filter((slot) => eligibleSlots.some((candidate) => candidate.id === slot.id))
      .map((slot) => ({ slot, score: scoreWorkoutForSlot(workout, slot) }))
      .sort((a, b) => b.score - a.score);

    const best = candidates[0];
    const secondBest = candidates[1];
    const completedSlotScores = split
      .filter((slot) => completed.has(slot.id))
      .map((slot) => scoreWorkoutForSlot(workout, slot));
    const sameBiasCompletedScores = split
      .filter(
        (slot) =>
          completed.has(slot.id) &&
          getSlotBias(slot) === workoutBias &&
          workoutBias !== "mixed",
      )
      .map((slot) => scoreWorkoutForSlot(workout, slot));
    const bestCompletedScore =
      completedSlotScores.length > 0 ? Math.max(...completedSlotScores) : -Infinity;
    const bestSameBiasCompletedScore =
      sameBiasCompletedScores.length > 0 ? Math.max(...sameBiasCompletedScores) : -Infinity;
    const confidenceGap = best && secondBest ? best.score - secondBest.score : best?.score ?? 0;
    if (!best || best.score < PLANNER_TUNING.slotInference.mixedExplicitSkipScoreThreshold) return;
    if (hasExplicitSlots && workoutBias === "mixed") {
      return;
    }
    if (
      hasExplicitSlots &&
      !explicitSlotId &&
      bestSameBiasCompletedScore > -Infinity &&
      (best.score < bestSameBiasCompletedScore + PLANNER_TUNING.slotInference.sameBiasCompletedMargin ||
        confidenceGap < PLANNER_TUNING.slotInference.sameBiasConfidenceThreshold)
    ) {
      return;
    }
    if (
      hasExplicitSlots &&
      bestCompletedScore > -Infinity &&
      best.score < bestCompletedScore + PLANNER_TUNING.slotInference.completedMargin
    ) {
      return;
    }
    if (confidenceGap < PLANNER_TUNING.slotInference.lowConfidenceThreshold) {
      if (hasExplicitSlots && bestCompletedScore > -Infinity) return;
      completed.add(eligibleSlots[0]?.id ?? best.slot.id);
      available.delete(eligibleSlots[0]?.id ?? best.slot.id);
      return;
    }
    completed.add(best.slot.id);
    available.delete(best.slot.id);
  });

  return completed;
};

const getIncompleteSplitSlotIndices = (
  split: SplitSlot[],
  workouts: Workout[],
): number[] => {
  const completedSlotIds = inferCompletedSlotIds(split, workouts);

  if (completedSlotIds.size > 0) {
    const incompleteIndices = split
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => !completedSlotIds.has(slot.id))
      .map(({ index }) => index);
    if (incompleteIndices.length > 0) return incompleteIndices;
  }

  return [];
};

// Deficit counts primary AND secondary stimulus against the floor (saturation
// counts primary only): a muscle that rode along as a secondary all week has
// less left to close, but hasn't been "trained" for the purpose of over-target
// penalties.
const computeMuscleDeficits = (
  weeklyTargets: Partial<Record<MuscleGroup, number>>,
  coverage: ReturnType<typeof computeCoverage>,
): MuscleDeficitMap => {
  const deficits: MuscleDeficitMap = {};
  (Object.entries(weeklyTargets) as [MuscleGroup, number][]).forEach(([muscle, target]) => {
    const primary = coverage.muscleStats[muscle]?.primaryStimulus ?? 0;
    const secondary = coverage.muscleStats[muscle]?.secondaryStimulus ?? 0;
    const effectiveDone = primary + secondary;
    deficits[muscle] = Math.max(0, target - effectiveDone);
  });

  return deficits;
};

const sumDeficits = (
  deficits: Partial<Record<MuscleGroup, number>>,
  muscles: MuscleGroup[],
): number => muscles.reduce((sum, muscle) => sum + (deficits[muscle] ?? 0), 0);

const adaptSelectedSlot = (
  slot: SplitSlot,
  profile: TrainingProfile,
  muscleDeficits: MuscleDeficitMap,
  recentMuscleFatigue: Partial<Record<MuscleGroup, number>>,
  need: Record<MovementPattern, number>,
): SplitSlot => {
  if (!(profile.goal === "physique" && isUpperSlot(slot) && !isLowerSlot(slot))) return slot;

  const lowerFatigue = sumDeficits(recentMuscleFatigue, [
    "glutes",
    "quads",
    "hamstrings",
    "adductors",
    "core",
  ]);
  // "shoulders" is excluded here (and from pullDeficit/pressDeficit below) because
  // rear-delt-focused pull work (rows, face pulls, reverse flies) trains it as a
  // secondary target too — counting it toward "press" fatigue/deficit lets a
  // pull-heavy week masquerade as recent pressing and wrongly suppress pressing further.
  const pushFatigue = sumDeficits(recentMuscleFatigue, ["chest", "triceps"]);
  const pullDeficit = sumDeficits(muscleDeficits, ["back", "rear_delts", "biceps"]);
  const pressDeficit = sumDeficits(muscleDeficits, ["chest", "triceps"]);

  if (
    lowerFatigue <
      PLANNER_TUNING.splitSelection.adaptiveUpperPullLowerFatigueThreshold ||
    pullDeficit <
      pressDeficit + PLANNER_TUNING.splitSelection.adaptiveUpperPullDeficitGap
  ) {
    return slot;
  }

  // Plyo/conditioning in lower sessions can inflate chest/tricep fatigue without representing actual pressing — guard: skip when push is entirely uncovered this week.
  const strictPullBias =
    (need["push"] ?? 0) < 3 &&
    (muscleDeficits.shoulders ?? 0) < PLANNER_TUNING.splitSelection.adaptiveUpperPullShoulderDeficitThreshold &&
    pushFatigue >= PLANNER_TUNING.splitSelection.adaptiveUpperPullPushFatigueThreshold;

  // Targets stay the slot's band shares — composeSessionSlot shapes volume
  // from the week's actual deficit; this rewrite only steers movement and focus.
  return {
    ...slot,
    summary: strictPullBias
      ? "Upper session biased hard toward back and rear-delt catch-up with minimal pressing."
      : "Upper session biased toward back and rear-delt catch-up with controlled pressing.",
    focusMuscles: strictPullBias
      ? ["back", "rear_delts", "biceps", "core"]
      : ["back", "rear_delts", "shoulders", "biceps", "core"],
    preferredMovements: ["pull"],
    allowedMovements: strictPullBias ? ["pull", "carry_core"] : ["pull", "push", "carry_core"],
  };
};

// Movements that can deliver primary stimulus to each muscle — decides whether a
// muscle absent from the base slot can be added to today's session at all.
const COMPOSITION_MOVEMENTS: Record<MuscleGroup, MovementPattern[]> = {
  quads: ["squat", "single_leg"],
  glutes: ["hinge", "single_leg", "squat"],
  hamstrings: ["hinge", "single_leg"],
  adductors: ["squat", "single_leg"],
  hip_flexors: ["carry_core"],
  chest: ["push"],
  shoulders: ["push"],
  triceps: ["push"],
  back: ["pull"],
  rear_delts: ["pull"],
  biceps: ["pull"],
  core: ["carry_core"],
  calves: [],
};

type CompositionInputs = {
  band: WeeklyTargetBand;
  coverage: ReturnType<typeof computeCoverage>;
  overCeiling: Set<MuscleGroup>;
  requiredMovements: MovementPattern[];
  loggedSessions: number;
  remainingSessions: number;
  daysPerWeek: number;
  forced: boolean;
};

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));

// Reshapes the selected template slot toward this week's remaining distance to
// the band floor. The template is the prior: with nothing logged the slot
// passes through untouched, and its share stays a lower bound for any muscle
// still under its floor, so a clean on-plan week reproduces the template.
// Reshaping only appears where logged work (whoever programmed it) diverged
// from the plan: muscles already at their floor drop out, muscles past their
// ceiling are avoided, and muscles no remaining session will cover are added.
// Distance is measured on primary stimulus, like saturation and the UI rows,
// so secondary ride-along volume can't erase a slot's own theme.
// A user-forced slot keeps its theme; only the ceiling is enforced.
// id, title and summary are never changed: keystone anchors, slot inference and
// forced slots all key on them.
export const composeSessionSlot = (
  baseSlot: SplitSlot,
  futureSlots: SplitSlot[],
  inputs: CompositionInputs,
): { slot: SplitSlot; composition: SessionComposition } => {
  const tuning = PLANNER_TUNING.composition;
  const { band, coverage, overCeiling, requiredMovements, loggedSessions, remainingSessions, daysPerWeek, forced } = inputs;
  const primaryDone = (muscle: MuscleGroup): number => coverage.muscleStats[muscle]?.primaryStimulus ?? 0;
  const leftToFloor = (muscle: MuscleGroup): number =>
    Math.max(0, (band[muscle]?.floor ?? 0) - primaryDone(muscle));
  const covered = (Object.keys(band) as MuscleGroup[]).filter((muscle) => {
    const floor = band[muscle]?.floor ?? 0;
    return floor > 0 && primaryDone(muscle) >= floor;
  });
  const baseTargets = baseSlot.targetPrimaryStimulus;
  const closesOf = (targets: Partial<Record<MuscleGroup, number>>): MuscleGroup[] =>
    (Object.keys(targets) as MuscleGroup[])
      .filter((muscle) => leftToFloor(muscle) > 0)
      .sort((a, b) => (targets[b] ?? 0) - (targets[a] ?? 0))
      .slice(0, 3);

  if (loggedSessions === 0 && requiredMovements.length === 0) {
    return {
      slot: baseSlot,
      composition: {
        baseSlotId: baseSlot.id,
        loggedSessions,
        remainingSessions,
        priorWeight: 1,
        todayTargets: baseTargets,
        closes: [],
        covered,
        avoid: [],
        requiredMovements: [],
      },
    };
  }

  const avoid = (Object.keys(baseTargets) as MuscleGroup[]).filter((muscle) => overCeiling.has(muscle));

  if (forced) {
    const today: Partial<Record<MuscleGroup, number>> = {};
    (Object.entries(baseTargets) as [MuscleGroup, number][]).forEach(([muscle, target]) => {
      if (!overCeiling.has(muscle) && target > 0) today[muscle] = target;
    });
    return {
      slot: {
        ...baseSlot,
        targetPrimaryStimulus: today,
        focusMuscles: baseSlot.focusMuscles.filter((muscle) => !overCeiling.has(muscle)),
      },
      composition: {
        baseSlotId: baseSlot.id,
        loggedSessions,
        remainingSessions,
        priorWeight: 1,
        todayTargets: today,
        closes: closesOf(today),
        covered,
        avoid,
        requiredMovements: [],
      },
    };
  }

  const priorWeight =
    remainingSessions <= tuning.lateWeekRemaining
      ? tuning.lastSessionPriorWeight
      : clamp(1 - loggedSessions / daysPerWeek, tuning.minPriorWeight, 1);

  const future: Partial<Record<MuscleGroup, number>> = {};
  futureSlots.forEach((slot) => {
    (Object.entries(slot.targetPrimaryStimulus) as [MuscleGroup, number][]).forEach(([muscle, target]) => {
      future[muscle] = (future[muscle] ?? 0) + target;
    });
  });

  const allowed = new Set<MovementPattern>([
    ...baseSlot.allowedMovements,
    ...(baseSlot.supplementalMovements ?? []),
    ...requiredMovements,
  ]);
  const candidates = new Set<MuscleGroup>([
    ...(Object.keys(baseTargets) as MuscleGroup[]),
    ...(Object.keys(band) as MuscleGroup[]).filter((muscle) => leftToFloor(muscle) > 0),
  ]);

  const today: Partial<Record<MuscleGroup, number>> = {};
  candidates.forEach((muscle) => {
    if (overCeiling.has(muscle)) {
      if (!avoid.includes(muscle) && (baseTargets[muscle] ?? 0) > 0) avoid.push(muscle);
      return;
    }
    const left = leftToFloor(muscle);
    if (left <= 0) return;
    const baseTarget = baseTargets[muscle] ?? 0;
    const evenShare = left / remainingSessions;
    const residual = Math.max(0, left - (future[muscle] ?? 0));
    const needToday = Math.max(evenShare, residual);
    const baseShare = Math.min(baseTarget, Math.max(left, tuning.minTarget));
    const muscleBand = band[muscle];
    const cap = muscleBand && isMajorTarget(muscleBand) ? tuning.sessionCapMajor : tuning.sessionCapSupport;
    const value = roundHalf(clamp(Math.max(baseShare, (1 - priorWeight) * needToday), 0, cap));
    const newcomer = baseTarget <= 0;
    // A support muscle whose whole weekly floor is smaller than the newcomer
    // threshold (adductors on a strength split) must still be reachable, or
    // nothing in the week will ever ask for it.
    const newcomerFloor = Math.min(tuning.newcomerMinTarget, muscleBand?.floor ?? tuning.newcomerMinTarget);
    if (
      newcomer &&
      (value < newcomerFloor ||
        !COMPOSITION_MOVEMENTS[muscle].some((movement) => allowed.has(movement)))
    ) {
      return;
    }
    if (value >= tuning.minTarget) today[muscle] = value;
  });

  // Never hand assembly an empty or trivial target map: when the week has
  // closed nearly everything, fall back to a maintenance dose of the slot's
  // own top muscles that aren't over ceiling.
  const total = Object.values(today).reduce((sum, value) => sum + (value ?? 0), 0);
  if (total < tuning.minComposedTargetTotal) {
    (Object.entries(baseTargets) as [MuscleGroup, number][])
      .filter(([muscle]) => !overCeiling.has(muscle))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .forEach(([muscle, target]) => {
        today[muscle] = Math.max(today[muscle] ?? 0, roundHalf(target));
      });
  }

  const newcomers = (Object.keys(today) as MuscleGroup[])
    .filter((muscle) => (baseTargets[muscle] ?? 0) <= 0 && (today[muscle] ?? 0) >= tuning.focusThreshold)
    .sort((a, b) => (today[b] ?? 0) - (today[a] ?? 0));
  const focusMuscles = [
    ...baseSlot.focusMuscles.filter((muscle) => !overCeiling.has(muscle)),
    ...newcomers.filter((muscle) => !baseSlot.focusMuscles.includes(muscle)).slice(0, tuning.maxNewcomerFocus),
  ];

  const withRequired = (movements: MovementPattern[]): MovementPattern[] => [
    ...movements,
    ...requiredMovements.filter((movement) => !movements.includes(movement)),
  ];

  return {
    slot: {
      ...baseSlot,
      targetPrimaryStimulus: today,
      focusMuscles,
      allowedMovements: withRequired(baseSlot.allowedMovements),
      preferredMovements: withRequired(baseSlot.preferredMovements),
    },
    composition: {
      baseSlotId: baseSlot.id,
      loggedSessions,
      remainingSessions,
      priorWeight,
      todayTargets: today,
      closes: closesOf(today),
      covered,
      avoid,
      requiredMovements,
    },
  };
};

const scoreSplitSlot = (
  slot: SplitSlot,
  index: number,
  need: Record<MovementPattern, number>,
  muscleDeficits: MuscleDeficitMap = {},
  muscleSaturation: Partial<Record<MuscleGroup, number>> = {},
  lastSessionMovements: Set<MovementPattern> = new Set(),
  weeklyBiasBalance: WeeklyBiasBalance = { lower: 0, upper: 0 },
  recentMuscleFatigue: Partial<Record<MuscleGroup, number>> = {},
): number => {
  const slotPrimaryTargetTotal = Object.values(slot.targetPrimaryStimulus).reduce(
    (sum, sets) => sum + (sets ?? 0),
    0,
  );
  const preferredScores = slot.preferredMovements
    .map((movement) => (need[movement] ?? 0) * (MOVEMENT_PRIORITY[movement] ?? 1))
    .sort((a, b) => b - a);
  const allowedScores = slot.allowedMovements
    .filter((movement) => !slot.preferredMovements.includes(movement))
    .map((movement) => (need[movement] ?? 0) * (MOVEMENT_PRIORITY[movement] ?? 1))
    .sort((a, b) => b - a);
  const deficitScores = (Object.entries(slot.targetPrimaryStimulus) as [MuscleGroup, number][])
    .filter(([, target]) => target > 0)
    .map(([muscle, target]) => {
      const deficit = muscleDeficits[muscle] ?? 0;
      const weight = PRIMARY_MUSCLE_PRIORITY[muscle] ?? 1;
      return {
        target,
        weightedTarget: target * weight,
        value: Math.min(target, deficit) * weight,
      };
    })
    .sort((a, b) => b.value - a.value);

  let score = 0;
  // Normalize by the priority-WEIGHTED target total so the ratio is a true
  // "fraction of this slot's plan still deficient" (1.0 on a fresh week for
  // every slot) — an unweighted denominator let small low-priority support
  // targets dilute a slot's coverage score just by existing.
  const weightedTargetTotal = deficitScores.reduce((sum, item) => sum + item.weightedTarget, 0);
  const deficitCoverage =
    weightedTargetTotal > 0
      ? deficitScores.reduce((sum, item) => sum + item.value, 0) / weightedTargetTotal
      : 0;
  if (deficitCoverage > 0) score += deficitCoverage * PLANNER_TUNING.splitSelection.deficitCoverageWeight;
  if (deficitScores[0]) score += deficitScores[0].value * PLANNER_TUNING.splitSelection.topDeficitWeight;
  if (deficitScores[1]) score += deficitScores[1].value * PLANNER_TUNING.splitSelection.secondDeficitWeight;
  if (deficitScores[2]) score += deficitScores[2].value * PLANNER_TUNING.splitSelection.thirdDeficitWeight;

  if (preferredScores[0]) score += preferredScores[0] * PLANNER_TUNING.splitSelection.preferredNeedTopWeight;
  if (preferredScores[1]) score += preferredScores[1] * PLANNER_TUNING.splitSelection.preferredNeedSecondWeight;
  if (allowedScores[0]) score += allowedScores[0] * PLANNER_TUNING.splitSelection.allowedNeedWeight;

  // Keep a slight bias toward the earliest missing slot so the split does not
  // drift unless another slot closes a more urgent weekly gap.
  score -= index * PLANNER_TUNING.splitSelection.slotOrderPenalty;

  // Penalize slots whose primary muscles have already met their weekly volume
  // target — training a saturated muscle group adds fatigue without adaptation.
  const targetedMuscles = Object.keys(slot.targetPrimaryStimulus) as MuscleGroup[];
  const saturations = targetedMuscles
    .filter((m) => (slot.targetPrimaryStimulus[m] ?? 0) > 0 && muscleSaturation[m] !== undefined)
    .map((m) => muscleSaturation[m] as number);
  if (saturations.length > 0) {
    const avg = saturations.reduce((a, b) => a + b, 0) / saturations.length;
    // Check if any PRIMARY-DRIVER muscle (large enough target to define the slot's identity)
    // is genuinely over its weekly target. Minor support targets (e.g. glutes: 2 in Upper A)
    // are excluded so support muscles saturated by another slot don't penalize this one.
    const maxMajorSat = Math.max(
      0,
      ...slotMajorMuscles(slot)
        .filter((m) => muscleSaturation[m] !== undefined)
        .map((m) => muscleSaturation[m] as number),
    );
    if (maxMajorSat > PLANNER_TUNING.splitSelection.saturationOverTargetThreshold) {
      const excess = maxMajorSat - PLANNER_TUNING.splitSelection.saturationOverTargetThreshold;
      score -= PLANNER_TUNING.splitSelection.saturationOverTargetPenalty +
        excess * PLANNER_TUNING.splitSelection.saturationOverTargetPenaltyScale;
    } else if (avg >= PLANNER_TUNING.splitSelection.saturationHighThreshold) {
      score -= PLANNER_TUNING.splitSelection.saturationHighPenalty;
    } else if (avg >= PLANNER_TUNING.splitSelection.saturationMediumThreshold) {
      score -= PLANNER_TUNING.splitSelection.saturationMediumPenalty;
    }
  }

  // Penalize repeating the same movement patterns as the last session.
  // A trainer would never program squat+hinge+single_leg back-to-back regardless
  // of whether weekly volume targets are met.
  if (lastSessionMovements.size > 0 && slot.preferredMovements.length > 0) {
    const overlap = slot.preferredMovements.filter(m => lastSessionMovements.has(m)).length;
    const overlapFraction = overlap / slot.preferredMovements.length;
    if (overlapFraction >= 1.0) score -= PLANNER_TUNING.splitSelection.fullOverlapPenalty;
    else if (overlapFraction >= 0.67) score -= PLANNER_TUNING.splitSelection.partialOverlapPenalty;
  }

  // Penalize slots whose focus muscles were recently stressed.
  // Coarse movement-pattern overlap doesn't capture that a trainer workout
  // hitting heavy squats/lunges/RDLs overlaps with Lower A's glute+hamstring focus.
  const fatiguePenalty = slot.focusMuscles.reduce(
    (sum, muscle) => sum + (recentMuscleFatigue[muscle] ?? 0),
    0,
  );
  if (fatiguePenalty > 0) {
    score -= fatiguePenalty * PLANNER_TUNING.splitSelection.recentFatigueSlotPenaltyWeight;
  }

  const lowerBiasFatigue = sumDeficits(recentMuscleFatigue, [
    "glutes",
    "quads",
    "hamstrings",
    "adductors",
    "core",
  ]);
  const upperPullDeficit = sumDeficits(muscleDeficits, [
    "back",
    "rear_delts",
    "biceps",
  ]);
  const lowerPrimaryDeficit = sumDeficits(muscleDeficits, [
    "glutes",
    "quads",
    "hamstrings",
    "adductors",
  ]);
  const lowerSlotBackSupportOnly =
    isLowerSlot(slot) &&
    (slot.targetPrimaryStimulus.back ?? 0) > 0 &&
    (slot.targetPrimaryStimulus.back ?? 0) <= 2 &&
    (slot.targetPrimaryStimulus.glutes ?? 0) + (slot.targetPrimaryStimulus.hamstrings ?? 0) + (slot.targetPrimaryStimulus.quads ?? 0) >= 8;

  if (
    lowerBiasFatigue >= PLANNER_TUNING.splitSelection.lowerBiasFatigueThreshold &&
    upperPullDeficit >= lowerPrimaryDeficit + PLANNER_TUNING.splitSelection.upperPullPivotGapThreshold
  ) {
    if (isUpperSlot(slot) && slot.focusMuscles.some((muscle) => muscle === "back" || muscle === "rear_delts")) {
      score += PLANNER_TUNING.splitSelection.upperPullPivotBonus;
    }
    if (isLowerSlot(slot)) {
      score -= lowerBiasFatigue * PLANNER_TUNING.splitSelection.lowerBiasFatiguePenaltyWeight;
      if (lowerSlotBackSupportOnly) {
        score -= PLANNER_TUNING.splitSelection.lowerBackSupportMisreadPenalty;
      }
    }
  }

  const lowerLead = weeklyBiasBalance.lower - weeklyBiasBalance.upper;
  if (lowerLead >= PLANNER_TUNING.splitSelection.leadThreshold) {
    if (isUpperSlot(slot)) {
      score += Math.min(
        PLANNER_TUNING.splitSelection.leadCap,
        lowerLead * PLANNER_TUNING.splitSelection.leadCatchupBoost,
      );
    }
    if (isLowerSlot(slot)) {
      score -= Math.min(
        PLANNER_TUNING.splitSelection.leadCap,
        lowerLead * PLANNER_TUNING.splitSelection.leadSameSidePenalty,
      );
    }
  }

  const upperLead = weeklyBiasBalance.upper - weeklyBiasBalance.lower;
  if (upperLead >= PLANNER_TUNING.splitSelection.leadThreshold) {
    if (isLowerSlot(slot)) {
      score += Math.min(
        PLANNER_TUNING.splitSelection.leadCap,
        upperLead * PLANNER_TUNING.splitSelection.leadCatchupBoost,
      );
    }
    if (isUpperSlot(slot)) {
      score -= Math.min(
        PLANNER_TUNING.splitSelection.leadCap,
        upperLead * PLANNER_TUNING.splitSelection.leadSameSidePenalty,
      );
    }
  }

  return score;
};

const pickBestSplitSlotIndex = (
  split: SplitSlot[],
  candidateIndices: number[],
  need: Record<MovementPattern, number>,
  muscleDeficits: MuscleDeficitMap = {},
  muscleSaturation: Partial<Record<MuscleGroup, number>> = {},
  lastSessionMovements: Set<MovementPattern> = new Set(),
  weeklyBiasBalance: WeeklyBiasBalance = { lower: 0, upper: 0 },
  recentMuscleFatigue: Partial<Record<MuscleGroup, number>> = {},
): { index: number; score: number } | null => {
  let best: { index: number; score: number } | null = null;

  candidateIndices.forEach((index) => {
    const score = scoreSplitSlot(
      split[index],
      index,
      need,
      muscleDeficits,
      muscleSaturation,
      lastSessionMovements,
      weeklyBiasBalance,
      recentMuscleFatigue,
    );
    if (!best || score > best.score) {
      best = { index, score };
    }
  });

  return best;
};

const rankSplitSlotIndices = (
  split: SplitSlot[],
  need: Record<MovementPattern, number>,
  muscleDeficits: MuscleDeficitMap = {},
  muscleSaturation: Partial<Record<MuscleGroup, number>> = {},
  lastSessionMovements: Set<MovementPattern> = new Set(),
  weeklyBiasBalance: WeeklyBiasBalance = { lower: 0, upper: 0 },
  recentMuscleFatigue: Partial<Record<MuscleGroup, number>> = {},
): Array<{ index: number; score: number }> =>
  split
    .map((slot, index) => ({
      index,
      score: scoreSplitSlot(
        slot,
        index,
        need,
        muscleDeficits,
        muscleSaturation,
        lastSessionMovements,
        weeklyBiasBalance,
        recentMuscleFatigue,
      ),
    }))
    .sort((a, b) => b.score - a.score);

const buildSlotRecommendations = (
  split: SplitSlot[],
  rankedSlots: Array<{ index: number; score: number }>,
  recommendedIndex: number,
  muscleDeficits: MuscleDeficitMap,
  recentMuscleFatigue: Partial<Record<MuscleGroup, number>>,
): WorkoutDraft["slotRecommendations"] => {
  const recommendedEntry =
    rankedSlots.find((entry) => entry.index === recommendedIndex) ?? {
      index: recommendedIndex,
      score: 0,
    };
  const ordered = [
    recommendedEntry,
    ...rankedSlots.filter((entry) => entry.index !== recommendedIndex),
  ];

  return ordered.map(({ index, score }, rank) => {
    const slot = split[index];
    const topMuscles = (Object.entries(slot.targetPrimaryStimulus) as [MuscleGroup, number][])
      .filter(([, target]) => target > 0)
      .map(([muscle, target]) => ({
        muscle,
        value: Math.min(target, muscleDeficits[muscle] ?? 0) * (PRIMARY_MUSCLE_PRIORITY[muscle] ?? 1),
      }))
      .sort((a, b) => b.value - a.value)
      .filter((entry) => entry.value > 0)
      .map((entry) => entry.muscle)
      .slice(0, 3);
    const reasonMuscles = topMuscles.length > 0 ? topMuscles : slot.focusMuscles.slice(0, 3);
    const note =
      topMuscles.length > 0
        ? `Targets the biggest remaining gaps in ${reasonMuscles.join(", ")}.`
        : `Valid option to keep ${reasonMuscles.join(", ")} moving this week.`;

    const fatigueHotspots = slot.focusMuscles
      .map((muscle) => ({
        muscle,
        value: recentMuscleFatigue[muscle] ?? 0,
      }))
      .filter((entry) => entry.value >= PLANNER_TUNING.rationale.recentFocusStressThreshold)
      .sort((a, b) => b.value - a.value)
      .map((entry) => entry.muscle)
      .slice(0, 2);
    const caution =
      fatigueHotspots.length > 0
        ? `More overlap with recent ${fatigueHotspots.join(" / ")} fatigue.`
        : null;

    return {
      slotId: slot.id,
      title: slot.title,
      summary: slot.summary,
      rank: rank + 1,
      score,
      isRecommended: index === recommendedIndex,
      targetPrimaryStimulus: slot.targetPrimaryStimulus,
      targetPrimarySets: slot.targetPrimaryStimulus,
      topMuscles,
      allowedMovements: slot.allowedMovements,
      note,
      caution,
    };
  });
};

// Returns true when a slot has at least one primary-driver muscle (large enough target
// to define the slot's identity) that has already hit or exceeded its weekly volume target.
// Minor support targets (e.g. glutes: 2 in Upper A) are excluded so saturation from
// another slot's primary work doesn't block an upper session.
// Template slots carry their major muscles from normalization (share of the
// weekly floor); hand-built slots fall back to the absolute threshold.
const slotMajorMuscles = (slot: SplitSlot): MuscleGroup[] => {
  if (slot.majorMuscles) return slot.majorMuscles;
  const majorThreshold = PLANNER_TUNING.splitSelection.saturationOverTargetMajorMuscleThreshold;
  return (Object.entries(slot.targetPrimaryStimulus) as [MuscleGroup, number][])
    .filter(([, target]) => target >= majorThreshold)
    .map(([muscle]) => muscle);
};

const slotHasOverTargetMajorMuscle = (
  slot: SplitSlot,
  overCeiling: Set<MuscleGroup>,
): boolean =>
  // Hard exclusion only past the band CEILING — the graduated over-target
  // penalties in scoreSplitSlot own the floor-to-ceiling band. Filtering at
  // the floor let incidental co-primary volume (Monday lunges nudging quads
  // just past target) delete Wednesday's quad day and force an upper/upper week.
  slotMajorMuscles(slot).some((muscle) => overCeiling.has(muscle));

const getNextSplitSlotIndex = (
  split: SplitSlot[],
  workouts: Workout[],
  incompleteIndices: number[],
  need: Record<MovementPattern, number>,
  muscleDeficits: MuscleDeficitMap = {},
  muscleSaturation: Partial<Record<MuscleGroup, number>> = {},
  lastSessionMovements: Set<MovementPattern> = new Set(),
  recentMuscleFatigue: Partial<Record<MuscleGroup, number>> = {},
  overCeiling: Set<MuscleGroup> = new Set(),
): number => {
  const weeklyBiasBalance = summarizeWeeklyBiasBalance(split, workouts);
  const lastLogged = [...workouts].sort(compareWorkoutsDesc)[0];
  const lastSlot = lastLogged?.planSlot?.slotId
    ? split.find((slot) => slot.id === lastLogged.planSlot?.slotId)
    : undefined;
  const lastBias = lastSlot ? getSlotBias(lastSlot) : "mixed";

  // A slot whose defining muscles are past the band ceiling is out for the
  // day. If that empties the incomplete pool, the whole split is re-scored
  // rather than forcing a session onto muscles that should be left alone.
  const nonSaturatedIncomplete = incompleteIndices.filter(
    (i) => !slotHasOverTargetMajorMuscle(split[i], overCeiling),
  );
  if (nonSaturatedIncomplete.length > 0) {
    let incompleteToScore = nonSaturatedIncomplete;
    // The saturation filter must never force back-to-back same-bias sessions:
    // if it leaves only slots matching yesterday's bias, restore the
    // alternating candidates and let the graduated over-target penalties
    // arbitrate on score instead.
    if (
      lastBias !== "mixed" &&
      incompleteToScore.every((i) => getSlotBias(split[i]) === lastBias)
    ) {
      const alternating = incompleteIndices.filter((i) => getSlotBias(split[i]) !== lastBias);
      if (alternating.length > 0) incompleteToScore = [...incompleteToScore, ...alternating];
    }
    const bestIncomplete = pickBestSplitSlotIndex(
      split,
      incompleteToScore,
      need,
      muscleDeficits,
      muscleSaturation,
      lastSessionMovements,
      weeklyBiasBalance,
      recentMuscleFatigue,
    );
    if (bestIncomplete) return bestIncomplete.index;
    return incompleteToScore[0];
  }

  const allIndices = split.map((_, index) => index);
  const nonSaturatedAll = allIndices.filter(
    (i) => !slotHasOverTargetMajorMuscle(split[i], overCeiling),
  );
  let allToScore = nonSaturatedAll.length > 0 ? nonSaturatedAll : allIndices;
  // Re-scoring the whole split must not hand back the theme just trained.
  if (lastSlot && allToScore.length > 1) {
    const withoutLast = allToScore.filter((i) => split[i].id !== lastSlot.id);
    if (withoutLast.length > 0) allToScore = withoutLast;
  }
  const bestOverall = pickBestSplitSlotIndex(
    split,
    allToScore,
    need,
    muscleDeficits,
    muscleSaturation,
    lastSessionMovements,
    weeklyBiasBalance,
    recentMuscleFatigue,
  );
  if (bestOverall) return bestOverall.index;

  return 0;
};

const maybeOverrideForCriticalGap = (
  split: SplitSlot[],
  incompleteIndices: number[],
  baseIndex: number,
  need: Record<MovementPattern, number>,
  muscleDeficits: MuscleDeficitMap = {},
  muscleSaturation: Partial<Record<MuscleGroup, number>> = {},
  lastSessionMovements: Set<MovementPattern> = new Set(),
  weeklyBiasBalance: WeeklyBiasBalance = { lower: 0, upper: 0 },
  recentMuscleFatigue: Partial<Record<MuscleGroup, number>> = {},
  overCeiling: Set<MuscleGroup> = new Set(),
): number => {
  // A fresh week (nothing completed yet) has every movement at full need, so
  // "critical" carries no signal and the base slot order should stand — this
  // override is a late-week rescue for a movement the remaining slots would
  // otherwise strand, not a reason to jump the split on day one.
  if (incompleteIndices.length === 0) return baseIndex;
  const baseSlot = split[baseIndex];
  // Pull/push are ranked above hinge here so that when a lower slot (hinge-dominant)
  // is the base, missing pull/push gets checked before hinge short-circuits the loop.
  const criticalGapPriority: Partial<Record<MovementPattern, number>> = {
    ...MOVEMENT_PRIORITY,
    pull: 1.5,
    push: 1.0,
    hinge: 1.1,
  };
  const criticalMovements = MOVEMENT_PATTERNS
    .filter((movement) => (need[movement] ?? 0) >= 3)
    // squat and single_leg are both knee-dominant: a week full of lunges has
    // no squat "gap" worth overriding the split for (and vice versa). Without
    // this, an anchor week that served knee flexion via single_leg work gets
    // a squat-critical override that re-picks an already-completed lower slot.
    .filter(
      (movement) =>
        (movement !== "squat" || (need["single_leg"] ?? 0) >= 3) &&
        (movement !== "single_leg" || (need["squat"] ?? 0) >= 3),
    )
    .sort(
      (a, b) => (criticalGapPriority[b] ?? 0) - (criticalGapPriority[a] ?? 0),
    );

  if (criticalMovements.length === 0) return baseIndex;

  for (const movement of criticalMovements) {
    if (baseSlot.allowedMovements.includes(movement)) return baseIndex;

    let bestIndex = baseIndex;
    let bestScore = scoreSplitSlot(
      baseSlot,
      baseIndex,
      need,
      muscleDeficits,
      muscleSaturation,
      lastSessionMovements,
      weeklyBiasBalance,
      recentMuscleFatigue,
    );

    const eligible = split
      .map((slot, index) => ({ slot, index }))
      .filter(({ slot }) => slot.allowedMovements.includes(movement));
    // Prefer incomplete slots — forcing a completed slot repeats a session theme
    // and strands another slot — but fall back to completed ones when no
    // incomplete slot can cover the critical movement. Saturation filtering
    // happens inside that pool so it can't push the pick back onto a repeat.
    const incompleteSet = new Set(incompleteIndices);
    const incompleteEligible = eligible.filter(
      ({ index }) => incompleteSet.size === 0 || incompleteSet.has(index),
    );
    const pool = incompleteEligible.length > 0 ? incompleteEligible : eligible;
    const nonSaturatedEligible = pool.filter(
      ({ slot }) => !slotHasOverTargetMajorMuscle(slot, overCeiling),
    );
    const candidates = nonSaturatedEligible.length > 0 ? nonSaturatedEligible : pool;

    candidates.forEach(({ slot, index }) => {
      let score = scoreSplitSlot(
        slot,
        index,
        need,
        muscleDeficits,
        muscleSaturation,
        lastSessionMovements,
        weeklyBiasBalance,
        recentMuscleFatigue,
      );
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

const maybeOverrideForStalledBias = (
  split: SplitSlot[],
  baseIndex: number,
  incompleteIndices: number[],
  need: Record<MovementPattern, number>,
  muscleDeficits: MuscleDeficitMap,
  muscleSaturation: Partial<Record<MuscleGroup, number>>,
  lastSessionMovements: Set<MovementPattern>,
  weeklyBiasBalance: WeeklyBiasBalance,
  stalledBiasPressure: BiasPressure,
  recentMuscleFatigue: Partial<Record<MuscleGroup, number>> = {},
): number => {
  const preferredBias =
    stalledBiasPressure.lower >= stalledBiasPressure.upper + 1
      ? "lower"
      : stalledBiasPressure.upper >= stalledBiasPressure.lower + 1
        ? "upper"
        : "mixed";
  if (preferredBias === "mixed") return baseIndex;

  // Don't override when the preferred type has fewer remaining cycle slots than the
  // other type. That means the non-preferred type is more behind in the current cycle
  // and skipping it would push the imbalance further in the wrong direction. Stall
  // pressure from accessory exercises (e.g. lateral raises) shouldn't override the
  // cycle order when the preferred type is already ahead.
  const incompletePreferred = incompleteIndices.filter(
    (i) => getSlotBias(split[i]) === preferredBias,
  ).length;
  const incompleteOpposite = incompleteIndices.filter((i) => {
    const bias = getSlotBias(split[i]);
    return bias !== preferredBias && bias !== "mixed";
  }).length;
  if (incompletePreferred < incompleteOpposite) return baseIndex;

  const baseBias = getSlotBias(split[baseIndex]);
  if (baseBias === preferredBias) return baseIndex;

  const candidateIndices = incompleteIndices.filter(
    (index) => getSlotBias(split[index]) === preferredBias,
  );
  if (candidateIndices.length === 0) return baseIndex;

  const preferred = pickBestSplitSlotIndex(
    split,
    candidateIndices,
    need,
    muscleDeficits,
    muscleSaturation,
    lastSessionMovements,
    weeklyBiasBalance,
    recentMuscleFatigue,
  );
  if (!preferred) return baseIndex;
  return preferred.index;
};

const summarizeWorkoutMuscleStress = (
  workout: Workout,
): Partial<Record<MuscleGroup, number>> => {
  const stress: Partial<Record<MuscleGroup, number>> = {};

  workout.exercises.forEach((logEx) => {
    const exercise = EXERCISES.find((candidate) => candidate.name === logEx.exerciseName);
    if (!exercise) return;
    const sets = logEx.sets.length;
    const stimulus = estimateExerciseStimulus(exercise);
    const distributedStress = distributeRecoveryStress(
      exercise,
      sets * stimulus.recoveryPerSet,
    );

    Object.entries(distributedStress).forEach(([muscle, value]) => {
      const key = muscle as MuscleGroup;
      stress[key] = (stress[key] ?? 0) + value;
    });
  });

  return stress;
};

const sumMuscleStress = (
  stress: Partial<Record<MuscleGroup, number>>,
): number =>
  Object.values(stress).reduce((total, value) => total + (value ?? 0), 0);

const addMuscleStress = (
  target: Partial<Record<MuscleGroup, number>>,
  incoming: Partial<Record<MuscleGroup, number>>,
): void => {
  Object.entries(incoming).forEach(([muscle, value]) => {
    const key = muscle as MuscleGroup;
    target[key] = (target[key] ?? 0) + (value ?? 0);
  });
};

const estimatePlannedExerciseStress = (
  exercise: Exercise,
  rounds: number,
  multiplier = 1,
): Partial<Record<MuscleGroup, number>> => {
  const stimulus = estimateExerciseStimulus(exercise);
  return distributeRecoveryStress(
    exercise,
    rounds * stimulus.recoveryPerSet * multiplier,
  );
};

const ymdToUtcMs = (date: string): number => {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
};

const isWithinPastDays = (date: string, todayISO: string, days: number): boolean => {
  const diff = ymdToUtcMs(todayISO) - ymdToUtcMs(date);
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
};

const finisherRepeatPenalty = (
  exerciseNames: string[],
  workouts: Workout[],
  todayISO: string,
): number => {
  const uniqueNames = [...new Set(exerciseNames)];
  if (uniqueNames.length === 0) return 0;

  const recentWorkouts = workouts
    .filter((workout) => isWithinPastDays(workout.date, todayISO, 21))
    .sort(compareWorkoutsDesc)
    .slice(0, 6);

  return recentWorkouts.reduce((penalty, workout, index) => {
    const workoutNames = new Set(workout.exercises.map((exercise) => exercise.exerciseName));
    const overlap = uniqueNames.filter((name) => workoutNames.has(name)).length;
    if (overlap === 0) return penalty;

    const recencyMultiplier = Math.max(0.4, 1 - index * 0.15);
    if (overlap === uniqueNames.length) return penalty + 12 * recencyMultiplier;
    if (overlap >= Math.max(2, uniqueNames.length - 1)) return penalty + 4.5 * recencyMultiplier;
    if (overlap >= 2) return penalty + 1.5 * recencyMultiplier;
    return penalty;
  }, 0);
};

// Public helper — lets the UI build a DraftExercise from a library exercise
// without re-running the full generator (used by the per-exercise swap feature).
export function buildDraftExercise(
  ex: Exercise,
  targets: (number | string)[],
  workouts: Workout[],
  knownNames: Set<string>,
  environment: TrainingEnvironment = "full_gym",
): DraftExercise {
  const last = lastWorkingWeight(ex.name, workouts);
  const resolvedTargets = resolveDisplayTargets(targets, workouts, ex.name);
  return {
    name: ex.name,
    primary: ex.primary,
    secondary: ex.secondary,
    pattern: ex.pattern,
    movement: movementOf(ex),
    targets: resolvedTargets,
    suggestedWeight: capSuggestedWeight(last?.weight ?? null, ex, environment),
    suggestedDuration: ex.tracksDuration ? lastWorkingDuration(ex.name, workouts) : null,
    unit: last?.unit ?? "lb",
    isFamiliar: knownNames.has(ex.name),
    trend: getStallState(ex.name, workouts),
    progression: buildProgression(ex, resolvedTargets, workouts),
  };
}

export function generateNextWorkout(
  workouts: Workout[],
  todayISO: string,
  seed: number = Date.now(),
  profile?: TrainingProfile | null,
  overrides?: GeneratorOverrides,
): WorkoutDraft {
  const activeProfile: TrainingProfile = profile ?? DEFAULT_PROFILE;
  const window = weekContaining(todayISO);
  const coverage = computeCoverage(workouts, window);
  const recent = recentMusclesWithin(workouts, todayISO, 48);
  const recentStress = recentMuscleStressWithin(workouts, todayISO, 96);
  const rng = mulberry32(seed);
  const finisherRng = mulberry32(overrides?.finisherSeed ?? seed);
  // mulberry32's first outputs for nearby seeds are strongly correlated, which
  // made the finisher template draw collapse onto one index across seed
  // sweeps (10/12 sessions with the same finisher). Two warm-up draws
  // decorrelate the stream before any selection uses it.
  finisherRng();
  finisherRng();
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

  // Weekly targets are the band floors — the standard the week is graded
  // against, independent of which template slots happen to exist.
  const weeklyBand = getWeeklyTargetBand(activeProfile);
  const weeklyMuscleTargets = bandFloors(weeklyBand);
  // Muscle saturation: fraction of each muscle's weekly floor already done.
  // Used to deprioritize split slots whose primary muscles are already at volume.
  const muscleSaturation: Partial<Record<MuscleGroup, number>> = {};
  MUSCLE_GROUPS.forEach((m) => {
    const target = weeklyMuscleTargets[m];
    if (target && target > 0) {
      const done = coverage.muscleStats[m]?.primaryStimulus ?? 0;
      muscleSaturation[m] = done / target;
    }
  });
  // Slot selection reads saturation against the band CEILING: past the floor a
  // muscle simply stops contributing deficit, and only approaching the ceiling
  // should actively push a whole session theme away. Exercise selection keeps
  // the floor-based reading for entitlement and overshoot pricing.
  const muscleCeilingSaturation: Partial<Record<MuscleGroup, number>> = {};
  MUSCLE_GROUPS.forEach((m) => {
    const band = weeklyBand[m];
    if (band && band.ceiling > 0) {
      muscleCeilingSaturation[m] = (coverage.muscleStats[m]?.primaryStimulus ?? 0) / band.ceiling;
    }
  });
  const muscleDeficits = computeMuscleDeficits(weeklyMuscleTargets, coverage);
  // Finer balance axis under the coarse pattern need: once push or pull is
  // covered for the week, a plane of it still at zero days is worth a nudge.
  const directionNeed = new Set<DirectionKey>();
  (["push", "pull"] as const).forEach((pattern) => {
    if ((need[pattern] ?? 0) !== 0) return;
    (["horizontal", "vertical"] as const).forEach((direction) => {
      const key: DirectionKey = `${pattern}_${direction}`;
      if ((coverage.directionStats[key]?.daysHit.length ?? 0) === 0) directionNeed.add(key);
    });
  });
  const overCeiling = new Set<MuscleGroup>();
  MUSCLE_GROUPS.forEach((m) => {
    const band = weeklyBand[m];
    if (band && (coverage.muscleStats[m]?.primaryStimulus ?? 0) >= band.ceiling) overCeiling.add(m);
  });

  // How much of the week is left, judged purely from the log: every session
  // counts the same whoever programmed it, and daysPerWeek is an expectation,
  // not a commitment. Two workouts on one date are one training day.
  const loggedSessions = new Set(coverage.workouts.map((workout) => workout.date)).size;
  const remainingSessions = Math.max(1, activeProfile.daysPerWeek - loggedSessions);

  // With (almost) no sessions left, a pattern still at zero days becomes a
  // requirement of today's session rather than a preference. squat/single_leg
  // cover each other, as in maybeOverrideForCriticalGap.
  const requiredMovements: MovementPattern[] = [];
  if (remainingSessions <= PLANNER_TUNING.composition.lateWeekRemaining) {
    MOVEMENT_PATTERNS.forEach((mp) => {
      if ((need[mp] ?? 0) < 3) return;
      if (mp === "squat" && (need.single_leg ?? 0) < 3) return;
      if (mp === "single_leg" && (need.squat ?? 0) < 3) return;
      need[mp] += PLANNER_TUNING.composition.lateWeekNeedBoost;
      requiredMovements.push(mp);
    });
  }
  const stalledExerciseNames = new Set(
    EXERCISES.filter((exercise) => getStallState(exercise.name, workouts) === "stalled").map(
      (exercise) => exercise.name,
    ),
  );
  const stalledBiasPressure = summarizeStalledBiasPressure(stalledExerciseNames);

  // Movement patterns from the most recent session — used to avoid recommending
  // the same movement category back-to-back regardless of weekly volume targets.
  const lastSessionMovements = new Set<MovementPattern>();
  const lastSessionExerciseNames = new Set<string>();
  // Primary stimulus logged exactly YESTERDAY (calendar-adjacent) — a muscle
  // that took a hard dose yesterday gets no in-session entitlement today, so
  // back-to-back training days (weekend clusters, full-body splits, 5-day
  // schedules) stop re-hammering the same muscles. Core/hip flexors are
  // exempt: daily core work is part of the house style.
  const yesterdayPrimary: Partial<Record<MuscleGroup, number>> = {};
  workouts
    .filter((w) => w.date !== todayISO && isWithinPastDays(w.date, todayISO, 1))
    .forEach((w) =>
      w.exercises.forEach((logEx) => {
        const meta = findExerciseByName(logEx.exerciseName);
        if (!meta) return;
        const perSet = estimateExerciseStimulus(meta).primaryPerSet;
        meta.primary.forEach((muscle) => {
          yesterdayPrimary[muscle] = (yesterdayPrimary[muscle] ?? 0) + perSet * logEx.sets.length;
        });
      }),
    );
  const lastWorkout = [...workouts].sort(compareWorkoutsDesc)[0];
  if (lastWorkout) {
    lastWorkout.exercises.forEach((logEx) => {
      // The exact-repeat penalty is about back-to-back sessions; a lift last
      // done ~a week ago is a progression re-visit, not a repeat.
      if (isWithinPastDays(lastWorkout.date, todayISO, 2)) {
        lastSessionExerciseNames.add(logEx.exerciseName);
      }
      const ex = EXERCISES.find((e) => e.name === logEx.exerciseName);
      if (ex) {
        const movement = movementOf(ex);
        if (movement) lastSessionMovements.add(movement);
      }
    });
  }
  const recentSessionStressMaps = [...workouts]
    .sort(compareWorkoutsDesc)
    .slice(0, 2)
    .map((workout, index) => ({
      decay:
        index === 0
          ? PLANNER_TUNING.recentSessionOverlap.latestDecay
          : PLANNER_TUNING.recentSessionOverlap.priorDecay,
      stress: summarizeWorkoutMuscleStress(workout),
    }));

  // Cross-week continuity: treat slots explicitly completed in the last N days
  // as already done this cycle, even if they fall before the Monday week boundary.
  const crossWeekDays = PLANNER_TUNING.splitSelection.crossWeekRecencyDays;
  const crossWeekCutoff = new Date(window.startISO + "T12:00:00");
  crossWeekCutoff.setDate(crossWeekCutoff.getDate() - crossWeekDays);
  const crossWeekCutoffISO = crossWeekCutoff.toISOString().slice(0, 10);
  const crossWeekRecentWorkouts = workouts.filter(
    (w) => w.date >= crossWeekCutoffISO && w.date < window.startISO && w.planSlot?.slotId,
  );
  const recentWorkoutsForSlotSelection = [...coverage.workouts, ...crossWeekRecentWorkouts];

  // Muscle fatigue from recent sessions — summed with decay across last 2 workouts.
  // Used in slot scoring to avoid programming sessions that pile onto recently
  // stressed muscle groups, independent of coarse movement-pattern overlap.
  const recentMuscleFatigue: Partial<Record<MuscleGroup, number>> = {};
  recentSessionStressMaps.forEach(({ stress, decay }) => {
    (Object.entries(stress) as [MuscleGroup, number][]).forEach(([muscle, value]) => {
      recentMuscleFatigue[muscle] = (recentMuscleFatigue[muscle] ?? 0) + value * decay;
    });
  });

  // Cross-week recency stops Monday from repeating last Friday's slot, but it
  // must never DELETE a slot from the week: if counting last week's tail makes
  // every slot look complete, fall back to what this week alone hasn't done
  // (e.g. Lower B still runs even though it also closed last week).
  const combinedIncompleteIndices = getIncompleteSplitSlotIndices(split, recentWorkoutsForSlotSelection);
  const incompleteIndices =
    combinedIncompleteIndices.length > 0
      ? combinedIncompleteIndices
      : getIncompleteSplitSlotIndices(split, coverage.workouts);
  const weeklyBiasBalance = summarizeWeeklyBiasBalance(split, recentWorkoutsForSlotSelection);
  // A cycle with nothing logged starts at the top of the template — the
  // template is the prior, and band magnitudes must not reorder day one.
  // The one exception: if the most recent session (however old) already was
  // that opening theme, continue the rotation from the next slot instead of
  // repeating it.
  const isFreshCycle = recentWorkoutsForSlotSelection.length === 0;
  const lastLoggedOverall = [...workouts].sort(compareWorkoutsDesc)[0];
  const lastLoggedSlot = lastLoggedOverall
    ? split.find((candidate) => candidate.id === lastLoggedOverall.planSlot?.slotId)
    : undefined;
  const lastLoggedBias: InferredWorkoutBias = lastLoggedOverall
    ? lastLoggedSlot
      ? getSlotBias(lastLoggedSlot)
      : inferWorkoutBias(lastLoggedOverall)
    : "mixed";
  const freshStartIndex =
    split.length > 1 && lastLoggedBias !== "mixed" && getSlotBias(split[0]) === lastLoggedBias ? 1 : 0;
  const sessionIndex = isFreshCycle ? freshStartIndex : maybeOverrideForCriticalGap(
    split,
    incompleteIndices,
    maybeOverrideForStalledBias(
      split,
      getNextSplitSlotIndex(
        split,
        recentWorkoutsForSlotSelection,
        incompleteIndices,
        need,
        muscleDeficits,
        muscleCeilingSaturation,
        lastSessionMovements,
        recentMuscleFatigue,
        overCeiling,
      ),
      incompleteIndices,
      need,
      muscleDeficits,
      muscleCeilingSaturation,
      lastSessionMovements,
      weeklyBiasBalance,
      stalledBiasPressure,
      recentMuscleFatigue,
    ),
    need,
    muscleDeficits,
    muscleCeilingSaturation,
    lastSessionMovements,
    weeklyBiasBalance,
    recentMuscleFatigue,
    overCeiling,
  );
  const rankedSlots = rankSplitSlotIndices(
    split,
    need,
    muscleDeficits,
    muscleCeilingSaturation,
    lastSessionMovements,
    weeklyBiasBalance,
    recentMuscleFatigue,
  );
  const slotRecommendations = buildSlotRecommendations(
    split,
    rankedSlots,
    sessionIndex,
    muscleDeficits,
    recentMuscleFatigue,
  );
  const forcedSlotIndex =
    overrides?.forcedSlotId
      ? split.findIndex((candidate) => candidate.id === overrides.forcedSlotId)
      : -1;
  const selectedSlotIndex = forcedSlotIndex >= 0 ? forcedSlotIndex : sessionIndex;
  const adaptedSlot = adaptSelectedSlot(
    split[selectedSlotIndex],
    activeProfile,
    muscleDeficits,
    recentMuscleFatigue,
    need,
  );
  // The template slots most likely to still happen this week, in ranked order,
  // so today doesn't over-reach for volume a later session will carry.
  const futureSlots = rankedSlots
    .map((ranked) => ranked.index)
    .filter((index) => index !== selectedSlotIndex && incompleteIndices.includes(index))
    .slice(0, Math.max(0, remainingSessions - 1))
    .map((index) => split[index]);
  const { slot, composition } = composeSessionSlot(adaptedSlot, futureSlots, {
    band: weeklyBand,
    coverage,
    overCeiling,
    requiredMovements: forcedSlotIndex >= 0 ? [] : requiredMovements,
    loggedSessions,
    remainingSessions,
    daysPerWeek: activeProfile.daysPerWeek,
    forced: forcedSlotIndex >= 0,
  });
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

  // Lower families present in the last 2 sessions — stronger inter-session signal
  // than the week-level currentWeekFamilies penalty for unilateral/hinge patterns.
  const recentLowerFamilies = new Set<string>();
  [...workouts]
    .sort(compareWorkoutsDesc)
    .slice(0, 2)
    .forEach((w) => {
      w.exercises.forEach((logEx) => {
        const ex = EXERCISES.find((e) => e.name === logEx.exerciseName);
        if (!ex) return;
        const movement = movementOf(ex);
        if (movement === "hinge" || movement === "squat" || movement === "single_leg") {
          recentLowerFamilies.add(familyOf(ex));
        }
      });
    });

  const known = new Set<string>();
  workouts.forEach((w) =>
    w.exercises.forEach((e) => known.add(e.exerciseName)),
  );

  const watchedExerciseNames = new Set(
    EXERCISES.filter((exercise) => getStallState(exercise.name, workouts) === "watch").map(
      (exercise) => exercise.name,
    ),
  );
  const stalledFamilies = new Set(
    EXERCISES.filter((exercise) => stalledExerciseNames.has(exercise.name)).map((exercise) =>
      familyOf(exercise),
    ),
  );

  const used = new Set<string>();
  const claimedFamilies: Partial<Record<string, number>> = {};
  let pendingRdlPick = false;
  let pendingHingePick = false;
  let barbellCount = 0;
  const plannedSessionStress: Partial<Record<MuscleGroup, number>> = {};
  const claimedMovements: Record<MovementPattern, number> = {} as Record<
    MovementPattern,
    number
  >;
  MOVEMENT_PATTERNS.forEach((mp) => (claimedMovements[mp] = 0));

  // Hard cap on how many exercises in one session may load the same muscle
  // group, independent of plannedSessionStress's continuous soft budget
  // above. Counted in exercise-equivalents: a muscle tagged primary counts
  // as a full exercise, secondary counts as half — otherwise every
  // lower-body compound's incidental secondary core/hamstring engagement
  // would exhaust the cap on its own, blocking legitimate primary-focus
  // volume (e.g. a squat/deadlift/hinge day intentionally hitting glutes as
  // primary 4+ times). flaggedClaimedMuscles tracks muscles already touched
  // by a watch/stalled-state exercise, so their cap can be tightened — a
  // lift that just reset to baseline shouldn't get stacked alongside a pile
  // of other work on the same muscle. pendingPicks holds picks made earlier
  // in the same in-progress batch (superset/circuit/main pairing) that
  // haven't been claim()'d yet, so scoring later picks in that batch isn't
  // blind to earlier ones — mirrors pendingRdlPick/pendingHingePick.
  const claimedMuscleCounts: Partial<Record<MuscleGroup, number>> = {};
  const flaggedClaimedMuscles = new Set<MuscleGroup>();
  // Primary stimulus already planned into this session, per muscle — the
  // basis for the sessionTarget slot-overshoot penalty in scoreExercise.
  const plannedPrimaryStimulus: Partial<Record<MuscleGroup, number>> = {};
  // Muscles whose in-session dose was deliberately trimmed to a maintenance
  // touch (saturated strength-pair support). Trimming frees allowance the
  // accessory circuits would otherwise re-spend on the very muscle the trim
  // protected, so scoring treats these as allowance-spent from the start.
  const saturationClosedMuscles = new Set<MuscleGroup>();
  let pendingPicks: Exercise[] = [];

  const muscleWeightsOf = (ex: Exercise): Map<MuscleGroup, number> => {
    const weights = new Map<MuscleGroup, number>();
    ex.secondary.forEach((m) => weights.set(m, 0.5));
    ex.primary.forEach((m) => weights.set(m, 1));
    return weights;
  };

  const effectiveMuscleCap = (m: MuscleGroup): number => {
    let cap = PLANNER_TUNING.muscleOverlap.capCount;
    if (flaggedClaimedMuscles.has(m)) cap -= PLANNER_TUNING.muscleOverlap.rebuildMuscleCapReduction;
    if (activeProfile.sensitiveMuscles?.includes(m)) {
      cap -= PLANNER_TUNING.muscleOverlap.sensitiveMuscleCapReduction;
    }
    return Math.max(PLANNER_TUNING.muscleOverlap.minCap, cap);
  };

  const muscleOverlapOverage = (ex: Exercise, extraPending: Exercise[] = []): MuscleGroup[] => {
    const weights = muscleWeightsOf(ex);
    return [...weights.entries()]
      .filter(([m, weight]) => {
        const pendingWeight = extraPending.reduce((sum, p) => {
          const pWeight = muscleWeightsOf(p).get(m) ?? 0;
          return sum + pWeight;
        }, 0);
        const current = (claimedMuscleCounts[m] ?? 0) + pendingWeight;
        return current + weight > effectiveMuscleCap(m);
      })
      .map(([m]) => m);
  };

  // Absolute exclusions return this rather than -10: soft penalties can push a
  // legitimate candidate's score below -10, which would let a hard-blocked
  // exercise (e.g. a second hip thrust) win the pick.
  const HARD_BLOCK_SCORE = -1000;
  const scoreExercise = (ex: Exercise, plannedRounds = 1): number => {
    const movement = movementOf(ex);
    if (!movement) return HARD_BLOCK_SCORE; // plyo/conditioning/calf — never a planned pick
    if (!environmentAllowsExercise(ex, activeProfile)) return HARD_BLOCK_SCORE;
    if (!goalAllows(ex, activeProfile.goal)) return HARD_BLOCK_SCORE;
    if (!slot.allowedMovements.includes(movement) && !(slot.supplementalMovements ?? []).includes(movement)) return HARD_BLOCK_SCORE;
    const family = familyOf(ex);
    if (
      (family === "biceps_isolation" || family === "triceps_isolation" || family === "hip_thrust" || family === "rdl") &&
      (claimedFamilies[family] ?? 0) > 0
    ) {
      return HARD_BLOCK_SCORE;
    }
    if (muscleOverlapOverage(ex, pendingPicks).length > 0) return HARD_BLOCK_SCORE;
    // Lower days get at most ONE back-primary lift (the slot's "upper-back
    // support"), or none beyond a deadlift anchor — a second row/extension the
    // day before an upper session pre-fatigues the back for its own day.
    if (
      lowerBiasSlot &&
      ex.primary.includes("back") &&
      ((plannedPrimaryStimulus.back ?? 0) > 0 ||
        pendingPicks.some((pending) => pending.primary.includes("back")))
    ) {
      return HARD_BLOCK_SCORE;
    }
    // Likewise one direct adduction movement per session — an adductor machine
    // AND a cable adduction in the same workout is redundant isolation volume
    // against a 2-unit weekly target.
    if (
      ex.primary[0] === "adductors" &&
      ((plannedPrimaryStimulus.adductors ?? 0) > 0 ||
        pendingPicks.some((pending) => pending.primary[0] === "adductors"))
    ) {
      return HARD_BLOCK_SCORE;
    }
    const stimulus = estimateExerciseStimulus(ex);
    const projectedStress = estimatePlannedExerciseStress(ex, plannedRounds);
    const projectedSessionTotal =
      sumMuscleStress(plannedSessionStress) + sumMuscleStress(projectedStress);
    const effectiveMovementFocus = new Set<MovementPattern>([
      ...(overrides?.focusedMovements ?? []),
      ...(overrides?.focusedMuscles?.length
        ? muscleSetToMovements(overrides.focusedMuscles)
        : []),
    ]);
    const baseNeed = effectiveMovementFocus.has(movement) ? 3 : (need[movement] ?? 0);
    const remaining = Math.max(0, baseNeed - claimedMovements[movement]);
    let s = remaining * PLANNER_TUNING.exerciseSelection.movementNeedWeight;
    const physiqueFactor =
      activeProfile.goal === "physique"
        ? 1
        : activeProfile.goal === "balanced"
          ? 0.35
          : 0;
    s +=
      (MOVEMENT_PRIORITY[movement] ?? 0) *
      (physiqueFactor || PLANNER_TUNING.exerciseSelection.fallbackMovementPriorityWeight);

    let deficitClosureScore = 0;
    let deficitMagnitudeScore = 0;
    let recoveryPenalty = 0;
    let sessionOverlapPenalty = 0;
    // Uncapped, unlike sessionOverlapPenalty — it must be able to outweigh the
    // deficit bonuses of a muscle the session has already served.
    let sessionTargetPenalty = 0;

    ex.primary.forEach((m) => {
      const deficit = muscleDeficits[m] ?? 0;
      const closure = Math.min(deficit, stimulus.primaryPerSet);
      const weight = PRIMARY_MUSCLE_PRIORITY[m] ?? 1;
      const focusMultiplier = overrides?.focusedMuscles?.includes(m)
        ? PLANNER_TUNING.exerciseSelection.userFocusPrimaryMultiplier
        : slot.focusMuscles.includes(m)
          ? PLANNER_TUNING.exerciseSelection.primaryFocusMultiplier
          : 1;
      // Session-level slot-target discipline. Weekly deficits stay large all
      // session (closure is per-set-saturating), so without this a session
      // keeps stacking lifts on whichever muscles have the biggest weekly gap
      // regardless of the slot's own plan. Once a muscle's planned-in-session
      // primary stimulus reaches the slot target plus headroom, its deficit
      // bonuses collapse and further stimulus is penalized. Pending
      // (unclaimed) superset picks count so a pair can't sneak past.
      const pendingStimulus = pendingPicks
        .filter((pending) => pending.primary.includes(m))
        .reduce(
          (sum, pending) => sum + estimateExerciseStimulus(pending).primaryPerSet * plannedRounds,
          0,
        );
      const plannedForMuscle = (plannedPrimaryStimulus[m] ?? 0) + pendingStimulus;
      // The slot's target only entitles what the WEEK still needs: once a
      // muscle is well into its weekly target (>= half done), the session gets
      // a light touch even on the muscle's own day, freeing volume for real
      // gaps (one row, not three, when back has 1 stimulus left). Early in the
      // week the slot's own plan governs — a fresh back day still pairs a row
      // with a vertical pull.
      const weeklyTarget = weeklyMuscleTargets[m] ?? 0;
      const weeklyPrimaryDone = coverage.muscleStats[m]?.primaryStimulus ?? 0;
      const slotTarget = slot.targetPrimaryStimulus[m] ?? 0;
      const hardYesterday =
        m !== "core" &&
        m !== "hip_flexors" &&
        (yesterdayPrimary[m] ?? 0) >= PLANNER_TUNING.sessionTarget.hardDoseYesterdayThreshold;
      const entitledTarget = hardYesterday
        ? 0
        : weeklyTarget > 0 &&
            weeklyPrimaryDone >=
              weeklyTarget * PLANNER_TUNING.sessionTarget.remainingEntitlementThreshold
          ? Math.min(slotTarget, Math.max(0, weeklyTarget - weeklyPrimaryDone))
          : slotTarget;
      const allowance =
        (entitledTarget * PLANNER_TUNING.sessionTarget.headroomMultiplier +
          PLANNER_TUNING.sessionTarget.baseAllowance) *
        (activeProfile.goal === "strength"
          ? PLANNER_TUNING.sessionTarget.strengthAllowanceMultiplier
          : 1);
      // A muscle's deficit bonuses collapse once its in-session allowance is
      // spent — the per-set-saturating closure would otherwise stay maximal
      // all session no matter how much this draft already gave the muscle.
      const disciplineMultiplier =
        plannedForMuscle >= allowance || saturationClosedMuscles.has(m)
          ? PLANNER_TUNING.sessionTarget.saturatedClosureMultiplier
          : 1;
      // A saturation-closed muscle's allowance is spent by definition — every
      // further set is pure overshoot, matching how a full-volume support lift
      // would have consumed the allowance before the trim existed.
      const effectiveAllowance = saturationClosedMuscles.has(m)
        ? Math.min(allowance, plannedForMuscle)
        : allowance;
      const overshoot =
        plannedForMuscle + stimulus.primaryPerSet * plannedRounds - effectiveAllowance;
      if (overshoot > 0) {
        sessionTargetPenalty += Math.min(
          PLANNER_TUNING.sessionTarget.overshootPenaltyCap,
          overshoot * PLANNER_TUNING.sessionTarget.overshootPenaltyWeight,
        );
      }
      // A slot-targeted muscle still under HALF its weekly target with nothing
      // planned yet is this session's responsibility — without a nudge, small
      // targets (adductors: 2, rear delts: 4) can finish the week under floor.
      // The anchor (first pick) is exempt: main-lift choice is about the
      // slot's identity, not support-gap accounting.
      const anchorStage = used.size === 0 && pendingPicks.length === 0;
      if (
        !anchorStage &&
        weeklyTarget > 0 &&
        slotTarget > 0 &&
        (coverage.muscleStats[m]?.primaryStimulus ?? 0) +
          (coverage.muscleStats[m]?.secondaryStimulus ?? 0) <
          weeklyTarget * 0.5 &&
        plannedForMuscle === 0
      ) {
        s += PLANNER_TUNING.sessionTarget.untouchedTargetPrimaryBonus;
      }
      deficitClosureScore += closure * weight * focusMultiplier * disciplineMultiplier;
      const magnitude = Math.min(deficit, PLANNER_TUNING.exerciseSelection.deficitMagnitudeCap);
      deficitMagnitudeScore += magnitude * weight * focusMultiplier * disciplineMultiplier;
      recoveryPenalty +=
        (recentStress[m] ?? 0) *
        stimulus.recoveryPerSet *
        PLANNER_TUNING.exerciseSelection.primaryRecoveryPenaltyWeight;
      recentSessionStressMaps.forEach(({ stress, decay }) => {
        sessionOverlapPenalty +=
          (stress[m] ?? 0) *
          stimulus.recoveryPerSet *
          decay *
          PLANNER_TUNING.exerciseSelection.latestSessionPrimaryOverlapWeight;
      });
      sessionOverlapPenalty +=
        (plannedSessionStress[m] ?? 0) *
        stimulus.recoveryPerSet *
        PLANNER_TUNING.exerciseSelection.plannedPrimaryOverlapWeight;
      s +=
        (PRIMARY_MUSCLE_PRIORITY[m] ?? 0) *
        physiqueFactor *
        PLANNER_TUNING.exerciseSelection.primaryPriorityWeight;
    });
    ex.secondary.forEach((m) => {
      const deficit = muscleDeficits[m] ?? 0;
      const closure = Math.min(deficit, stimulus.secondaryPerSet);
      const weight = SECONDARY_MUSCLE_PRIORITY[m] ?? PRIMARY_MUSCLE_PRIORITY[m] ?? 1;
      const focusMultiplier = overrides?.focusedMuscles?.includes(m)
        ? PLANNER_TUNING.exerciseSelection.userFocusSecondaryMultiplier
        : slot.focusMuscles.includes(m)
          ? PLANNER_TUNING.exerciseSelection.secondaryFocusMultiplier
          : 1;
      deficitClosureScore +=
        closure *
        weight *
        focusMultiplier *
        PLANNER_TUNING.exerciseSelection.secondaryClosureWeight;
      // Secondary-tag counterpart of the under-half-target nudge — small
      // targets like adductors are mostly served by secondary tags.
      if (
        used.size > 0 &&
        (slot.targetPrimaryStimulus[m] ?? 0) > 0 &&
        (coverage.muscleStats[m]?.primaryStimulus ?? 0) +
          (coverage.muscleStats[m]?.secondaryStimulus ?? 0) <
          (weeklyMuscleTargets[m] ?? 0) * 0.5 &&
        (plannedPrimaryStimulus[m] ?? 0) === 0
      ) {
        s += PLANNER_TUNING.sessionTarget.untouchedTargetSecondaryBonus;
      }
      const magnitude = Math.min(deficit, PLANNER_TUNING.exerciseSelection.deficitMagnitudeCap);
      deficitMagnitudeScore +=
        magnitude *
        weight *
        focusMultiplier *
        PLANNER_TUNING.exerciseSelection.secondaryClosureWeight;
      recoveryPenalty +=
        (recentStress[m] ?? 0) *
        stimulus.recoveryPerSet *
        PLANNER_TUNING.exerciseSelection.secondaryRecoveryPenaltyWeight;
      recentSessionStressMaps.forEach(({ stress, decay }) => {
        sessionOverlapPenalty +=
          (stress[m] ?? 0) *
          stimulus.recoveryPerSet *
          decay *
          PLANNER_TUNING.exerciseSelection.latestSessionSecondaryOverlapWeight;
      });
      sessionOverlapPenalty +=
        (plannedSessionStress[m] ?? 0) *
        stimulus.recoveryPerSet *
        PLANNER_TUNING.exerciseSelection.plannedSecondaryOverlapWeight;
      s +=
        (SECONDARY_MUSCLE_PRIORITY[m] ?? 0) *
        physiqueFactor *
        PLANNER_TUNING.exerciseSelection.secondaryPriorityWeight;
    });

    s += deficitClosureScore * PLANNER_TUNING.exerciseSelection.deficitClosureWeight;
    s += deficitMagnitudeScore * PLANNER_TUNING.exerciseSelection.deficitMagnitudeWeight;
    s -= sessionTargetPenalty;
    // Deficit-magnitude scoring above sums primary AND secondary muscle tags,
    // so a near-capped muscle's exercise can still score well if it carries an
    // under-target muscle as a secondary tag. This penalty looks only at each
    // candidate's own primary muscles' weekly coverage (no cross-candidate
    // comparison needed) so a glute-primary pick can't out-rank a hamstring-
    // primary pick just because it also happens to hit hamstrings secondarily.
    let nearCapPenalty = 0;
    ex.primary.forEach((m) => {
      const saturation = muscleSaturation[m];
      if (
        saturation !== undefined &&
        saturation >= PLANNER_TUNING.exerciseSelection.nearCapSaturationThreshold
      ) {
        nearCapPenalty +=
          (saturation - PLANNER_TUNING.exerciseSelection.nearCapSaturationThreshold) *
          PLANNER_TUNING.exerciseSelection.nearCapPenaltyWeight;
      }
    });
    s -= nearCapPenalty;

    // Steeper, tiered penalty for a candidate that touches a muscle already OVER its
    // real weekly target (muscleSaturation >= 1.0) — checked across BOTH primary and
    // secondary tags, unlike nearCapPenalty above. A compound that re-stresses an
    // already-maxed muscle only as a secondary tag would otherwise slip through.
    // Capped so this term alone can never push a legal candidate below pickBest's
    // -10 exclusion floor on its own — worst case it becomes the "least bad" pick
    // for a movement rather than removing the movement's section entirely.
    let overTargetPenalty = 0;
    const touchedMuscles: [MuscleGroup, number][] = [
      ...ex.primary.map((m): [MuscleGroup, number] => [m, 1]),
      ...ex.secondary.map((m): [MuscleGroup, number] => [
        m,
        PLANNER_TUNING.exerciseSelection.overTargetSecondaryWeight,
      ]),
    ];
    touchedMuscles.forEach(([m, weight]) => {
      const saturation = muscleSaturation[m];
      if (saturation === undefined) return;
      if (saturation >= PLANNER_TUNING.exerciseSelection.overTargetHighThreshold) {
        const excess = saturation - PLANNER_TUNING.exerciseSelection.overTargetHighThreshold;
        overTargetPenalty +=
          weight *
          (PLANNER_TUNING.exerciseSelection.overTargetHighPenalty +
            excess * PLANNER_TUNING.exerciseSelection.overTargetHighPenaltyScale);
      } else if (saturation >= PLANNER_TUNING.exerciseSelection.overTargetThreshold) {
        const excess = saturation - PLANNER_TUNING.exerciseSelection.overTargetThreshold;
        overTargetPenalty +=
          weight *
          (PLANNER_TUNING.exerciseSelection.overTargetPenalty +
            excess * PLANNER_TUNING.exerciseSelection.overTargetPenaltyScale);
      }
    });
    s -= Math.min(PLANNER_TUNING.exerciseSelection.overTargetPenaltyCap, overTargetPenalty);

    // Past the band CEILING the muscle is not just closed but should be left
    // alone; stacked on the capped over-target tier this drops a candidate
    // below the normal-stage floor while leaving it legal as a least-bad pick.
    ex.primary.forEach((m) => {
      if (overCeiling.has(m)) s -= PLANNER_TUNING.composition.overCeilingPrimaryPenalty;
    });
    ex.secondary.forEach((m) => {
      if (overCeiling.has(m)) s -= PLANNER_TUNING.composition.overCeilingSecondaryPenalty;
    });

    s -= Math.min(PLANNER_TUNING.exerciseSelection.recoveryPenaltyCap, recoveryPenalty);
    s -= Math.min(PLANNER_TUNING.exerciseSelection.overlapPenaltyCap, sessionOverlapPenalty);
    if (projectedSessionTotal > sessionFatigueBudget) {
      // carry_core shares the reduced multiplier: end-of-session core work is
      // as cheap as upper support, and billing it at the default rate made
      // rows systematically out-rank planks in late fill-in slots.
      const budgetPenaltyMultiplier =
        armBiasSlot && isDirectArmFocus(ex)
          ? PLANNER_TUNING.exerciseSelection.armBiasBudgetPenaltyMultiplier
          : lowerBiasSlot &&
              (movement === "pull" || movement === "push" || movement === "carry_core")
            ? PLANNER_TUNING.exerciseSelection.lowerBiasUpperMovementBudgetPenaltyMultiplier
            : PLANNER_TUNING.exerciseSelection.defaultBudgetPenaltyMultiplier;
      s -= (projectedSessionTotal - sessionFatigueBudget) * budgetPenaltyMultiplier;
    }

    if (activeProfile.goal === "physique") {
      if (movement === "push" && ex.primary.includes("chest")) {
        s -= PLANNER_TUNING.exerciseSelection.physiquePushChestPenalty;
      }
      if (movement === "push" && ex.primary.includes("triceps")) {
        s -= PLANNER_TUNING.exerciseSelection.physiquePushTricepsPenalty;
      }
      // Glute-emphasis bonuses only apply while glutes are still under their
      // weekly target — a physique bias toward glutes must not keep piling
      // direct glute work onto an already-saturated week.
      const glutesOverTarget =
        (muscleSaturation.glutes ?? 0) >=
        PLANNER_TUNING.exerciseSelection.overTargetThreshold;
      if (!glutesOverTarget) {
        if (movement === "hinge" && ex.primary.includes("glutes")) {
          s += PLANNER_TUNING.exerciseSelection.physiqueHingeGluteBonus;
        }
        if (movement === "single_leg" && ex.primary.includes("glutes")) {
          s += PLANNER_TUNING.exerciseSelection.physiqueSingleLegGluteBonus;
        }
        if (isDirectGluteFocus(ex)) s += PLANNER_TUNING.exerciseSelection.physiqueDirectGluteBonus;
      }
      if (movement === "pull" && ex.primary.includes("back")) {
        s += PLANNER_TUNING.exerciseSelection.physiquePullBackBonus;
      }
      if (ex.primary.includes("shoulders") || ex.primary.includes("rear_delts")) {
        s += PLANNER_TUNING.exerciseSelection.physiqueShoulderBonus;
      }
      if (armBiasSlot && isDirectArmFocus(ex)) s += PLANNER_TUNING.exerciseSelection.physiqueArmBiasBonus;
    }

    if (activeProfile.goal === "strength" && isHeavyEquipment(ex)) {
      s += PLANNER_TUNING.exerciseSelection.strengthHeavyEquipmentBonus;
    }
    if (activeProfile.equipment === "full_gym") {
      if (ex.equipment === "barbell") s += PLANNER_TUNING.exerciseSelection.fullGymBarbellBonus;
      if (ex.equipment === "machine" || ex.equipment === "cable") {
        s += PLANNER_TUNING.exerciseSelection.fullGymMachineCableBonus;
      }
    }
    if (activeProfile.equipment === "dumbbells" || activeProfile.equipment === "home") {
      if (ex.equipment === "dumbbell") s += PLANNER_TUNING.exerciseSelection.dumbbellEnvDumbbellBonus;
      if (ex.equipment === "kettlebell") s += PLANNER_TUNING.exerciseSelection.dumbbellEnvKettlebellBonus;
      // Give unlocked cable/barbell/machine the same scoring bonuses as full_gym equivalents.
      if (homeGymEquipment.includes("cable") && ex.equipment === "cable") {
        s += PLANNER_TUNING.exerciseSelection.fullGymMachineCableBonus;
        if (movement === "pull") {
          s += PLANNER_TUNING.exerciseSelection.dumbbellEnvCablePullBonus;
          if (slot.focusMuscles.includes("back") && ex.primary.includes("back")) {
            s += PLANNER_TUNING.exerciseSelection.dumbbellEnvBackFocusedCablePullBonus;
          }
          if (familyOf(ex) === "vertical_pull") {
            s += PLANNER_TUNING.exerciseSelection.dumbbellEnvCableVerticalPullBonus;
          }
        }
      }
      if (homeGymEquipment.includes("barbell") && ex.equipment === "barbell") {
        s += PLANNER_TUNING.exerciseSelection.fullGymBarbellBonus;
      }
      if (homeGymEquipment.includes("machine") && ex.equipment === "machine") {
        s += PLANNER_TUNING.exerciseSelection.fullGymMachineCableBonus;
      }
    }
    if (activeProfile.equipment === "home" && homeGymEquipment.length === 0) {
      if (isHomeConditioningFriendly(ex)) s += PLANNER_TUNING.exerciseSelection.homeConditioningBonus;
      if (ex.equipment === "dumbbell") s += PLANNER_TUNING.exerciseSelection.homeDumbbellBonus;
      if (ex.pattern === "hinge" && ex.equipment === "dumbbell") {
        s -= PLANNER_TUNING.exerciseSelection.homeDumbbellHingePenalty;
      }
    }
    if (activeProfile.experience === "beginner") {
      if (isTechnicalBarbell(ex)) s -= PLANNER_TUNING.exerciseSelection.beginnerTechnicalBarbellPenalty;
      if (!known.has(ex.name)) s -= PLANNER_TUNING.exerciseSelection.beginnerNovelLiftPenalty;
    }

    if (ex.equipment === "barbell" && barbellCount >= 2) {
      s -= PLANNER_TUNING.exerciseSelection.barbellCapPenalty;
    }

    if (stalledExerciseNames.has(ex.name)) s -= PLANNER_TUNING.exerciseSelection.stalledExercisePenalty;
    else if (watchedExerciseNames.has(ex.name)) s -= PLANNER_TUNING.exerciseSelection.watchedExercisePenalty;
    if (stalledFamilies.has(familyOf(ex)) && !stalledExerciseNames.has(ex.name)) {
      s += PLANNER_TUNING.exerciseSelection.stalledFamilySubBonus;
    }

    if (known.has(ex.name)) s += PLANNER_TUNING.exerciseSelection.knownExerciseBonus;
    if (
      movement === "pull" &&
      claimedMovements.pull === 0 &&
      slot.focusMuscles.includes("back")
    ) {
      if (isBackPullAnchor(ex)) {
        s += PLANNER_TUNING.exerciseSelection.earlyBackAnchorBonus;
      } else if (hasPrimary(ex, "rear_delts") || isDirectArmFocus(ex)) {
        s -= PLANNER_TUNING.exerciseSelection.earlyBackSupportPenalty;
      }
    }
    if (
      movement === "push" &&
      claimedMovements.push === 0 &&
      slot.focusMuscles.includes("shoulders")
    ) {
      if (isVerticalPressAnchor(ex)) {
        s += PLANNER_TUNING.exerciseSelection.earlyPushAnchorBonus;
      } else if (familyOf(ex) === "shoulder_isolation") {
        s -= PLANNER_TUNING.exerciseSelection.earlyPushIsolationPenalty;
      }
    }
    if (slot.preferredMovements.includes(movement)) s += PLANNER_TUNING.exerciseSelection.preferredMovementBonus;
    if (directionNeed.size > 0 && (movement === "push" || movement === "pull")) {
      const direction = directionOf(ex);
      if (direction && directionNeed.has(`${movement}_${direction}`)) {
        s += PLANNER_TUNING.exerciseSelection.directionNeedBonus;
      }
    }
    if (currentWeekExerciseNames.has(ex.name)) {
      s -=
        activeProfile.goal === "strength"
          ? PLANNER_TUNING.exerciseSelection.repeatExerciseStrengthPenalty
          : PLANNER_TUNING.exerciseSelection.repeatExercisePenalty;
    }
    if (currentWeekFamilies.has(familyOf(ex))) {
      s -=
        activeProfile.goal === "strength"
          ? PLANNER_TUNING.exerciseSelection.repeatFamilyStrengthPenalty
          : PLANNER_TUNING.exerciseSelection.repeatFamilyPenalty;
    }
    const familyCount = claimedFamilies[family] ?? 0;
    if (familyCount > 0) {
      s -=
        activeProfile.goal === "strength"
          ? familyCount * PLANNER_TUNING.exerciseSelection.repeatClaimedFamilyStrengthPenalty
          : familyCount * PLANNER_TUNING.exerciseSelection.repeatClaimedFamilyPenalty;
    }
    if (
      familyCount > 0 &&
      (family === "biceps_isolation" || family === "triceps_isolation")
    ) {
      s -= PLANNER_TUNING.exerciseSelection.repeatDirectArmIsolationPenalty;
    }
    if (upperBiasSlot && movement === "pull" && slot.focusMuscles.includes("back")) {
      const verticalPullCount = claimedFamilies.vertical_pull ?? 0;
      const rowCount = claimedFamilies.row ?? 0;
      if (family === "vertical_pull") {
        if (verticalPullCount >= 1) {
          s -= PLANNER_TUNING.exerciseSelection.upperPullRepeatVerticalPenalty;
        }
        if (claimedMovements.pull >= 1 && rowCount === 0) {
          s -= PLANNER_TUNING.exerciseSelection.upperPullNeedsRowPenalty;
        }
      }
      if (verticalPullCount >= 1 && rowCount === 0) {
        if (family === "row") {
          s += PLANNER_TUNING.exerciseSelection.upperPullRowBalanceBonus;
        } else if (family !== "vertical_pull") {
          s -= PLANNER_TUNING.exerciseSelection.upperPullSupportBeforeRowPenalty;
        }
      }
      if (rowCount >= 1 && verticalPullCount === 0) {
        if (family === "vertical_pull") {
          s += PLANNER_TUNING.exerciseSelection.upperPullRowBalanceBonus;
        }
      }
    }
    const lowerUnilateralFamily = lowerUnilateralKneeFamilyOf(ex);
    if (lowerBiasSlot && lowerUnilateralFamily) {
      const usedLowerUnilateralFamilies = ["split_squat", "lunge", "step_up"].reduce(
        (count, key) => count + (claimedFamilies[key] ?? 0),
        0,
      );
      if (usedLowerUnilateralFamilies >= 1) s -= PLANNER_TUNING.exerciseSelection.unilateralFamilyPenalty;
      if (usedLowerUnilateralFamilies >= 2) s -= PLANNER_TUNING.exerciseSelection.repeatedUnilateralFamilyPenalty;
    }
    if (lowerBiasSlot && movement === "single_leg") {
      if (claimedMovements.single_leg >= 1) s -= PLANNER_TUNING.exerciseSelection.repeatedSingleLegPenalty;
      if (claimedMovements.single_leg >= 2) s -= PLANNER_TUNING.exerciseSelection.repeatedSingleLegHardPenalty;
    }
    // Limit hinge stacking in non-strength lower sessions — two compound hinges
    // (e.g., deadlift + RDL) is fine in strength, but trainer-like physique/balanced
    // programming would rotate to a different lower pattern after one hinge.
    if (lowerBiasSlot && movement === "hinge" && activeProfile.goal !== "strength") {
      if (claimedMovements.hinge >= 1) s -= PLANNER_TUNING.exerciseSelection.repeatedHingePenalty;
      if (claimedMovements.hinge >= 2) s -= PLANNER_TUNING.exerciseSelection.repeatedHingeHardPenalty;
    }
    // RDL-family single_leg exercises (e.g. "Single-leg DB RDL") are kinematically
    // hinge-dominant even though movementOf() returns "single_leg". Count them alongside
    // true hinges for posterior-chain stacking purposes and apply a meaningful penalty
    // when the combined total reaches 2 — preventing a 3rd hinge-pattern exercise.
    if (lowerBiasSlot && activeProfile.goal !== "strength") {
      // Count both claimed rdl-family exercises AND any pending rdl-family first-pick
      // in the current superset (scored before the first pick is claimed).
      const rdlFamilyClaimed = (claimedFamilies["rdl"] ?? 0) + (pendingRdlPick ? 1 : 0);
      const hingePosteriorTotal = claimedMovements.hinge + rdlFamilyClaimed + (pendingHingePick ? 1 : 0);
      const isHingeDominantPick =
        movement === "hinge" || (movement === "single_leg" && family === "rdl");
      if (isHingeDominantPick && hingePosteriorTotal >= 2) {
        s -= PLANNER_TUNING.exerciseSelection.posteriorChainOverloadPenalty;
      }
    }
    // Hard-block a second deadlift-family exercise in the same session regardless of goal.
    // Two deadlift variations in one session stacks too much posterior-chain fatigue on
    // identical movement patterns.
    if (family === "deadlift" && (claimedFamilies["deadlift"] ?? 0) >= 1) {
      s -= PLANNER_TUNING.exerciseSelection.repeatedDeadliftFamilyPenalty;
    }
    // Penalize repeating a lower family that appeared in either of the last 2 sessions.
    // The currentWeekFamilies penalty (1.2) is too weak to capture "you just did lunges
    // yesterday"; this provides a stronger but still soft inter-session signal.
    if (lowerBiasSlot && recentLowerFamilies.has(family)) {
      s -= PLANNER_TUNING.exerciseSelection.recentLowerFamilyRepeatPenalty;
    }
    // The exact same lift two sessions in a row is monotonous and re-fatigues
    // the same tissue; daily core work is fine, and strength deliberately
    // repeats its mains, so those are exempt/damped.
    if (lastSessionExerciseNames.has(ex.name) && movement !== "carry_core") {
      s -=
        PLANNER_TUNING.sessionTarget.lastSessionExercisePenalty *
        (activeProfile.goal === "strength"
          ? PLANNER_TUNING.sessionTarget.strengthClaimedOrderMultiplier
          : 1);
    }
    ex.primary.forEach((m) => {
      if (slot.focusMuscles.includes(m)) s += PLANNER_TUNING.exerciseSelection.focusPrimaryBonus;
      const target = slot.targetPrimaryStimulus[m] ?? 0;
      const done = coverage.muscleStats[m]?.primaryStimulus ?? 0;
      if (target > 0) {
        const remainingSets = Math.max(0, target - done);
        s += remainingSets * PLANNER_TUNING.exerciseSelection.targetRemainingWeight;
        if (done >= target) s -= PLANNER_TUNING.exerciseSelection.targetReachedPenalty;
      }
    });
    ex.secondary.forEach((m) => {
      if (slot.focusMuscles.includes(m)) s += PLANNER_TUNING.exerciseSelection.focusSecondaryBonus;
    });
    s += rng() * PLANNER_TUNING.exerciseSelection.randomnessWeight;
    return s;
  };

  const pickBest = (
    filter: (ex: Exercise) => boolean,
    plannedRounds = 1,
    allowNegative = false,
  ): Exercise | null => {
    let best: Exercise | null = null;
    let bestScore = -Infinity;
    for (const ex of EXERCISES) {
      if (used.has(ex.name)) continue;
      if (!filter(ex)) continue;
      const s = scoreExercise(ex, plannedRounds);
      if (s > bestScore) {
        best = ex;
        bestScore = s;
      }
    }
    // allowNegative admits heavily-penalized-but-legal picks (floor stays above
    // the -1000 hard blocks) — used only for the session anchor, where the
    // least-bad true compound beats an anchorless session.
    return best && bestScore > (allowNegative ? -100 : -10) ? best : null;
  };

  const pickBestFinisher = (filter: (ex: Exercise) => boolean): Exercise | null => {
    let best: Exercise | null = null;
    let bestScore = -Infinity;
    for (const ex of EXERCISES) {
      if (used.has(ex.name)) continue;
      if (!filter(ex)) continue;
      if (muscleOverlapOverage(ex).length > 0) continue;
      let s = 0;
      if (movementOf(ex) === "carry_core") s += 4;
      if (isAccessibleConditioningFinisher(ex)) s += 5;
      if (activeProfile.daysPerWeek === 3 && isAccessibleConditioningFinisher(ex)) s += 4;
      if (isAccessibleMetabolicFinisher(ex)) s += 4.5;
      if (["bodyweight", "dumbbell", "band"].includes(ex.equipment)) s += 1.5;
      if (ex.pattern === "conditioning" && !isAccessibleConditioningFinisher(ex)) s -= 6;
      if (activeProfile.equipment === "home" && isHomeConditioningFriendly(ex)) s += 2;
      ex.primary.forEach((m) => {
        if (recent.has(m)) s -= 1;
        if ((muscleSaturation[m] ?? 0) >= PLANNER_TUNING.exerciseSelection.overTargetThreshold) {
          s -= PLANNER_TUNING.sessionTarget.finisherSaturatedMusclePenalty;
        }
      });
      if (known.has(ex.name)) s += 0.4;
      s += rng() * 0.5;
      if (s > bestScore) {
        best = ex;
        bestScore = s;
      }
    }
    return best;
  };

  const finisherTargetSet = (
    ex: Exercise,
    rounds: number,
  ): (number | string)[] => {
    if (ex.pattern === "carry") return Array.from({ length: rounds }, () => "20 steps");
    if (ex.pattern === "conditioning" || ex.pattern === "plyo") {
      return Array.from({ length: rounds }, () => (hardMode ? 12 : 10));
    }
    if (movementOf(ex) === "carry_core") return Array.from({ length: rounds }, () => 10);
    if (rounds === 4) return [15, 12, 12, 10];
    if (rounds === 3) return [15, 12, 12];
    if (rounds === 2) return [12, 10];
    return [15];
  };

  const templateTargetSet = (
    template: FinisherTemplate,
    ex: Exercise,
  ): (number | string)[] => {
    switch (template.id) {
      case "mechanical_pushup_drop":
        return Array.from({ length: template.rounds }, () => 5);
      case "lunge_trip":
        return Array.from({ length: template.rounds }, () => 6);
      case "burpee_ladder":
        return ex.name === "Burpee" ? [15, 15] : [10, 10];
      case "hollow_superman":
        return Array.from({ length: template.rounds }, () => 8);
      case "plank_traveler":
        return Array.from({ length: template.rounds }, () => 10);
      case "bear_box":
        if (ex.name === "Bear crawl") return Array.from({ length: template.rounds }, () => 20);
        if (ex.name === "Bear plank shoulder tap") return Array.from({ length: template.rounds }, () => 8);
        return Array.from({ length: template.rounds }, () => 20);
      case "wall_ball_sprint":
        return ex.name === "High knees"
          ? Array.from({ length: template.rounds }, () => 20)
          : Array.from({ length: template.rounds }, () => 15);
      case "slam_and_sprawl":
        if (ex.name === "Tall-kneeling rotational medicine ball slam") {
          return Array.from({ length: template.rounds }, () => 10);
        }
        if (ex.name === "Burpee") return Array.from({ length: template.rounds }, () => 8);
        return Array.from({ length: template.rounds }, () => 20);
      case "wall_sit_burnout":
        return ex.name === "Lateral lunge"
          ? Array.from({ length: template.rounds }, () => 8)
          : Array.from({ length: template.rounds }, () => 12);
      case "dumbbell_burner":
        return Array.from({ length: template.rounds }, () => 8);
      default:
        return finisherTargetSet(ex, template.rounds);
    }
  };

  const finisherLabel = (exercises: Exercise[]): string => {
    const includesCarry = exercises.some((ex) => ex.pattern === "carry");
    const includesConditioning = exercises.some(
      (ex) => ex.pattern === "conditioning" || ex.pattern === "plyo",
    );
    const includesMetcon = exercises.some((ex) => isAccessibleMetabolicFinisher(ex));

    if (exercises.length >= 3) {
      if (includesConditioning || includesMetcon) return "8–12 reps each · finisher circuit";
      if (includesCarry) return "20–30 steps · carry circuit";
      return "12–15 reps · finisher circuit";
    }
    if (exercises.length === 2) {
      if (includesConditioning || includesMetcon) return "8–12 reps each · finisher pair";
      if (includesCarry) return "20–30 steps · carry pair";
      return "12–15 reps · finisher pair";
    }
    const [ex] = exercises;
    if (!ex) return "12–15 reps";
    if (ex.pattern === "carry") return "20–30 steps";
    if (ex.pattern === "conditioning" || ex.pattern === "plyo") return "8–12 reps";
    return isHomeProfile ? "15–20 reps" : "12–15 reps";
  };

  const claim = (ex: Exercise) => {
    used.add(ex.name);
    if (ex.equipment === "barbell") barbellCount += 1;
    const m = movementOf(ex);
    if (m) claimedMovements[m] = claimedMovements[m] + 1;
    const family = familyOf(ex);
    claimedFamilies[family] = (claimedFamilies[family] ?? 0) + 1;
    // If the exercise also has a secondary knee-dominant-unilateral family (e.g.,
    // "DB split squat to RDL" is rdl-primary but also knee-dominant/single-leg),
    // track that family too so the unilateral-stacking guard fires correctly.
    const kneeFamily = lowerUnilateralKneeFamilyOf(ex);
    if (kneeFamily && kneeFamily !== family) {
      claimedFamilies[kneeFamily] = (claimedFamilies[kneeFamily] ?? 0) + 1;
    }
    const flagged = stalledExerciseNames.has(ex.name) || watchedExerciseNames.has(ex.name);
    muscleWeightsOf(ex).forEach((weight, muscle) => {
      claimedMuscleCounts[muscle] = (claimedMuscleCounts[muscle] ?? 0) + weight;
      if (flagged) flaggedClaimedMuscles.add(muscle);
    });
  };

  const claimWithStress = (
    ex: Exercise,
    rounds: number,
    multiplier = 1,
  ) => {
    claim(ex);
    addMuscleStress(
      plannedSessionStress,
      estimatePlannedExerciseStress(ex, rounds, multiplier),
    );
    const perSet = estimateExerciseStimulus(ex).primaryPerSet;
    ex.primary.forEach((muscle) => {
      plannedPrimaryStimulus[muscle] = (plannedPrimaryStimulus[muscle] ?? 0) + perSet * rounds;
    });
  };

  const makeDraftEx = (
    ex: Exercise,
    targets: (number | string)[],
  ): DraftExercise => {
    const last = lastWorkingWeight(ex.name, workouts);
    const resolvedTargets = resolveDisplayTargets(targets, workouts, ex.name);
    return {
      name: ex.name,
      primary: ex.primary,
      secondary: ex.secondary,
      pattern: ex.pattern,
      movement: movementOf(ex),
      targets: resolvedTargets,
      suggestedWeight: capSuggestedWeight(last?.weight ?? null, ex, activeProfile.equipment),
      suggestedDuration: ex.tracksDuration ? lastWorkingDuration(ex.name, workouts) : null,
      unit: last?.unit ?? "lb",
      isFamiliar: known.has(ex.name),
      trend: stalledExerciseNames.has(ex.name)
        ? "stalled"
        : watchedExerciseNames.has(ex.name)
          ? "watch"
          : "none",
      progression: buildProgression(ex, resolvedTargets, workouts),
    };
  };

  const sections: DraftSection[] = [];
  const movementsHit: MovementPattern[] = [];
  const homeGymEquipment = activeProfile.homeGymEquipment ?? [];
  const isHomeProfile =
    (activeProfile.equipment === "home" || activeProfile.equipment === "dumbbells") &&
    homeGymEquipment.length === 0;
  const hardMode = activeProfile.intensity === "hard";
  const secondaryRounds: number = activeProfile.daysPerWeek === 5 ? 3 : 4;
  const accessoryRounds: number = activeProfile.daysPerWeek === 5 ? (hardMode ? 4 : 3) : hardMode ? 4 : 4;
  const finisherRounds =
    activeProfile.daysPerWeek === 3
      ? hardMode
        ? 4
        : 3
      : isHomeProfile
        ? hardMode
          ? 3
          : 2
        : hardMode
          ? 2
          : 1;
  const useTrisetAccessory =
    hardMode &&
    !isHomeProfile &&
    (activeProfile.daysPerWeek === 3 || activeProfile.goal === "balanced");
  const compoundMovements = COMPOUND_MOVEMENTS.filter((movement) =>
    slot.allowedMovements.includes(movement),
  );
  const accessoryMovements = ACCESSORY_MOVEMENTS.filter((movement) =>
    slot.allowedMovements.includes(movement) || (slot.supplementalMovements ?? []).includes(movement),
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
  const pullCatchUpUpperSlot =
    upperBiasSlot &&
    slot.preferredMovements.length === 1 &&
    slot.preferredMovements[0] === "pull";
  const strictPullCatchUpUpperSlot =
    pullCatchUpUpperSlot &&
    !slot.allowedMovements.includes("push");
  const baseSessionBudget =
    activeProfile.daysPerWeek === 3
      ? PLANNER_TUNING.fatigueBudget.baseThreeDay
      : activeProfile.daysPerWeek === 4
        ? PLANNER_TUNING.fatigueBudget.baseFourDay
        : PLANNER_TUNING.fatigueBudget.baseFiveDay;
  // Two trainer-style modulators scale the whole session:
  // - weekPhase: every ~5th week (or sooner after brutal-rated weeks) is a
  //   deload at reduced intensity (src/lib/periodization.ts)
  // - effortMultiplier: the user's own easy/right/brutal ratings nudge the
  //   next session's budget within [0.85, 1.1] (src/lib/session-feedback.ts)
  const weekPhase = getWeekPhase(workouts, todayISO);
  const effortMultiplier = effortBudgetMultiplier(workouts, todayISO);
  const effortReason = effortAdjustmentReason(workouts, todayISO);
  const sessionFatigueBudget =
    (baseSessionBudget +
      (hardMode ? PLANNER_TUNING.fatigueBudget.hardModeBonus : 0) +
      (lowerBiasSlot ? PLANNER_TUNING.fatigueBudget.lowerBiasBonus : 0) +
      (activeProfile.goal === "strength" ? PLANNER_TUNING.fatigueBudget.strengthBonus : 0) -
      (activeProfile.equipment === "home" ? PLANNER_TUNING.fatigueBudget.homePenalty : 0)) *
    weekPhase.intensityScale *
    effortMultiplier;
  // Hard-intensity lifters past beginner get true heavy anchor work — a
  // program with nothing under 8 reps never builds top-end strength. Display
  // targets for familiar lifts still resolve to last performance (double
  // progression); the scheme governs new lifts and the section header.
  // Deload weeks drop the heavy scheme: back off, don't grind top sets.
  const heavyAnchor =
    hardMode && activeProfile.experience !== "beginner" && weekPhase.phase !== "deload";
  const compoundTargets = isHomeProfile
    ? [12, 12, 10, 10]
    : heavyAnchor
      ? [8, 6, 5, 5]
      : [10, 8, 8, 6];
  const compoundRepScheme = isHomeProfile
    ? "12 / 12 / 10 / 10 — smooth tempo"
    : heavyAnchor
      ? "8 / 6 / 5 / 5 — heavy top sets"
      : "10 / 8 / 8 / 6 — build weight";
  const secondaryTargets = isHomeProfile
    ? secondaryRounds === 5
      ? [15, 12, 12, 10, 10]
      : secondaryRounds === 4
        ? [15, 12, 12, 10]
        : [15, 12, 12]
    : secondaryRounds === 5
      ? [10, 8, 8, 6, 6]
      : secondaryRounds === 4
        ? [10, 8, 8, 6]
        : [10, 8, 8];
  const secondaryRepScheme = isHomeProfile
    ? "12–15 reps — lighter load, controlled pace"
    : "8–10 reps — controlled working sets";
  const firstAccessoryTargets = isHomeProfile
    ? accessoryRounds === 5
      ? [18, 15, 15, 12, 12]
      : accessoryRounds === 4
        ? [18, 15, 15, 12]
        : [18, 15, 15]
    : accessoryRounds === 5
      ? [12, 10, 10, 8, 8]
      : accessoryRounds === 4
        ? [12, 10, 10, 8]
        : [12, 10, 10];
  const firstAccessoryRepScheme = isHomeProfile
    ? "15–18 reps · short rest"
    : "10–12 reps · superset";
  const secondAccessoryTargets = isHomeProfile
    ? accessoryRounds === 5
      ? [20, 18, 18, 15, 15]
      : accessoryRounds === 4
        ? [20, 18, 18, 15]
        : [20, 18, 18]
    : accessoryRounds === 5
      ? [15, 12, 12, 10, 10]
      : accessoryRounds === 4
        ? [15, 12, 12, 10]
        : [15, 12, 12];
  const secondAccessoryRepScheme = isHomeProfile
    ? "18–20 reps · home conditioning pace"
    : "12–15 reps · short rest";
  // Pre-generate per-movement noise so sort comparators are pure functions.
  // JavaScript sort calls comparators a variable number of times, so calling
  // rng() inside a comparator produces non-deterministic results for the same seed.
  const movementNoise: Partial<Record<MovementPattern, number>> = {};
  MOVEMENT_PATTERNS.forEach((mp) => (movementNoise[mp] = rng()));

  // Order candidate movements by weekly need, biased toward the slot's own
  // preferred movements and away from movements already claimed this session.
  // On a fresh week every movement's need ties at 3, so without the bias the
  // tie-break is pure noise and a lower slot's supersets chase pull/push
  // support as readily as the lower work the slot was designed around.
  const claimedOrderPenalty =
    PLANNER_TUNING.sessionTarget.claimedMovementOrderPenalty *
    (activeProfile.goal === "strength"
      ? PLANNER_TUNING.sessionTarget.strengthClaimedOrderMultiplier
      : 1);
  const movementOrderScore = (m: MovementPattern): number =>
    (need[m] ?? 0) +
    (slot.preferredMovements.includes(m)
      ? PLANNER_TUNING.sessionTarget.preferredMovementOrderBias
      : 0) -
    (claimedMovements[m] ?? 0) * claimedOrderPenalty;
  const sortedByNeed = (candidates: MovementPattern[]): MovementPattern[] =>
    [...candidates].sort(
      (a, b) =>
        movementOrderScore(b) - movementOrderScore(a) +
        ((movementNoise[b] ?? 0) - (movementNoise[a] ?? 0)) * 0.01,
    );

  const pushMovement = (movement: MovementPattern | null) => {
    if (movement) movementsHit.push(movement);
  };

  const pickForMovement = (
    candidates: MovementPattern[],
    plannedRounds: number,
    filter?: (ex: Exercise) => boolean,
    allowNegative = false,
  ): { movement: MovementPattern; exercise: Exercise } | null => {
    for (const movement of sortedByNeed(candidates)) {
      const exercise = pickBest(
        (ex) => movementOf(ex) === movement && (filter ? filter(ex) : true),
        plannedRounds,
        allowNegative,
      );
      if (exercise) return { movement, exercise };
    }
    return null;
  };

  const isCompatibleWithPicks = (
    ex: Exercise,
    picks: Exercise[],
  ): boolean => {
    const family = familyOf(ex);
    if (picks.some((pick) => pick.name === ex.name)) return false;
    if (
      (family === "biceps_isolation" ||
        family === "triceps_isolation" ||
        family === "vertical_pull" ||
        family === "row" ||
        family === "hip_thrust" ||
        family === "step_up") &&
      picks.some((pick) => familyOf(pick) === family)
    ) {
      return false;
    }
    return true;
  };

  const addSuperset = (
    allowed: MovementPattern[],
    rounds: number,
    repScheme: string,
    targets: (number | string)[],
    filter?: (ex: Exercise) => boolean,
  ): boolean => {
    const first = pickForMovement(allowed, rounds, filter);
    if (!first) return false;

    // Signal to scoreExercise that the first pick is hinge- or rdl-family, so the
    // posterior-chain overload penalty fires when scoring second-pick candidates
    // (before the first pick is claimed). pendingPicks does the same for the
    // muscle-overlap cap, so the second pick isn't blind to the first's muscles.
    pendingRdlPick = familyOf(first.exercise) === "rdl";
    pendingHingePick = movementOf(first.exercise) === "hinge";
    pendingPicks = [first.exercise];
    let second = pickForMovement(
      allowed.filter((movement) => movement !== first.movement),
      rounds,
      (ex) =>
        isCompatibleWithPicks(ex, [first.exercise]) &&
        (filter ? filter(ex) : true),
    );
    if (!second) {
      second = pickForMovement(
        allowed,
        rounds,
        (ex) =>
          isCompatibleWithPicks(ex, [first.exercise]) &&
          (filter ? filter(ex) : true),
      );
    }
    pendingRdlPick = false;
    pendingHingePick = false;
    pendingPicks = [];
    if (!second) return false;

    claimWithStress(first.exercise, rounds);
    pushMovement(first.movement);
    claimWithStress(second.exercise, rounds);
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

  const addCircuit = (
    allowed: MovementPattern[],
    rounds: number,
    repScheme: string,
    targets: (number | string)[],
    filter?: (ex: Exercise) => boolean,
  ): boolean => {
    const picks: { movement: MovementPattern; exercise: Exercise }[] = [];
    const availableMovements = sortedByNeed(allowed);

    for (const movement of availableMovements) {
      pendingPicks = picks.map((existing) => existing.exercise);
      const pick = pickForMovement(
        [movement],
        rounds,
        (ex) =>
          isCompatibleWithPicks(
            ex,
            picks.map((existing) => existing.exercise),
          ) &&
          (filter ? filter(ex) : true),
      );
      if (pick) picks.push(pick);
      if (picks.length === 3) break;
    }

    if (picks.length < 3) {
      pendingPicks = picks.map((existing) => existing.exercise);
      const fallbackPick = pickForMovement(
        allowed,
        rounds,
        (ex) =>
          isCompatibleWithPicks(
            ex,
            picks.map((existing) => existing.exercise),
          ) &&
          (filter ? filter(ex) : true),
      );
      if (fallbackPick) picks.push(fallbackPick);
    }

    pendingPicks = [];
    if (picks.length < 3) return false;

    picks.forEach((pick) => {
      claimWithStress(pick.exercise, rounds);
      pushMovement(pick.movement);
    });
    sections.push({
      kind: "superset",
      rounds,
      repScheme,
      exercises: picks.map((pick) => makeDraftEx(pick.exercise, targets)),
    });
    return true;
  };

  const addAccessoryBlock = (
    allowed: MovementPattern[],
    rounds: number,
    repScheme: string,
    targets: (number | string)[],
    filter?: (ex: Exercise) => boolean,
    allowNegative = false,
  ): boolean => {
    // Fill-in blocks want the best remaining exercise overall, so compare
    // candidates across all allowed movements at once — pickForMovement's
    // first-movement-with-any-pick semantics would let a mediocre pick from a
    // high-need movement shadow a clearly better pick from the next one.
    const allowedSet = new Set(allowed);
    const exercise = pickBest(
      (ex) => {
        const m = movementOf(ex);
        return m !== null && allowedSet.has(m) && (filter ? filter(ex) : true);
      },
      rounds,
      allowNegative,
    );
    if (!exercise) return false;
    claimWithStress(exercise, rounds);
    pushMovement(movementOf(exercise));
    sections.push({
      kind: "accessory",
      rounds,
      repScheme,
      exercises: [makeDraftEx(exercise, targets)],
    });
    return true;
  };

  const avoidSoftLowerAccessory = (ex: Exercise): boolean =>
    !(lowerBiasSlot && isActivationLowerAccessory(ex));

  // Heavy barbell hinge/squat compounds are anchor- or secondary-stage lifts
  // only — never short-rest superset/tri-set/fill-in volume (a 15-rep deadlift
  // circuit is a technique hazard, not accessory work). Barbell hip thrusts
  // are exempt: no axial load, and a classic superset movement.
  const noHeavyBarbellCircuit = (ex: Exercise): boolean =>
    !(
      ex.equipment === "barbell" &&
      (movementOf(ex) === "hinge" || movementOf(ex) === "squat" || movementOf(ex) === "push") &&
      familyOf(ex) !== "hip_thrust"
    );

  // 1. Main lift — the most-needed heavy compound among squat, hinge, push, pull.
  const lowerAnchorMovements: MovementPattern[] = ["squat", "hinge", "single_leg"];
  const upperCompoundFilter = (ex: Exercise): boolean => {
    const movement = movementOf(ex);
    if (!environmentAllowsExercise(ex, activeProfile)) return false;
    if (!goalAllows(ex, activeProfile.goal)) return false;
    if (!(isHeavyEquipment(ex) || (movement === "pull" && ex.equipment === "cable"))) return false;
    if (movement === "pull") return isBackPullAnchor(ex);
    // A push anchor must be a true press compound — a vertical press or a
    // chest press — never a raise or arm isolation (an overhead tricep
    // extension is not a session's main lift).
    if (movement === "push") {
      return (
        !isDirectArmFocus(ex) &&
        (isVerticalPressAnchor(ex) || hasPrimary(ex, "chest"))
      );
    }
    return true;
  };
  // Back-focused upper slots should always anchor on a pull compound regardless of
  // how many pull exercises appeared earlier in the week (e.g. renegade rows in a
  // lower session reduce need["pull"] to 1 but are not valid back anchors).
  const preferBackPullCompound =
    slot.focusMuscles.includes("back") && slot.preferredMovements.includes("pull");
  const lowerAnchorFilter = (ex: Exercise): boolean =>
    environmentAllowsExercise(ex, activeProfile) &&
    goalAllows(ex, activeProfile.goal) &&
    isStrongLowerAnchor(ex) &&
    (isHeavyEquipment(ex) || movementOf(ex) === "single_leg");
  const anchorFilter = lowerBiasSlot ? lowerAnchorFilter : upperCompoundFilter;
  // On back-to-back training days the anchor should lead with muscles that
  // were NOT hard-dosed yesterday (a full-body day after a glute-heavy day
  // anchors on a press or row instead of another glute lift). Falls back to
  // the plain filter when the equipment pool leaves no fresh anchor.
  const anchorIsFresh = (ex: Exercise): boolean =>
    !ex.primary.some(
      (m) =>
        m !== "core" &&
        m !== "hip_flexors" &&
        (yesterdayPrimary[m] ?? 0) >= PLANNER_TUNING.sessionTarget.hardDoseYesterdayThreshold,
    );
  const freshAnchorFilter = (ex: Exercise): boolean => anchorFilter(ex) && anchorIsFresh(ex);
  // Keystone continuity: a program progresses by repeating its main lift week
  // over week, so re-anchor on the lift that opened the most recent session of
  // THIS slot (3-14 days back) unless it has stalled or no longer qualifies.
  // Accessories keep rotating; only the anchor persists.
  const keystoneAnchor = ((): Exercise | null => {
    const past = [...workouts]
      .sort(compareWorkoutsDesc)
      .find(
        (w) =>
          w.planSlot?.slotId === slot.id &&
          isWithinPastDays(w.date, todayISO, 14) &&
          !isWithinPastDays(w.date, todayISO, 2),
      );
    const name = past?.exercises[0]?.exerciseName;
    if (!name || stalledExerciseNames.has(name)) return null;
    const meta = findExerciseByName(name);
    if (!meta || used.has(meta.name) || !anchorFilter(meta)) return null;
    // Keystone yields when its muscles took a hard dose yesterday.
    if (!anchorIsFresh(meta)) return null;
    return movementOf(meta) ? meta : null;
  })();
  const compoundPick = keystoneAnchor
    ? { movement: movementOf(keystoneAnchor) as MovementPattern, exercise: keystoneAnchor }
    : lowerBiasSlot
      ? // Fresh-muscle anchor first; then any anchor; the anchor is guaranteed,
        // so finally retry with the score floor relaxed rather than let a
        // saturated week produce a session with no main lift.
        pickForMovement(lowerAnchorMovements, compoundTargets.length, freshAnchorFilter) ??
        pickForMovement(lowerAnchorMovements, compoundTargets.length, lowerAnchorFilter) ??
        pickForMovement(lowerAnchorMovements, compoundTargets.length, lowerAnchorFilter, true)
      : ((preferBackPullCompound
          ? pickForMovement(["pull"], compoundTargets.length, (ex) => upperCompoundFilter(ex) && anchorIsFresh(ex)) ??
            pickForMovement(["pull"], compoundTargets.length, upperCompoundFilter)
          : null) ??
        pickForMovement(compoundMovements, compoundTargets.length, freshAnchorFilter) ??
        pickForMovement(compoundMovements, compoundTargets.length, upperCompoundFilter) ??
        pickForMovement(compoundMovements, compoundTargets.length, upperCompoundFilter, true));
  // 2. Secondary lift — add another focused block before accessories.
  const secondaryMovements = accessoryMovements.filter(
    (movement) => movement !== compoundPick?.movement,
  );
  // Signal the muscle-overlap cap about compoundPick before it's claimed, so
  // secondaryPick candidates aren't scored blind to its muscles.
  pendingPicks = compoundPick ? [compoundPick.exercise] : [];
  let secondaryPick = lowerBiasSlot
    ? pickForMovement(
      secondaryMovements,
      secondaryTargets.length,
      (ex) =>
          environmentAllowsExercise(ex, activeProfile) &&
          goalAllows(ex, activeProfile.goal) &&
          isGluteBiasedLower(ex) &&
          avoidSoftLowerAccessory(ex),
      )
    : // The strength-pair support on an upper day should itself be a compound
      // (a press to pair with a pull anchor, or vice versa) — raises and
      // isolations belong in the accessory supersets, not opposite the main
      // lift. Fall back to the broader pool only when no compound fits.
      pickForMovement(
        secondaryMovements,
        secondaryTargets.length,
        (ex) => upperCompoundFilter(ex) && avoidSoftLowerAccessory(ex),
      ) ??
      pickForMovement(
        secondaryMovements,
        secondaryTargets.length,
        (ex) =>
          environmentAllowsExercise(ex, activeProfile) &&
          goalAllows(ex, activeProfile.goal) &&
          (isBackOrShoulderFocused(ex) || (armBiasSlot && isDirectArmFocus(ex))) &&
          avoidSoftLowerAccessory(ex),
      );
  if (!secondaryPick) {
    secondaryPick = lowerBiasSlot
      ? pickForMovement(
          secondaryMovements,
          secondaryTargets.length,
          (ex) =>
            environmentAllowsExercise(ex, activeProfile) &&
            goalAllows(ex, activeProfile.goal) &&
            isBackOrShoulderFocused(ex) &&
            avoidSoftLowerAccessory(ex),
        )
      : pickForMovement(
          secondaryMovements,
          secondaryTargets.length,
          (ex) =>
            environmentAllowsExercise(ex, activeProfile) &&
            goalAllows(ex, activeProfile.goal) &&
            isGluteBiasedLower(ex) &&
            avoidSoftLowerAccessory(ex),
        );
  }
  if (!secondaryPick) {
    secondaryPick = pickForMovement(
      secondaryMovements,
      secondaryTargets.length,
      (ex) =>
        environmentAllowsExercise(ex, activeProfile) &&
        goalAllows(ex, activeProfile.goal) &&
        avoidSoftLowerAccessory(ex) &&
        !(compoundPick?.exercise.equipment === "barbell" && ex.equipment === "barbell"),
    );
  }
  pendingPicks = [];

  // The strength-pair support is structurally guaranteed — every session keeps
  // a compound opposite the main lift for movement balance — so saturation
  // scoring can only steer WHICH press/pull gets picked, never shrink the dose.
  // When every non-core muscle the support move primarily hits is already past
  // its weekly target, keep the pattern but drop it to a maintenance touch.
  const supportPrimaries = secondaryPick
    ? secondaryPick.exercise.primary.filter(
        (m) => m !== "core" && m !== "hip_flexors",
      )
    : [];
  const supportSaturated =
    supportPrimaries.length > 0 &&
    supportPrimaries.every((m) => {
      const target = weeklyMuscleTargets[m] ?? 0;
      return target > 0 && (coverage.muscleStats[m]?.primaryStimulus ?? 0) >= target;
    });
  const supportSets = supportSaturated
    ? PLANNER_TUNING.sessionTarget.saturatedSupportSets
    : 4;
  if (supportSaturated) supportPrimaries.forEach((m) => saturationClosedMuscles.add(m));
  const supportLabel = supportPrimaries
    .map((m) => m.replace("_", " "))
    .join(" and ");
  const saturatedSupportNote =
    supportSaturated && secondaryPick
      ? `${supportLabel.charAt(0).toUpperCase()}${supportLabel.slice(1)} already hit this week's target, so ${secondaryPick.exercise.name} stays for movement balance at a light ${supportSets}-set touch.`
      : null;

  if (compoundPick && secondaryPick && hardMode) {
    claimWithStress(compoundPick.exercise, compoundTargets.length);
    pushMovement(compoundPick.movement);
    claimWithStress(secondaryPick.exercise, supportSets);
    pushMovement(secondaryPick.movement);
    // Put the barbell exercise first when the need-ranked "compound" is lighter equipment.
    // A barbell deadlift should lead a dumbbell lunge, not follow it — but a
    // barbell CURL is still an isolation and never leads the pair.
    const barbellLeads =
      secondaryPick.exercise.equipment === "barbell" &&
      compoundPick.exercise.equipment !== "barbell" &&
      !isDirectArmFocus(secondaryPick.exercise);
    sections.push({
      kind: "superset",
      rounds: 4,
      repScheme: "strength pairing · main lift + support move",
      exercises: [
        makeDraftEx(
          barbellLeads ? secondaryPick.exercise : compoundPick.exercise,
          barbellLeads ? secondaryTargets.slice(0, supportSets) : compoundTargets,
        ),
        makeDraftEx(
          barbellLeads ? compoundPick.exercise : secondaryPick.exercise,
          barbellLeads ? compoundTargets : secondaryTargets.slice(0, supportSets),
        ),
      ],
    });
  } else {
    if (compoundPick) {
      claimWithStress(compoundPick.exercise, compoundTargets.length);
      pushMovement(compoundPick.movement);
      sections.push({
        kind: "compound",
        rounds: 4,
        repScheme: compoundRepScheme,
        exercises: [makeDraftEx(compoundPick.exercise, compoundTargets)],
      });
    }
    if (secondaryPick) {
      const supportTargets = secondaryTargets.slice(0, supportSets);
      claimWithStress(secondaryPick.exercise, supportTargets.length);
      pushMovement(secondaryPick.movement);
      sections.push({
        kind: "accessory",
        rounds: Math.min(secondaryRounds, supportTargets.length),
        repScheme: secondaryRepScheme,
        exercises: [
          makeDraftEx(secondaryPick.exercise, supportTargets),
        ],
      });
    }
  }

  // Physique lower accessories serve whichever lower muscles today's slot still
  // targets — once glutes have closed for the week and composition drops them,
  // quad/hamstring/adductor work keeps the session a lower session.
  const lowerTargetedAccessory = (ex: Exercise): boolean =>
    (["quads", "hamstrings", "adductors"] as MuscleGroup[]).some(
      (muscle) => hasPrimary(ex, muscle) && (slot.targetPrimaryStimulus[muscle] ?? 0) > 0,
    );
  const glutesTargeted = (slot.targetPrimaryStimulus.glutes ?? 0) > 0;
  const gluteAccessory = (ex: Exercise): boolean =>
    glutesTargeted && (isGluteBiasedLower(ex) || isDirectGluteFocus(ex));

  // 3. First accessory superset — prioritize uncovered movements.
  addSuperset(
    accessoryMovements,
    accessoryRounds,
    firstAccessoryRepScheme,
    firstAccessoryTargets,
    (ex) =>
      environmentAllowsExercise(ex, activeProfile) &&
      goalAllows(ex, activeProfile.goal) &&
      avoidSoftLowerAccessory(ex) &&
      noHeavyBarbellCircuit(ex) &&
      (activeProfile.goal !== "physique" ||
        (!isChestDominantPush(ex) &&
          ((lowerBiasSlot && (gluteAccessory(ex) || lowerTargetedAccessory(ex))) ||
            (upperBiasSlot &&
              (isBackOrShoulderFocused(ex) ||
                (armBiasSlot && isDirectArmFocus(ex))))))),
  );

  // 4. Second accessory superset — add enough volume for a fuller session.
  const secondAccessoryFilter = (ex: Exercise) =>
    environmentAllowsExercise(ex, activeProfile) &&
    goalAllows(ex, activeProfile.goal) &&
    avoidSoftLowerAccessory(ex) &&
    noHeavyBarbellCircuit(ex) &&
    (activeProfile.goal !== "physique" ||
      ((lowerBiasSlot &&
        (gluteAccessory(ex) || lowerTargetedAccessory(ex) || isBackOrShoulderFocused(ex))) ||
        (upperBiasSlot &&
          (isBackOrShoulderFocused(ex) ||
            (armBiasSlot && isDirectArmFocus(ex)) ||
            isGluteBiasedLower(ex)))));

  if (useTrisetAccessory) {
    addCircuit(
      accessoryMovements,
      accessoryRounds,
      `${secondAccessoryRepScheme} · tri-set`,
      secondAccessoryTargets,
      secondAccessoryFilter,
    );
  } else {
    addSuperset(
      accessoryMovements,
      accessoryRounds,
      secondAccessoryRepScheme,
      secondAccessoryTargets,
      secondAccessoryFilter,
    );
  }

  // Supplemental cross-over: if the slot has supplementalMovements and no exercise
  // from that movement appeared in the accessory picks, add a short block now.
  for (const suppMovement of (slot.supplementalMovements ?? [])) {
    const hasSuppWork = sections.some((section) =>
      section.exercises.some((ex) => ex.movement === suppMovement),
    );
    if (!hasSuppWork) {
      addAccessoryBlock(
        [suppMovement],
        3,
        "10–12 reps · cross-over",
        [12, 10, 10],
        (ex) =>
          environmentAllowsExercise(ex, activeProfile) &&
          goalAllows(ex, activeProfile.goal),
      );
    }
  }

  // Fill-in blocks run before the finisher so the finisher is always last in the
  // sections array and renders at the bottom of the UI, not mid-workout.
  const totalExercises = (): number =>
    sections.reduce((count, section) => count + section.exercises.length, 0);

  const hasDirectArmWork = (): boolean =>
    sections.some((section) =>
      section.exercises.some((exercise) =>
        exercise.primary.includes("biceps") || exercise.primary.includes("triceps"),
      ),
    );

  const hasLowerSupportWork = (): boolean =>
    sections.some((section) =>
      section.exercises.some((exercise) =>
        exercise.primary.includes("glutes") ||
        exercise.primary.includes("quads") ||
        exercise.primary.includes("hamstrings"),
      ),
    );

  const hasCarryCore = (): boolean =>
    sections.some((section) =>
      section.exercises.some((exercise) => exercise.movement === "carry_core"),
    );

  if (totalExercises() < 5) {
    // Core is eligible here when the session has none yet: on a slot whose
    // lower/support targets are already spent, the honest fifth exercise is
    // core work, not another lift stacked onto an over-served muscle.
    addAccessoryBlock(
      hasCarryCore() ? accessoryMovements : [...accessoryMovements, "carry_core"],
      accessoryRounds,
      "12–15 reps — finishing volume",
      accessoryRounds === 5
        ? [15, 12, 12, 10, 10]
        : accessoryRounds === 4
          ? [15, 12, 12, 10]
          : [15, 12, 12],
      (ex) =>
        environmentAllowsExercise(ex, activeProfile) &&
        goalAllows(ex, activeProfile.goal) &&
        avoidSoftLowerAccessory(ex) &&
        noHeavyBarbellCircuit(ex) &&
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
        environmentAllowsExercise(ex, activeProfile) &&
        goalAllows(ex, activeProfile.goal) &&
        isDirectArmFocus(ex),
    );
  }

  if (
    activeProfile.goal === "physique" &&
    activeProfile.daysPerWeek === 4 &&
    upperBiasSlot &&
    !hasLowerSupportWork()
  ) {
    addAccessoryBlock(
      accessoryMovements,
      2,
      "10–12 reps — lower support",
      [12, 10],
      (ex) =>
        environmentAllowsExercise(ex, activeProfile) &&
        goalAllows(ex, activeProfile.goal) &&
        avoidSoftLowerAccessory(ex) &&
        isGluteBiasedLower(ex),
    );
  }

  // Core rides along as a secondary on most lifts and headlines most finisher
  // circuits, so the dedicated core block only runs while core still has
  // weekly headroom — otherwise a 3-day week quietly accrues 30+ core sets.
  const coreOverTarget =
    (muscleSaturation.core ?? 0) >= PLANNER_TUNING.sessionTarget.coreBlockSaturationCutoff;
  if (!hasCarryCore() && !coreOverTarget) {
    addAccessoryBlock(
      ["carry_core"],
      2,
      "2–3 sets · core/carry",
      [12, 12],
      (ex) =>
        environmentAllowsExercise(ex, activeProfile) &&
        goalAllows(ex, activeProfile.goal) &&
        slot.focusMuscles.some(
          (muscle) => ex.primary.includes(muscle) || ex.secondary.includes(muscle),
        ),
    );
  }

  // Session completeness guarantee: a program never hands the user a one- or
  // two-exercise day. Deep weekly saturation can drive every candidate for
  // the normal stages below pickBest's floor and null them out — in that case
  // take the least-bad LEGAL picks (hard blocks still excluded) until the
  // session has a real body of work.
  let completenessGuard = 0;
  while (
    totalExercises() < PLANNER_TUNING.sessionTarget.minSessionExercises &&
    completenessGuard < 4
  ) {
    completenessGuard += 1;
    const added = addAccessoryBlock(
      [...accessoryMovements, "carry_core"],
      accessoryRounds,
      "12–15 reps — finishing volume",
      accessoryRounds === 5
        ? [15, 12, 12, 10, 10]
        : accessoryRounds === 4
          ? [15, 12, 12, 10]
          : [15, 12, 12],
      (ex) =>
        environmentAllowsExercise(ex, activeProfile) &&
        goalAllows(ex, activeProfile.goal) &&
        avoidSoftLowerAccessory(ex) &&
        noHeavyBarbellCircuit(ex),
      true,
    );
    if (!added) break;
  }

  // 5. Finisher — 3-day plans bias harder toward conditioning so the session
  // still has a noticeable end-of-workout push.
  const allowConditioningFinisher =
    activeProfile.daysPerWeek === 3 ||
    isHomeProfile;
  const templateApplies = (template: FinisherTemplate): boolean => {
    if (template.requiresHardMode && !hardMode) return false;
    if (lowerBiasSlot && !template.tags.includes("lower") && !template.tags.includes("conditioning")) {
      return false;
    }
    if (upperBiasSlot && !template.tags.includes("upper") && !template.tags.includes("core") && !template.tags.includes("conditioning")) {
      return false;
    }
    const exercises = template.exercises
      .map(findExerciseByName)
      .filter((exercise): exercise is Exercise => Boolean(exercise));
    if (exercises.length !== template.exercises.length) return false;
    // Almost every template carries the generic "conditioning" tag, which
    // bypasses the lower/upper tag gates above — reject a template whose
    // exercises are ALL off-theme for this session's body region so an
    // all-push circuit can't fill a lower-focused session's finisher slot
    // (and vice versa).
    if (lowerBiasSlot && exercises.every((exercise) => isPushLeaningFinisher(exercise))) {
      return false;
    }
    if (upperBiasSlot && exercises.every((exercise) => isLowerFatiguingFinisher(exercise))) {
      return false;
    }
    if (
      strictPullCatchUpUpperSlot &&
      (template.tags.includes("lower") ||
        exercises.some((exercise) =>
          isPushLeaningFinisher(exercise) || isLowerFatiguingFinisher(exercise),
        ))
    ) {
      return false;
    }
    if (
      !exercises.every(
        (exercise) =>
          !used.has(exercise.name) &&
          environmentAllowsExercise(exercise, activeProfile),
      )
    ) {
      return false;
    }
    // A hinge-movement finisher (swings, good mornings) must not become the
    // session's third posterior-chain hinge — mirror the in-session
    // posterior-overload guard for template contents.
    const hingeDominantClaimed =
      (claimedMovements.hinge ?? 0) + (claimedFamilies["rdl"] ?? 0);
    if (
      lowerBiasSlot &&
      hingeDominantClaimed >= 2 &&
      exercises.some((exercise) => movementOf(exercise) === "hinge")
    ) {
      return false;
    }
    // Trainer-equivalent compound families the session already claimed must
    // not reappear via a finisher circuit — "Glute bridge" after a hip-thrust
    // variant is the same movement again. Arm isolation is deliberately not
    // gated: an arm burnout circuit after direct arm work is a normal finisher.
    if (
      exercises.some((exercise) => {
        const family = familyOf(exercise);
        return (
          (family === "hip_thrust" || family === "rdl") &&
          (claimedFamilies[family] ?? 0) > 0
        );
      })
    ) {
      return false;
    }
    // Hard-excludes a template if any of its exercises would push a muscle
    // group past its session cap, counting both already-claimed exercises
    // (main lifts/prior sections) and exercises earlier in this same
    // template's list — a 3-move all-core template needs enough session
    // headroom on core for all 3, not just for whichever one is checked
    // first.
    const seenInTemplate: Exercise[] = [];
    for (const exercise of exercises) {
      if (muscleOverlapOverage(exercise, seenInTemplate).length > 0) return false;
      seenInTemplate.push(exercise);
    }
    return true;
  };
  const templateScore = (template: FinisherTemplate): number => {
    let score = 0;
    if (template.tags.includes("conditioning")) score += 2;
    if (template.tags.includes("core")) score += 1.25;
    if (template.tags.includes("lower") && lowerBiasSlot) score += 2.5;
    if (template.tags.includes("upper") && upperBiasSlot) score += 2.5;
    if (template.tags.includes("core") && upperBiasSlot) score += 0.75;
    if (template.tags.includes("core") && lowerBiasSlot) score += 0.5;
    // +0.75 (not more): hard-mode templates should be favored, but a bigger
    // bonus pushes every alternative out of the shortlist spread and makes
    // hard-mode finishers near-deterministic.
    if (template.requiresHardMode && hardMode) score += 0.75;
    if (template.exercises.some((name) => {
      const exercise = findExerciseByName(name);
      return exercise?.equipment === "dumbbell" || exercise?.equipment === "bodyweight";
    })) {
      score += 0.75;
    }
    if (template.tags.includes("upper") && lowerBiasSlot) score -= 0.5;
    if (template.tags.includes("lower") && upperBiasSlot) score -= 0.5;
    const templateExercises = template.exercises
      .map(findExerciseByName)
      .filter((exercise): exercise is Exercise => Boolean(exercise));
    // A finisher shouldn't keep feeding a muscle that is already past its
    // weekly target (e.g. a swing + glute-bridge circuit on a glute-saturated
    // week) — steer the draw toward circuits that spend the effort elsewhere.
    templateExercises.forEach((exercise) => {
      exercise.primary.forEach((muscle) => {
        if (
          (muscleSaturation[muscle] ?? 0) >=
          PLANNER_TUNING.exerciseSelection.overTargetThreshold
        ) {
          score -= PLANNER_TUNING.sessionTarget.finisherSaturatedMusclePenalty;
        }
      });
    });
    if (pullCatchUpUpperSlot) {
      score -= templateExercises.filter((exercise) => isPushLeaningFinisher(exercise)).length * 4;
      score -= templateExercises.filter((exercise) => isLowerFatiguingFinisher(exercise)).length * 2.5;
      if (template.tags.includes("core")) score += 2.5;
      if (templateExercises.some((exercise) => movementOf(exercise) === "carry_core")) score += 2;
    }
    if (lowerBiasSlot) {
      const templateUnilateralFamilies = templateExercises
        .map((exercise) => lowerUnilateralKneeFamilyOf(exercise))
        .filter((family): family is string => family !== null);
      if (templateUnilateralFamilies.length > 0) {
        const usedLowerUnilateralFamilies = ["split_squat", "lunge", "step_up"].reduce(
          (count, key) => count + (claimedFamilies[key] ?? 0),
          0,
        );
        if (usedLowerUnilateralFamilies >= 1) score -= PLANNER_TUNING.exerciseSelection.unilateralFamilyPenalty;
        if (usedLowerUnilateralFamilies >= 2) score -= PLANNER_TUNING.exerciseSelection.repeatedUnilateralFamilyPenalty;
      }
    }
    score -= finisherRepeatPenalty(template.exercises, workouts, todayISO);
    return score;
  };
  const scoredTemplates = [...FINISHER_TEMPLATES]
    .filter(templateApplies)
    .map((template) => ({
      template,
      score: templateScore(template),
    }))
    .sort((a, b) => b.score - a.score);
  const bestTemplateScore = scoredTemplates[0]?.score ?? -Infinity;
  const templateShortlist = scoredTemplates.filter(
    ({ score }) => score >= bestTemplateScore - PLANNER_TUNING.finisherVariety.templateShortlistSpread,
  );
  let chosenTemplate: FinisherTemplate | undefined;
  // When the shortlist has only one entry and it's already been excluded
  // (i.e. it's the finisher currently on screen), there is no genuine
  // curated alternative — reusing it anyway makes every Shuffle click a
  // no-op. Hold onto it as a last resort and let the ad-hoc per-exercise
  // fallback below take a real shot at variety instead.
  let fallbackSingletonTemplate: FinisherTemplate | undefined;
  if (templateShortlist.length > 0) {
    // Every template in the shortlist already cleared the score-proximity
    // gate, so treat them as equally valid picks — weighting again within
    // that "good enough" set just collapses variety back onto the top 1-2.
    const excluded = new Set(overrides?.excludeFinisherTemplateIds ?? []);
    const drawPool = templateShortlist.filter(({ template }) => !excluded.has(template.id));
    if (drawPool.length > 0) {
      chosenTemplate = drawPool[Math.floor(finisherRng() * drawPool.length)]?.template;
    } else {
      // Every shortlisted template is excluded (all currently/recently shown),
      // so redrawing among them makes Shuffle a visible no-op — same trap as
      // the singleton case regardless of shortlist size. Park one as a last
      // resort and give the ad-hoc path a shot at genuine variety.
      fallbackSingletonTemplate =
        templateShortlist[Math.floor(finisherRng() * templateShortlist.length)]?.template;
    }
  }

  const applyChosenTemplate = (template: FinisherTemplate) => {
    const templateExercises = template.exercises
      .map(findExerciseByName)
      .filter((exercise): exercise is Exercise => Boolean(exercise));
    templateExercises.forEach((exercise) => {
      claimWithStress(
        exercise,
        template.rounds,
        PLANNER_TUNING.fatigueBudget.finisherStressMultiplier,
      );
      if (movementOf(exercise) === "carry_core") pushMovement("carry_core");
    });
    sections.push({
      kind: "finisher",
      templateId: template.id,
      rounds: template.rounds,
      repScheme: `${template.repScheme} · ${template.label}`,
      exercises: templateExercises.map((exercise) =>
        makeDraftEx(exercise, templateTargetSet(template, exercise)),
      ),
    });
  };

  if (chosenTemplate) {
    applyChosenTemplate(chosenTemplate);
  } else {
    const adHocEligible = (ex: Exercise, enforceMuscleCap: boolean): boolean => {
      if (used.has(ex.name)) return false;
      if (!environmentAllowsExercise(ex, activeProfile)) return false;
      if (enforceMuscleCap && muscleOverlapOverage(ex).length > 0) return false;
      if (lowerBiasSlot && isPushLeaningFinisher(ex)) return false;
      if (upperBiasSlot && isLowerFatiguingFinisher(ex)) return false;
      if (strictPullCatchUpUpperSlot) {
        if (isPushLeaningFinisher(ex) || isLowerFatiguingFinisher(ex)) return false;
      }
      if (allowConditioningFinisher) return isPreferredAccessibleFinisher(ex);
      return movementOf(ex) === "carry_core" || isAccessibleMetabolicFinisher(ex);
    };
    const cappedCandidates = EXERCISES.filter((ex) => adHocEligible(ex, true));
    // A full session can have every muscle at its overlap cap, which would
    // leave the ad-hoc path empty and force re-showing an excluded template —
    // the "shuffle does nothing" trap. Finishers run at reduced stress, so
    // fall back to ignoring the cap rather than repeating what the user just
    // asked to replace.
    const finisherCandidates =
      cappedCandidates.length > 0
        ? cappedCandidates
        : EXERCISES.filter((ex) => adHocEligible(ex, false));
    const preferredFinisherCount = 3;
  const finisherPicks: Exercise[] = [];
  const finisherNames = new Set<string>();
  const finisherFamilies = new Set<string>();
  const finisherNoise = new Map<string, number>();
  finisherCandidates.forEach((ex) => finisherNoise.set(ex.name, finisherRng()));
  const sortFinisherScore = (ex: Exercise, currentPicks: Exercise[]): number => {
    let s = 0;
    const projectedStress = estimatePlannedExerciseStress(
      ex,
      finisherRounds,
      PLANNER_TUNING.fatigueBudget.finisherStressMultiplier,
    );
    const projectedSessionTotal =
      sumMuscleStress(plannedSessionStress) + sumMuscleStress(projectedStress);
    if (isAccessibleConditioningFinisher(ex)) s += 5;
    if (isAccessibleMetabolicFinisher(ex)) s += 4.5;
    if (movementOf(ex) === "carry_core") s += 4;
    if (pullCatchUpUpperSlot) {
      if (isPushLeaningFinisher(ex)) s -= 8;
      if (isLowerFatiguingFinisher(ex)) s -= 5;
      if (ex.primary.includes("core") || ex.secondary.includes("core")) s += 2;
    }
    if (["bodyweight", "dumbbell", "band"].includes(ex.equipment)) s += 1.5;
    if (known.has(ex.name)) s += 0.4;
    ex.primary.forEach((m) => {
      if (recent.has(m)) s -= 1;
    });
    s -= finisherRepeatPenalty(
      [...currentPicks.map((pick) => pick.name), ex.name],
      workouts,
      todayISO,
    );
    if (projectedSessionTotal > sessionFatigueBudget) {
      s -=
        (projectedSessionTotal - sessionFatigueBudget) *
        PLANNER_TUNING.fatigueBudget.finisherBudgetPenaltyMultiplier;
    }
    return s + (finisherNoise.get(ex.name) ?? 0) * PLANNER_TUNING.finisherVariety.adHocNoiseWeight;
  };

  const remainingFinisherCandidates = [...finisherCandidates];

  while (finisherPicks.length < preferredFinisherCount && remainingFinisherCandidates.length > 0) {
    const rankedCandidates = [...remainingFinisherCandidates].sort(
      (a, b) => sortFinisherScore(b, finisherPicks) - sortFinisherScore(a, finisherPicks),
    );
    let picked: Exercise | null = null;

    for (const ex of rankedCandidates) {
      if (finisherNames.has(ex.name)) continue;
      const family = familyOf(ex);
      if (finisherFamilies.has(family)) continue;
      if (muscleOverlapOverage(ex, finisherPicks).length > 0) continue;
      if (
        finisherPicks.length > 0 &&
        movementOf(ex) !== "carry_core" &&
        movementOf(ex) !== null &&
        finisherPicks.some((existing) => movementOf(existing) === movementOf(ex))
      ) {
        continue;
      }
      picked = ex;
      break;
    }

    if (!picked) break;

    finisherPicks.push(picked);
    finisherNames.add(picked.name);
    finisherFamilies.add(familyOf(picked));
    const pickedIndex = remainingFinisherCandidates.findIndex(
      (candidate) => candidate.name === picked?.name,
    );
    if (pickedIndex >= 0) remainingFinisherCandidates.splice(pickedIndex, 1);
  }

  if (finisherPicks.length === 0) {
    const fin = pickBestFinisher((ex) => {
      if (!environmentAllowsExercise(ex, activeProfile)) return false;
      if (lowerBiasSlot && isPushLeaningFinisher(ex)) return false;
      if (upperBiasSlot && isLowerFatiguingFinisher(ex)) return false;
      if (strictPullCatchUpUpperSlot) {
        if (isPushLeaningFinisher(ex) || isLowerFatiguingFinisher(ex)) return false;
      }
      if (allowConditioningFinisher) return isPreferredAccessibleFinisher(ex);
      return movementOf(ex) === "carry_core" || isAccessibleMetabolicFinisher(ex);
    });
    if (fin) finisherPicks.push(fin);
  }

  if (finisherPicks.length > 0) {
    finisherPicks.forEach((fin) => {
      claimWithStress(
        fin,
        finisherRounds,
        PLANNER_TUNING.fatigueBudget.finisherStressMultiplier,
      );
      if (movementOf(fin) === "carry_core") pushMovement("carry_core");
    });
    sections.push({
      kind: "finisher",
      rounds: finisherRounds,
      repScheme: finisherLabel(finisherPicks),
      exercises: finisherPicks.map((fin) => makeDraftEx(fin, finisherTargetSet(fin, finisherRounds))),
    });
  } else if (fallbackSingletonTemplate) {
    // The ad-hoc fallback found nothing usable — re-show the excluded
    // singleton template rather than leaving the session without a
    // finisher section at all.
    applyChosenTemplate(fallbackSingletonTemplate);
  }
  }

  // ---- Rationale ----
  const rationale: string[] = [];
  if (weekPhase.phase === "deload" && weekPhase.reason) rationale.push(weekPhase.reason);
  if (effortReason) rationale.push(effortReason);
  const selectedExerciseNames = new Set(
    sections.flatMap((section) => section.exercises.map((exercise) => exercise.name)),
  );
  const plannedSessionStressTotal = sumMuscleStress(plannedSessionStress);
  const budgetUsage = sessionFatigueBudget > 0
    ? plannedSessionStressTotal / sessionFatigueBudget
    : 0;
  const recentFocusStress = slot.focusMuscles
    .map((muscle) => ({
      muscle,
      stress: recentStress[muscle] ?? 0,
    }))
    .filter(({ stress }) => stress > PLANNER_TUNING.rationale.recentFocusStressThreshold)
    .sort((a, b) => b.stress - a.stress);
  const rotatedOffLiftNames = [...stalledExerciseNames]
    .map((name) => EXERCISES.find((exercise) => exercise.name === name))
    .filter((exercise): exercise is Exercise => Boolean(exercise))
    .filter((exercise) => {
      if (selectedExerciseNames.has(exercise.name)) return false;
      const movement = movementOf(exercise);
      if (movement === null) {
        // Conditioning/plyo/calf work never fills a main slot (see
        // scoreExercise's `if (!movement) return HARD_BLOCK_SCORE`) — it can only return
        // through a finisher pick, so only offer it back when the user's
        // environment could actually support it there.
        return environmentAllowsExercise(exercise, activeProfile);
      }
      return (
        slot.allowedMovements.includes(movement) &&
        hasAnyMuscle(exercise, slot.focusMuscles)
      );
    })
    .map((exercise) => exercise.name);

  if (rotatedOffLiftNames.length > 0) {
    rationale.push(
      `Rotated off stalled lift${rotatedOffLiftNames.length > 1 ? "s" : ""}: ${rotatedOffLiftNames.join(", ")}.`,
    );
  }
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
  rationale.push(
    `This is ${slot.title}: ${slot.summary}`,
  );
  const remainingFocus = slot.focusMuscles
    .map((muscle) => {
      const target = slot.targetPrimaryStimulus[muscle] ?? 0;
      if (target <= 0) return null;
      const done = coverage.muscleStats[muscle]?.primaryStimulus ?? 0;
      const doneLabel = Number(done.toFixed(1));
      const targetLabel = Number(target.toFixed(1));
      return done < target ? `${muscle.replace("_", " ")} ${doneLabel}/${targetLabel}` : null;
    })
    .filter((value): value is string => Boolean(value));
  if (remainingFocus.length > 0) {
    rationale.push(`Still building this slot's focus stimulus: ${remainingFocus.join(", ")}.`);
  }
  if (composition.loggedSessions > 0 && composition.closes.length > 0) {
    const gaps = composition.closes
      .map((muscle) => {
        const left = Math.max(
          0,
          (weeklyBand[muscle]?.floor ?? 0) - (coverage.muscleStats[muscle]?.primaryStimulus ?? 0),
        );
        return `${muscle.replace("_", " ")} ${left.toFixed(1)} left`;
      })
      .join(", ");
    rationale.push(
      `Closing this week's gaps: ${gaps} · ${composition.loggedSessions} of ${activeProfile.daysPerWeek} sessions logged.`,
    );
  }
  if (saturatedSupportNote) rationale.push(saturatedSupportNote);
  if (recentFocusStress.length > 0) {
    rationale.push(
      `Recent overlap is high for ${recentFocusStress
        .slice(0, PLANNER_TUNING.rationale.recentFocusDisplayLimit)
        .map(({ muscle }) => muscle.replace("_", " "))
        .join(", ")}, so this session steers stress toward fresher work.`,
    );
  }
  if (budgetUsage >= PLANNER_TUNING.rationale.budgetHighThreshold) {
    rationale.push(
      "Kept total session fatigue in check so this workout stays productive without overshooting recovery.",
    );
  } else if (budgetUsage >= PLANNER_TUNING.rationale.budgetMediumThreshold) {
    rationale.push(
      "Capped the total load a bit to respect recent fatigue while still moving weekly stimulus forward.",
    );
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
  directionNeed.forEach((key) => {
    const [pattern, direction] = key.split("_") as ["push" | "pull", "horizontal" | "vertical"];
    const added = sections.some((section) =>
      section.exercises.some((exercise) => {
        const meta = findExerciseByName(exercise.name);
        return meta !== null && movementOf(meta) === pattern && directionOf(meta) === direction;
      }),
    );
    if (!added) return;
    const other = direction === "horizontal" ? "vertical" : "horizontal";
    const example =
      pattern === "pull"
        ? direction === "horizontal" ? "a row" : "a pulldown or pull-up"
        : direction === "horizontal" ? "a horizontal press" : "an overhead press";
    rationale.push(`${formatMovement(pattern)} work has been all ${other} this week — adding ${example}.`);
  });
  if (recent.size > 0) {
    // Only claim a muscle was "avoided" if this session's own selected
    // exercises don't actually touch it — recent.size > 0 alone doesn't mean
    // the session succeeded in avoiding those muscles (a slot's allowed
    // movements can make some of them unavoidable).
    const touchedMuscles = new Set(
      sections.flatMap((section) =>
        section.exercises.flatMap((ex) => [...ex.primary, ...ex.secondary]),
      ),
    );
    const list = [...recent]
      .filter((m) => MUSCLE_GROUPS.includes(m as (typeof MUSCLE_GROUPS)[number]))
      .filter((m) => !touchedMuscles.has(m))
      .map((m) => m.replace("_", " "));
    if (list.length > 0) {
      rationale.push(
        `Avoiding muscles trained in the last 48h: ${list.join(", ")}.`,
      );
    }
  }
  if (hardMode) {
    rationale.push(
      "Hard mode is on: more rounds, denser accessory work, and a stronger finisher.",
    );
  }
  if (rationale.length === 0) {
    rationale.push("All movement patterns are well covered — balanced session.");
  }

  const mobility = buildSessionBookend(
    "5-minute warm-up",
    WARMUP_BY_MUSCLE,
    slot.focusMuscles,
    ["Brisk walk or bike x 2 min", "Deep squat pry or hip opener x 30s"],
  );
  const cooldown = buildSessionBookend(
    "Cooldown and stretch",
    COOLDOWN_BY_MUSCLE,
    slot.focusMuscles,
    ["Easy breathing x 1 min", "Light walk x 2 min"],
  );

  // Move watch/stalled-trend sections earlier so recovery-focused lifts land
  // near the start of the session, when form quality matters most — but
  // never displace the opening main-lift section, and never move anything
  // past the finisher (which always stays last, see the fill-in comment
  // above). Array.prototype.filter is a stable partition, so relative order
  // within the flagged and non-flagged groups is preserved.
  const sectionHasFlaggedExercise = (section: DraftSection): boolean =>
    section.exercises.some((ex) => ex.trend === "watch" || ex.trend === "stalled");
  const reorderedSections = ((): DraftSection[] => {
    if (sections.length === 0) return sections;
    const finisherIndex = sections.findIndex((section) => section.kind === "finisher");
    const anchorEnd = finisherIndex === -1 ? sections.length : finisherIndex;
    const fixed = sections.slice(0, 1);
    const movable = sections.slice(1, anchorEnd);
    const tail = sections.slice(anchorEnd);
    const flagged = movable.filter(sectionHasFlaggedExercise);
    const rest = movable.filter((section) => !sectionHasFlaggedExercise(section));
    return [...fixed, ...flagged, ...rest, ...tail];
  })();

  return {
    split: {
      slotId: slot.id,
      title: slot.title,
      summary: slot.summary,
      focusLabel:
        composition.closes.length > 0
          ? `Today: ${composition.closes.map((muscle) => muscle.replace("_", " ")).join(", ")}`
          : null,
      sessionIndex: Math.min(composition.loggedSessions + 1, activeProfile.daysPerWeek),
      totalSessions: activeProfile.daysPerWeek,
      targetPrimaryStimulus: slot.targetPrimaryStimulus,
      targetPrimarySets: slot.targetPrimaryStimulus,
    },
    composition,
    slotRecommendations,
    sections: reorderedSections,
    rationale,
    mobility,
    cooldown,
  };
}

// ---------- Pending-draft handoff to /log ----------

const PENDING_KEY = "workout.pending-draft.v1";

export type PendingDraft = {
  source: "manual";
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
