import { weekContaining } from "./coverage";
import type { Workout } from "./types";

export type WeekPhase = {
  phase: "build" | "deload";
  buildWeeks: number;
  intensityScale: number;
  reason: string | null;
};

// Thresholds (see periodization.test.ts for behavioral spec):
// - A qualifying build week has >= MIN_WORKOUTS_PER_BUILD_WEEK logged workouts
//   and a total set count >= VOLUME_DROP_RATIO of the trailing build-week
//   average; a week below that ratio reads as a self-selected deload.
// - A scheduled deload lands after SCHEDULED_DELOAD_AFTER consecutive build
//   weeks, or after FATIGUE_DELOAD_AFTER when those weeks contain
//   >= FATIGUE_BRUTAL_COUNT "brutal" session ratings.
const MIN_WORKOUTS_PER_BUILD_WEEK = 2;
const VOLUME_DROP_RATIO = 0.6;
const SCHEDULED_DELOAD_AFTER = 4;
const FATIGUE_DELOAD_AFTER = 3;
const FATIGUE_BRUTAL_COUNT = 2;
const DELOAD_INTENSITY_SCALE = 0.75;

type WeekSummary = {
  workoutCount: number;
  totalSets: number;
  brutalCount: number;
};

const addDaysISO = (iso: string, days: number): string => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d + days);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
};

const emptyWeek = (): WeekSummary => ({
  workoutCount: 0,
  totalSets: 0,
  brutalCount: 0,
});

type ChainState = {
  buildWeeks: number;
  chainSets: number;
  chainBrutal: number;
};

const freshChain = (): ChainState => ({
  buildWeeks: 0,
  chainSets: 0,
  chainBrutal: 0,
});

const deloadThreshold = (chain: ChainState): number =>
  chain.chainBrutal >= FATIGUE_BRUTAL_COUNT
    ? FATIGUE_DELOAD_AFTER
    : SCHEDULED_DELOAD_AFTER;

export function getWeekPhase(workouts: Workout[], todayISO: string): WeekPhase {
  const currentWeekStart = weekContaining(todayISO).startISO;

  const byWeek = new Map<string, WeekSummary>();
  let firstWeekStart: string | null = null;
  workouts.forEach((w) => {
    if (w.date >= currentWeekStart) return;
    const start = weekContaining(w.date).startISO;
    const summary = byWeek.get(start) ?? emptyWeek();
    summary.workoutCount += 1;
    summary.totalSets += w.exercises.reduce((n, ex) => n + ex.sets.length, 0);
    if (w.sessionEffort === "brutal") summary.brutalCount += 1;
    byWeek.set(start, summary);
    if (firstWeekStart === null || start < firstWeekStart) {
      firstWeekStart = start;
    }
  });

  let chain = freshChain();

  if (firstWeekStart !== null) {
    for (
      let weekStart: string = firstWeekStart;
      weekStart < currentWeekStart;
      weekStart = addDaysISO(weekStart, 7)
    ) {
      // A week the derivation already marked as a deload resets the chain
      // once it passes, whatever the user actually did during it.
      if (chain.buildWeeks >= deloadThreshold(chain)) {
        chain = freshChain();
        continue;
      }

      const week = byWeek.get(weekStart) ?? emptyWeek();
      if (week.workoutCount < MIN_WORKOUTS_PER_BUILD_WEEK) {
        chain = freshChain();
        continue;
      }

      const trailingAvg =
        chain.buildWeeks > 0 ? chain.chainSets / chain.buildWeeks : 0;
      if (chain.buildWeeks > 0 && week.totalSets < trailingAvg * VOLUME_DROP_RATIO) {
        chain = freshChain();
        continue;
      }

      chain.buildWeeks += 1;
      chain.chainSets += week.totalSets;
      chain.chainBrutal += week.brutalCount;
    }
  }

  if (chain.buildWeeks >= deloadThreshold(chain)) {
    const fatigueTriggered = chain.buildWeeks < SCHEDULED_DELOAD_AFTER;
    return {
      phase: "deload",
      buildWeeks: chain.buildWeeks,
      intensityScale: DELOAD_INTENSITY_SCALE,
      reason: fatigueTriggered
        ? `Deload week — ${chain.buildWeeks} hard weeks in a row with several brutal sessions. Backing off so you can rebuild.`
        : `Deload week — ${chain.buildWeeks} solid build weeks in a row. Easing off to lock in the gains.`,
    };
  }

  return {
    phase: "build",
    buildWeeks: chain.buildWeeks,
    intensityScale: 1.0,
    reason: null,
  };
}
