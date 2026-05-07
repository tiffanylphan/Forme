import { findExercise } from "./exercises";
import { movementOf } from "./movement";
import { MOVEMENT_PATTERNS, MUSCLE_GROUPS, PATTERNS } from "./types";
import type {
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
  exercises: [],
});

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
        if (!s.daysHit.includes(w.date)) s.daysHit.push(w.date);
        s.exercises.push({ name: logEx.exerciseName, sets, date: w.date });
        muscleStats[m] = s;
      });

      // Secondary tracked separately so it doesn't inflate the hit-day score
      meta.secondary.forEach((m) => {
        const s = muscleStats[m] ?? emptyMuscleStats();
        s.asSecondarySets += sets;
        muscleStats[m] = s;
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
  const cutoff = parseISO(todayISO).getTime() - hours * 60 * 60 * 1000;
  const out = new Set<MuscleGroup>();
  workouts.forEach((w) => {
    const d = parseISO(w.date).getTime();
    if (d < cutoff) return;
    w.exercises.forEach((logEx) => {
      const meta = findExercise(logEx.exerciseName);
      meta?.primary.forEach((m) => out.add(m));
    });
  });
  return out;
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
