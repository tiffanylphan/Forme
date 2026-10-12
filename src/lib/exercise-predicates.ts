import { movementOf } from "./movement";
import type { Exercise, GoalMode, MovementPattern, MuscleGroup, PressPullDirection, TrainingEnvironment } from "./types";

export const COMPOUND_MOVEMENTS: MovementPattern[] = ["squat", "hinge", "push", "pull"];
export const ACCESSORY_MOVEMENTS: MovementPattern[] = [
  "squat",
  "hinge",
  "push",
  "pull",
  "single_leg",
];

export const MOVEMENT_PRIORITY: Record<MovementPattern, number> = {
  squat: 0.8,
  hinge: 1.4,
  push: 0.8,
  pull: 1.2,
  single_leg: 1.3,
  carry_core: 0.9,
};

export const PRIMARY_MUSCLE_PRIORITY: Partial<Record<MuscleGroup, number>> = {
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

export const SECONDARY_MUSCLE_PRIORITY: Partial<Record<MuscleGroup, number>> = {
  glutes: 0.7,
  hamstrings: 0.5,
  back: 0.6,
  shoulders: 0.6,
  rear_delts: 0.5,
  core: 0.5,
};

export const hasPrimary = (ex: Exercise, muscle: MuscleGroup): boolean =>
  ex.primary.includes(muscle);

export const hasSecondary = (ex: Exercise, muscle: MuscleGroup): boolean =>
  ex.secondary.includes(muscle);

export const hasAnyMuscle = (ex: Exercise, muscles: MuscleGroup[]): boolean =>
  muscles.some((muscle) => hasPrimary(ex, muscle) || hasSecondary(ex, muscle));

export type MuscleFilter = {
  include?: MuscleGroup[];
  exclude?: MuscleGroup[];
};

export const matchesMuscleFilter = (ex: Exercise, filter: MuscleFilter): boolean => {
  if (filter.include?.length && !hasAnyMuscle(ex, filter.include)) return false;
  if (filter.exclude?.length && hasAnyMuscle(ex, filter.exclude)) return false;
  return true;
};

export const familyOf = (ex: Exercise): string => {
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
  if (name.includes("lateral raise") || name.includes("front raise") || name.includes("arnold") || name.includes("prone press"))
    return "shoulder_isolation";
  if (
    name.includes("overhead press") ||
    name.includes("landmine press") ||
    name.includes("strict press") ||
    name.includes("push press") ||
    name.includes("press to windmill")
  )
    return "vertical_press";
  if (name.includes("squat") || name.includes("leg press") || name.includes("hack squat"))
    return "squat_pattern";
  if (name.includes("leg curl") || name.includes("nordic")) return "leg_curl";
  if (name.includes("carry")) return "carry";
  if (ex.pattern === "core") return "core";
  return `${ex.pattern}_${ex.equipment}`;
};

// Plane of a push or pull. Rows and rear-delt work are horizontal pulls;
// pulldowns/pull-ups vertical pulls; overhead-type presses vertical pushes;
// chest-led presses, push-ups, flies and dips horizontal pushes. Isolations
// and non-push/pull patterns have no direction.
export const directionOf = (ex: Exercise): PressPullDirection | null => {
  if (ex.direction) return ex.direction;
  const movement = movementOf(ex);
  if (movement !== "push" && movement !== "pull") return null;
  const family = familyOf(ex);
  if (family === "row" || family === "rear_delt") return "horizontal";
  if (family === "vertical_pull") return "vertical";
  if (family === "vertical_press") return "vertical";
  if (family === "shoulder_isolation" || family === "biceps_isolation" || family === "triceps_isolation") return null;
  const name = ex.name.toLowerCase();
  if (movement === "push") {
    if (
      ex.primary.includes("chest") ||
      /bench|push-up|pushup|fly|dip|floor press|chest press/.test(name)
    ) {
      return "horizontal";
    }
    if (/pike|handstand|overhead|shoulder press/.test(name)) return "vertical";
    return null;
  }
  if (/pullover|straight-arm/.test(name)) return "vertical";
  return null;
};

export const isHeavyEquipment = (ex: Exercise): boolean =>
  ex.equipment === "barbell" ||
  ex.equipment === "dumbbell" ||
  ex.equipment === "machine";

export const isTechnicalBarbell = (ex: Exercise): boolean =>
  ex.equipment === "barbell" &&
  (ex.name.includes("deadlift") ||
    ex.name.includes("squat") ||
    ex.name.includes("overhead press") ||
    ex.name.includes("walking lunge"));

export const capSuggestedWeight = (
  weight: number | null,
  exercise: Exercise,
  environment: TrainingEnvironment,
): number | null => {
  if (weight == null) return null;
  if (environment !== "home") return weight;
  if (exercise.equipment !== "dumbbell") return weight;
  return Math.min(weight, 15);
};

export const isHomeConditioningFriendly = (ex: Exercise): boolean =>
  ex.pattern === "conditioning" ||
  ex.pattern === "core" ||
  ex.equipment === "bodyweight" ||
  ex.equipment === "band";

export const isAccessibleConditioningFinisher = (ex: Exercise): boolean =>
  ex.pattern === "conditioning" &&
  ["bodyweight", "dumbbell", "band"].includes(ex.equipment);

export const isAccessibleMetabolicFinisher = (ex: Exercise): boolean =>
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

export const isPreferredAccessibleFinisher = (ex: Exercise): boolean =>
  movementOf(ex) === "carry_core" ||
  isAccessibleConditioningFinisher(ex) ||
  isAccessibleMetabolicFinisher(ex);

export const isPushLeaningFinisher = (ex: Exercise): boolean =>
  ex.pattern === "push" ||
  ex.name === "Push-up to renegade row";

export const isLowerFatiguingFinisher = (ex: Exercise): boolean => {
  const movement = movementOf(ex);
  return movement === "hinge" || movement === "squat" || movement === "single_leg";
};

export const formatMovement = (m: MovementPattern): string =>
  m === "carry_core"
    ? "carry/core"
    : m === "single_leg"
      ? "single-leg"
      : m;

export const isChestDominantPush = (ex: Exercise): boolean =>
  ex.pattern === "push" &&
  (hasPrimary(ex, "chest") ||
    (hasPrimary(ex, "triceps") && !hasPrimary(ex, "shoulders")));

export const isShoulderBiasedPush = (ex: Exercise): boolean =>
  ex.pattern === "push" &&
  (hasPrimary(ex, "shoulders") ||
    hasPrimary(ex, "rear_delts") ||
    ex.name === "Landmine press");

export const isGluteBiasedLower = (ex: Exercise): boolean =>
  (movementOf(ex) === "hinge" || movementOf(ex) === "single_leg") &&
  hasAnyMuscle(ex, ["glutes", "hamstrings"]);

export const isBackOrShoulderFocused = (ex: Exercise): boolean =>
  hasAnyMuscle(ex, ["back", "shoulders", "rear_delts"]);

export const isDirectArmFocus = (ex: Exercise): boolean =>
  hasPrimary(ex, "biceps") || hasPrimary(ex, "triceps");

export const isBackPullAnchor = (ex: Exercise): boolean =>
  movementOf(ex) === "pull" &&
  hasPrimary(ex, "back") &&
  ex.name !== "DB renegade row" &&
  ex.name !== "Push-up to renegade row" &&
  (familyOf(ex) === "row" || familyOf(ex) === "vertical_pull");

export const isVerticalPressAnchor = (ex: Exercise): boolean =>
  movementOf(ex) === "push" &&
  hasPrimary(ex, "shoulders") &&
  familyOf(ex) === "vertical_press";

export const isDirectGluteFocus = (ex: Exercise): boolean =>
  hasPrimary(ex, "glutes") &&
  (movementOf(ex) === "hinge" || movementOf(ex) === "single_leg");

export const isLowerIsolation = (ex: Exercise): boolean =>
  [
    "Leg extension",
    "Leg curl",
    "Banded clamshell",
    "Banded fire hydrant",
    "Banded walkout",
    "Glute bridge",
    "Feet-elevated glute bridge",
    "Bench single-leg hip thrust",
    "Wall sit",
    "Wall sit with adductor squeeze",
    "Banded wall sit abduction pulses",
    "Sissy squat",
    "Adductor machine",
    "Cable hip adduction",
    "Cable kickback",
    "Donkey kick",
    "Cable pull-through",
    "Hyperextension",
    "Stability ball hamstring curl",
    "Nordic hamstring curl",
  ].includes(ex.name);

export const isActivationLowerAccessory = (ex: Exercise): boolean =>
  [
    "Banded clamshell",
    "Banded fire hydrant",
    "Banded walkout",
    "Glute bridge",
  ].includes(ex.name);

export const isStrongLowerAnchor = (ex: Exercise): boolean => {
  const movement = movementOf(ex);
  if (!movement) return false;
  if (isLowerIsolation(ex)) return false;

  if (movement === "squat" || movement === "hinge") return true;
  if (movement !== "single_leg") return false;

  const family = familyOf(ex);
  return family === "split_squat" || family === "lunge" || family === "step_up";
};

export const isPhysiqueFriendly = (ex: Exercise): boolean => {
  const movement = movementOf(ex);
  if (!movement) return false;
  // Chest-dominant pressing is no longer hard-banned for physique — the upper
  // slots carry a small chest baseline (a real trainer keeps some pressing in
  // a glute-focused program), and physiquePushChestPenalty still biases push
  // selection toward shoulders rather than outlawing chest work outright.
  return true;
};

export const lowerUnilateralKneeFamilyOf = (ex: Exercise): string | null => {
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

export const isStrengthFriendly = (ex: Exercise): boolean => {
  if (!isHeavyEquipment(ex)) return false;
  if (ex.name.includes("raise") || ex.name.includes("fly")) return false;
  return movementOf(ex) !== null;
};

export const goalAllows = (ex: Exercise, goal: GoalMode): boolean => {
  if (goal === "physique") return isPhysiqueFriendly(ex);
  if (goal === "strength") return isStrengthFriendly(ex);
  return movementOf(ex) !== null;
};
