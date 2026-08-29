import type { SessionEffort, Workout } from "@/lib/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 14;
const RATED_SAMPLE_SIZE = 4;
const MIN_MULTIPLIER = 0.85;
const MAX_MULTIPLIER = 1.1;

const parseISO = (iso: string): Date => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
};

const daysAgo = (dateISO: string, todayISO: string): number =>
  Math.round((parseISO(todayISO).getTime() - parseISO(dateISO).getTime()) / MS_PER_DAY);

type RatedSession = { effort: SessionEffort; age: number };

const ratedRecentFirst = (workouts: Workout[], todayISO: string): RatedSession[] =>
  workouts
    .filter((w) => w.sessionEffort !== undefined)
    .map((w) => ({ effort: w.sessionEffort as SessionEffort, age: daysAgo(w.date, todayISO) }))
    .filter((s) => s.age >= 0)
    .sort((a, b) => a.age - b.age);

type EffortSignal = { multiplier: number; reason: string | null };

const brutalRecencyReason = (age: number): string => {
  if (age <= 0) return "Today's earlier session felt brutal — this one is scaled back.";
  if (age === 1) return "Yesterday felt brutal — today is scaled back.";
  return "Your last session felt brutal — today is scaled back.";
};

function computeSignal(workouts: Workout[], todayISO: string): EffortSignal {
  const rated = ratedRecentFirst(workouts, todayISO);

  const latest = rated[0];
  if (latest && latest.age <= 2 && latest.effort === "brutal") {
    return { multiplier: 0.85, reason: brutalRecencyReason(latest.age) };
  }

  const sample = rated
    .filter((s) => s.age <= RECENT_WINDOW_DAYS)
    .slice(0, RATED_SAMPLE_SIZE);
  const brutalCount = sample.filter((s) => s.effort === "brutal").length;
  if (brutalCount >= 2) {
    return {
      multiplier: 0.9,
      reason: "Several recent sessions felt brutal — easing today's load a little.",
    };
  }
  const easyCount = sample.filter((s) => s.effort === "easy").length;
  if (easyCount >= 3) {
    return {
      multiplier: 1.1,
      reason: "Recent sessions have felt easy — nudging today's work up.",
    };
  }

  return { multiplier: 1.0, reason: null };
}

const clamp = (value: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, value));

/**
 * Scales the session fatigue budget based on recent one-tap effort ratings.
 * Clamped to [0.85, 1.1]; unrated workouts are neutral.
 */
export function effortBudgetMultiplier(workouts: Workout[], todayISO: string): number {
  return clamp(computeSignal(workouts, todayISO).multiplier, MIN_MULTIPLIER, MAX_MULTIPLIER);
}

/** Short user-facing explanation for a non-1.0 multiplier; null when 1.0. */
export function effortAdjustmentReason(workouts: Workout[], todayISO: string): string | null {
  return computeSignal(workouts, todayISO).reason;
}
