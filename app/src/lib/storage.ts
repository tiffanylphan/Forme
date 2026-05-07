"use client";

import { useSyncExternalStore } from "react";
import type { Workout } from "./types";

const STORAGE_KEY = "workout.workouts.v1";
const CHANGE_EVENT = "workouts:changed";

const isBrowser = (): boolean => typeof window !== "undefined";

const safeParse = (raw: string | null): Workout[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Workout[];
    return [];
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
  cachedSnapshot = workouts;
  snapshotInitialized = true;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workouts));
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
    return JSON.parse(raw) as Workout;
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
