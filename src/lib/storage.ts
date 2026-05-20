"use client";

import { useSyncExternalStore } from "react";
import { canonicalExerciseName } from "./exercises";
import type { Workout } from "./types";

const STORAGE_KEY = "workout.workouts.v1";
const CHANGE_EVENT = "workouts:changed";

const isBrowser = (): boolean => typeof window !== "undefined";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const isWeightUnit = (value: unknown): value is "lb" | "kg" =>
  value === "lb" || value === "kg";

const isWorkoutSource = (value: unknown): value is Workout["source"] =>
  value === "manual" || value === "class";

const isProgressionStatus = (
  value: unknown,
): value is NonNullable<Workout["exercises"][number]["progressionStatus"]> =>
  value === "progressed" ||
  value === "held" ||
  value === "missed" ||
  value === "baseline";

const isNonNullable = <T>(value: T | null): value is T => value !== null;

const parseNumericField = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value)
    ? value
    : typeof value === "string" && value.trim() !== "" && Number.isFinite(Number(value))
      ? Number(value)
      : null;

const slotIdFromTitle = (title: string): string => {
  const normalized = title.trim().toLowerCase();
  const known = new Map<string, string>([
    ["lower a", "lower_a"],
    ["upper a", "upper_back_shoulder"],
    ["lower b", "lower_b"],
    ["upper b", "upper_back_shoulder_arms"],
  ]);
  return known.get(normalized) ?? normalized.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
};

const isFlattenedImportRow = (
  value: unknown,
): value is Record<string, unknown> & {
  workout_id: unknown;
  exercise: unknown;
} =>
  isRecord(value) &&
  "workout_id" in value &&
  "exercise" in value;

const normalizeSets = (
  raw: unknown,
  exerciseId: string,
): Workout["exercises"][number]["sets"] =>
  Array.isArray(raw)
    ? raw
        .map((entry, index) => {
          if (!isRecord(entry)) return null;
          const id =
            typeof entry.id === "string" && entry.id.trim()
              ? entry.id
              : `${exerciseId}-set-${index + 1}`;
          return {
            id,
            reps: typeof entry.reps === "number" && Number.isFinite(entry.reps) ? entry.reps : null,
            weight:
              typeof entry.weight === "number" && Number.isFinite(entry.weight) ? entry.weight : null,
            unit: isWeightUnit(entry.unit) ? entry.unit : "lb",
            durationSec:
              typeof entry.durationSec === "number" && Number.isFinite(entry.durationSec)
                ? entry.durationSec
                : null,
            distanceM:
              typeof entry.distanceM === "number" && Number.isFinite(entry.distanceM)
                ? entry.distanceM
                : null,
          };
        })
        .filter(isNonNullable)
    : [];

const normalizeExercises = (
  raw: unknown,
  workoutId: string,
): Workout["exercises"] =>
  Array.isArray(raw)
    ? raw
        .map((entry, index) => {
          if (!isRecord(entry) || typeof entry.exerciseName !== "string" || !entry.exerciseName.trim()) {
            return null;
          }
          const id =
            typeof entry.id === "string" && entry.id.trim()
              ? entry.id
              : `${workoutId}-ex-${index + 1}`;
          return {
            id,
            exerciseName: canonicalExerciseName(entry.exerciseName),
            sets: normalizeSets(entry.sets, id),
            supersetGroup: typeof entry.supersetGroup === "string" ? entry.supersetGroup : null,
            routineGroup:
              isRecord(entry.routineGroup) &&
              typeof entry.routineGroup.id === "string" &&
              entry.routineGroup.kind === "set" &&
              typeof entry.routineGroup.rounds === "number" &&
              typeof entry.routineGroup.repScheme === "string"
                ? {
                    id: entry.routineGroup.id,
                    kind: "set" as const,
                    rounds: entry.routineGroup.rounds,
                    repScheme: entry.routineGroup.repScheme,
                  }
                : null,
            progressionStatus: isProgressionStatus(entry.progressionStatus)
              ? entry.progressionStatus
              : undefined,
            notes: typeof entry.notes === "string" ? entry.notes : undefined,
          };
        })
        .filter(isNonNullable)
    : [];

const normalizeWorkout = (raw: unknown, index: number): Workout | null => {
  if (!isRecord(raw) || typeof raw.date !== "string" || !Array.isArray(raw.exercises)) {
    return null;
  }
  const workoutId =
    typeof raw.id === "string" && raw.id.trim() ? raw.id : `imported-workout-${index + 1}`;
  const exercises = normalizeExercises(raw.exercises, workoutId);
  if (exercises.length === 0) return null;

  const createdAt =
    typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
      ? raw.createdAt
      : Date.now() + index;
  const updatedAt =
    typeof raw.updatedAt === "number" && Number.isFinite(raw.updatedAt)
      ? raw.updatedAt
      : createdAt;

  return {
    id: workoutId,
    date: raw.date,
    source: isWorkoutSource(raw.source) ? raw.source : "manual",
    exercises,
    planSlot:
      isRecord(raw.planSlot) &&
      typeof raw.planSlot.slotId === "string" &&
      typeof raw.planSlot.title === "string"
        ? { slotId: raw.planSlot.slotId, title: raw.planSlot.title }
        : undefined,
    notes: typeof raw.notes === "string" ? raw.notes : undefined,
    createdAt,
    updatedAt,
  };
};

export const normalizeWorkouts = (raw: unknown): Workout[] =>
  Array.isArray(raw)
    ? raw.every(isFlattenedImportRow)
      ? normalizeFlattenedWorkouts(raw)
      : raw
          .map((entry, index) => normalizeWorkout(entry, index))
          .filter((entry): entry is Workout => Boolean(entry))
    : [];

const normalizeFlattenedWorkouts = (
  rows: Array<Record<string, unknown> & { workout_id: unknown; exercise: unknown }>,
): Workout[] => {
  const groupedWorkouts = new Map<string, typeof rows>();

  rows.forEach((row) => {
    const workoutId =
      typeof row.workout_id === "string" && row.workout_id.trim()
        ? row.workout_id
        : null;
    if (!workoutId) return;
    const bucket = groupedWorkouts.get(workoutId) ?? [];
    bucket.push(row);
    groupedWorkouts.set(workoutId, bucket);
  });

  return [...groupedWorkouts.entries()].map(([workoutId, workoutRows], workoutIndex) => {
    const firstRow = workoutRows[0];
    const date = typeof firstRow.date === "string" ? firstRow.date : "";
    const source = isWorkoutSource(firstRow.source) ? firstRow.source : "manual";
    const notes = typeof firstRow.workout_notes === "string" && firstRow.workout_notes.trim()
      ? firstRow.workout_notes
      : undefined;
    const planSlotTitle =
      typeof firstRow.plan_slot === "string" && firstRow.plan_slot.trim()
        ? firstRow.plan_slot.trim()
        : "";

    const groupedExercises = new Map<string, typeof workoutRows>();
    workoutRows.forEach((row) => {
      const exerciseName =
        typeof row.exercise === "string" && row.exercise.trim()
          ? canonicalExerciseName(row.exercise)
          : null;
      if (!exerciseName) return;
      const bucket = groupedExercises.get(exerciseName) ?? [];
      bucket.push(row);
      groupedExercises.set(exerciseName, bucket);
    });

    const exercises = [...groupedExercises.entries()].map(([exerciseName, exerciseRows], exerciseIndex) => {
      const exerciseId = `${workoutId}-ex-${exerciseIndex + 1}`;
      const sortedRows = [...exerciseRows].sort((a, b) => {
        const aSet = parseNumericField(a.set_number) ?? 0;
        const bSet = parseNumericField(b.set_number) ?? 0;
        return aSet - bSet;
      });
      const progressionRow = [...sortedRows]
        .reverse()
        .find((row) => isProgressionStatus(row.progression_status));

      return {
        id: exerciseId,
        exerciseName,
        supersetGroup: null,
        progressionStatus: progressionRow?.progression_status as Workout["exercises"][number]["progressionStatus"],
        notes: undefined,
        sets: sortedRows.map((row, setIndex) => ({
          id: `${exerciseId}-set-${setIndex + 1}`,
          reps: parseNumericField(row.reps),
          weight: parseNumericField(row.weight),
          unit: isWeightUnit(row.unit) ? row.unit : "lb",
          durationSec: parseNumericField(row.duration_sec),
          distanceM: parseNumericField(row.distance_m),
        })),
      };
    });

    const createdAt = Date.now() + workoutIndex;
    return {
      id: workoutId,
      date,
      source,
      exercises,
      planSlot: planSlotTitle
        ? {
            slotId: slotIdFromTitle(planSlotTitle),
            title: planSlotTitle,
          }
        : undefined,
      notes,
      createdAt,
      updatedAt: createdAt,
    };
  }).filter((workout) => workout.date && workout.exercises.length > 0);
};

const safeParse = (raw: string | null): Workout[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return normalizeWorkouts(parsed);
  } catch {
    return [];
  }
};

export const loadWorkouts = (): Workout[] => {
  if (!isBrowser()) return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
};

export const saveWorkouts = (workouts: Workout[]): void => {
  if (!isBrowser()) return;
  const normalized = normalizeWorkouts(workouts);
  cachedSnapshot = normalized;
  snapshotInitialized = true;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  // Notify other hook instances in the same tab.
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
};

export const upsertWorkout = (workout: Workout): Workout[] => {
  const all = loadWorkouts();
  const idx = all.findIndex((w) => w.id === workout.id);
  const next = [...all];
  if (idx >= 0) next[idx] = workout;
  else next.push(workout);
  saveWorkouts(next);
  return next;
};

export const deleteWorkout = (id: string): Workout[] => {
  const all = loadWorkouts().filter((w) => w.id !== id);
  saveWorkouts(all);
  return all;
};

export const getWorkout = (id: string): Workout | undefined =>
  loadWorkouts().find((w) => w.id === id);

// ---------- Edit-session handoff (sessionStorage) ----------
// Stash a workout before navigating to /log so the logger can read it on the
// client without relying on window.location (which isn't available during SSR).

const PENDING_EDIT_KEY = "workout.pending-edit.v1";

export const stashEditWorkout = (workout: Workout): void => {
  if (!isBrowser()) return;
  window.sessionStorage.setItem(PENDING_EDIT_KEY, JSON.stringify(workout));
};

export const popEditWorkout = (): Workout | null => {
  if (!isBrowser()) return null;
  const raw = window.sessionStorage.getItem(PENDING_EDIT_KEY);
  if (!raw) return null;
  window.sessionStorage.removeItem(PENDING_EDIT_KEY);
  try {
    return normalizeWorkout(JSON.parse(raw), 0);
  } catch {
    return null;
  }
};

// Snapshot caching: useSyncExternalStore requires a stable reference between
// renders when the underlying data hasn't changed. We re-parse on writes only.
let cachedSnapshot: Workout[] = [];
let snapshotInitialized = false;

const readSnapshot = (): Workout[] => {
  if (!snapshotInitialized) {
    cachedSnapshot = loadWorkouts();
    snapshotInitialized = true;
  }
  return cachedSnapshot;
};

const subscribe = (notify: () => void): (() => void) => {
  const onChange = () => {
    cachedSnapshot = loadWorkouts();
    notify();
  };
  const onStorage = (e: StorageEvent) => {
    if (e.key === STORAGE_KEY) onChange();
  };
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
};

const EMPTY: Workout[] = [];
const getServerSnapshot = (): Workout[] => EMPTY;

// `ready` flips true after hydration so consumers can distinguish empty-during-SSR
// from empty-because-no-workouts. Implemented via useSyncExternalStore so the value
// is `false` on server / first paint and `true` once mounted on client.
const noopSubscribe = (): (() => void) => () => {};
const trueSnapshot = (): boolean => true;
const falseSnapshot = (): boolean => false;

export function useWorkouts(): { workouts: Workout[]; ready: boolean } {
  const workouts = useSyncExternalStore(subscribe, readSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(noopSubscribe, trueSnapshot, falseSnapshot);
  return { workouts, ready };
}
