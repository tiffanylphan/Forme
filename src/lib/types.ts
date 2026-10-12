// Canonical iteration list for coverage, the muscle grid, and the generator.
// Calves are intentionally excluded — calf training is not a programming
// requirement for this app. The library still contains calf exercises and
// they may appear as primary muscles on logged sets, but they don't drive
// planning.
export const MUSCLE_GROUPS = [
  "quads",
  "glutes",
  "hamstrings",
  "chest",
  "back",
  "shoulders",
  "rear_delts",
  "biceps",
  "triceps",
  "core",
  "hip_flexors",
  "adductors",
] as const;

// Includes "calves" so existing exercise tags type-check, but calves never
// appears in MUSCLE_GROUPS-based iteration.
export type MuscleGroup = (typeof MUSCLE_GROUPS)[number] | "calves";

export const PATTERNS = [
  "push",
  "pull",
  "hinge",
  "squat",
  "carry",
  "core",
  "plyo",
  "conditioning",
] as const;

// Higher-level grouping that planning revolves around. Each library exercise
// is classified into one of these (or null for plyo/conditioning/calf-only).
export const MOVEMENT_PATTERNS = [
  "squat",
  "hinge",
  "push",
  "pull",
  "single_leg",
  "carry_core",
] as const;
export type MovementPattern = (typeof MOVEMENT_PATTERNS)[number];

export const EQUIPMENT = [
  "barbell",
  "dumbbell",
  "cable",
  "band",
  "bodyweight",
  "machine",
  "kettlebell",
  "other",
] as const;

export type Pattern = (typeof PATTERNS)[number];
export type Equipment = (typeof EQUIPMENT)[number];

export type Exercise = {
  name: string;
  aliases?: string[];
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  equipment: Equipment;
  pattern: Pattern;
  /** Static holds tracked by time (seconds) rather than rep count. */
  tracksDuration?: boolean;
  /**
   * Push/pull plane. Inferred from the exercise family when absent
   * (see directionOf); set explicitly only where inference is wrong.
   */
  direction?: PressPullDirection;
};

export type PressPullDirection = "horizontal" | "vertical";

export type WeightUnit = "lb" | "kg";

export type GoalMode = "physique" | "balanced" | "strength";
export type ExperienceLevel = "beginner" | "intermediate";
export type TrainingEnvironment = "full_gym" | "dumbbells" | "home";
export type TrainingDaysPerWeek = 3 | 4 | 5;
export type SessionIntensity = "standard" | "hard";
export type HomeGymEquipmentType = "barbell" | "cable" | "machine" | "pullup_bar";

export const HOME_GYM_EQUIPMENT_OPTIONS: HomeGymEquipmentType[] = [
  "cable",
  "barbell",
  "machine",
  "pullup_bar",
];

export type MuscleEmphasisLevel = "high" | "normal" | "low";

export type TrainingProfile = {
  goal: GoalMode;
  daysPerWeek: TrainingDaysPerWeek;
  equipment: TrainingEnvironment;
  experience: ExperienceLevel;
  intensity: SessionIntensity;
  blockedExercises: string[];
  allowedExercises: string[];
  homeGymEquipment: HomeGymEquipmentType[];
  /** Muscles to limit (not exclude) session volume on — e.g. a nerve/joint sensitivity. */
  sensitiveMuscles: MuscleGroup[];
  /**
   * Per-muscle weekly-target emphasis. "high" scales a muscle's split targets
   * up (~1.5x), "low" scales them down (~0.5x); unset/"normal" leaves the
   * split's baseline untouched. Optional for backward compatibility with
   * stored profiles.
   */
  muscleEmphasis?: Partial<Record<MuscleGroup, MuscleEmphasisLevel>>;
};

export type SetEntry = {
  id: string;
  reps: number | null;
  weight: number | null;
  unit: WeightUnit;
  // class-mode-friendly metrics
  durationSec?: number | null;
  distanceM?: number | null;
};

export type ExerciseLog = {
  id: string;
  exerciseName: string;
  sets: SetEntry[];
  supersetGroup: string | null;
  routineGroup?: {
    id: string;
    kind: "set";
    rounds: number;
    repScheme: string;
  } | null;
  progressionStatus?: "progressed" | "held" | "missed" | "baseline";
  notes?: string;
};

// "external" marks a session programmed outside the app (a trainer, a class,
// someone else's plan). Display only: the planner treats every logged session
// identically. Legacy "class" values normalize to "external" on read.
export type WorkoutSource = "manual" | "external";

/** One-tap post-session effort rating — the user's own read on the session. */
export type SessionEffort = "easy" | "right" | "brutal";

export type Workout = {
  id: string;
  date: string; // YYYY-MM-DD
  source: WorkoutSource;
  exercises: ExerciseLog[];
  planSlot?: {
    slotId: string;
    title: string;
  };
  notes?: string;
  /** Optional one-tap effort rating captured when the workout is saved. */
  sessionEffort?: SessionEffort;
  createdAt: number;
  updatedAt: number;
};
