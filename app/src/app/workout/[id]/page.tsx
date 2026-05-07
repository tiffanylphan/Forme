"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";
import { MuscleTag } from "@/components/MuscleTag";
import { SUPERSET_COLORS } from "@/lib/colors";
import { findExercise } from "@/lib/exercises";
import { formatDate, formatMuscle } from "@/lib/format";
import { deleteWorkout, stashEditWorkout, useWorkouts } from "@/lib/storage";
import type { ExerciseLog, MuscleGroup, SetEntry } from "@/lib/types";

type ColorPair = { bg: string; text: string };

type Block = {
  key: string;
  groupId: string | null;
  exercises: ExerciseLog[];
};

const buildBlocks = (exs: ExerciseLog[]): Block[] => {
  const blocks: Block[] = [];
  exs.forEach((ex) => {
    const last = blocks[blocks.length - 1];
    if (last && ex.supersetGroup && last.groupId === ex.supersetGroup) {
      last.exercises.push(ex);
    } else {
      blocks.push({ key: ex.id, groupId: ex.supersetGroup, exercises: [ex] });
    }
  });
  return blocks;
};

const formatSet = (s: SetEntry): string => {
  const reps = s.reps != null ? `${s.reps} reps` : null;
  const weight = s.weight != null ? `${s.weight} ${s.unit}` : null;
  if (reps && weight) return `${reps} · ${weight}`;
  return reps ?? weight ?? "—";
};

export default function WorkoutDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { workouts, ready } = useWorkouts();

  const workout = useMemo(
    () => workouts.find((w) => w.id === id) ?? null,
    [workouts, id],
  );

  const muscles = useMemo((): MuscleGroup[] => {
    if (!workout) return [];
    const set = new Set<MuscleGroup>();
    workout.exercises.forEach((logEx) => {
      findExercise(logEx.exerciseName)?.primary.forEach((m) => set.add(m));
    });
    return Array.from(set);
  }, [workout]);

  const blocks = useMemo(
    () => (workout ? buildBlocks(workout.exercises) : []),
    [workout],
  );

  const groupOrder = useMemo(
    () =>
      Array.from(
        new Set(
          workout?.exercises
            .map((e) => e.supersetGroup)
            .filter((g): g is string => Boolean(g)) ?? [],
        ),
      ),
    [workout],
  );

  const handleDelete = () => {
    if (!workout) return;
    if (confirm(`Delete workout from ${formatDate(workout.date)}?`)) {
      deleteWorkout(workout.id);
      router.push("/");
    }
  };

  const handleEdit = () => {
    if (!workout) return;
    stashEditWorkout(workout);
    router.push("/log");
  };

  if (!ready) {
    return (
      <div className="mx-auto max-w-[480px] px-4 pt-8">
        <p className="text-[14px] text-text-subtle">Loading…</p>
      </div>
    );
  }

  if (!workout) {
    return (
      <div className="mx-auto max-w-[480px] px-4 pt-8">
        <Link href="/" className="text-[13px] font-medium text-text-muted">
          ← Back
        </Link>
        <p className="mt-8 text-[14px] text-text-subtle">Workout not found.</p>
      </div>
    );
  }

  const totalSets = workout.exercises.reduce(
    (acc, e) => acc + e.sets.length,
    0,
  );

  return (
    <div className="mx-auto max-w-[480px] px-4 pb-16 pt-6">
      {/* Header row */}
      <div className="mb-4 flex items-center justify-between">
        <Link href="/" className="text-[13px] font-medium text-text-muted">
          ← Back
        </Link>
        <button
          onClick={handleEdit}
          className="rounded-full bg-text px-4 py-1.5 text-[13px] font-medium text-white"
        >
          Edit
        </button>
      </div>

      {/* Title */}
      <header className="mb-6">
        <h1 className="text-[26px] font-semibold tracking-tight text-text">
          {formatDate(workout.date)}
        </h1>
        <p className="mt-1 text-[13px] text-text-subtle">
          {workout.source === "class" ? "Class" : "Structured"} ·{" "}
          {workout.exercises.length} exercise
          {workout.exercises.length !== 1 ? "s" : ""} · {totalSets} sets
        </p>
        {muscles.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {muscles.map((m) => (
              <MuscleTag key={m} muscle={m} />
            ))}
          </div>
        )}
      </header>

      {/* Exercise blocks */}
      <div className="space-y-3">
        {blocks.map((block) => {
          if (block.exercises.length > 1) {
            const gIdx = block.groupId
              ? groupOrder.indexOf(block.groupId)
              : -1;
            const color =
              gIdx >= 0
                ? SUPERSET_COLORS[gIdx % SUPERSET_COLORS.length]
                : SUPERSET_COLORS[0];
            return (
              <SupersetView key={block.key} block={block} color={color} />
            );
          }
          return (
            <StandaloneView key={block.key} ex={block.exercises[0]} />
          );
        })}
      </div>

      {/* Notes */}
      {workout.notes && (
        <div className="mt-4 rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-3">
          <p className="label-eyebrow mb-1.5">Notes</p>
          <p className="text-[14px] leading-relaxed text-text">
            {workout.notes}
          </p>
        </div>
      )}

      {/* Delete */}
      <div className="mt-6">
        <button
          onClick={handleDelete}
          className="w-full rounded-full border border-[#E6E3D8] py-3 text-[14px] font-medium text-text-muted"
        >
          Delete workout
        </button>
      </div>
    </div>
  );
}

// ---------- Standalone block ----------

function StandaloneView({ ex }: { ex: ExerciseLog }) {
  const meta = findExercise(ex.exerciseName);
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E6E3D8] bg-surface">
      <div className="px-4 pt-3 pb-2">
        <h3 className="text-[15px] font-medium text-text">
          {ex.exerciseName}
        </h3>
        {meta && (
          <div className="mt-1 flex flex-wrap gap-1">
            {meta.primary.map((m) => (
              <MuscleTag key={m} muscle={m} />
            ))}
            {meta.secondary.map((m) => (
              <MuscleTag key={`s-${m}`} muscle={m} faded />
            ))}
          </div>
        )}
      </div>
      <div className="border-t border-divider px-4 pb-3 pt-2">
        <div className="mb-1 grid grid-cols-[28px_1fr] gap-2 text-[10px] font-medium uppercase tracking-wider text-text-subtle">
          <span>#</span>
          <span>Set</span>
        </div>
        {ex.sets.map((s, i) => (
          <div
            key={s.id}
            className="grid grid-cols-[28px_1fr] items-center gap-2 py-0.5"
          >
            <span className="font-mono text-[12px] text-text-subtle">
              {i + 1}
            </span>
            <span className="text-[14px] text-text">{formatSet(s)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Superset block (round-major) ----------

function SupersetView({
  block,
  color,
}: {
  block: Block;
  color: ColorPair;
}) {
  const lanes = block.exercises;
  const rounds = Math.max(...lanes.map((e) => e.sets.length));

  return (
    <div
      className="overflow-hidden rounded-2xl border bg-surface"
      style={{ borderColor: color.text, borderLeftWidth: 4 }}
    >
      {/* Group header */}
      <div
        className="flex items-center gap-2 px-4 py-2"
        style={{ background: color.bg, color: color.text }}
      >
        <span className="text-[10px] font-medium uppercase tracking-wider">
          Superset · {lanes.length} exercises · {rounds} round
          {rounds !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Exercise lanes */}
      <div className="divide-y divide-divider">
        {lanes.map((ex, i) => {
          const meta = findExercise(ex.exerciseName);
          return (
            <div key={ex.id} className="flex items-start gap-2 px-4 py-2">
              <span
                className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold"
                style={{ background: color.bg, color: color.text }}
              >
                {String.fromCharCode(65 + i)}
              </span>
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-text">
                  {ex.exerciseName}
                </p>
                {meta && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {meta.primary.map((m) => (
                      <span
                        key={m}
                        className="text-[10px] text-text-subtle capitalize"
                      >
                        {formatMuscle(m)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Rounds */}
      <div className="border-t border-divider px-4 pt-3 pb-3">
        {Array.from({ length: rounds }).map((_, roundIdx) => (
          <div key={roundIdx} className="mb-3 last:mb-0">
            <p className="label-eyebrow mb-1">Round {roundIdx + 1}</p>
            <div className="space-y-0.5">
              {lanes.map((ex, i) => {
                const s = ex.sets[roundIdx];
                if (!s) return null;
                return (
                  <div key={ex.id} className="flex items-center gap-2">
                    <span
                      className="text-[11px] font-semibold"
                      style={{ color: color.text }}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <span className="text-[14px] text-text">
                      {formatSet(s)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
