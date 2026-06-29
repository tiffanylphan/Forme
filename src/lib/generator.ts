import { EXERCISES } from "./exercises";
import { environmentAllowsExercise } from "./exercise-availability";
import { movementOf, muscleSetToMovements } from "./movement";
import { PLANNER_TUNING } from "./planner-tuning";
import { DEFAULT_PROFILE } from "./profile";
import { MOVEMENT_PATTERNS, MUSCLE_GROUPS } from "./types";
import {
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
    targetPrimaryStimulus: Partial<Record<MuscleGroup, number>>;
    targetPrimarySets: Partial<Record<MuscleGroup, number>>;
  };
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

type GeneratorOverrides = {
  forcedSlotId?: string;
  focusedMovements?: MovementPattern[];
  focusedMuscles?: MuscleGroup[];
  finisherSeed?: number;
  excludeFinisherTemplateIds?: string[];
};

type SplitSlot = {
  id: string;
  title: string;
  summary: string;
  focusMuscles: MuscleGroup[];
  preferredMovements: MovementPattern[];
  allowedMovements: MovementPattern[];
  targetPrimaryStimulus: Partial<Record<MuscleGroup, number>>;
};

type FinisherTemplate = {
  id: string;
  label: string;
  exercises: string[];
  rounds: number;
  repScheme: string;
  tags: ("upper" | "lower" | "core" | "conditioning")[];
  requiresHardMode?: boolean;
};

const PHYSIQUE_UPPER_A_SLOT: SplitSlot = {
  id: "upper_back_shoulder",
  title: "Upper A · Back/Shoulders",
  summary: "Upper session theme with back, shoulders, and glute support.",
  focusMuscles: ["back", "shoulders", "rear_delts", "glutes", "core"],
  preferredMovements: ["pull", "push"],
  allowedMovements: ["pull", "push", "hinge", "carry_core"],
  targetPrimaryStimulus: { back: 7, shoulders: 5, rear_delts: 4, glutes: 2, core: 3 },
};

const PHYSIQUE_UPPER_B_SLOT: SplitSlot = {
  id: "upper_back_shoulder_arms",
  title: "Upper B · Upper/Arms",
  summary: "Upper session theme with shoulders, arms, and lower-body support.",
  focusMuscles: ["back", "shoulders", "rear_delts", "biceps", "triceps", "glutes", "core"],
  preferredMovements: ["pull", "push"],
  allowedMovements: ["pull", "push", "single_leg", "carry_core"],
  targetPrimaryStimulus: { back: 6, shoulders: 5, rear_delts: 4, biceps: 3, triceps: 2, glutes: 2, core: 2 },
};

export const FINISHER_TEMPLATES: FinisherTemplate[] = [
  {
    id: "mechanical_pushup_drop",
    label: "mechanical advantage drop set",
    exercises: ["Archer push-up", "Push-up", "Incline push-up"],
    rounds: 3,
    repScheme: "5 reps each, no rest · drop set",
    tags: ["upper", "conditioning"],
    requiresHardMode: true,
  },
  {
    id: "lunge_trip",
    label: "bi-directional lunge complex",
    exercises: ["Forward lunge", "Lateral lunge", "Reverse lunge"],
    rounds: 3,
    repScheme: "6 reps/side each direction · stay on one side before switching",
    tags: ["lower", "conditioning"],
  },
  {
    id: "burpee_ladder",
    label: "burpee ladder",
    exercises: ["Burpee", "Bodyweight squat"],
    rounds: 2,
    repScheme: "Burpees 1→5→1, air squats 10 each rung",
    tags: ["conditioning", "lower"],
    requiresHardMode: true,
  },
  {
    id: "hollow_superman",
    label: "hollow-to-superman roll",
    exercises: ["Hollow body hold", "Superman hold"],
    rounds: 4,
    repScheme: "8 reps each + controlled roll transition",
    tags: ["core", "conditioning"],
  },
  {
    id: "plank_traveler",
    label: "plank traveler",
    exercises: ["Plank", "Plank to push-up", "Plank jack", "Shoulder tap"],
    rounds: 3,
    repScheme: "10 reps each, non-stop travel through all positions",
    tags: ["upper", "core", "conditioning"],
  },
  {
    id: "bear_box",
    label: "bear crawl box",
    exercises: ["Bear crawl", "Bear plank shoulder tap", "High knees"],
    rounds: 3,
    repScheme: "20 crawl steps + 8 taps + 20 high knees",
    tags: ["lower", "core", "conditioning"],
  },
  {
    id: "wall_ball_sprint",
    label: "wall-ball sprint",
    exercises: ["Wall ball shot", "High knees"],
    rounds: 3,
    repScheme: "15 wall ball shots + 20 high knees + 15 wall ball shots",
    tags: ["lower", "upper", "conditioning"],
  },
  {
    id: "slam_and_sprawl",
    label: "slam-and-sprawl chain",
    exercises: ["Tall-kneeling rotational medicine ball slam", "Burpee", "Bear crawl"],
    rounds: 3,
    repScheme: "10 slams + 8 burpees + 20 crawl steps",
    tags: ["upper", "core", "conditioning"],
    requiresHardMode: true,
  },
  {
    id: "wall_sit_burnout",
    label: "wall-sit burnout",
    exercises: ["Banded wall sit abduction pulses", "Lateral lunge"],
    rounds: 3,
    repScheme: "12 pulses + 8/side lunges + 12 pulses",
    tags: ["lower", "conditioning"],
  },
  {
    id: "dumbbell_burner",
    label: "dumbbell burner",
    exercises: ["Half burpee w/ dumbbell", "Push-up to renegade row", "DB snatch"],
    rounds: 3,
    repScheme: "8 reps each, no rest · metabolic chain",
    tags: ["upper", "lower", "conditioning"],
    requiresHardMode: true,
  },
  {
    id: "skater_shuffle",
    label: "skater shuffle",
    exercises: ["Skater hop", "Mountain climber", "High knees"],
    rounds: 3,
    repScheme: "10/side hops + 16 climbers + 20 high knees, no rest between",
    tags: ["lower", "core", "conditioning"],
  },
  {
    id: "broad_jump_chain",
    label: "broad jump chain",
    exercises: ["Broad jump", "Bodyweight squat", "Mountain climber"],
    rounds: 3,
    repScheme: "5 broad jumps + 12 squats + 16 climbers",
    tags: ["lower", "conditioning"],
  },
  {
    id: "carry_and_crawl",
    label: "carry-and-crawl gauntlet",
    exercises: ["Farmer carry", "Bear crawl", "Tuck-up"],
    rounds: 3,
    repScheme: "30-step carry + 20 crawl steps + 12 tuck-ups",
    tags: ["core", "conditioning"],
  },
  {
    id: "tuck_and_tap",
    label: "tuck-jump and tap chain",
    exercises: ["Tuck jump", "Push-up", "Hanging knee raise"],
    rounds: 3,
    repScheme: "8 tuck jumps + 10 push-ups + 12 knee raises",
    tags: ["upper", "lower", "core", "conditioning"],
  },
  {
    id: "core_conditioning_chain",
    label: "core conditioning chain",
    exercises: ["V-up", "Side plank", "Squat thrust"],
    rounds: 3,
    repScheme: "12 V-ups + 20 sec/side plank + 10 squat thrusts",
    tags: ["core", "conditioning"],
  },
  {
    id: "rotation_and_pop_chain",
    label: "rotation and pop chain",
    exercises: ["Alternating V-up", "Bird dog", "Squat jump"],
    rounds: 3,
    repScheme: "10/side V-ups + 8/side bird dogs + 10 squat jumps",
    tags: ["core", "conditioning"],
  },
  {
    id: "unilateral_carry_circuit",
    label: "unilateral carry circuit",
    exercises: ["Single-side V-up", "Copenhagen plank", "Suitcase carry"],
    rounds: 3,
    repScheme: "8/side V-ups + 20 sec/side plank + 30-step carry",
    tags: ["core", "conditioning"],
  },
  {
    id: "anti_extension_march",
    label: "anti-extension march",
    exercises: ["Dead bug", "High plank", "DB overhead march"],
    rounds: 3,
    repScheme: "10/side dead bugs + 20 sec plank hold + 20-step march",
    tags: ["core", "conditioning"],
  },
  {
    id: "hanging_core_complex",
    label: "hanging core complex",
    exercises: ["Hanging leg raise", "Cable woodchop", "DB renegade row"],
    rounds: 3,
    repScheme: "10 leg raises + 10/side woodchops + 8/side rows",
    tags: ["core", "conditioning"],
  },
  {
    id: "bicycle_and_clean_chain",
    label: "bicycle and clean chain",
    exercises: ["Bicycle crunch", "Side plank dip", "DB squat to clean"],
    rounds: 3,
    repScheme: "16 bicycle crunches + 8/side plank dips + 8 squat-to-cleans",
    tags: ["core", "conditioning"],
  },
  {
    id: "flutter_and_drag_burner",
    label: "flutter and drag burner",
    exercises: ["Flutter kick", "Plank drag", "Woman maker"],
    rounds: 3,
    repScheme: "20 flutter kicks + 8/side plank drags + 6 woman makers",
    tags: ["core", "conditioning"],
  },
  {
    id: "twist_and_pull_chain",
    label: "twist and pull chain",
    exercises: ["Butterfly sit-up", "DB side plank rotation", "DB side lunge to high pull"],
    rounds: 3,
    repScheme: "12 sit-ups + 8/side rotations + 8/side lunge-to-pulls",
    tags: ["upper", "core", "conditioning"],
  },
  {
    id: "rotational_core_gauntlet",
    label: "rotational core gauntlet",
    exercises: ["Oblique twist", "Russian twist", "Pallof press", "Ab wheel rollout"],
    rounds: 3,
    repScheme: "16 reps each, controlled tempo throughout",
    tags: ["core"],
  },
];

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

const findExerciseByName = (name: string): Exercise | null =>
  EXERCISES.find((exercise) => exercise.name === name) ?? null;

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
  adductors: 1.1,
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

const capSuggestedWeight = (
  weight: number | null,
  exercise: Exercise,
  environment: TrainingEnvironment,
): number | null => {
  if (weight == null) return null;
  if (environment !== "home") return weight;
  if (exercise.equipment !== "dumbbell") return weight;
  return Math.min(weight, 15);
};

const isHomeConditioningFriendly = (ex: Exercise): boolean =>
  ex.pattern === "conditioning" ||
  ex.pattern === "core" ||
  ex.equipment === "bodyweight" ||
  ex.equipment === "band";

const isAccessibleConditioningFinisher = (ex: Exercise): boolean =>
  ex.pattern === "conditioning" &&
  ["bodyweight", "dumbbell", "band"].includes(ex.equipment);

const isAccessibleMetabolicFinisher = (ex: Exercise): boolean =>
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

const isPreferredAccessibleFinisher = (ex: Exercise): boolean =>
  movementOf(ex) === "carry_core" ||
  isAccessibleConditioningFinisher(ex) ||
  isAccessibleMetabolicFinisher(ex);

const isPushLeaningFinisher = (ex: Exercise): boolean =>
  ex.pattern === "push" ||
  ex.name === "Push-up to renegade row";

const isLowerFatiguingFinisher = (ex: Exercise): boolean => {
  const movement = movementOf(ex);
  return movement === "hinge" || movement === "squat" || movement === "single_leg";
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

const isBackPullAnchor = (ex: Exercise): boolean =>
  movementOf(ex) === "pull" &&
  hasPrimary(ex, "back") &&
  ex.name !== "DB renegade row" &&
  ex.name !== "Push-up to renegade row" &&
  (familyOf(ex) === "row" || familyOf(ex) === "vertical_pull");

const isDirectGluteFocus = (ex: Exercise): boolean =>
  hasPrimary(ex, "glutes") &&
  (movementOf(ex) === "hinge" || movementOf(ex) === "single_leg");

const isLowerIsolation = (ex: Exercise): boolean =>
  [
    "Leg extension",
    "Leg curl",
    "Banded clamshell",
    "Banded fire hydrant",
    "Banded walkout",
    "Glute bridge",
    "Bench single-leg hip thrust",
    "Wall sit",
    "Wall sit with adductor squeeze",
    "Banded wall sit abduction pulses",
    "Sissy squat",
  ].includes(ex.name);

const isActivationLowerAccessory = (ex: Exercise): boolean =>
  [
    "Banded clamshell",
    "Banded fire hydrant",
    "Banded walkout",
    "Glute bridge",
  ].includes(ex.name);

const isStrongLowerAnchor = (ex: Exercise): boolean => {
  const movement = movementOf(ex);
  if (!movement) return false;
  if (isLowerIsolation(ex)) return false;

  if (movement === "squat" || movement === "hinge") return true;
  if (movement !== "single_leg") return false;

  const family = familyOf(ex);
  return family === "split_squat" || family === "lunge" || family === "step_up";
};

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
  // "DB split squat to RDL" has "rdl" in its name — treat it as rdl family so it
  // is hard-blocked from coexisting with DB Romanian deadlift / Single-leg DB RDL.
  if ((name.includes("split squat") || name.includes("bulgarian")) && !name.includes("rdl")) return "split_squat";
  if (name.includes("romanian deadlift") || name.includes("rdl")) return "rdl";
  if (name.includes("deadlift")) return "deadlift";
  if (name.includes("lunge")) return "lunge";
  if (name.includes("step-up")) return "step_up";
  if (name.includes("row")) return "row";
  if (name.includes("pulldown") || name.includes("pull-up") || name.includes("chin-up"))
    return "vertical_pull";
  if (name.includes("face pull") || name.includes("reverse fly") || name.includes("pull-apart"))
    return "rear_delt";
  if (name.includes("curl") && !name.includes("leg curl")) return "biceps_isolation";
  if (
    name.includes("tricep pushdown") ||
    name.includes("tricep extension") ||
    name.includes("skull crusher") ||
    name.includes("skullcrusher")
  ) {
    return "triceps_isolation";
  }
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

const lowerUnilateralKneeFamilyOf = (ex: Exercise): string | null => {
  if (movementOf(ex) !== "single_leg") return null;
  const family = familyOf(ex);
  if (family === "split_squat" || family === "lunge" || family === "step_up") {
    return family;
  }
  // Hybrid exercises like "DB split squat to RDL" are rdl family (hard-blocked from
  // stacking with other RDLs) but have squat pattern and single-leg movement — they
  // are still knee-dominant and should participate in the unilateral-stacking guard.
  if (family === "rdl" && ex.pattern === "squat") return "split_squat";
  return null;
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

const isLowerSlot = (slot: SplitSlot): boolean =>
  slot.preferredMovements.some((movement) =>
    movement === "hinge" || movement === "squat" || movement === "single_leg",
  );

const isUpperSlot = (slot: SplitSlot): boolean =>
  slot.preferredMovements.some((movement) => movement === "pull" || movement === "push");

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
    if (movement === "push" || movement === "pull") upperStimulus += 0;
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

  sorted.forEach((workout) => {
    const explicitSlotId = workout.planSlot?.slotId;
    if (explicitSlotId && split.some((slot) => slot.id === explicitSlotId)) {
      completed.add(explicitSlotId);
      available.delete(explicitSlotId);
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

const computeMuscleDeficits = (
  split: SplitSlot[],
  coverage: ReturnType<typeof computeCoverage>,
): MuscleDeficitMap => {
  const weeklyTargets: Partial<Record<MuscleGroup, number>> = {};
  split.forEach((slot) => {
    (Object.entries(slot.targetPrimaryStimulus) as [MuscleGroup, number][]).forEach(([muscle, sets]) => {
      if (sets > 0) weeklyTargets[muscle] = (weeklyTargets[muscle] ?? 0) + sets;
    });
  });

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

  const strictPullBias =
    pushFatigue >= PLANNER_TUNING.splitSelection.adaptiveUpperPullPushFatigueThreshold;

  // When shoulders are more deficient than rear delts, don't let the
  // pull-bias allocation cap shoulder work below rear-delt work.
  const shoulderAllocation =
    (muscleDeficits.shoulders ?? 0) > (muscleDeficits.rear_delts ?? 0) ? 4 : 3;

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
    targetPrimaryStimulus:
      slot.id === PHYSIQUE_UPPER_B_SLOT.id
        ? strictPullBias
          ? { back: 8, rear_delts: 4, biceps: 3, core: 3 }
          : { back: 7, rear_delts: 4, shoulders: shoulderAllocation, biceps: 3, core: 3 }
        : strictPullBias
          ? { back: 8, rear_delts: 4, biceps: 2, core: 3 }
          : { back: 8, rear_delts: 4, shoulders: shoulderAllocation, core: 3 },
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
        value: Math.min(target, deficit) * weight,
      };
    })
    .sort((a, b) => b.value - a.value);

  let score = 0;
  const deficitCoverage =
    slotPrimaryTargetTotal > 0
      ? deficitScores.reduce((sum, item) => sum + item.value, 0) / slotPrimaryTargetTotal
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
    const majorThreshold = PLANNER_TUNING.splitSelection.saturationOverTargetMajorMuscleThreshold;
    const maxMajorSat = Math.max(
      0,
      ...targetedMuscles
        .filter((m) => (slot.targetPrimaryStimulus[m] ?? 0) >= majorThreshold && muscleSaturation[m] !== undefined)
        .map((m) => muscleSaturation[m] as number),
    );
    if (maxMajorSat > PLANNER_TUNING.splitSelection.saturationOverTargetThreshold) {
      score -= PLANNER_TUNING.splitSelection.saturationOverTargetPenalty;
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

const getNextSplitSlotIndex = (
  split: SplitSlot[],
  workouts: Workout[],
  need: Record<MovementPattern, number>,
  muscleDeficits: MuscleDeficitMap = {},
  muscleSaturation: Partial<Record<MuscleGroup, number>> = {},
  lastSessionMovements: Set<MovementPattern> = new Set(),
  recentMuscleFatigue: Partial<Record<MuscleGroup, number>> = {},
): number => {
  const weeklyBiasBalance = summarizeWeeklyBiasBalance(split, workouts);
  const incompleteIndices = getIncompleteSplitSlotIndices(split, workouts);

  if (incompleteIndices.length > 0) {
    const bestIncomplete = pickBestSplitSlotIndex(
      split,
      incompleteIndices,
      need,
      muscleDeficits,
      muscleSaturation,
      lastSessionMovements,
      weeklyBiasBalance,
      recentMuscleFatigue,
    );
    if (bestIncomplete) return bestIncomplete.index;
    const firstIncompleteIndex = incompleteIndices[0];
    if (firstIncompleteIndex >= 0) return firstIncompleteIndex;
  }

  const allIndices = split.map((_, index) => index);
  const bestOverall = pickBestSplitSlotIndex(
    split,
    allIndices,
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
  baseIndex: number,
  need: Record<MovementPattern, number>,
  muscleDeficits: MuscleDeficitMap = {},
  muscleSaturation: Partial<Record<MuscleGroup, number>> = {},
  lastSessionMovements: Set<MovementPattern> = new Set(),
  weeklyBiasBalance: WeeklyBiasBalance = { lower: 0, upper: 0 },
  recentMuscleFatigue: Partial<Record<MuscleGroup, number>> = {},
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

    split.forEach((slot, index) => {
      if (!slot.allowedMovements.includes(movement)) return;
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

const compareWorkoutsDesc = (a: Workout, b: Workout): number =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt;

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
  return {
    name: ex.name,
    primary: ex.primary,
    secondary: ex.secondary,
    pattern: ex.pattern,
    movement: movementOf(ex),
    targets,
    suggestedWeight: capSuggestedWeight(last?.weight ?? null, ex, environment),
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
  overrides?: GeneratorOverrides,
): WorkoutDraft {
  const activeProfile: TrainingProfile = profile ?? DEFAULT_PROFILE;
  const window = weekContaining(todayISO);
  const coverage = computeCoverage(workouts, window);
  const recent = recentMusclesWithin(workouts, todayISO, 48);
  const recentStress = recentMuscleStressWithin(workouts, todayISO, 96);
  const rng = mulberry32(seed);
  const finisherRng = mulberry32(overrides?.finisherSeed ?? seed);
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

  // Muscle saturation: fraction of each muscle's weekly set target already done.
  // Used to deprioritize split slots whose primary muscles are already at volume.
  const weeklyMuscleTargets: Partial<Record<MuscleGroup, number>> = {};
  split.forEach((s) => {
    (Object.entries(s.targetPrimaryStimulus) as [MuscleGroup, number][]).forEach(([m, sets]) => {
      if (sets > 0) weeklyMuscleTargets[m] = (weeklyMuscleTargets[m] ?? 0) + sets;
    });
  });
  const muscleSaturation: Partial<Record<MuscleGroup, number>> = {};
  MUSCLE_GROUPS.forEach((m) => {
    const target = weeklyMuscleTargets[m];
    if (target && target > 0) {
      const done = coverage.muscleStats[m]?.primaryStimulus ?? 0;
      muscleSaturation[m] = done / target;
    }
  });
  const muscleDeficits = computeMuscleDeficits(split, coverage);
  const stalledExerciseNames = new Set(
    EXERCISES.filter((exercise) => getStallState(exercise.name, workouts) === "stalled").map(
      (exercise) => exercise.name,
    ),
  );
  const stalledBiasPressure = summarizeStalledBiasPressure(stalledExerciseNames);

  // Movement patterns from the most recent session — used to avoid recommending
  // the same movement category back-to-back regardless of weekly volume targets.
  const lastSessionMovements = new Set<MovementPattern>();
  const lastWorkout = [...workouts].sort(compareWorkoutsDesc)[0];
  if (lastWorkout) {
    lastWorkout.exercises.forEach((logEx) => {
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

  const incompleteIndices = getIncompleteSplitSlotIndices(split, recentWorkoutsForSlotSelection);
  const weeklyBiasBalance = summarizeWeeklyBiasBalance(split, recentWorkoutsForSlotSelection);
  const sessionIndex = maybeOverrideForStalledBias(
    split,
    maybeOverrideForCriticalGap(
      split,
      getNextSplitSlotIndex(
        split,
        recentWorkoutsForSlotSelection,
        need,
        muscleDeficits,
        muscleSaturation,
        lastSessionMovements,
        recentMuscleFatigue,
      ),
      need,
      muscleDeficits,
      muscleSaturation,
      lastSessionMovements,
      weeklyBiasBalance,
      recentMuscleFatigue,
    ),
    incompleteIndices,
    need,
    muscleDeficits,
    muscleSaturation,
    lastSessionMovements,
    weeklyBiasBalance,
    stalledBiasPressure,
    recentMuscleFatigue,
  );
  const rankedSlots = rankSplitSlotIndices(
    split,
    need,
    muscleDeficits,
    muscleSaturation,
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
  const slot = adaptSelectedSlot(
    split[selectedSlotIndex],
    activeProfile,
    muscleDeficits,
    recentMuscleFatigue,
  );
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
  let barbellCount = 0;
  const plannedSessionStress: Partial<Record<MuscleGroup, number>> = {};
  const claimedMovements: Record<MovementPattern, number> = {} as Record<
    MovementPattern,
    number
  >;
  MOVEMENT_PATTERNS.forEach((mp) => (claimedMovements[mp] = 0));

  const scoreExercise = (ex: Exercise, plannedRounds = 1): number => {
    const movement = movementOf(ex);
    if (!movement) return -10; // plyo/conditioning/calf — never a planned pick
    if (!environmentAllowsExercise(ex, activeProfile)) return -10;
    if (!goalAllows(ex, activeProfile.goal)) return -10;
    if (!slot.allowedMovements.includes(movement)) return -10;
    const family = familyOf(ex);
    if (
      (family === "biceps_isolation" || family === "triceps_isolation" || family === "hip_thrust" || family === "rdl") &&
      (claimedFamilies[family] ?? 0) > 0
    ) {
      return -10;
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

    ex.primary.forEach((m) => {
      const deficit = muscleDeficits[m] ?? 0;
      const closure = Math.min(deficit, stimulus.primaryPerSet);
      const weight = PRIMARY_MUSCLE_PRIORITY[m] ?? 1;
      const focusMultiplier = overrides?.focusedMuscles?.includes(m)
        ? PLANNER_TUNING.exerciseSelection.userFocusPrimaryMultiplier
        : slot.focusMuscles.includes(m)
          ? PLANNER_TUNING.exerciseSelection.primaryFocusMultiplier
          : 1;
      deficitClosureScore += closure * weight * focusMultiplier;
      const magnitude = Math.min(deficit, PLANNER_TUNING.exerciseSelection.deficitMagnitudeCap);
      deficitMagnitudeScore += magnitude * weight * focusMultiplier;
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
    s -= Math.min(PLANNER_TUNING.exerciseSelection.recoveryPenaltyCap, recoveryPenalty);
    s -= Math.min(PLANNER_TUNING.exerciseSelection.overlapPenaltyCap, sessionOverlapPenalty);
    if (projectedSessionTotal > sessionFatigueBudget) {
      const budgetPenaltyMultiplier =
        armBiasSlot && isDirectArmFocus(ex)
          ? PLANNER_TUNING.exerciseSelection.armBiasBudgetPenaltyMultiplier
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
      if (movement === "hinge" && ex.primary.includes("glutes")) {
        s += PLANNER_TUNING.exerciseSelection.physiqueHingeGluteBonus;
      }
      if (movement === "single_leg" && ex.primary.includes("glutes")) {
        s += PLANNER_TUNING.exerciseSelection.physiqueSingleLegGluteBonus;
      }
      if (isDirectGluteFocus(ex)) s += PLANNER_TUNING.exerciseSelection.physiqueDirectGluteBonus;
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
    if (slot.preferredMovements.includes(movement)) s += PLANNER_TUNING.exerciseSelection.preferredMovementBonus;
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
    // Penalize repeating a lower family that appeared in either of the last 2 sessions.
    // The currentWeekFamilies penalty (1.2) is too weak to capture "you just did lunges
    // yesterday"; this provides a stronger but still soft inter-session signal.
    if (lowerBiasSlot && recentLowerFamilies.has(family)) {
      s -= PLANNER_TUNING.exerciseSelection.recentLowerFamilyRepeatPenalty;
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
    return best && bestScore > -10 ? best : null;
  };

  const pickBestFinisher = (filter: (ex: Exercise) => boolean): Exercise | null => {
    let best: Exercise | null = null;
    let bestScore = -Infinity;
    for (const ex of EXERCISES) {
      if (used.has(ex.name)) continue;
      if (!filter(ex)) continue;
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
      suggestedWeight: capSuggestedWeight(last?.weight ?? null, ex, activeProfile.equipment),
      unit: last?.unit ?? "lb",
      isFamiliar: known.has(ex.name),
      progression: buildProgression(ex, targets, workouts),
    };
  };

  const sections: DraftSection[] = [];
  const movementsHit: MovementPattern[] = [];
  const homeGymEquipment = activeProfile.homeGymEquipment ?? [];
  const isHomeProfile =
    (activeProfile.equipment === "home" || activeProfile.equipment === "dumbbells") &&
    homeGymEquipment.length === 0;
  const hardMode = activeProfile.intensity === "hard";
  const secondaryRounds: number = activeProfile.daysPerWeek === 5 ? 3 : hardMode ? 4 : 4;
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
  const sessionFatigueBudget =
    baseSessionBudget +
    (hardMode ? PLANNER_TUNING.fatigueBudget.hardModeBonus : 0) +
    (lowerBiasSlot ? PLANNER_TUNING.fatigueBudget.lowerBiasBonus : 0) +
    (activeProfile.goal === "strength" ? PLANNER_TUNING.fatigueBudget.strengthBonus : 0) -
    (activeProfile.equipment === "home" ? PLANNER_TUNING.fatigueBudget.homePenalty : 0);
  const compoundTargets = isHomeProfile ? [12, 12, 10, 10] : [10, 8, 8, 6];
  const compoundRepScheme = isHomeProfile
    ? "12 / 12 / 10 / 10 — smooth tempo"
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
    plannedRounds: number,
    filter?: (ex: Exercise) => boolean,
  ): { movement: MovementPattern; exercise: Exercise } | null => {
    for (const movement of sortedByNeed(candidates)) {
      const exercise = pickBest(
        (ex) => movementOf(ex) === movement && (filter ? filter(ex) : true),
        plannedRounds,
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
        family === "hip_thrust") &&
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
  ): boolean => {
    const pick = pickForMovement(allowed, rounds, filter);
    if (!pick) return false;
    claimWithStress(pick.exercise, rounds);
    pushMovement(pick.movement);
    sections.push({
      kind: "accessory",
      rounds,
      repScheme,
      exercises: [makeDraftEx(pick.exercise, targets)],
    });
    return true;
  };

  const avoidSoftLowerAccessory = (ex: Exercise): boolean =>
    !(lowerBiasSlot && isActivationLowerAccessory(ex));

  // 1. Main lift — the most-needed heavy compound among squat, hinge, push, pull.
  const lowerAnchorMovements: MovementPattern[] = ["squat", "hinge", "single_leg"];
  const compoundPick = lowerBiasSlot
    ? pickForMovement(
        lowerAnchorMovements,
        compoundTargets.length,
        (ex) =>
          environmentAllowsExercise(ex, activeProfile) &&
          goalAllows(ex, activeProfile.goal) &&
          isStrongLowerAnchor(ex) &&
          (isHeavyEquipment(ex) || movementOf(ex) === "single_leg"),
      )
    : pickForMovement(
        compoundMovements,
        compoundTargets.length,
        (ex) => {
          const movement = movementOf(ex);
          if (!environmentAllowsExercise(ex, activeProfile)) return false;
          if (!goalAllows(ex, activeProfile.goal)) return false;
          if (!(isHeavyEquipment(ex) || (movement === "pull" && ex.equipment === "cable"))) return false;
          if (movement === "pull") return isBackPullAnchor(ex);
          return true;
        },
      );
  // 2. Secondary lift — add another focused block before accessories.
  const secondaryMovements = accessoryMovements.filter(
    (movement) => movement !== compoundPick?.movement,
  );
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
    : pickForMovement(
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

  if (compoundPick && secondaryPick && hardMode) {
    claimWithStress(compoundPick.exercise, compoundTargets.length);
    pushMovement(compoundPick.movement);
    claimWithStress(secondaryPick.exercise, 4);
    pushMovement(secondaryPick.movement);
    sections.push({
      kind: "superset",
      rounds: 4,
      repScheme: "strength pairing · main lift + support move",
      exercises: [
        makeDraftEx(compoundPick.exercise, compoundTargets),
        makeDraftEx(secondaryPick.exercise, secondaryTargets.slice(0, 4)),
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
      claimWithStress(secondaryPick.exercise, secondaryTargets.length);
      pushMovement(secondaryPick.movement);
      sections.push({
        kind: "accessory",
        rounds: secondaryRounds,
        repScheme: secondaryRepScheme,
        exercises: [
          makeDraftEx(secondaryPick.exercise, secondaryTargets),
        ],
      });
    }
  }

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
      (activeProfile.goal !== "physique" ||
        (!isChestDominantPush(ex) &&
          ((lowerBiasSlot &&
            (isGluteBiasedLower(ex) || isDirectGluteFocus(ex))) ||
            (upperBiasSlot &&
              (isBackOrShoulderFocused(ex) ||
                (armBiasSlot && isDirectArmFocus(ex))))))),
  );

  // 4. Second accessory superset — add enough volume for a fuller session.
  const secondAccessoryFilter = (ex: Exercise) =>
    environmentAllowsExercise(ex, activeProfile) &&
    goalAllows(ex, activeProfile.goal) &&
    avoidSoftLowerAccessory(ex) &&
    (activeProfile.goal !== "physique" ||
      ((lowerBiasSlot &&
        (isGluteBiasedLower(ex) ||
          isDirectGluteFocus(ex) ||
          isBackOrShoulderFocused(ex))) ||
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
    addAccessoryBlock(
      accessoryMovements,
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

  if (!hasCarryCore()) {
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
    if (
      strictPullCatchUpUpperSlot &&
      (template.tags.includes("lower") ||
        exercises.some((exercise) =>
          isPushLeaningFinisher(exercise) || isLowerFatiguingFinisher(exercise),
        ))
    ) {
      return false;
    }
    return exercises.every(
      (exercise) =>
        !used.has(exercise.name) &&
        environmentAllowsExercise(exercise, activeProfile),
    );
  };
  const templateScore = (template: FinisherTemplate): number => {
    let score = 0;
    if (template.tags.includes("conditioning")) score += 2;
    if (template.tags.includes("core")) score += 1.25;
    if (template.tags.includes("lower") && lowerBiasSlot) score += 2.5;
    if (template.tags.includes("upper") && upperBiasSlot) score += 2.5;
    if (template.tags.includes("core") && upperBiasSlot) score += 0.75;
    if (template.tags.includes("core") && lowerBiasSlot) score += 0.5;
    if (template.requiresHardMode && hardMode) score += 1.5;
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
  if (templateShortlist.length > 0) {
    // Every template in the shortlist already cleared the score-proximity
    // gate, so treat them as equally valid picks — weighting again within
    // that "good enough" set just collapses variety back onto the top 1-2.
    const excluded = new Set(overrides?.excludeFinisherTemplateIds ?? []);
    const drawPool = templateShortlist.filter(({ template }) => !excluded.has(template.id));
    const pool = drawPool.length > 0 ? drawPool : templateShortlist;
    chosenTemplate = pool[Math.floor(finisherRng() * pool.length)]?.template;
  }

  if (chosenTemplate) {
    const templateExercises = chosenTemplate.exercises
      .map(findExerciseByName)
      .filter((exercise): exercise is Exercise => Boolean(exercise));
    templateExercises.forEach((exercise) => {
      claimWithStress(
        exercise,
        chosenTemplate.rounds,
        PLANNER_TUNING.fatigueBudget.finisherStressMultiplier,
      );
      if (movementOf(exercise) === "carry_core") pushMovement("carry_core");
    });
    sections.push({
      kind: "finisher",
      templateId: chosenTemplate.id,
      rounds: chosenTemplate.rounds,
      repScheme: `${chosenTemplate.repScheme} · ${chosenTemplate.label}`,
      exercises: templateExercises.map((exercise) =>
        makeDraftEx(exercise, templateTargetSet(chosenTemplate, exercise)),
      ),
    });
  } else {
    const finisherCandidates = EXERCISES.filter((ex) => {
      if (used.has(ex.name)) return false;
      if (!environmentAllowsExercise(ex, activeProfile)) return false;
      if (strictPullCatchUpUpperSlot) {
        if (isPushLeaningFinisher(ex) || isLowerFatiguingFinisher(ex)) return false;
      }
      if (allowConditioningFinisher) return isPreferredAccessibleFinisher(ex);
      return movementOf(ex) === "carry_core" || isAccessibleMetabolicFinisher(ex);
    });
    const preferredFinisherCount = hardMode ? 3 : 3;
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
    return s + (finisherNoise.get(ex.name) ?? 0) * 0.5;
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
  }
  }

  // ---- Rationale ----
  const rationale: string[] = [];
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
        // scoreExercise's `if (!movement) return -10`) — it can only return
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

  return {
    split: {
      slotId: slot.id,
      title: slot.title,
      summary: slot.summary,
      sessionIndex: selectedSlotIndex + 1,
      totalSessions: split.length,
      targetPrimaryStimulus: slot.targetPrimaryStimulus,
      targetPrimarySets: slot.targetPrimaryStimulus,
    },
    slotRecommendations,
    sections,
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
