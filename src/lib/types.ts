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
  primary: MuscleGroup[];
  secondary: MuscleGroup[];
  equipment: Equipment;
  pattern: Pattern;
};

export type WeightUnit = "lb" | "kg";

export type GoalMode = "physique" | "balanced" | "strength";
export type ExperienceLevel = "beginner" | "intermediate";
export type TrainingEnvironment = "full_gym" | "dumbbells" | "home";
export type TrainingDaysPerWeek = 3 | 4 | 5;
export type SessionIntensity = "standard" | "hard";

export type TrainingProfile = {
  goal: GoalMode;
  daysPerWeek: TrainingDaysPerWeek;
  equipment: TrainingEnvironment;
  experience: ExperienceLevel;
  intensity: SessionIntensity;
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
  progressionStatus?: "progressed" | "held" | "missed" | "baseline";
  notes?: string;
};

export type WorkoutSource = "manual" | "class";

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
  createdAt: number;
  updatedAt: number;
};
