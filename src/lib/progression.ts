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

const maxWeightedLoad = (sets: SetEntry[]): number | null => {
  const weights = sets
    .map((s) => s.weight)
    .filter((w): w is number => typeof w === "number");
  return weights.length > 0 ? Math.max(...weights) : null;
};

const totalVolume = (sets: SetEntry[]): number =>
  sets.reduce(
    (sum, s) =>
      sum +
      (typeof s.weight === "number" && typeof s.reps === "number" ? s.weight * s.reps : 0),
    0,
  );

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
  const load = maxWeightedLoad(exercise.sets);
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

  const currentLoad = maxWeightedLoad(currentSets);
  const previousLoad = maxWeightedLoad(previous.sets);
  const currentReps = totalNumericReps(currentSets);
  const previousReps = totalNumericReps(previous.sets);
  const currentDuration = totalDuration(currentSets);
  const previousDuration = totalDuration(previous.sets);
  const currentDistance = totalDistance(currentSets);
  const previousDistance = totalDistance(previous.sets);

  if (currentLoad != null && previousLoad != null) {
    const curVol = totalVolume(currentSets);
    const prevVol = totalVolume(previous.sets);

    if (currentLoad > previousLoad) {
      // Lifted heavier — progressed if reps held up reasonably, held if they dropped a lot
      return currentReps >= Math.floor(previousReps * 0.8) ? "progressed" : "held";
    }
    if (currentLoad === previousLoad) {
      if (currentReps > previousReps) return "progressed";
      if (currentReps === previousReps) return "held";
      // Same weight, fewer reps — held if volume stayed close (within 10%)
      return curVol >= prevVol * 0.9 ? "held" : "missed";
    }
    // Weight dropped — held if volume compensated, otherwise missed
    return curVol >= prevVol * 0.9 ? "held" : "missed";
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
