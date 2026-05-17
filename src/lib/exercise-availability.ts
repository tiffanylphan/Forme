import type { Exercise, TrainingEnvironment, TrainingProfile } from "./types";

export const environmentAllowsExercise = (
  ex: Exercise,
  profileOrEnvironment:
    | TrainingEnvironment
    | Pick<TrainingProfile, "equipment" | "blockedExercises">,
): boolean => {
  const environment =
    typeof profileOrEnvironment === "string"
      ? profileOrEnvironment
      : profileOrEnvironment.equipment;
  const blockedExercises =
    typeof profileOrEnvironment === "string"
      ? []
      : profileOrEnvironment.blockedExercises ?? [];

  if (blockedExercises.includes(ex.name)) return false;
  if (environment === "full_gym") return true;
  if (environment === "dumbbells") {
    if (
      [
        "Nordic hamstring curl",
        "Pull-up",
        "Chin-up",
        "Band-assisted pull-up",
        "Dip",
        "Inverted row",
        "Hanging knee raise",
        "Hanging leg raise",
        "Hyperextension",
      ].includes(ex.name)
    ) {
      return false;
    }
    if (["dumbbell", "kettlebell", "bodyweight", "band"].includes(ex.equipment)) {
      return true;
    }
    if (ex.equipment === "cable") return true;
    if (ex.equipment === "machine" && ex.name === "Leg press") return true;
    return false;
  }
  return ["dumbbell", "bodyweight", "band"].includes(ex.equipment);
};
