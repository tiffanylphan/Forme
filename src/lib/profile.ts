"use client";

import { useSyncExternalStore } from "react";
import type {
  ExperienceLevel,
  GoalMode,
  SessionIntensity,
  TrainingDaysPerWeek,
  TrainingEnvironment,
  TrainingProfile,
} from "./types";

const STORAGE_KEY = "workout.training-profile.v1";
const CHANGE_EVENT = "training-profile:changed";

export const GOAL_OPTIONS: GoalMode[] = ["physique", "balanced", "strength"];
export const EXPERIENCE_OPTIONS: ExperienceLevel[] = [
  "beginner",
  "intermediate",
];
export const ENVIRONMENT_OPTIONS: TrainingEnvironment[] = [
  "full_gym",
  "dumbbells",
  "home",
];
export const DAY_OPTIONS: TrainingDaysPerWeek[] = [3, 4, 5];
export const INTENSITY_OPTIONS: SessionIntensity[] = ["standard", "hard"];

export const DEFAULT_PROFILE: TrainingProfile = {
  goal: "physique",
  daysPerWeek: 4,
  equipment: "full_gym",
  experience: "beginner",
  intensity: "standard",
  blockedExercises: [],
  allowedExercises: [],
};

const EMPTY_SNAPSHOT = { profile: null, ready: false } as const;

const isBrowser = (): boolean => typeof window !== "undefined";

const isGoal = (value: unknown): value is GoalMode =>
  typeof value === "string" && GOAL_OPTIONS.includes(value as GoalMode);

const isExperience = (value: unknown): value is ExperienceLevel =>
  typeof value === "string" &&
  EXPERIENCE_OPTIONS.includes(value as ExperienceLevel);

const isEnvironment = (value: unknown): value is TrainingEnvironment =>
  typeof value === "string" &&
  ENVIRONMENT_OPTIONS.includes(value as TrainingEnvironment);

const isDays = (value: unknown): value is TrainingDaysPerWeek =>
  value === 3 || value === 4 || value === 5;

const isIntensity = (value: unknown): value is SessionIntensity =>
  typeof value === "string" &&
  INTENSITY_OPTIONS.includes(value as SessionIntensity);

const normalizeProfile = (raw: unknown): TrainingProfile | null => {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<TrainingProfile>;
  if (
    !isGoal(candidate.goal) ||
    !isExperience(candidate.experience) ||
    !isEnvironment(candidate.equipment) ||
    !isDays(candidate.daysPerWeek)
  ) {
    return null;
  }
  return {
    goal: candidate.goal,
    experience: candidate.experience,
    equipment: candidate.equipment,
    daysPerWeek: candidate.daysPerWeek,
    intensity: isIntensity(candidate.intensity)
      ? candidate.intensity
      : DEFAULT_PROFILE.intensity,
    blockedExercises: Array.isArray(candidate.blockedExercises)
      ? candidate.blockedExercises.filter(
          (value): value is string => typeof value === "string",
        )
      : DEFAULT_PROFILE.blockedExercises,
    allowedExercises: Array.isArray(candidate.allowedExercises)
      ? candidate.allowedExercises.filter(
          (value): value is string => typeof value === "string",
        )
      : DEFAULT_PROFILE.allowedExercises,
  };
};

export const loadTrainingProfile = (): TrainingProfile | null => {
  if (!isBrowser()) return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return normalizeProfile(JSON.parse(raw));
  } catch {
    return null;
  }
};

export const saveTrainingProfile = (profile: TrainingProfile): void => {
  if (!isBrowser()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
};

let cachedProfile: TrainingProfile | null = null;
let initialized = false;

const readSnapshot = (): TrainingProfile | null => {
  if (!initialized) {
    cachedProfile = loadTrainingProfile();
    initialized = true;
  }
  return cachedProfile;
};

const subscribe = (notify: () => void): (() => void) => {
  const onChange = () => {
    cachedProfile = loadTrainingProfile();
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

const getServerSnapshot = (): TrainingProfile | null => null;
const noopSubscribe = (): (() => void) => () => {};
const trueSnapshot = (): boolean => true;
const falseSnapshot = (): boolean => false;

export function useTrainingProfile(): {
  profile: TrainingProfile | null;
  ready: boolean;
} {
  const profile = useSyncExternalStore(subscribe, readSnapshot, getServerSnapshot);
  const ready = useSyncExternalStore(noopSubscribe, trueSnapshot, falseSnapshot);
  if (!ready) return EMPTY_SNAPSHOT;
  return { profile, ready };
}

export const formatGoal = (goal: GoalMode): string =>
  goal === "physique"
    ? "Physique"
    : goal === "balanced"
      ? "Balanced"
      : "Strength";

export const formatExperience = (experience: ExperienceLevel): string =>
  experience === "beginner" ? "Beginner" : "Intermediate";

export const formatEnvironment = (environment: TrainingEnvironment): string =>
  environment === "full_gym"
    ? "Full gym"
    : environment === "dumbbells"
      ? "Dumbbells"
      : "Home";

export const formatIntensity = (intensity: SessionIntensity): string =>
  intensity === "hard" ? "Hard" : "Standard";
