"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ExercisePicker } from "@/components/ExercisePicker";
import { MuscleTag } from "@/components/MuscleTag";
import { findExercise } from "@/lib/exercises";
import { SUPERSET_COLORS } from "@/lib/colors";
import { formatDate, todayISO, uid } from "@/lib/format";
import { popDraft } from "@/lib/generator";
import { getWorkout, popEditWorkout, upsertWorkout } from "@/lib/storage";
import type { WorkoutDraft } from "@/lib/generator";
import type {
  ExerciseLog,
  MuscleGroup,
  SetEntry,
  WeightUnit,
  Workout,
  WorkoutSource,
} from "@/lib/types";

type ColorPair = { bg: string; text: string };

type Block = {
  key: string;
  groupId: string | null;
  exercises: ExerciseLog[];
  startIndex: number;
  rounds: number;
};

const newSet = (defaults?: Partial<SetEntry>): SetEntry => ({
  id: uid("set"),
  reps: null,
  weight: null,
  unit: "lb",
  ...defaults,
});

const newExerciseLog = (exerciseName: string): ExerciseLog => ({
  id: uid("ex"),
  exerciseName,
  sets: [newSet()],
  supersetGroup: null,
});

// Convert a generator draft into ExerciseLog[] ready to seed the logger.
const hydrateDraft = (draft: WorkoutDraft): ExerciseLog[] => {
  const out: ExerciseLog[] = [];
  for (const sec of draft.sections) {
    const groupId =
      sec.kind === "superset" && sec.exercises.length > 1 ? uid("ss") : null;
    for (const dex of sec.exercises) {
      const sets: SetEntry[] = dex.targets.map((t) =>
        newSet({
          reps: typeof t === "number" ? t : null,
          weight: dex.suggestedWeight ?? null,
          unit: dex.unit,
        }),
      );
      out.push({
        id: uid("ex"),
        exerciseName: dex.name,
        sets,
        supersetGroup: groupId,
      });
    }
  }
  return out;
};

type InitialState = {
  workoutId: string;
  date: string;
  source: WorkoutSource;
  exercises: ExerciseLog[];
  planSlot: Workout["planSlot"];
  notes: string;
  isEditing: boolean;
  recovered: boolean;
};

const LOG_DRAFT_KEY = "workout.log-draft.v1";

type LogDraftSnapshot = {
  workoutId: string;
  date: string;
  source: WorkoutSource;
  exercises: ExerciseLog[];
  planSlot: Workout["planSlot"];
  notes: string;
  isEditing: boolean;
  defaultUnit: WeightUnit;
};

const loadLogDraft = (): LogDraftSnapshot | null => {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(LOG_DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as LogDraftSnapshot;
  } catch {
    return null;
  }
};

const saveLogDraft = (snapshot: LogDraftSnapshot): void => {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem(LOG_DRAFT_KEY, JSON.stringify(snapshot));
};

const clearLogDraft = (): void => {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(LOG_DRAFT_KEY);
};

// Resolves initial state for the logger. Priority order:
//   1. Existing workout stashed in sessionStorage for editing
//   2. Generator draft stashed in sessionStorage
//   3. Blank new workout
//
// Both cases use sessionStorage (not window.location) so the initializer
// works correctly on the client regardless of SSR/hydration order.
const resolveInitialState = (): InitialState => {
  const blank = (): InitialState => ({
    workoutId: uid("w"),
    date: todayISO(),
    source: "manual",
    exercises: [],
    planSlot: undefined,
    notes: "",
    isEditing: false,
    recovered: false,
  });

  if (typeof window === "undefined") return blank();

  // Priority 1: edit an existing workout
  const editWorkout = popEditWorkout();
  if (editWorkout) {
    return {
      workoutId: editWorkout.id,
      date: editWorkout.date,
      source: editWorkout.source,
      exercises: editWorkout.exercises,
      planSlot: editWorkout.planSlot,
      notes: editWorkout.notes ?? "",
      isEditing: true,
      recovered: false,
    };
  }

  // Priority 2: generator draft
  const pending = popDraft();
  if (pending) {
    return {
      ...blank(),
      source: pending.source,
      exercises: hydrateDraft(pending.draft),
      planSlot: {
        slotId: pending.draft.split.slotId,
        title: pending.draft.split.title,
      },
    };
  }

  const savedDraft = loadLogDraft();
  if (savedDraft) {
    return {
      workoutId: savedDraft.workoutId,
      date: savedDraft.date,
      source: savedDraft.source,
      exercises: savedDraft.exercises,
      planSlot: savedDraft.planSlot,
      notes: savedDraft.notes,
      isEditing: savedDraft.isEditing,
      recovered: true,
    };
  }

  return blank();
};

const buildBlocks = (exs: ExerciseLog[]): Block[] => {
  const blocks: Block[] = [];
  exs.forEach((ex, i) => {
    const last = blocks[blocks.length - 1];
    if (last && ex.supersetGroup && last.groupId === ex.supersetGroup) {
      last.exercises.push(ex);
    } else {
      blocks.push({
        key: ex.id,
        groupId: ex.supersetGroup,
        exercises: [ex],
        startIndex: i,
        rounds: ex.sets.length,
      });
    }
  });
  for (const b of blocks) {
    b.rounds = Math.max(...b.exercises.map((e) => e.sets.length));
  }
  return blocks;
};

const padSetsTo = (ex: ExerciseLog, count: number): ExerciseLog => {
  if (ex.sets.length >= count) return ex;
  const last = ex.sets[ex.sets.length - 1];
  const pads: SetEntry[] = [];
  for (let i = ex.sets.length; i < count; i++) {
    pads.push(
      newSet(
        last
          ? { reps: last.reps, weight: last.weight, unit: last.unit }
          : undefined,
      ),
    );
  }
  return { ...ex, sets: [...ex.sets, ...pads] };
};

const groupColorFor = (
  groupId: string | null,
  groupOrder: string[],
): ColorPair | null => {
  if (!groupId) return null;
  const idx = groupOrder.indexOf(groupId);
  if (idx < 0) return null;
  return SUPERSET_COLORS[idx % SUPERSET_COLORS.length];
};

export default function LogPage() {
  const router = useRouter();
  const [init] = useState(resolveInitialState);
  const [workoutId] = useState(init.workoutId);
  const [date, setDate] = useState(init.date);
  const [source, setSource] = useState<WorkoutSource>(init.source);
  const [exercises, setExercises] = useState<ExerciseLog[]>(init.exercises);
  const [planSlot] = useState(init.planSlot);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notes, setNotes] = useState(init.notes);
  const isEditing = init.isEditing;
  const [defaultUnit, setDefaultUnit] = useState<WeightUnit>(() => {
    const savedDraft = loadLogDraft();
    return savedDraft?.defaultUnit ?? "lb";
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    saveLogDraft({
      workoutId,
      date,
      source,
      exercises,
      planSlot,
      notes,
      isEditing,
      defaultUnit,
    });
  }, [workoutId, date, source, exercises, planSlot, notes, isEditing, defaultUnit]);

  const blocks = useMemo(() => buildBlocks(exercises), [exercises]);

  const groupOrder = useMemo(
    () =>
      Array.from(
        new Set(
          exercises
            .map((e) => e.supersetGroup)
            .filter((g): g is string => Boolean(g)),
        ),
      ),
    [exercises],
  );

  const addedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    exercises.forEach((e) => {
      counts[e.exerciseName] = (counts[e.exerciseName] ?? 0) + 1;
    });
    return counts;
  }, [exercises]);

  const muscleSummary = useMemo(() => {
    const set = new Set<MuscleGroup>();
    exercises.forEach((e) => {
      const meta = findExercise(e.exerciseName);
      meta?.primary.forEach((m) => set.add(m));
    });
    return Array.from(set);
  }, [exercises]);

  const addExercise = (name: string) => {
    setSaveError(null);
    setExercises((prev) => [...prev, newExerciseLog(name)]);
  };

  const removeExercise = (id: string) => {
    setSaveError(null);
    setExercises((prev) => prev.filter((e) => e.id !== id));
  };

  const moveExercise = (id: string, dir: -1 | 1) => {
    setSaveError(null);
    setExercises((prev) => {
      const idx = prev.findIndex((e) => e.id === id);
      if (idx < 0) return prev;
      const target = idx + dir;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  // Merge block at gapIdx (above) with block at gapIdx + 1 (below).
  const linkAcross = (gapIdx: number) => {
    setSaveError(null);
    setExercises((prev) => {
      const built = buildBlocks(prev);
      if (gapIdx < 0 || gapIdx >= built.length - 1) return prev;
      const a = built[gapIdx];
      const b = built[gapIdx + 1];
      const groupId = a.groupId ?? uid("ss");
      const target = Math.max(
        ...a.exercises.map((e) => e.sets.length),
        ...b.exercises.map((e) => e.sets.length),
      );
      const ids = new Set([
        ...a.exercises.map((e) => e.id),
        ...b.exercises.map((e) => e.id),
      ]);
      return prev.map((ex) => {
        if (!ids.has(ex.id)) return ex;
        return { ...padSetsTo(ex, target), supersetGroup: groupId };
      });
    });
  };

  const breakGroup = (groupId: string) => {
    setSaveError(null);
    setExercises((prev) =>
      prev.map((ex) =>
        ex.supersetGroup === groupId ? { ...ex, supersetGroup: null } : ex,
      ),
    );
  };

  const addRound = (groupId: string) => {
    setSaveError(null);
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.supersetGroup !== groupId) return ex;
        const last = ex.sets[ex.sets.length - 1];
        const seed: Partial<SetEntry> = last
          ? { reps: last.reps, weight: last.weight, unit: last.unit }
          : { unit: defaultUnit };
        return { ...ex, sets: [...ex.sets, newSet(seed)] };
      }),
    );
  };

  const removeRound = (groupId: string, roundIdx: number) => {
    setSaveError(null);
    setExercises((prev) =>
      prev.map((ex) => {
        if (ex.supersetGroup !== groupId) return ex;
        if (ex.sets.length <= 1) return ex;
        return { ...ex, sets: ex.sets.filter((_, i) => i !== roundIdx) };
      }),
    );
  };

  const addSet = (exerciseId: string) => {
    setSaveError(null);
    setExercises((prev) =>
      prev.map((e) => {
        if (e.id !== exerciseId) return e;
        const lastSet = e.sets[e.sets.length - 1];
        const seed: Partial<SetEntry> = lastSet
          ? { reps: lastSet.reps, weight: lastSet.weight, unit: lastSet.unit }
          : { unit: defaultUnit };
        return { ...e, sets: [...e.sets, newSet(seed)] };
      }),
    );
  };

  const updateSet = (
    exerciseId: string,
    setId: string,
    patch: Partial<SetEntry>,
  ) => {
    setSaveError(null);
    setExercises((prev) =>
      prev.map((e) =>
        e.id !== exerciseId
          ? e
          : {
              ...e,
              sets: e.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)),
            },
      ),
    );
  };

  const removeSet = (exerciseId: string, setId: string) => {
    setSaveError(null);
    setExercises((prev) =>
      prev.map((e) =>
        e.id !== exerciseId
          ? e
          : { ...e, sets: e.sets.filter((s) => s.id !== setId) },
      ),
    );
  };

  const canSave = exercises.length > 0;

  const save = () => {
    if (!canSave) return;
    const now = Date.now();
    const workout: Workout = {
      id: workoutId,
      date,
      source,
      exercises,
      planSlot,
      notes: notes.trim() || undefined,
      createdAt: init.isEditing ? (getWorkout(workoutId)?.createdAt ?? now) : now,
      updatedAt: now,
    };
    try {
      upsertWorkout(workout);
      const saved = getWorkout(workoutId);
      if (!saved || saved.updatedAt !== now) {
        throw new Error("Workout did not persist after save.");
      }
      clearLogDraft();
      // Return to the detail page when editing; go home for new entries.
      router.push(init.isEditing ? `/workout/${workoutId}` : "/");
    } catch {
      setSaveError("Save failed. Your workout is still kept in this browser so you can try again.");
    }
  };

  return (
    <div className="mx-auto flex min-h-screen max-w-[480px] flex-col">
      <header className="sticky top-0 z-10 border-b border-divider bg-bg/95 px-4 pt-4 pb-3 backdrop-blur">
        <div className="mb-3 flex items-center justify-between">
          <Link
            href={isEditing ? `/workout/${workoutId}` : "/"}
            className="text-[14px] font-medium text-text-muted"
          >
            ← Back
          </Link>
          <button
            onClick={save}
            disabled={!canSave}
            className="rounded-full bg-text px-4 py-1.5 text-[13px] font-medium text-white disabled:opacity-30"
          >
            Save
          </button>
        </div>
        <h1 className="text-[24px] font-semibold tracking-tight text-text">
          {isEditing ? "Edit workout" : "Log workout"}
        </h1>
        {isEditing && (
          <p className="mt-0.5 text-[12px] text-text-subtle">
            Editing {formatDate(init.date)} — changes saved on tap
          </p>
        )}
        {!isEditing && init.recovered && (
          <p className="mt-0.5 text-[12px] text-text-subtle">
            Restored your in-progress workout draft.
          </p>
        )}
        {saveError && (
          <p className="mt-2 text-[12px] text-[#A13C1B]">
            {saveError}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => {
              setSaveError(null);
              setDate(e.target.value);
            }}
            className="rounded-[10px] border border-[#D3D1C7] bg-white px-3 py-1.5 text-[13px] text-text outline-none"
          />
          <div className="flex rounded-full border border-[#D3D1C7] bg-white p-0.5">
            <button
              onClick={() => {
                setSaveError(null);
                setSource("manual");
              }}
              className={`rounded-full px-3 py-1 text-[12px] font-medium ${
                source === "manual" ? "bg-text text-white" : "text-text-muted"
              }`}
            >
              Structured
            </button>
            <button
              onClick={() => {
                setSaveError(null);
                setSource("class");
              }}
              className={`rounded-full px-3 py-1 text-[12px] font-medium ${
                source === "class" ? "bg-text text-white" : "text-text-muted"
              }`}
            >
              Class
            </button>
          </div>
        </div>

        {muscleSummary.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1">
            {muscleSummary.map((m) => (
              <MuscleTag key={m} muscle={m} />
            ))}
          </div>
        )}
      </header>

      <main className="flex-1 px-4 pt-4 pb-32">
        {exercises.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-[#D3D1C7] p-8 text-center">
            <p className="text-[14px] text-text-subtle">
              No exercises yet. Tap below to add your first one.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {blocks.map((block, blockIdx) => {
            const isSuperset = block.exercises.length > 1;
            const groupColor = groupColorFor(block.groupId, groupOrder);
            const above = blocks[blockIdx - 1];
            const aboveIsGroup = above ? above.exercises.length > 1 : false;
            const linkLabel = aboveIsGroup
              ? "+ Add to superset above"
              : "+ Link as superset";

            return (
              <div key={block.key}>
                {source === "manual" && blockIdx > 0 && (
                  <div className="flex justify-center py-1">
                    <button
                      onClick={() => linkAcross(blockIdx - 1)}
                      className="rounded-full border border-[#E6E3D8] bg-white px-3 py-0.5 text-[10px] font-medium uppercase tracking-wider text-text-muted"
                    >
                      {linkLabel}
                    </button>
                  </div>
                )}

                {isSuperset && groupColor ? (
                  <SupersetBlockView
                    block={block}
                    color={groupColor}
                    onMoveExercise={moveExercise}
                    onRemoveExercise={removeExercise}
                    onBreakGroup={() =>
                      block.groupId && breakGroup(block.groupId)
                    }
                    onAddRound={() =>
                      block.groupId && addRound(block.groupId)
                    }
                    onRemoveRound={(i) =>
                      block.groupId && removeRound(block.groupId, i)
                    }
                    onUpdateSet={updateSet}
                    onUnitChange={setDefaultUnit}
                  />
                ) : (
                  <StandaloneBlockView
                    block={block}
                    totalExercises={exercises.length}
                    onMoveExercise={moveExercise}
                    onRemoveExercise={removeExercise}
                    onAddSet={addSet}
                    onUpdateSet={updateSet}
                    onRemoveSet={removeSet}
                    onUnitChange={setDefaultUnit}
                  />
                )}
              </div>
            );
          })}
        </div>

        {exercises.length > 0 && (
          <div className="mt-4">
            <label className="label-eyebrow mb-1.5 block">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => {
                setSaveError(null);
                setNotes(e.target.value);
              }}
              placeholder="How did it feel?"
              rows={3}
              className="w-full resize-none rounded-[12px] border border-[#E6E3D8] bg-white px-3 py-2 text-[14px] outline-none focus:border-[#888780]"
            />
          </div>
        )}
      </main>

      <div className="fixed bottom-0 left-0 right-0 z-10 mx-auto max-w-[480px] border-t border-divider bg-bg/95 px-4 py-3 backdrop-blur">
        <button
          onClick={() => setPickerOpen(true)}
          className="w-full rounded-full bg-text py-3 text-[14px] font-medium text-white"
        >
          + Add exercise
        </button>
      </div>

      <ExercisePicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onPick={addExercise}
        alreadyAddedCounts={addedCounts}
      />
    </div>
  );
}

// ---------- Standalone block (one exercise, exercise-major sets) ----------

function StandaloneBlockView({
  block,
  totalExercises,
  onMoveExercise,
  onRemoveExercise,
  onAddSet,
  onUpdateSet,
  onRemoveSet,
  onUnitChange,
}: {
  block: Block;
  totalExercises: number;
  onMoveExercise: (id: string, dir: -1 | 1) => void;
  onRemoveExercise: (id: string) => void;
  onAddSet: (id: string) => void;
  onUpdateSet: (exId: string, setId: string, patch: Partial<SetEntry>) => void;
  onRemoveSet: (exId: string, setId: string) => void;
  onUnitChange: (u: WeightUnit) => void;
}) {
  const ex = block.exercises[0];
  const meta = findExercise(ex.exerciseName);
  const isFirst = block.startIndex === 0;
  const isLast = block.startIndex === totalExercises - 1;

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E6E3D8] bg-surface">
      <div className="flex items-start justify-between gap-2 px-4 pt-3 pb-2">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-medium text-text">
            {ex.exerciseName}
          </h3>
          {meta && (
            <div className="mt-1 flex flex-wrap gap-1">
              {meta.primary.map((m) => (
                <MuscleTag key={`p-${m}`} muscle={m} />
              ))}
              {meta.secondary.map((m) => (
                <MuscleTag key={`s-${m}`} muscle={m} faded />
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => onMoveExercise(ex.id, -1)}
            disabled={isFirst}
            className="rounded-md px-1.5 py-1 text-[14px] text-text-subtle disabled:opacity-20"
            aria-label="Move up"
          >
            ↑
          </button>
          <button
            onClick={() => onMoveExercise(ex.id, 1)}
            disabled={isLast}
            className="rounded-md px-1.5 py-1 text-[14px] text-text-subtle disabled:opacity-20"
            aria-label="Move down"
          >
            ↓
          </button>
          <button
            onClick={() => onRemoveExercise(ex.id)}
            className="rounded-md px-1.5 py-1 text-[14px] text-text-subtle"
            aria-label="Remove"
          >
            ×
          </button>
        </div>
      </div>

      <div className="px-4 pb-3">
        <div className="mb-1 grid grid-cols-[28px_1fr_1fr_56px_28px] items-center gap-2 px-1 pt-1 text-[10px] font-medium uppercase tracking-wider text-text-subtle">
          <span>#</span>
          <span>Reps</span>
          <span>Weight</span>
          <span className="text-right">Unit</span>
          <span></span>
        </div>
        {ex.sets.map((s, setIdx) => (
          <div
            key={s.id}
            className="grid grid-cols-[28px_1fr_1fr_56px_28px] items-center gap-2 py-1"
          >
            <span className="font-mono text-[12px] text-text-subtle">
              {setIdx + 1}
            </span>
            <input
              type="number"
              inputMode="numeric"
              placeholder="—"
              value={s.reps ?? ""}
              onChange={(e) =>
                onUpdateSet(ex.id, s.id, {
                  reps: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="w-full rounded-md border border-[#E6E3D8] bg-white px-2 py-1.5 text-center text-[14px] outline-none focus:border-[#888780]"
            />
            <input
              type="number"
              inputMode="decimal"
              step="0.5"
              placeholder="—"
              value={s.weight ?? ""}
              onChange={(e) =>
                onUpdateSet(ex.id, s.id, {
                  weight: e.target.value === "" ? null : Number(e.target.value),
                })
              }
              className="w-full rounded-md border border-[#E6E3D8] bg-white px-2 py-1.5 text-center text-[14px] outline-none focus:border-[#888780]"
            />
            <select
              value={s.unit}
              onChange={(e) => {
                const unit = e.target.value as WeightUnit;
                onUnitChange(unit);
                onUpdateSet(ex.id, s.id, { unit });
              }}
              className="w-full rounded-md border border-[#E6E3D8] bg-white px-1 py-1.5 text-center text-[12px] outline-none"
            >
              <option value="lb">lb</option>
              <option value="kg">kg</option>
            </select>
            <button
              onClick={() => onRemoveSet(ex.id, s.id)}
              disabled={ex.sets.length === 1}
              className="text-[14px] text-text-subtle disabled:opacity-20"
              aria-label="Remove set"
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => onAddSet(ex.id)}
          className="mt-2 w-full rounded-lg border border-dashed border-[#D3D1C7] py-1.5 text-[12px] font-medium text-text-muted"
        >
          + Add set
        </button>
      </div>
    </div>
  );
}

// ---------- Superset block (round-major) ----------

function SupersetBlockView({
  block,
  color,
  onMoveExercise,
  onRemoveExercise,
  onBreakGroup,
  onAddRound,
  onRemoveRound,
  onUpdateSet,
  onUnitChange,
}: {
  block: Block;
  color: ColorPair;
  onMoveExercise: (id: string, dir: -1 | 1) => void;
  onRemoveExercise: (id: string) => void;
  onBreakGroup: () => void;
  onAddRound: () => void;
  onRemoveRound: (i: number) => void;
  onUpdateSet: (exId: string, setId: string, patch: Partial<SetEntry>) => void;
  onUnitChange: (u: WeightUnit) => void;
}) {
  const lanes = block.exercises;
  const rounds = block.rounds;

  return (
    <div
      className="overflow-hidden rounded-2xl border bg-surface"
      style={{ borderColor: color.text, borderLeftWidth: 4 }}
    >
      {/* Group header */}
      <div
        className="flex items-center justify-between px-4 py-2"
        style={{ background: color.bg, color: color.text }}
      >
        <span className="text-[10px] font-medium uppercase tracking-wider">
          Superset · {lanes.length} exercise{lanes.length !== 1 ? "s" : ""} ·{" "}
          {rounds} round{rounds !== 1 ? "s" : ""}
        </span>
        <button
          onClick={onBreakGroup}
          className="text-[10px] font-medium uppercase tracking-wider opacity-70"
        >
          Break
        </button>
      </div>

      {/* Lanes (one per exercise, with reorder/remove) */}
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
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-[14px] font-medium text-text">
                  {ex.exerciseName}
                </h3>
                {meta && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {meta.primary.map((m) => (
                      <MuscleTag key={`p-${m}`} muscle={m} />
                    ))}
                  </div>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={() => onMoveExercise(ex.id, -1)}
                  disabled={i === 0}
                  className="rounded-md px-1.5 py-1 text-[14px] text-text-subtle disabled:opacity-20"
                  aria-label="Move up"
                >
                  ↑
                </button>
                <button
                  onClick={() => onMoveExercise(ex.id, 1)}
                  disabled={i === lanes.length - 1}
                  className="rounded-md px-1.5 py-1 text-[14px] text-text-subtle disabled:opacity-20"
                  aria-label="Move down"
                >
                  ↓
                </button>
                <button
                  onClick={() => onRemoveExercise(ex.id)}
                  className="rounded-md px-1.5 py-1 text-[14px] text-text-subtle"
                  aria-label="Remove"
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Rounds */}
      <div className="border-t border-divider px-4 pt-3 pb-3">
        {Array.from({ length: rounds }).map((_, roundIdx) => (
          <div key={roundIdx} className="mb-3 last:mb-0">
            <div className="mb-1 flex items-center justify-between">
              <span className="label-eyebrow">Round {roundIdx + 1}</span>
              <button
                onClick={() => onRemoveRound(roundIdx)}
                disabled={rounds <= 1}
                className="text-[10px] font-medium uppercase tracking-wider text-text-subtle disabled:opacity-20"
              >
                Remove round
              </button>
            </div>
            <div className="space-y-1">
              {lanes.map((ex, i) => {
                const set = ex.sets[roundIdx];
                if (!set) return null;
                return (
                  <div
                    key={ex.id}
                    className="grid grid-cols-[20px_1fr_1fr_56px] items-center gap-2"
                  >
                    <span
                      className="text-[11px] font-semibold"
                      style={{ color: color.text }}
                    >
                      {String.fromCharCode(65 + i)}
                    </span>
                    <input
                      type="number"
                      inputMode="numeric"
                      placeholder="reps"
                      value={set.reps ?? ""}
                      onChange={(e) =>
                        onUpdateSet(ex.id, set.id, {
                          reps:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      className="w-full rounded-md border border-[#E6E3D8] bg-white px-2 py-1.5 text-center text-[14px] outline-none focus:border-[#888780]"
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.5"
                      placeholder="weight"
                      value={set.weight ?? ""}
                      onChange={(e) =>
                        onUpdateSet(ex.id, set.id, {
                          weight:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                      className="w-full rounded-md border border-[#E6E3D8] bg-white px-2 py-1.5 text-center text-[14px] outline-none focus:border-[#888780]"
                    />
                    <select
                      value={set.unit}
                      onChange={(e) => {
                        const unit = e.target.value as WeightUnit;
                        onUnitChange(unit);
                        onUpdateSet(ex.id, set.id, { unit });
                      }}
                      className="w-full rounded-md border border-[#E6E3D8] bg-white px-1 py-1.5 text-center text-[12px] outline-none"
                    >
                      <option value="lb">lb</option>
                      <option value="kg">kg</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        <button
          onClick={onAddRound}
          className="mt-1 w-full rounded-lg border border-dashed border-[#D3D1C7] py-1.5 text-[12px] font-medium text-text-muted"
        >
          + Add round
        </button>
      </div>
    </div>
  );
}
