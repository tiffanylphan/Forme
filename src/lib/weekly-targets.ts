import { PLANNER_TUNING } from "./planner-tuning";
import type {
  ExperienceLevel,
  GoalMode,
  MuscleGroup,
  TrainingDaysPerWeek,
  TrainingProfile,
} from "./types";
import { MUSCLE_GROUPS } from "./types";

export type SetBand = { floorSets: number; ceilingSets: number };
export type StimulusBand = { floor: number; ceiling: number };
export type WeeklyTargetBand = Partial<Record<MuscleGroup, StimulusBand>>;
export type BandStatus = "below" | "in_range" | "over";

type PlannedMuscle = (typeof MUSCLE_GROUPS)[number];

const sets = (floorSets: number, ceilingSets: number): SetBand => ({ floorSets, ceilingSets });

// Hard sets per week. The floor is where growth reliably starts (MEV to low
// MAV) at the 4-day reference frequency; the ceiling is the recoverable
// maximum (high MRV) — the "leave it alone" line, not the optimum, and it does
// not shrink for fewer training days because recovery capacity doesn't.
// Intermediate is one notch up on both. Sources: RP
// volume landmarks (per-muscle MEV/MAV/MRV), Schoenfeld 2017 (>~9-10 weekly
// sets favorable), Baz-Valle 2022 (12-20 for trained lifters). These are the
// standard the planner is graded against — never derived from what the
// planner itself produces.
const HARD_SET_BANDS: Record<ExperienceLevel, Record<PlannedMuscle, SetBand>> = {
  beginner: {
    quads: sets(8, 24),
    glutes: sets(6, 22),
    hamstrings: sets(6, 20),
    chest: sets(8, 24),
    back: sets(10, 26),
    shoulders: sets(10, 26),
    rear_delts: sets(6, 24),
    biceps: sets(6, 20),
    triceps: sets(6, 18),
    core: sets(6, 25),
    hip_flexors: sets(0, 12),
    adductors: sets(2, 12),
  },
  intermediate: {
    quads: sets(10, 26),
    glutes: sets(8, 24),
    hamstrings: sets(8, 22),
    chest: sets(10, 26),
    back: sets(12, 28),
    shoulders: sets(12, 28),
    rear_delts: sets(8, 26),
    biceps: sets(8, 22),
    triceps: sets(8, 20),
    core: sets(8, 28),
    hip_flexors: sets(0, 14),
    adductors: sets(3, 14),
  },
};

// Stimulus one hard set delivers to the muscle via the lift type that usually
// carries it — mirrors estimateExerciseStimulus in coverage.ts so band units
// and coverage units are the same thing. Shoulders read as a press compound
// (1.0) because the library credits nearly every press to them as a primary.
export const STIMULUS_PER_HARD_SET: Record<MuscleGroup, number> = {
  quads: 1.3,
  glutes: 1.3,
  hamstrings: 1.3,
  chest: 1.0,
  back: 1.0,
  shoulders: 1.0,
  rear_delts: 0.65,
  biceps: 0.65,
  triceps: 0.65,
  core: 0.7,
  hip_flexors: 0.7,
  adductors: 0.55,
  calves: 0.55,
};

const GOAL_SCALE: Record<GoalMode, Partial<Record<MuscleGroup, number>>> = {
  physique: { glutes: 1.25, chest: 0.75 },
  balanced: {},
  strength: { biceps: 0.75, rear_delts: 0.75 },
};

// Weekly floor volume a week of N sessions can realistically hold inside the
// per-session fatigue budget. Applies to floors only.
export const DAYS_SCALE: Record<TrainingDaysPerWeek, number> = { 3: 0.85, 4: 1, 5: 1.1 };

const EMPHASIS_SCALE = { high: 1.5, low: 0.5 } as const;
const SENSITIVE_CEILING_SCALE = 0.75;

export const roundHalf = (value: number): number => Math.round(value * 2) / 2;

export const getWeeklyTargetBand = (profile: TrainingProfile): WeeklyTargetBand => {
  const bands = HARD_SET_BANDS[profile.experience];
  const emphasis = profile.muscleEmphasis ?? {};
  const sensitive = new Set(profile.sensitiveMuscles);
  const out: WeeklyTargetBand = {};
  MUSCLE_GROUPS.forEach((muscle) => {
    const band = bands[muscle];
    // Goal and frequency shape how much a muscle is *asked* for (the floor);
    // the recoverable maximum (the ceiling) is physiological and stays put.
    const perSet = STIMULUS_PER_HARD_SET[muscle];
    const baseFloor = roundHalf(
      band.floorSets * perSet * (GOAL_SCALE[profile.goal][muscle] ?? 1) * DAYS_SCALE[profile.daysPerWeek],
    );
    const baseCeiling = roundHalf(band.ceilingSets * perSet);
    const level = emphasis[muscle];
    let floor = baseFloor;
    let ceiling = baseCeiling;
    if (level === "high") {
      floor = Math.max(baseFloor + 1, roundHalf(baseFloor * EMPHASIS_SCALE.high));
      ceiling = roundHalf(baseCeiling * EMPHASIS_SCALE.high);
    } else if (level === "low") {
      floor = roundHalf(baseFloor * EMPHASIS_SCALE.low);
      ceiling = roundHalf(baseCeiling * EMPHASIS_SCALE.low);
    }
    if (sensitive.has(muscle)) {
      ceiling = Math.max(floor, roundHalf(ceiling * SENSITIVE_CEILING_SCALE));
    }
    if (ceiling <= 0) return;
    out[muscle] = { floor, ceiling };
  });
  return out;
};

export const bandFloors = (band: WeeklyTargetBand): Partial<Record<MuscleGroup, number>> => {
  const floors: Partial<Record<MuscleGroup, number>> = {};
  (Object.entries(band) as [MuscleGroup, StimulusBand][]).forEach(([muscle, { floor }]) => {
    if (floor > 0) floors[muscle] = floor;
  });
  return floors;
};

export const bandStatus = (band: StimulusBand, primaryDone: number): BandStatus =>
  primaryDone >= band.ceiling ? "over" : primaryDone < band.floor ? "below" : "in_range";

export const isMajorTarget = (band: StimulusBand): boolean =>
  band.floor >= PLANNER_TUNING.splitSelection.saturationOverTargetMajorMuscleThreshold;
