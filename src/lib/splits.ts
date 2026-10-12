import type { Coverage } from "./coverage";
import { PLANNER_TUNING } from "./planner-tuning";
import type { MovementPattern, MuscleGroup, TrainingProfile, Workout } from "./types";
import {
  bandFloors,
  bandStatus,
  getWeeklyTargetBand,
  roundHalf,
  type BandStatus,
  type WeeklyTargetBand,
} from "./weekly-targets";

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
  // Muscles whose share of the weekly floor is large enough to define this
  // slot's identity; saturation on one of these disqualifies the slot.
  majorMuscles?: MuscleGroup[];
};

export const PHYSIQUE_UPPER_A_SLOT: SplitSlot = {
  id: "upper_back_shoulder",
  title: "Upper A · Back/Shoulders",
  summary: "Upper session theme with back, shoulders, and glute support.",
  focusMuscles: ["back", "shoulders", "rear_delts", "chest", "glutes", "core"],
  preferredMovements: ["pull", "push"],
  allowedMovements: ["pull", "push", "hinge", "carry_core"],
  targetPrimaryStimulus: { back: 7, shoulders: 5, rear_delts: 4, chest: 3, biceps: 2, triceps: 2, glutes: 2, core: 3 },
};

export const PHYSIQUE_UPPER_B_SLOT: SplitSlot = {
  id: "upper_back_shoulder_arms",
  title: "Upper B · Upper/Arms",
  summary: "Upper session theme with shoulders, arms, and lower-body support.",
  focusMuscles: ["back", "shoulders", "rear_delts", "chest", "biceps", "triceps", "glutes", "core"],
  preferredMovements: ["pull", "push"],
  allowedMovements: ["pull", "push", "single_leg", "carry_core"],
  targetPrimaryStimulus: { back: 6, shoulders: 5, rear_delts: 4, chest: 2, biceps: 3, triceps: 2, glutes: 2, core: 2 },
};

export const isLowerSlot = (slot: SplitSlot): boolean =>
  slot.preferredMovements.some((movement) =>
    movement === "hinge" || movement === "squat" || movement === "single_leg",
  );

export const isUpperSlot = (slot: SplitSlot): boolean =>
  slot.preferredMovements.some((movement) => movement === "pull" || movement === "push");

export const compareWorkoutsDesc = (a: Workout, b: Workout): number =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt;

const baseSplitTemplate = (
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
          targetPrimaryStimulus: { glutes: 7, quads: 8, hamstrings: 4, adductors: 2, core: 4 },
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
          targetPrimaryStimulus: { glutes: 6, quads: 8, hamstrings: 4, adductors: 2, shoulders: 2, core: 4 },
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
        targetPrimaryStimulus: { glutes: 7, quads: 8, hamstrings: 4, adductors: 2, core: 4 },
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
          focusMuscles: ["quads", "glutes", "hamstrings", "adductors", "core"],
          preferredMovements: ["squat", "hinge"],
          allowedMovements: ["squat", "hinge", "single_leg", "carry_core"],
          targetPrimaryStimulus: { quads: 7, glutes: 5, hamstrings: 5, adductors: 1, core: 3 },
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
        focusMuscles: ["quads", "glutes", "adductors", "core"],
        preferredMovements: ["squat", "single_leg"],
        allowedMovements: ["squat", "single_leg", "carry_core"],
        targetPrimaryStimulus: { quads: 7, glutes: 5, adductors: 1, core: 3 },
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
        focusMuscles: ["quads", "glutes", "adductors", "back", "core"],
        preferredMovements: ["squat", "pull", "push"],
        allowedMovements: ["hinge", "squat", "single_leg", "pull", "push", "carry_core"],
        targetPrimaryStimulus: { quads: 5, glutes: 4, adductors: 1, back: 5, core: 3 },
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

// The editorial templates only decide each slot's SHARE of a muscle's weekly
// volume; the weekly band decides the volume itself. Every slot target is
// rescaled so the slot-sum per muscle equals the band floor exactly, with the
// rounding residual landing on the slot that already leads that muscle.
const normalizeToBand = (
  split: SplitSlot[],
  band: WeeklyTargetBand,
  profile: TrainingProfile,
): SplitSlot[] => {
  const slotSums: Partial<Record<MuscleGroup, number>> = {};
  split.forEach((slot) => {
    (Object.entries(slot.targetPrimaryStimulus) as [MuscleGroup, number][]).forEach(([muscle, target]) => {
      if (target > 0) slotSums[muscle] = (slotSums[muscle] ?? 0) + target;
    });
  });

  const scaled = split.map((slot) => {
    const targets: Partial<Record<MuscleGroup, number>> = {};
    (Object.entries(slot.targetPrimaryStimulus) as [MuscleGroup, number][]).forEach(([muscle, target]) => {
      if (target <= 0) return;
      const floor = band[muscle]?.floor;
      const sum = slotSums[muscle];
      if (floor === undefined || !sum) {
        targets[muscle] = target;
        return;
      }
      const share = roundHalf((target * floor) / sum);
      if (share > 0) targets[muscle] = share;
    });
    return { ...slot, targetPrimaryStimulus: targets };
  });

  (Object.keys(slotSums) as MuscleGroup[]).forEach((muscle) => {
    const floor = band[muscle]?.floor;
    if (floor === undefined) return;
    const total = scaled.reduce((acc, slot) => acc + (slot.targetPrimaryStimulus[muscle] ?? 0), 0);
    const residual = roundHalf(floor - total);
    if (residual === 0) return;
    const leader = scaled.reduce((best, slot) =>
      (slot.targetPrimaryStimulus[muscle] ?? 0) > (best.targetPrimaryStimulus[muscle] ?? 0) ? slot : best,
    );
    const adjusted = (leader.targetPrimaryStimulus[muscle] ?? 0) + residual;
    if (adjusted > 0) leader.targetPrimaryStimulus[muscle] = adjusted;
    else delete leader.targetPrimaryStimulus[muscle];
  });

  const emphasis = profile.muscleEmphasis ?? {};
  const majorThreshold = PLANNER_TUNING.splitSelection.saturationOverTargetMajorMuscleThreshold;
  const majorShare = PLANNER_TUNING.splitSelection.saturationMajorShareOfFloor;
  return scaled.map((slot) => {
    const promoted = (Object.keys(emphasis) as MuscleGroup[]).filter(
      (muscle) =>
        emphasis[muscle] === "high" &&
        (slot.targetPrimaryStimulus[muscle] ?? 0) > 0 &&
        !slot.focusMuscles.includes(muscle),
    );
    // Core rides along on nearly everything and clears its floor early; it must
    // never be the reason a whole slot is disqualified.
    const majorMuscles = (Object.keys(slot.targetPrimaryStimulus) as MuscleGroup[]).filter((muscle) => {
      if (muscle === "core" || muscle === "hip_flexors") return false;
      const target = slot.targetPrimaryStimulus[muscle] ?? 0;
      const floor = band[muscle]?.floor;
      return target >= majorThreshold || (floor !== undefined && floor > 0 && target >= floor * majorShare);
    });
    return {
      ...slot,
      majorMuscles,
      focusMuscles: promoted.length > 0 ? [...slot.focusMuscles, ...promoted] : slot.focusMuscles,
    };
  });
};

export const getSplitTemplate = (profile: TrainingProfile): SplitSlot[] =>
  normalizeToBand(baseSplitTemplate(profile), getWeeklyTargetBand(profile), profile);

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

// Weekly floors come from the band, not from the split; the workouts argument
// is kept so existing call sites don't churn.
export function getWeeklyTargetStimulus(
  profile: TrainingProfile,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _workouts: Workout[] = [],
): Partial<Record<MuscleGroup, number>> {
  return bandFloors(getWeeklyTargetBand(profile));
}

export type MuscleTargetRow = {
  muscle: MuscleGroup;
  target: number;
  ceiling: number | null;
  done: number;
  pct: number;
  remaining: number;
  overPct: number | null;
  status: BandStatus;
};

export function buildMuscleTargetRows(
  targetPrimaryStimulus: Partial<Record<MuscleGroup, number>>,
  coverage: Coverage,
  band?: WeeklyTargetBand,
): MuscleTargetRow[] {
  return (Object.entries(targetPrimaryStimulus) as [MuscleGroup, number][])
    .filter(([, target]) => typeof target === "number" && target > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([muscle, target]) => {
      const done = coverage.muscleStats[muscle]?.primaryStimulus ?? 0;
      const pct = Math.min(100, Math.round((done / target) * 100));
      const remaining = Math.max(0, target - done);
      const overPct = target > 0 && done > target ? Math.round((done / target) * 100) : null;
      const muscleBand = band?.[muscle];
      const status: BandStatus = muscleBand
        ? bandStatus(muscleBand, done)
        : done > target
          ? "over"
          : done >= target
            ? "in_range"
            : "below";
      return { muscle, target, ceiling: muscleBand?.ceiling ?? null, done, pct, remaining, overPct, status };
    });
}

// One wording for every surface: distance to the floor while under it, position
// inside the band once past it, and an explicit ceiling call-out when over.
export const muscleTargetStatusLabel = (row: MuscleTargetRow): string =>
  row.status === "over"
    ? `Over ceiling (${Math.round((row.done / (row.ceiling ?? row.target)) * 100)}%)`
    : row.status === "in_range"
      ? `In range (${Math.round((row.done / row.target) * 100)}%)`
      : `${row.remaining.toFixed(1)} left to floor`;

export function getMuscleTargetRows(
  profile: TrainingProfile,
  coverage: Coverage,
): MuscleTargetRow[] {
  const band = getWeeklyTargetBand(profile);
  return buildMuscleTargetRows(bandFloors(band), coverage, band);
}

export const getWeeklyTargetSets = getWeeklyTargetStimulus;
