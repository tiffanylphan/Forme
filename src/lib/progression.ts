import type { ExerciseLog, SetEntry, Workout } from "./types";

export type ProgressionStatus = NonNullable<ExerciseLog["progressionStatus"]>;
export type StallState = "none" | "watch" | "stalled";
export type ExerciseHistoryEntry = {
  date: string;
  summary: string;
  status: ProgressionStatus;
};

const compareWorkoutsDesc = (a: Workout, b: Workout): number =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt;

const lastWeightedLoad = (sets: SetEntry[]): number | null => {
  const weighted = sets.filter(
    (set): set is SetEntry & { weight: number } => typeof set.weight === "number",
  );
  return weighted.length > 0 ? weighted[weighted.length - 1].weight : null;
};

const totalNumericReps = (sets: SetEntry[]): number =>
  sets.reduce((sum, set) => sum + (typeof set.reps === "number" ? set.reps : 0), 0);

const totalDuration = (sets: SetEntry[]): number =>
  sets.reduce(
    (sum, set) => sum + (typeof set.durationSec === "number" ? set.durationSec : 0),
    0,
  );

const totalDistance = (sets: SetEntry[]): number =>
  sets.reduce(
    (sum, set) => sum + (typeof set.distanceM === "number" ? set.distanceM : 0),
    0,
  );

export const summarizeExerciseLog = (exercise: ExerciseLog): string => {
  const load = lastWeightedLoad(exercise.sets);
  const reps = exercise.sets
    .map((set) => (typeof set.reps === "number" ? set.reps.toString() : null))
    .filter((value): value is string => Boolean(value));
  const duration = totalDuration(exercise.sets);
  const distance = totalDistance(exercise.sets);

  if (load != null && reps.length > 0) return `${load} lb x ${reps.join("/")}`;
  if (reps.length > 0) return `${reps.join("/")} reps`;
  if (distance > 0) return `${distance} m`;
  if (duration > 0) return `${duration}s`;
  return "Logged";
};

const findPreviousExercise = (
  exerciseName: string,
  workouts: Workout[],
  currentWorkoutId?: string,
): ExerciseLog | null => {
  const sorted = [...workouts].sort(compareWorkoutsDesc);
  for (const workout of sorted) {
    if (workout.id === currentWorkoutId) continue;
    const match = workout.exercises.find((exercise) => exercise.exerciseName === exerciseName);
    if (match) return match;
  }
  return null;
};

export const evaluateProgressionStatus = (
  exerciseName: string,
  currentSets: SetEntry[],
  workouts: Workout[],
  currentWorkoutId?: string,
): ProgressionStatus => {
  const previous = findPreviousExercise(exerciseName, workouts, currentWorkoutId);
  if (!previous) return "baseline";

  const currentLoad = lastWeightedLoad(currentSets);
  const previousLoad = lastWeightedLoad(previous.sets);
  const currentReps = totalNumericReps(currentSets);
  const previousReps = totalNumericReps(previous.sets);
  const currentDuration = totalDuration(currentSets);
  const previousDuration = totalDuration(previous.sets);
  const currentDistance = totalDistance(currentSets);
  const previousDistance = totalDistance(previous.sets);

  if (currentLoad != null && previousLoad != null) {
    if (currentLoad > previousLoad && currentReps >= Math.max(previousReps - 2, 1)) {
      return "progressed";
    }
    if (currentLoad === previousLoad && currentReps > previousReps) {
      return "progressed";
    }
    if (currentLoad === previousLoad && currentReps === previousReps) {
      return "held";
    }
    return "missed";
  }

  if (currentReps > 0 || previousReps > 0) {
    if (currentReps > previousReps) return "progressed";
    if (currentReps === previousReps) return "held";
    return "missed";
  }

  if (currentDistance > 0 || previousDistance > 0) {
    if (currentDistance > previousDistance) return "progressed";
    if (currentDistance === previousDistance) return "held";
    return "missed";
  }

  if (currentDuration > 0 || previousDuration > 0) {
    if (currentDuration > previousDuration) return "progressed";
    if (currentDuration === previousDuration) return "held";
    return "missed";
  }

  return "baseline";
};

export const getExerciseHistory = (
  exerciseName: string,
  workouts: Workout[],
  currentWorkoutId?: string,
  limit = 3,
): ExerciseHistoryEntry[] =>
  [...workouts]
    .sort(compareWorkoutsDesc)
    .filter((workout) => workout.id !== currentWorkoutId)
    .flatMap((workout) =>
      workout.exercises
        .filter((exercise) => exercise.exerciseName === exerciseName)
        .map((exercise) => ({
          date: workout.date,
          summary: summarizeExerciseLog(exercise),
          status: exercise.progressionStatus ?? "baseline",
        })),
    )
    .slice(0, limit);

export const getRecentProgressionStatuses = (
  exerciseName: string,
  workouts: Workout[],
  currentWorkoutId?: string,
  limit = 3,
): ProgressionStatus[] =>
  getExerciseHistory(exerciseName, workouts, currentWorkoutId, limit).map(
    (entry) => entry.status,
  );

export const getStallState = (
  exerciseName: string,
  workouts: Workout[],
  currentWorkoutId?: string,
): StallState => {
  const statuses = getRecentProgressionStatuses(
    exerciseName,
    workouts,
    currentWorkoutId,
    3,
  );

  if (statuses.length === 0) return "none";

  const latest = statuses[0];
  const isFlatOrMissed = (status: ProgressionStatus): boolean =>
    status === "held" || status === "missed";

  if (
    statuses.length >= 2 &&
    isFlatOrMissed(statuses[0]) &&
    isFlatOrMissed(statuses[1])
  ) {
    return "stalled";
  }

  if (latest === "held" || latest === "missed") {
    return "watch";
  }

  return "none";
};
