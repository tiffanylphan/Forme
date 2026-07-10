import type { Exercise, HomeGymEquipmentType, TrainingEnvironment, TrainingProfile } from "./types";

const PULLUP_BAR_EXERCISES = ["Pull-up", "Chin-up", "Band-assisted pull-up"];

const BODYWEIGHT_ONLY_BLOCKS = [
  "Nordic hamstring curl",
  "Dip",
  "Inverted row",
  "Hanging knee raise",
  "Hanging leg raise",
  "Hyperextension",
];

// Specialized commercial-gym machines not found in typical home gym setups,
// even when the user has unlocked "machine" via homeGymEquipment.
const FULL_GYM_ONLY_MACHINES = ["Adductor machine"];

export const environmentAllowsExercise = (
  ex: Exercise,
  profileOrEnvironment:
    | TrainingEnvironment
    | Pick<TrainingProfile, "equipment"> &
        Partial<Pick<TrainingProfile, "blockedExercises" | "allowedExercises" | "homeGymEquipment">>,
): boolean => {
  const environment =
    typeof profileOrEnvironment === "string"
      ? profileOrEnvironment
      : profileOrEnvironment.equipment;
  const blockedExercises =
    typeof profileOrEnvironment === "string"
      ? []
      : profileOrEnvironment.blockedExercises ?? [];
  const allowedExercises =
    typeof profileOrEnvironment === "string"
      ? []
      : profileOrEnvironment.allowedExercises ?? [];
  const homeGymEquipment: HomeGymEquipmentType[] =
    typeof profileOrEnvironment === "string"
      ? []
      : profileOrEnvironment.homeGymEquipment ?? [];

  if (blockedExercises.includes(ex.name)) return false;
  if (allowedExercises.includes(ex.name)) return true;
  if (environment === "full_gym") return true;

  // Base equipment available in all non-full-gym environments.
  const baseEquipment = ["dumbbell", "kettlebell", "bodyweight", "band"];

  // Exercises that require gym infrastructure (pull-up bar, rack, etc.)
  // and are only unlocked via homeGymEquipment.
  const hasPullupBar = homeGymEquipment.includes("pullup_bar");
  const hasCable = homeGymEquipment.includes("cable");
  const hasBarbell = homeGymEquipment.includes("barbell");
  const hasMachine = homeGymEquipment.includes("machine");

  if (BODYWEIGHT_ONLY_BLOCKS.includes(ex.name)) return false;
  if (PULLUP_BAR_EXERCISES.includes(ex.name)) return hasPullupBar;

  if (baseEquipment.includes(ex.equipment)) return true;
  if (ex.equipment === "cable") return hasCable;
  if (ex.equipment === "barbell") return hasBarbell;
  if (ex.equipment === "machine") {
    if (FULL_GYM_ONLY_MACHINES.includes(ex.name)) return false;
    return hasMachine;
  }
  return false;
};
