"use client";

import Link from "next/link";
import { useMemo } from "react";
import { MuscleTag } from "@/components/MuscleTag";
import { MUSCLE_COLORS } from "@/lib/colors";
import {
  computeCoverage,
  formatWindow,
  movementGaps,
  movementScore,
  muscleScore,
  topFocus,
  weekContaining,
} from "@/lib/coverage";
import { formatMuscle, todayISO } from "@/lib/format";
import { getWeeklyTargetSets } from "@/lib/generator";
import {
  MOVEMENT_BLURBS,
  MOVEMENT_COLORS,
  MOVEMENT_LABELS,
} from "@/lib/movement";
import { useTrainingProfile } from "@/lib/profile";
import { useWorkouts } from "@/lib/storage";
import { MOVEMENT_PATTERNS, MUSCLE_GROUPS } from "@/lib/types";
import type { CoverageScore } from "@/lib/coverage";
import type { MuscleGroup } from "@/lib/types";

const SCORE_DOT: Record<CoverageScore, string> = {
  0: "#C4441F",
  1: "#A36F22",
  2: "#1F7A52",
};

const SCORE_LABEL: Record<CoverageScore, string> = {
  0: "Not yet",
  1: "Once",
  2: "2+ days",
};

export default function WeekPage() {
  const { workouts, ready } = useWorkouts();
  const { profile } = useTrainingProfile();
  const today = todayISO();

  const coverage = useMemo(
    () => computeCoverage(workouts, weekContaining(today)),
    [workouts, today],
  );

  const focus = useMemo(() => topFocus(coverage, 3), [coverage]);
  const movGaps = useMemo(() => movementGaps(coverage), [coverage]);
  const sessionsCount = coverage.workouts.length;
  const weeklyTargets = useMemo(
    () => (profile ? getWeeklyTargetSets(profile, coverage.workouts) : {}),
    [profile, coverage.workouts],
  );
  const targetRows = useMemo(
    () =>
      Object.entries(weeklyTargets)
        .filter((entry): entry is [MuscleGroup, number] => typeof entry[1] === "number" && entry[1] > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([muscle, target]) => {
          const done = coverage.muscleStats[muscle]?.asPrimarySets ?? 0;
          const pct = Math.min(100, Math.round((done / target) * 100));
          const remaining = Math.max(0, target - done);
          return { muscle, target, done, pct, remaining };
        }),
    [coverage.muscleStats, weeklyTargets],
  );

  return (
    <div className="mx-auto max-w-[480px] px-4 pb-32 pt-6">
      <div className="mb-3">
        <Link href="/" className="text-[13px] font-medium text-text-muted">
          ← Back
        </Link>
      </div>

      <header className="mb-5">
        <p className="label-eyebrow">This week · {formatWindow(coverage.window)}</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-text">
          Movement coverage
        </h1>
        <p className="mt-1 text-[13px] text-text-subtle">
          {sessionsCount} session{sessionsCount !== 1 ? "s" : ""} logged
        </p>
      </header>

      {!ready && (
        <div className="rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-5 text-[13px] text-text-subtle">
          Loading…
        </div>
      )}

      {ready && sessionsCount === 0 && (
        <div className="rounded-2xl border border-dashed border-[#D3D1C7] px-4 py-8 text-center">
          <p className="text-[14px] text-text-subtle">
            No workouts logged in this week yet.
          </p>
          <Link
            href="/log"
            className="mt-3 inline-block rounded-full bg-text px-4 py-1.5 text-[13px] font-medium text-white"
          >
            Log your first one
          </Link>
        </div>
      )}

      {ready && sessionsCount > 0 && (
        <>
          {/* 6-movement grid — primary view */}
          <section className="mb-6">
            <p className="label-eyebrow mb-2">Six fundamental patterns</p>
            <div className="grid grid-cols-2 gap-2">
              {MOVEMENT_PATTERNS.map((mp) => {
                const stats = coverage.movementStats[mp];
                const score = movementScore(stats);
                const c = MOVEMENT_COLORS[mp];
                return (
                  <div
                    key={mp}
                    style={{ background: c.bg }}
                    className="rounded-xl px-3 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        style={{ color: c.text }}
                        className="text-[13px] font-semibold"
                      >
                        {MOVEMENT_LABELS[mp]}
                      </span>
                      <span
                        aria-hidden
                        style={{ background: SCORE_DOT[score] }}
                        className="h-2 w-2 rounded-full"
                      />
                    </div>
                    <p
                      style={{ color: c.text }}
                      className="mt-0.5 text-[10px] opacity-75"
                    >
                      {MOVEMENT_BLURBS[mp]}
                    </p>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span
                        style={{ color: c.text }}
                        className="font-mono text-[13px]"
                      >
                        {stats?.sets ?? 0} sets
                      </span>
                      <span
                        style={{ color: c.text }}
                        className="text-[10px] opacity-70"
                      >
                        {stats?.daysHit.length ?? 0}d · {SCORE_LABEL[score]}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-[10px] text-text-subtle">
              <span className="flex items-center gap-1">
                <span style={{ background: SCORE_DOT[2] }} className="h-2 w-2 rounded-full" />
                2+ days
              </span>
              <span className="flex items-center gap-1">
                <span style={{ background: SCORE_DOT[1] }} className="h-2 w-2 rounded-full" />
                1 day
              </span>
              <span className="flex items-center gap-1">
                <span style={{ background: SCORE_DOT[0] }} className="h-2 w-2 rounded-full" />
                not yet
              </span>
            </div>
          </section>

          {/* Movement gaps */}
          {movGaps.length > 0 && (
            <section className="mb-6">
              <p className="label-eyebrow mb-2">Patterns to fill</p>
              <div className="flex flex-wrap gap-1.5">
                {movGaps.map((mp) => {
                  const c = MOVEMENT_COLORS[mp];
                  return (
                    <span
                      key={mp}
                      style={{ background: c.bg, color: c.text }}
                      className="rounded-full px-3 py-1 text-[12px] font-medium"
                    >
                      {MOVEMENT_LABELS[mp]}
                    </span>
                  );
                })}
              </div>
            </section>
          )}

          {targetRows.length > 0 && (
            <section className="mb-6 rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4">
              <p className="label-eyebrow mb-2">Weekly muscle targets</p>
              <p className="mb-3 text-[12px] text-text-subtle">
                Keep stacking sets. Filling these bars is how this week turns into visible progress.
              </p>
              <div className="space-y-3">
                {targetRows.map((row) => (
                  <div key={row.muscle}>
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <MuscleTag muscle={row.muscle} size="md" />
                        <span className="text-[12px] text-text-subtle">
                          {row.remaining === 0
                            ? "On target"
                            : `${row.remaining} set${row.remaining !== 1 ? "s" : ""} left`}
                        </span>
                      </div>
                      <span className="font-mono text-[13px] text-text">
                        {row.done}/{row.target}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#ECE8DE]">
                      <div
                        className="h-full rounded-full bg-text"
                        style={{ width: `${row.pct}%` }}
                        aria-label={`${formatMuscle(row.muscle)} ${row.done} of ${row.target} sets`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Top focus by muscle (descriptive, not prescriptive) */}
          {focus.length > 0 && (
            <section className="mb-6 rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4">
              <p className="label-eyebrow mb-2">Top muscle focus</p>
              <div className="space-y-2">
                {focus.map((f) => (
                  <div key={f.muscle} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <MuscleTag muscle={f.muscle} size="md" />
                      <span className="text-[12px] text-text-subtle">
                        {f.days} day{f.days !== 1 ? "s" : ""}
                      </span>
                    </div>
                    <span className="font-mono text-[13px] text-text">
                      {f.primarySets} set{f.primarySets !== 1 ? "s" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Smaller muscle grid — supplementary */}
          <section className="mb-6">
            <p className="label-eyebrow mb-2">Muscles touched</p>
            <div className="grid grid-cols-3 gap-1.5">
              {MUSCLE_GROUPS.map((m) => {
                const stats = coverage.muscleStats[m];
                const score = muscleScore(stats);
                const c = MUSCLE_COLORS[m];
                return (
                  <div
                    key={m}
                    style={{ background: c.bg }}
                    className="rounded-lg px-2 py-2"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        style={{ color: c.text }}
                        className="text-[11px] font-medium capitalize"
                      >
                        {formatMuscle(m)}
                      </span>
                      <span
                        aria-hidden
                        style={{ background: SCORE_DOT[score] }}
                        className="h-1.5 w-1.5 rounded-full"
                      />
                    </div>
                    <span
                      style={{ color: c.text }}
                      className="mt-0.5 block font-mono text-[11px] opacity-80"
                    >
                      {stats?.asPrimarySets ?? 0}s · {stats?.daysHit.length ?? 0}d
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </>
      )}

      {/* CTA */}
      {ready && (
        <div className="fixed bottom-0 left-0 right-0 z-10 mx-auto max-w-[480px] border-t border-divider bg-bg/95 px-4 py-3 backdrop-blur">
          <Link
            href="/next"
            className="block w-full rounded-full bg-text py-3 text-center text-[14px] font-medium text-white"
          >
            Plan next workout →
          </Link>
        </div>
      )}
    </div>
  );
}
