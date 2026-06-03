"use client";

import Link from "next/link";
import { useMemo } from "react";
import { MuscleTag } from "@/components/MuscleTag";
import {
  computeCoverage,
  movementScore,
  weekContaining,
} from "@/lib/coverage";
import { findExercise } from "@/lib/exercises";
import { formatDate, todayISO } from "@/lib/format";
import { MOVEMENT_COLORS, MOVEMENT_LABELS } from "@/lib/movement";
import {
  formatEnvironment,
  formatExperience,
  formatGoal,
  formatIntensity,
  useTrainingProfile,
} from "@/lib/profile";
import { useWorkouts } from "@/lib/storage";
import { MOVEMENT_PATTERNS } from "@/lib/types";
import type { CoverageScore } from "@/lib/coverage";
import type { MuscleGroup, Workout } from "@/lib/types";

const SCORE_DOT: Record<CoverageScore, string> = {
  0: "#C4441F",
  1: "#A36F22",
  2: "#1F7A52",
};

const musclesForWorkout = (w: Workout): MuscleGroup[] => {
  const set = new Set<MuscleGroup>();
  w.exercises.forEach((logEx) => {
    const meta = findExercise(logEx.exerciseName);
    meta?.primary.forEach((m) => set.add(m));
  });
  return Array.from(set);
};

const setCount = (w: Workout): number =>
  w.exercises.reduce((acc, e) => acc + e.sets.length, 0);

export default function Home() {
  const { workouts, ready } = useWorkouts();
  const { profile, ready: profileReady } = useTrainingProfile();
  const today = todayISO();

  const coverage = useMemo(
    () => computeCoverage(workouts, weekContaining(today)),
    [workouts, today],
  );
  const sortedWorkouts = useMemo(
    () => [...workouts].sort((a, b) => (a.date < b.date ? 1 : -1)),
    [workouts],
  );

  const hasWeekData = coverage.workouts.length > 0;

  return (
    <div className="mx-auto max-w-[480px] px-4 pb-16 pt-8">
      <header className="mb-6">
        <p className="label-eyebrow mb-1">Workout</p>
        <h1 className="text-[28px] font-semibold tracking-tight text-text">
          What are we hitting today?
        </h1>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-2">
        <Link href="/log" className="rounded-2xl bg-text px-4 py-5 text-white">
          <span className="block text-[12px] font-medium uppercase tracking-wider opacity-70">
            Action
          </span>
          <span className="mt-1 block text-[18px] font-semibold">
            Log workout →
          </span>
        </Link>
        <Link
          href="/next"
          className="rounded-2xl border border-text bg-surface px-4 py-5"
        >
          <span className="label-eyebrow block">Plan</span>
          <span className="mt-1 block text-[18px] font-semibold text-text">
            Next workout →
          </span>
        </Link>
      </div>

      {profileReady && profile && (
        <Link
          href="/onboarding"
          className="mb-6 block rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4"
        >
          <div className="mb-2 flex items-baseline justify-between">
            <p className="label-eyebrow">Training profile</p>
            <span className="text-[12px] text-text-subtle">edit →</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ProfileChip>{formatGoal(profile.goal)}</ProfileChip>
            <ProfileChip>{profile.daysPerWeek} days/week</ProfileChip>
            <ProfileChip>{formatEnvironment(profile.equipment)}</ProfileChip>
            <ProfileChip>{formatExperience(profile.experience)}</ProfileChip>
            <ProfileChip>{formatIntensity(profile.intensity)}</ProfileChip>
          </div>
        </Link>
      )}

      {profileReady && !profile && (
        <Link
          href="/onboarding"
          className="mb-6 block rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4"
        >
          <p className="label-eyebrow mb-1">Setup</p>
          <p className="text-[15px] font-medium text-text">
            Build your training profile
          </p>
          <p className="mt-1 text-[13px] text-text-subtle">
            Let the planner use your goal, experience, equipment, and weekly
            frequency.
          </p>
        </Link>
      )}

      {/* This week — coverage at a glance */}
      <Link
        href="/week"
        className="mb-6 block rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4"
      >
        <div className="mb-2 flex items-baseline justify-between">
          <p className="label-eyebrow">This week</p>
          <span className="text-[12px] text-text-subtle">
            {coverage.workouts.length} session
            {coverage.workouts.length !== 1 ? "s" : ""} · view →
          </span>
        </div>

        {hasWeekData ? (
          <div className="grid grid-cols-3 gap-1.5">
            {MOVEMENT_PATTERNS.map((mp) => {
              const stats = coverage.movementStats[mp];
              const score = movementScore(stats);
              const c = MOVEMENT_COLORS[mp];
              return (
                <div
                  key={mp}
                  style={{ background: c.bg }}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5"
                >
                  <span
                    style={{ color: c.text }}
                    className="text-[11px] font-medium"
                  >
                    {MOVEMENT_LABELS[mp]}
                  </span>
                  <span
                    aria-hidden
                    style={{ background: SCORE_DOT[score] }}
                    className="h-1.5 w-1.5 rounded-full"
                  />
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-[13px] text-text-subtle">
            No workouts logged this week yet.
          </p>
        )}
      </Link>

      <div className="mb-6">
        <Link
          href="/library"
          className="block text-[13px] font-medium text-text-muted underline"
        >
          Browse exercise library →
        </Link>
      </div>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <p className="label-eyebrow">Recent workouts</p>
          <div className="flex items-center gap-2">
            {ready && workouts.length > 0 && (
              <span className="text-[12px] text-text-subtle">
                {workouts.length} total
              </span>
            )}
            <Link
              href="/data"
              className="rounded-full border border-[#D3D1C7] bg-white px-3 py-1 text-[11px] font-medium text-text-muted"
            >
              Import / Export
            </Link>
          </div>
        </div>

        {!ready && (
          <div className="rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-5 text-[13px] text-text-subtle">
            Loading…
          </div>
        )}

        {ready && sortedWorkouts.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[#D3D1C7] px-4 py-8 text-center">
            <p className="text-[14px] text-text-subtle">
              No workouts logged yet.
            </p>
            <Link
              href="/log"
              className="mt-3 inline-block rounded-full bg-text px-4 py-1.5 text-[13px] font-medium text-white"
            >
              Log your first one
            </Link>
          </div>
        )}

        <div className="space-y-2">
          {sortedWorkouts.map((w) => {
            const muscles = musclesForWorkout(w);
            return (
              <div
                key={w.id}
                className="rounded-2xl border border-[#E6E3D8] bg-surface"
              >
                <Link
                  href={`/workout/${w.id}`}
                  className="block px-4 pt-3.5 pb-3"
                >
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-[15px] font-medium text-text">
                      {formatDate(w.date)}
                    </h3>
                    <span className="text-[12px] text-text-subtle">
                      {w.exercises.length} ex · {setCount(w)} sets
                    </span>
                  </div>
                  {muscles.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {muscles.map((m) => (
                        <MuscleTag key={m} muscle={m} />
                      ))}
                    </div>
                  )}
                  <p className="mt-1.5 truncate text-[12px] text-text-subtle">
                    {w.exercises
                      .slice(0, 3)
                      .map((e) => e.exerciseName)
                      .join(" · ")}
                    {w.exercises.length > 3 ? " · …" : ""}
                  </p>
                </Link>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function ProfileChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[#F1EFE8] px-3 py-1 text-[12px] font-medium text-text-muted">
      {children}
    </span>
  );
}
