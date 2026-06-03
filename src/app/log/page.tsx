"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { ExercisePicker } from "@/components/ExercisePicker";
import { InputClearButton } from "@/components/InputClearButton";
import { MuscleTag } from "@/components/MuscleTag";
import { formatExerciseEquipment, getExerciseCoaching } from "@/lib/exerciseCoaching";
import { findExercise } from "@/lib/exercises";
import { movementOf } from "@/lib/movement";
import { SUPERSET_COLORS } from "@/lib/colors";
import { formatDate, todayISO, uid } from "@/lib/format";
import { popDraft } from "@/lib/generator";
import { evaluateProgressionStatus } from "@/lib/progression";
import { getWorkout, loadWorkouts, popEditWorkout, upsertWorkout } from "@/lib/storage";
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
  kind: "single" | "superset";
  groupId: string | null;
  routineGroup:
    | {
        id: string;
        kind: "set";
        rounds: number;
        repScheme: string;
      }
    | null;
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
  let activeSetGroup:
    | {
        id: string;
        kind: "set";
        rounds: number;
        repScheme: string;
      }
    | null = null;
  for (const sec of draft.sections) {
    if (sec.kind === "compound" || sec.kind === "accessory") {
      activeSetGroup ??= {
        id: uid("set"),
        kind: "set",
        rounds: sec.rounds,
        repScheme: sec.repScheme,
      };
    } else {
      activeSetGroup = null;
    }
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
        supersetGroup:
          groupId ?? (sec.kind === "compound" || sec.kind === "accessory" ? activeSetGroup?.id ?? null : null),
        routineGroup: activeSetGroup,
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
  pendingDraft: WorkoutDraft | null;
  notes: string;
  isEditing: boolean;
  recovered: boolean;
};

const LOG_DRAFT_KEY = "workout.log-draft.v1";

const normalizeWorkoutSource = (source: WorkoutSource): WorkoutSource => {
  void source;
  return "manual";
};

type LogDraftSnapshot = {
  workoutId: string;
  date: string;
  source: WorkoutSource;
  exercises: ExerciseLog[];
  planSlot: Workout["planSlot"];
  pendingDraft: WorkoutDraft | null;
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
    pendingDraft: null,
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
      source: normalizeWorkoutSource(editWorkout.source),
      exercises: editWorkout.exercises,
      planSlot: editWorkout.planSlot,
      pendingDraft: null,
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
      source: normalizeWorkoutSource(pending.source),
      exercises: hydrateDraft(pending.draft),
      planSlot: {
        slotId: pending.draft.split.slotId,
        title: pending.draft.split.title,
      },
      pendingDraft: pending.draft,
    };
  }

  const savedDraft = loadLogDraft();
  if (savedDraft) {
    return {
      workoutId: savedDraft.workoutId,
      date: savedDraft.date,
      source: normalizeWorkoutSource(savedDraft.source),
      exercises: savedDraft.exercises,
      planSlot: savedDraft.planSlot,
      pendingDraft: savedDraft.pendingDraft,
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
    const effectiveGroupId =
      ex.supersetGroup ??
      (ex.routineGroup?.kind === "set" ? ex.routineGroup.id : null);
    const last = blocks[blocks.length - 1];
    if (last && effectiveGroupId && last.kind === "superset" && last.groupId === effectiveGroupId) {
      last.exercises.push(ex);
    } else {
      blocks.push({
        key: ex.id,
        kind: effectiveGroupId ? "superset" : "single",
        groupId: effectiveGroupId,
        routineGroup: ex.routineGroup ?? null,
        exercises: [ex],
        startIndex: i,
        rounds: ex.sets.length,
      });
    }
  });
  for (const b of blocks) {
    b.rounds =
      b.routineGroup
        ? b.routineGroup.rounds
        : Math.max(...b.exercises.map((e) => e.sets.length));
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

const noopSubscribe = (): (() => void) => () => {};
const getClientHydrated = (): boolean => true;
const getServerHydrated = (): boolean => false;

export default function LogPage() {
  const router = useRouter();
  const hydrated = useSyncExternalStore(noopSubscribe, getClientHydrated, getServerHydrated);
  const [init] = useState(resolveInitialState);
  const [workoutId] = useState(init.workoutId);
  const [date, setDate] = useState(init.date);
  const [exercises, setExercises] = useState<ExerciseLog[]>(init.exercises);
  const [planSlot, setPlanSlot] = useState(init.planSlot);
  const [pendingDraft, setPendingDraft] = useState<WorkoutDraft | null>(init.pendingDraft);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [guideExerciseName, setGuideExerciseName] = useState<string | null>(null);
  const [swapExerciseId, setSwapExerciseId] = useState<string | null>(null);
  const [notes, setNotes] = useState(init.notes);
  const isEditing = init.isEditing;
  const [defaultUnit, setDefaultUnit] = useState<WeightUnit>(() => {
    const savedDraft = loadLogDraft();
    return savedDraft?.defaultUnit ?? "lb";
  });
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!hydrated || !workoutId) return;
    if (!isEditing && exercises.length === 0 && !pendingDraft && notes.trim() === "") {
      clearLogDraft();
      return;
    }
    saveLogDraft({
      workoutId,
      date,
      source: "manual",
      exercises,
      planSlot,
      pendingDraft,
      notes,
      isEditing,
      defaultUnit,
    });
  }, [hydrated, workoutId, date, exercises, planSlot, pendingDraft, notes, isEditing, defaultUnit]);

  useEffect(() => {
    if (isEditing) return;
    if (exercises.length > 0) return;
    if (!pendingDraft && !planSlot) return;
    setPendingDraft(null);
    setPlanSlot(undefined);
    clearLogDraft();
  }, [isEditing, exercises.length, pendingDraft, planSlot]);

  const blocks = useMemo(() => buildBlocks(exercises), [exercises]);

  const groupOrder = useMemo(
    () =>
      Array.from(
        new Set(
          exercises
            .map((e) => e.supersetGroup ?? (e.routineGroup?.kind === "set" ? e.routineGroup.id : null))
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

  const selectedGuideExercise = useMemo(
    () => (guideExerciseName ? findExercise(guideExerciseName) ?? null : null),
    [guideExerciseName],
  );

  const addExercise = (name: string) => {
    setSaveError(null);
    setExercises((prev) => [...prev, newExerciseLog(name)]);
  };

  const swapExercise = (exerciseId: string, exerciseName: string) => {
    setSaveError(null);
    setExercises((prev) =>
      prev.map((exercise) =>
        exercise.id !== exerciseId
          ? exercise
          : {
              ...exercise,
              exerciseName,
            },
      ),
    );
  };

  const removeExercise = (id: string) => {
    setSaveError(null);
    setExercises((prev) => prev.filter((e) => e.id !== id));
  };

  const removeExerciseByName = (exerciseName: string) => {
    setSaveError(null);
    setExercises((prev) => {
      const idx = prev.map((exercise) => exercise.exerciseName).lastIndexOf(exerciseName);
      if (idx < 0) return prev;
      return prev.filter((_, exerciseIdx) => exerciseIdx !== idx);
    });
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
  const canSwapExercises = isEditing || pendingDraft !== null;

  const clearDraftState = () => {
    if (isEditing) return;
    setSaveError(null);
    setExercises([]);
    setNotes("");
    setPendingDraft(null);
    setPlanSlot(undefined);
    clearLogDraft();
  };

  const save = () => {
    if (!hydrated || !canSave) return;
    const now = Date.now();
    const existingCreatedAt = isEditing ? (getWorkout(workoutId)?.createdAt ?? now) : now;
    const allWorkoutsForProgression = loadWorkouts();
    const workout: Workout = {
      id: workoutId,
      date,
      source: "manual",
      exercises: exercises.map((exercise) => ({
        ...exercise,
        progressionStatus: evaluateProgressionStatus(
          exercise.exerciseName,
          exercise.sets,
          allWorkoutsForProgression,
          isEditing ? workoutId : undefined,
        ),
      })),
      planSlot,
      notes: notes.trim() || undefined,
      createdAt: existingCreatedAt,
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
      router.push(isEditing ? `/workout/${workoutId}` : "/");
    } catch {
      setSaveError("Save failed. Your workout is still kept in this browser so you can try again.");
    }
  };

  if (!hydrated) {
    return (
      <div className="mx-auto flex min-h-screen max-w-[480px] flex-col px-4 pt-6">
        <div className="rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-5 text-[13px] text-text-subtle">
          Loading workout…
        </div>
      </div>
    );
  }

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
          <div className="mt-1 flex items-center justify-between gap-3">
            <p className="text-[12px] text-text-subtle">
              Restored your in-progress workout draft.
            </p>
            <button
              onClick={clearDraftState}
              className="shrink-0 rounded-full border border-[#E6E3D8] px-2.5 py-0.5 text-[10px] font-medium text-text-muted"
            >
              Clear draft
            </button>
          </div>
        )}
        {!isEditing && !init.recovered && pendingDraft && (
          <div className="mt-1 flex justify-end">
            <button
              onClick={clearDraftState}
              className="rounded-full border border-[#E6E3D8] px-2.5 py-0.5 text-[10px] font-medium text-text-muted"
            >
              Clear draft
            </button>
          </div>
        )}
        {saveError && (
          <p className="mt-2 text-[12px] text-[#A13C1B]">
            {saveError}
          </p>
        )}

        <div className="mt-3 flex items-center gap-2">
          <div className="relative">
            <input
              type="date"
              value={date}
              onChange={(e) => {
                setSaveError(null);
                setDate(e.target.value);
              }}
              className="rounded-[10px] border border-[#D3D1C7] bg-white px-3 py-1.5 pr-10 text-[13px] text-text outline-none"
            />
            {date && (
              <InputClearButton
                onClear={() => {
                  setSaveError(null);
                  setDate("");
                }}
                label="Clear workout date"
              />
            )}
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
        {pendingDraft?.mobility && (
          <PrepCard
            title={pendingDraft.mobility.title}
            eyebrow="Before you lift"
            items={pendingDraft.mobility.items}
            complementary={pendingDraft.mobility.complementary ?? []}
          />
        )}

        {exercises.length === 0 && (
          <div className="mt-8 rounded-2xl border border-dashed border-[#D3D1C7] p-8 text-center">
            <p className="text-[14px] text-text-subtle">
              No exercises yet. Tap below to add your first one.
            </p>
          </div>
        )}

        <div className="space-y-3">
          {blocks.map((block, blockIdx) => {
            const isSuperset = block.kind === "superset";
            const groupColor = groupColorFor(block.groupId, groupOrder);
            const above = blocks[blockIdx - 1];
            const aboveIsGroup = above ? above.kind === "superset" : false;
            const linkLabel = aboveIsGroup
              ? "+ Add to superset above"
              : "+ Link as superset";

            return (
              <div key={block.key}>
                {blockIdx > 0 && (
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
                    canSwapExercise={canSwapExercises}
                    onMoveExercise={moveExercise}
                    onRemoveExercise={removeExercise}
                    onOpenGuide={(exerciseName) => setGuideExerciseName(exerciseName)}
                    onSwapExercise={(exerciseId) => setSwapExerciseId(exerciseId)}
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
                    canSwapExercise={canSwapExercises}
                    onMoveExercise={moveExercise}
                    onRemoveExercise={removeExercise}
                    onAddSet={addSet}
                    onOpenGuide={(exerciseName) => setGuideExerciseName(exerciseName)}
                    onSwapExercise={(exerciseId) => setSwapExerciseId(exerciseId)}
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
            <div className="relative">
              <textarea
                value={notes}
                onChange={(e) => {
                  setSaveError(null);
                  setNotes(e.target.value);
                }}
                placeholder="How did it feel?"
                rows={3}
                className="w-full resize-none rounded-[12px] border border-[#E6E3D8] bg-white px-3 py-2 pr-12 text-[14px] outline-none focus:border-[#888780]"
              />
              {notes && (
                <InputClearButton
                  onClear={() => {
                    setSaveError(null);
                    setNotes("");
                  }}
                  label="Clear workout notes"
                  className="right-3 top-3 -translate-y-0"
                />
              )}
            </div>
          </div>
        )}

        {pendingDraft?.cooldown && (
          <PrepCard
            title={pendingDraft.cooldown.title}
            eyebrow="After you finish"
            items={pendingDraft.cooldown.items}
            complementary={pendingDraft.cooldown.complementary ?? []}
          />
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
        open={pickerOpen || swapExerciseId !== null}
        onClose={() => {
          setPickerOpen(false);
          setSwapExerciseId(null);
        }}
        onPick={(exerciseName) => {
          if (swapExerciseId) {
            swapExercise(swapExerciseId, exerciseName);
            setSwapExerciseId(null);
            return;
          }
          addExercise(exerciseName);
        }}
        onRemove={swapExerciseId ? undefined : removeExerciseByName}
        alreadyAddedCounts={addedCounts}
      />

      <ExerciseGuideSheet
        exercise={selectedGuideExercise}
        onClose={() => setGuideExerciseName(null)}
      />
    </div>
  );
}

// ---------- Standalone block (one exercise, exercise-major sets) ----------

function StandaloneBlockView({
  block,
  totalExercises,
  canSwapExercise,
  onMoveExercise,
  onRemoveExercise,
  onAddSet,
  onOpenGuide,
  onSwapExercise,
  onUpdateSet,
  onRemoveSet,
  onUnitChange,
}: {
  block: Block;
  totalExercises: number;
  canSwapExercise: boolean;
  onMoveExercise: (id: string, dir: -1 | 1) => void;
  onRemoveExercise: (id: string) => void;
  onAddSet: (id: string) => void;
  onOpenGuide: (exerciseName: string) => void;
  onSwapExercise: (exerciseId: string) => void;
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
      <ExerciseEditor
        ex={ex}
        meta={meta}
        canSwapExercise={canSwapExercise}
        isFirst={isFirst}
        isLast={isLast}
        onMoveExercise={onMoveExercise}
        onRemoveExercise={onRemoveExercise}
        onAddSet={onAddSet}
        onOpenGuide={onOpenGuide}
        onSwapExercise={onSwapExercise}
        onUpdateSet={onUpdateSet}
        onRemoveSet={onRemoveSet}
        onUnitChange={onUnitChange}
      />
    </div>
  );
}

function ExerciseEditor({
  ex,
  meta,
  canSwapExercise,
  isFirst,
  isLast,
  onMoveExercise,
  onRemoveExercise,
  onAddSet,
  onOpenGuide,
  onSwapExercise,
  onUpdateSet,
  onRemoveSet,
  onUnitChange,
}: {
  ex: ExerciseLog;
  meta: ReturnType<typeof findExercise>;
  canSwapExercise: boolean;
  isFirst: boolean;
  isLast: boolean;
  onMoveExercise: (id: string, dir: -1 | 1) => void;
  onRemoveExercise: (id: string) => void;
  onAddSet: (id: string) => void;
  onOpenGuide: (exerciseName: string) => void;
  onSwapExercise: (exerciseId: string) => void;
  onUpdateSet: (exId: string, setId: string, patch: Partial<SetEntry>) => void;
  onRemoveSet: (exId: string, setId: string) => void;
  onUnitChange: (u: WeightUnit) => void;
}) {
  return (
    <>
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
          {canSwapExercise && (
            <button
              onClick={() => onSwapExercise(ex.id)}
              className="rounded-full border border-[#E6E3D8] px-2.5 py-0.5 text-[10px] font-medium text-text-muted"
            >
              Swap
            </button>
          )}
          <button
            onClick={() => onOpenGuide(ex.exerciseName)}
            className="rounded-full border border-[#E6E3D8] px-2.5 py-0.5 text-[10px] font-medium text-text-muted"
          >
            How
          </button>
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
            <div className="relative">
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
                className="w-full rounded-md border border-[#E6E3D8] bg-white px-2 py-1.5 pr-7 text-center text-[14px] outline-none focus:border-[#888780]"
              />
              {s.reps !== null && (
                <InputClearButton
                  onClear={() => onUpdateSet(ex.id, s.id, { reps: null })}
                  label={`Clear reps for set ${setIdx + 1}`}
                  className="right-1 h-5 w-5 text-[12px]"
                />
              )}
            </div>
            <div className="relative">
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
                className="w-full rounded-md border border-[#E6E3D8] bg-white px-2 py-1.5 pr-7 text-center text-[14px] outline-none focus:border-[#888780]"
              />
              {s.weight !== null && (
                <InputClearButton
                  onClear={() => onUpdateSet(ex.id, s.id, { weight: null })}
                  label={`Clear weight for set ${setIdx + 1}`}
                  className="right-1 h-5 w-5 text-[12px]"
                />
              )}
            </div>
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
    </>
  );
}

function groupLabel(exercises: ExerciseLog[]): string {
  const exs = exercises.map((e) => findExercise(e.exerciseName));

  if (exercises.length >= 3) {
    const hasConditioning = exs.some(
      (ex) => ex?.pattern === "conditioning" || ex?.pattern === "plyo"
    );
    return hasConditioning ? "Conditioning circuit" : "Circuit";
  }

  const [a, b] = exs.map((ex) => (ex ? movementOf(ex) : null));
  const isUpper = (m: typeof a) => m === "push" || m === "pull";
  const isLower = (m: typeof a) => m === "squat" || m === "hinge" || m === "single_leg";

  if (a === "push" && b === "pull") return "Push / pull pair";
  if (a === "pull" && b === "push") return "Push / pull pair";
  if ((isUpper(a) && isLower(b)) || (isLower(a) && isUpper(b))) return "Upper / lower pair";
  if (a && b && a === b) return "Superset";
  return "Strength pair";
}

// ---------- Superset block (round-major) ----------

function SupersetBlockView({
  block,
  color,
  canSwapExercise,
  onMoveExercise,
  onRemoveExercise,
  onOpenGuide,
  onSwapExercise,
  onBreakGroup,
  onAddRound,
  onRemoveRound,
  onUpdateSet,
  onUnitChange,
}: {
  block: Block;
  color: ColorPair;
  canSwapExercise: boolean;
  onMoveExercise: (id: string, dir: -1 | 1) => void;
  onRemoveExercise: (id: string) => void;
  onOpenGuide: (exerciseName: string) => void;
  onSwapExercise: (exerciseId: string) => void;
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
        <div className="min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider">
            {groupLabel(lanes)} · {lanes.length} exercise{lanes.length !== 1 ? "s" : ""} ·{" "}
            {rounds} round{rounds !== 1 ? "s" : ""}
          </span>
          {block.routineGroup?.repScheme && (
            <div className="mt-0.5 text-[10px] opacity-80">
              {block.routineGroup.repScheme}
            </div>
          )}
        </div>
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
                {canSwapExercise && (
                  <button
                    onClick={() => onSwapExercise(ex.id)}
                    className="rounded-full border border-[#E6E3D8] px-2.5 py-0.5 text-[10px] font-medium text-text-muted"
                  >
                    Swap
                  </button>
                )}
                <button
                  onClick={() => onOpenGuide(ex.exerciseName)}
                  className="rounded-full border border-[#E6E3D8] px-2.5 py-0.5 text-[10px] font-medium text-text-muted"
                >
                  How
                </button>
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
                    <div className="relative">
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
                        className="w-full rounded-md border border-[#E6E3D8] bg-white px-2 py-1.5 pr-7 text-center text-[14px] outline-none focus:border-[#888780]"
                      />
                      {set.reps !== null && (
                        <InputClearButton
                          onClear={() => onUpdateSet(ex.id, set.id, { reps: null })}
                          label={`Clear reps for round ${roundIdx + 1}, ${ex.exerciseName}`}
                          className="right-1 h-5 w-5 text-[12px]"
                        />
                      )}
                    </div>
                    <div className="relative">
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
                        className="w-full rounded-md border border-[#E6E3D8] bg-white px-2 py-1.5 pr-7 text-center text-[14px] outline-none focus:border-[#888780]"
                      />
                      {set.weight !== null && (
                        <InputClearButton
                          onClear={() => onUpdateSet(ex.id, set.id, { weight: null })}
                          label={`Clear weight for round ${roundIdx + 1}, ${ex.exerciseName}`}
                          className="right-1 h-5 w-5 text-[12px]"
                        />
                      )}
                    </div>
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

function PrepCard({
  title,
  eyebrow,
  items,
  complementary,
}: {
  title: string;
  eyebrow: string;
  items: string[];
  complementary: string[];
}) {
  return (
    <section className="mb-4 rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-3">
      <p className="label-eyebrow">{eyebrow}</p>
      <div className="mt-1 flex items-center justify-between gap-3">
        <h2 className="text-[16px] font-medium text-text">{title}</h2>
      </div>
      <ul className="mt-2 space-y-1">
        {items.map((item) => (
          <li key={item} className="text-[13px] leading-snug text-text">
            · {item}
          </li>
        ))}
      </ul>
      {complementary.length > 0 && (
        <div className="mt-2 border-t border-divider pt-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-subtle">
            Complementary mobility
          </p>
          <ul className="mt-1 space-y-1">
            {complementary.map((item) => (
              <li key={item} className="text-[12px] leading-snug text-text-muted">
                · {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ExerciseGuideSheet({
  exercise,
  onClose,
}: {
  exercise: NonNullable<ReturnType<typeof findExercise>> | null;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!exercise) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [exercise]);

  if (!exercise) return null;

  const coaching = getExerciseCoaching(exercise);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(26, 26, 24, 0.4)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[480px] flex-col rounded-t-2xl bg-surface"
        style={{ height: "88vh" }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-[#D3D1C7]" />
        </div>

        <div className="flex items-center justify-between px-4 pt-2 pb-3">
          <div>
            <h2 className="text-[18px] font-semibold tracking-tight text-text">
              How to do this exercise
            </h2>
            <p className="mt-1 text-[12px] text-text-subtle">
              Quick setup and form cues for this lift.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[14px] font-medium text-text-muted"
          >
            Done
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-8">
          <section className="rounded-2xl border border-[#E6E3D8] bg-white px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-[15px] font-medium text-text">
                  {exercise.name}
                </h3>
                <p className="mt-1 text-[12px] text-text-subtle">
                  {formatExerciseEquipment(exercise)} · {exercise.pattern}
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1">
                {exercise.primary.map((muscle) => (
                  <MuscleTag key={`${exercise.name}-${muscle}`} muscle={muscle} />
                ))}
              </div>
            </div>

            <dl className="mt-3 space-y-3">
              <GuideRow label="Works" value={coaching.works} />
              <GuideRow label="Setup" value={coaching.setup} />
              <GuideList label="Cues" items={coaching.cues} />
              <GuideList label="Avoid" items={coaching.mistakes} />
              <GuideRow label="Why it's here" value={coaching.why} />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function GuideRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="label-eyebrow">{label}</dt>
      <dd className="mt-1 text-[13px] leading-relaxed text-text">{value}</dd>
    </div>
  );
}

function GuideList({ label, items }: { label: string; items: string[] }) {
  return (
    <div>
      <dt className="label-eyebrow">{label}</dt>
      <dd className="mt-1 space-y-1">
        {items.map((item) => (
          <p key={item} className="text-[13px] leading-relaxed text-text">
            · {item}
          </p>
        ))}
      </dd>
    </div>
  );
}
