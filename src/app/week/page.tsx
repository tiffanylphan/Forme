"use client";

import Link from "next/link";
import { useMemo } from "react";
import { MuscleMap } from "@/components/MuscleMap";
import { MuscleTag } from "@/components/MuscleTag";
import {
  computeCoverage,
  formatWindow,
  movementGaps,
  movementScore,
  topFocus,
  weekContaining,
} from "@/lib/coverage";
import { formatMuscle, todayISO } from "@/lib/format";
import { getWeeklyTargetStimulus } from "@/lib/splits";
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
    () => (profile ? getWeeklyTargetStimulus(profile, coverage.workouts) : {}),
    [profile, coverage.workouts],
  );
  const targetRows = useMemo(
    () =>
      Object.entries(weeklyTargets)
        .filter((entry): entry is [MuscleGroup, number] => typeof entry[1] === "number" && entry[1] > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([muscle, target]) => {
          const done = coverage.muscleStats[muscle]?.primaryStimulus ?? 0;
          const pct = Math.min(100, Math.round((done / target) * 100));
          const remaining = Math.max(0, target - done);
          return { muscle, target, done, pct, remaining };
        }),
    [coverage.muscleStats, weeklyTargets],
  );
  const muscleMapRows = useMemo(
    () =>
      MUSCLE_GROUPS.map((muscle) => {
        const primarySets = coverage.muscleStats[muscle]?.asPrimarySets ?? 0;
        const secondarySets = coverage.muscleStats[muscle]?.asSecondarySets ?? 0;
        const primaryStimulus = coverage.muscleStats[muscle]?.primaryStimulus ?? 0;
        const secondaryStimulus = coverage.muscleStats[muscle]?.secondaryStimulus ?? 0;
        const targetSets = weeklyTargets[muscle] ?? 0;
        const effectiveStimulus = primaryStimulus + secondaryStimulus;
        const intensity = targetSets > 0
          ? Math.min(1, effectiveStimulus / targetSets)
          : Math.min(1, effectiveStimulus / 6);
        return {
          muscle,
          primarySets,
          secondarySets,
          primaryStimulus,
          secondaryStimulus,
          targetSets,
          intensity,
        };
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

          {/* Training balance */}
          {(() => {
            const push  = coverage.movementStats["push"]?.sets ?? 0;
            const pull  = coverage.movementStats["pull"]?.sets ?? 0;
            const squat = (coverage.movementStats["squat"]?.sets ?? 0)
                        + (coverage.movementStats["single_leg"]?.sets ?? 0);
            const hinge = coverage.movementStats["hinge"]?.sets ?? 0;
            const upper = push + pull;
            const lower = squat + hinge;

            if (upper + lower === 0) return null;

            type Pair = {
              left: string; leftSets: number; leftBar: string; leftText: string;
              right: string; rightSets: number; rightBar: string; rightText: string;
              threshold: number;
              flag: string;
            };

            const pairs: Pair[] = [
              {
                left: "Push", leftSets: push, leftBar: "#f5cfc4", leftText: "#712B13",
                right: "Pull", rightSets: pull, rightBar: "#c0d8f0", rightText: "#0C447C",
                threshold: 1.4,
                flag: pull === 0
                  ? "No pulling yet this week."
                  : push >= pull
                    ? `${(push / pull).toFixed(1)}:1 — add ~${Math.round(push - pull)} pull sets to reach 1:1.`
                    : `${(pull / push).toFixed(1)}:1 — add ~${Math.round(pull - push)} push sets to reach 1:1.`,
              },
              {
                left: "Knee", leftSets: squat, leftBar: "#c5e8dc", leftText: "#085041",
                right: "Hip", rightSets: hinge, rightBar: "#d8d6f8", rightText: "#3C3489",
                threshold: 1.6,
                flag: hinge === 0
                  ? "No hinge work yet — deadlifts or RDLs balance the knees."
                  : squat >= hinge
                    ? `${(squat / hinge).toFixed(1)}:1 knee-to-hip. Add more hinge work.`
                    : `${(hinge / squat).toFixed(1)}:1 hip-to-knee. Add more squat and lunge work.`,
              },
              {
                left: "Upper", leftSets: upper, leftBar: "#faeeda", leftText: "#633806",
                right: "Lower", rightSets: lower, rightBar: "#eeedfe", rightText: "#3C3489",
                threshold: 1.6,
                flag: lower === 0
                  ? "No lower body work yet this week."
                  : upper > lower * 1.6
                    ? `${(upper / lower).toFixed(1)}:1 upper-to-lower. More leg and hip work needed.`
                    : lower > upper * 1.6
                      ? `${(lower / upper).toFixed(1)}:1 lower-to-upper. More pressing and pulling needed.`
                      : "",
              },
            ];

            const flags = pairs.filter(p => {
              const a = p.leftSets, b = p.rightSets;
              if (a + b === 0) return false;
              if (b === 0) return a > 0;
              return a > b * p.threshold || b > a * p.threshold;
            });

            const allBalanced = flags.length === 0;

            return (
              <section className="mb-6 rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <p className="label-eyebrow">Training balance</p>
                  <span className={`text-[11px] font-medium ${allBalanced ? "text-[#1F7A52]" : "text-[#A36F22]"}`}>
                    {allBalanced ? "on track" : `${flags.length} imbalance${flags.length > 1 ? "s" : ""}`}
                  </span>
                </div>
                <div className="space-y-3">
                  {pairs.map((p) => {
                    const total = p.leftSets + p.rightSets;
                    if (total === 0) return null;
                    const leftPct = Math.round((p.leftSets / total) * 100);
                    return (
                      <div key={p.left}>
                        <div className="mb-1 flex justify-between text-[11px] font-medium">
                          <span style={{ color: p.leftText }}>{p.left} — {p.leftSets}</span>
                          <span style={{ color: p.rightText }}>{p.right} — {p.rightSets}</span>
                        </div>
                        <div className="flex h-2 overflow-hidden rounded-full">
                          <div style={{ width: `${leftPct}%`, background: p.leftBar }} />
                          <div style={{ width: `${100 - leftPct}%`, background: p.rightBar }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
                {flags.length > 0 && (
                  <ul className="mt-3 space-y-1 border-t border-[#F0EDE5] pt-3">
                    {flags.map(p => (
                      <li key={p.left} className="text-[12px] text-text-subtle">
                        · {p.flag}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })()}

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
              <p className="label-eyebrow mb-2">Weekly muscle stimulus</p>
              <p className="mb-3 text-[12px] text-text-subtle">
                Keep stacking high-quality stimulus. Filling these bars is how this week turns into visible progress.
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
                            : `${row.remaining.toFixed(1)} stimulus left`}
                        </span>
                      </div>
                      <span className="font-mono text-[13px] text-text">
                        {row.done.toFixed(1)}/{row.target.toFixed(1)}
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-[#ECE8DE]">
                      <div
                        className="h-full rounded-full bg-text"
                        style={{ width: `${row.pct}%` }}
                        aria-label={`${formatMuscle(row.muscle)} ${row.done.toFixed(1)} of ${row.target.toFixed(1)} stimulus`}
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

          <MuscleMap rows={muscleMapRows} />
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
          <button
            onClick={() => {
              const data = localStorage.getItem("workout.workouts.v1") ?? "[]";
              if (navigator.share) {
                navigator.share({ title: "Workout data", text: data });
              } else {
                navigator.clipboard.writeText(data);
              }
            }}
            className="mt-2 block w-full rounded-full border border-[#D3D1C7] py-3 text-center text-[14px] font-medium text-text"
          >
            Export data
          </button>
        </div>
      )}
    </div>
  );
}
