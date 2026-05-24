import { findExercise } from "./exercises";
import { movementOf } from "./movement";
import { MOVEMENT_PATTERNS, MUSCLE_GROUPS, PATTERNS } from "./types";
import type {
  Exercise,
  MovementPattern,
  MuscleGroup,
  Pattern,
  Workout,
} from "./types";

export type WeekWindow = {
  // Inclusive ISO start (YYYY-MM-DD), exclusive ISO end.
  startISO: string;
  endISO: string;
};

const toISO = (d: Date): string => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};

const parseISO = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const MS_PER_HOUR = 60 * 60 * 1000;

// Monday-start week containing the given ISO date (local time).
export function weekContaining(iso: string): WeekWindow {
  const dt = parseISO(iso);
  const day = dt.getDay(); // 0=Sun..6=Sat
  const offsetToMonday = (day + 6) % 7;
  const start = new Date(dt);
  start.setDate(dt.getDate() - offsetToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 7);
  return { startISO: toISO(start), endISO: toISO(end) };
}

export const formatWindow = (w: WeekWindow): string => {
  const start = parseISO(w.startISO);
  const end = parseISO(w.endISO);
  end.setDate(end.getDate() - 1); // inclusive end for display
  const fmt = (d: Date) =>
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(start)} – ${fmt(end)}`;
};

export type MuscleStats = {
  daysHit: string[];
  asPrimarySets: number;
  asSecondarySets: number;
  primaryStimulus: number;
  secondaryStimulus: number;
  recoveryStress: number;
  exercises: { name: string; sets: number; date: string }[];
};

export type PatternStats = {
  daysHit: string[];
  sets: number;
};

export type MovementStats = {
  daysHit: string[];
  sets: number;
  exercises: { name: string; sets: number; date: string }[];
};

export type Coverage = {
  window: WeekWindow;
  workouts: Workout[];
  muscleStats: Partial<Record<MuscleGroup, MuscleStats>>;
  patternStats: Partial<Record<Pattern, PatternStats>>;
  movementStats: Partial<Record<MovementPattern, MovementStats>>;
};

const emptyMuscleStats = (): MuscleStats => ({
  daysHit: [],
  asPrimarySets: 0,
  asSecondarySets: 0,
  primaryStimulus: 0,
  secondaryStimulus: 0,
  recoveryStress: 0,
  exercises: [],
});

export type ExerciseStimulus = {
  primaryPerSet: number;
  secondaryPerSet: number;
  recoveryPerSet: number;
};

const OVERLAP_BY_MOVEMENT: Partial<
  Record<MovementPattern, Array<{ muscle: MuscleGroup; factor: number }>>
> = {
  hinge: [
    { muscle: "glutes", factor: 0.35 },
    { muscle: "hamstrings", factor: 0.35 },
    { muscle: "back", factor: 0.2 },
    { muscle: "core", factor: 0.15 },
    { muscle: "adductors", factor: 0.1 },
  ],
  squat: [
    { muscle: "quads", factor: 0.35 },
    { muscle: "glutes", factor: 0.25 },
    { muscle: "hamstrings", factor: 0.1 },
    { muscle: "core", factor: 0.15 },
    { muscle: "adductors", factor: 0.15 },
  ],
  single_leg: [
    { muscle: "glutes", factor: 0.25 },
    { muscle: "quads", factor: 0.2 },
    { muscle: "hamstrings", factor: 0.15 },
    { muscle: "adductors", factor: 0.15 },
    { muscle: "core", factor: 0.1 },
  ],
  pull: [
    { muscle: "back", factor: 0.35 },
    { muscle: "rear_delts", factor: 0.2 },
    { muscle: "biceps", factor: 0.15 },
    { muscle: "core", factor: 0.05 },
  ],
  push: [
    { muscle: "shoulders", factor: 0.25 },
    { muscle: "chest", factor: 0.25 },
    { muscle: "triceps", factor: 0.15 },
    { muscle: "core", factor: 0.05 },
  ],
  carry_core: [
    { muscle: "core", factor: 0.3 },
    { muscle: "glutes", factor: 0.1 },
    { muscle: "back", factor: 0.1 },
    { muscle: "shoulders", factor: 0.05 },
  ],
};

const isDirectArmIsolation = (exercise: Exercise): boolean =>
  exercise.pattern === "push" &&
    exercise.primary.includes("triceps") &&
    !exercise.primary.includes("chest") &&
    !exercise.primary.includes("shoulders") ||
  exercise.pattern === "pull" && exercise.primary.includes("biceps");

const isShoulderIsolation = (exercise: Exercise): boolean =>
  exercise.pattern === "push" &&
  (exercise.primary.includes("shoulders") || exercise.primary.includes("rear_delts")) &&
  !exercise.primary.includes("chest") &&
  !exercise.primary.includes("triceps");

const isLowerIsolation = (exercise: Exercise): boolean =>
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
  ].includes(exercise.name);

export const estimateExerciseStimulus = (exercise: Exercise): ExerciseStimulus => {
  const movement = movementOf(exercise);

  if (movement === "hinge" || movement === "squat") {
    if (isLowerIsolation(exercise)) {
      return { primaryPerSet: 0.55, secondaryPerSet: 0.2, recoveryPerSet: 0.45 };
    }
    return { primaryPerSet: 1.3, secondaryPerSet: 0.5, recoveryPerSet: 1.45 };
  }

  if (movement === "single_leg") {
    if (isLowerIsolation(exercise)) {
      return { primaryPerSet: 0.55, secondaryPerSet: 0.2, recoveryPerSet: 0.45 };
    }
    return { primaryPerSet: 1.15, secondaryPerSet: 0.45, recoveryPerSet: 1.15 };
  }

  if (movement === "push" || movement === "pull") {
    if (isDirectArmIsolation(exercise) || isShoulderIsolation(exercise)) {
      return { primaryPerSet: 0.65, secondaryPerSet: 0.25, recoveryPerSet: 0.55 };
    }
    return { primaryPerSet: 1, secondaryPerSet: 0.4, recoveryPerSet: 0.95 };
  }

  if (movement === "carry_core" || exercise.pattern === "core") {
    return { primaryPerSet: 0.7, secondaryPerSet: 0.3, recoveryPerSet: 0.6 };
  }

  return { primaryPerSet: 0.8, secondaryPerSet: 0.3, recoveryPerSet: 0.7 };
};

export function distributeRecoveryStress(
  exercise: Exercise,
  baseStress: number,
): Partial<Record<MuscleGroup, number>> {
  const stress: Partial<Record<MuscleGroup, number>> = {};

  exercise.primary.forEach((muscle) => {
    stress[muscle] = (stress[muscle] ?? 0) + baseStress;
  });
  exercise.secondary.forEach((muscle) => {
    stress[muscle] = (stress[muscle] ?? 0) + baseStress * 0.5;
  });

  const movement = movementOf(exercise);
  (OVERLAP_BY_MOVEMENT[movement ?? "carry_core"] ?? []).forEach(({ muscle, factor }) => {
    stress[muscle] = (stress[muscle] ?? 0) + baseStress * factor;
  });

  return stress;
}

export function computeCoverage(
  workouts: Workout[],
  window: WeekWindow,
): Coverage {
  const inWindow = workouts.filter(
    (w) => w.date >= window.startISO && w.date < window.endISO,
  );
  const muscleStats: Partial<Record<MuscleGroup, MuscleStats>> = {};
  const patternStats: Partial<Record<Pattern, PatternStats>> = {};
  const movementStats: Partial<Record<MovementPattern, MovementStats>> = {};

  inWindow.forEach((w) => {
    w.exercises.forEach((logEx) => {
      const meta = findExercise(logEx.exerciseName);
      if (!meta) return;
      const sets = logEx.sets.length;
      const stimulus = estimateExerciseStimulus(meta);
      const primaryStimulus = sets * stimulus.primaryPerSet;
      const secondaryStimulus = sets * stimulus.secondaryPerSet;
      const recoveryStress = sets * stimulus.recoveryPerSet;
      const distributedStress = distributeRecoveryStress(meta, recoveryStress);

      // Pattern
      const ps = patternStats[meta.pattern] ?? { daysHit: [], sets: 0 };
      ps.sets += sets;
      if (!ps.daysHit.includes(w.date)) ps.daysHit.push(w.date);
      patternStats[meta.pattern] = ps;

      // Fundamental movement (skips plyo / conditioning / calf-only)
      const movement = movementOf(meta);
      if (movement) {
        const ms = movementStats[movement] ?? {
          daysHit: [],
          sets: 0,
          exercises: [],
        };
        ms.sets += sets;
        if (!ms.daysHit.includes(w.date)) ms.daysHit.push(w.date);
        ms.exercises.push({ name: logEx.exerciseName, sets, date: w.date });
        movementStats[movement] = ms;
      }

      // Primary muscles count toward "hit days"
      meta.primary.forEach((m) => {
        const s = muscleStats[m] ?? emptyMuscleStats();
        s.asPrimarySets += sets;
        s.primaryStimulus += primaryStimulus;
        s.recoveryStress += distributedStress[m] ?? recoveryStress;
        if (!s.daysHit.includes(w.date)) s.daysHit.push(w.date);
        s.exercises.push({ name: logEx.exerciseName, sets, date: w.date });
        muscleStats[m] = s;
      });

      // Secondary tracked separately so it doesn't inflate the hit-day score
      meta.secondary.forEach((m) => {
        const s = muscleStats[m] ?? emptyMuscleStats();
        s.asSecondarySets += sets;
        s.secondaryStimulus += secondaryStimulus;
        s.recoveryStress += distributedStress[m] ?? recoveryStress * 0.5;
        muscleStats[m] = s;
      });

      Object.entries(distributedStress).forEach(([muscle, stress]) => {
        const key = muscle as MuscleGroup;
        if (meta.primary.includes(key) || meta.secondary.includes(key)) return;
        const s = muscleStats[key] ?? emptyMuscleStats();
        s.recoveryStress += stress;
        muscleStats[key] = s;
      });
    });
  });

  return {
    window,
    workouts: inWindow,
    muscleStats,
    patternStats,
    movementStats,
  };
}

export const movementScore = (stats?: MovementStats): CoverageScore => {
  const days = stats?.daysHit.length ?? 0;
  if (days === 0) return 0;
  if (days === 1) return 1;
  return 2;
};

export function movementGaps(coverage: Coverage): MovementPattern[] {
  return MOVEMENT_PATTERNS.filter(
    (m) => movementScore(coverage.movementStats[m]) < 2,
  )
    .map((m) => ({
      m,
      score: movementScore(coverage.movementStats[m]),
      sets: coverage.movementStats[m]?.sets ?? 0,
    }))
    .sort((a, b) => a.score - b.score || a.sets - b.sets)
    .map((x) => x.m);
}

export type CoverageScore = 0 | 1 | 2; // 0 = not hit, 1 = once, 2+ = covered

export const muscleScore = (stats?: MuscleStats): CoverageScore => {
  const days = stats?.daysHit.length ?? 0;
  if (days === 0) return 0;
  if (days === 1) return 1;
  return 2;
};

export type FocusEntry = {
  muscle: MuscleGroup;
  primarySets: number;
  secondarySets: number;
  days: number;
};

export function topFocus(coverage: Coverage, limit = 3): FocusEntry[] {
  return MUSCLE_GROUPS.map((m): FocusEntry => {
    const s = coverage.muscleStats[m];
    return {
      muscle: m,
      primarySets: s?.asPrimarySets ?? 0,
      secondarySets: s?.asSecondarySets ?? 0,
      days: s?.daysHit.length ?? 0,
    };
  })
    .filter((x) => x.primarySets > 0)
    .sort((a, b) => b.primarySets - a.primarySets || b.days - a.days)
    .slice(0, limit);
}

export function gapMuscles(coverage: Coverage): MuscleGroup[] {
  return MUSCLE_GROUPS.filter((m) => muscleScore(coverage.muscleStats[m]) < 2)
    .map((m) => ({
      m,
      score: muscleScore(coverage.muscleStats[m]),
      sets: coverage.muscleStats[m]?.asPrimarySets ?? 0,
    }))
    .sort((a, b) => a.score - b.score || a.sets - b.sets)
    .map((x) => x.m);
}

// Muscles trained as primary within the last `hours` hours (for recovery).
export function recentMusclesWithin(
  workouts: Workout[],
  todayISO: string,
  hours: number,
): Set<MuscleGroup> {
  const stress = recentMuscleStressWithin(workouts, todayISO, hours);
  const out = new Set<MuscleGroup>();
  MUSCLE_GROUPS.forEach((muscle) => {
    if ((stress[muscle] ?? 0) > 0) out.add(muscle);
  });
  return out;
}

export function recentMuscleStressWithin(
  workouts: Workout[],
  todayISO: string,
  hours: number,
): Partial<Record<MuscleGroup, number>> {
  const todayMs = parseISO(todayISO).getTime();
  const cutoff = todayMs - hours * MS_PER_HOUR;
  const halfLifeHours = Math.max(24, hours * 0.4);
  const stress: Partial<Record<MuscleGroup, number>> = {};

  workouts.forEach((w) => {
    const d = parseISO(w.date).getTime();
    if (d < cutoff) return;
    const elapsedHours = Math.max(0, (todayMs - d) / MS_PER_HOUR);
    const decay = Math.pow(0.5, elapsedHours / halfLifeHours);
    w.exercises.forEach((logEx) => {
      const meta = findExercise(logEx.exerciseName);
      if (!meta) return;
      const sets = logEx.sets.length;
      const stimulus = estimateExerciseStimulus(meta);
      const primaryStress = sets * stimulus.recoveryPerSet * decay;
      const distributedStress = distributeRecoveryStress(meta, primaryStress);

      Object.entries(distributedStress).forEach(([muscle, value]) => {
        const key = muscle as MuscleGroup;
        stress[key] = (stress[key] ?? 0) + value;
      });
    });
  });

  return stress;
}

export function patternBalance(
  coverage: Coverage,
): { pattern: Pattern; days: number; sets: number }[] {
  return PATTERNS.map((p) => ({
    pattern: p,
    days: coverage.patternStats[p]?.daysHit.length ?? 0,
    sets: coverage.patternStats[p]?.sets ?? 0,
  }));
}
