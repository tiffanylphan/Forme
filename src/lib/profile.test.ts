"use client";

import { describe, expect, it } from "vitest";
import {
  DEFAULT_PROFILE,
  formatEnvironment,
  formatExperience,
  formatGoal,
  formatIntensity,
  loadTrainingProfile,
  saveTrainingProfile,
} from "./profile";

describe("profile storage", () => {
  it("saves and loads a training profile", () => {
    saveTrainingProfile({
      goal: "strength",
      daysPerWeek: 3,
      equipment: "home",
      experience: "intermediate",
      intensity: "hard",
      blockedExercises: ["Hack squat"],
      allowedExercises: [],
      homeGymEquipment: ["cable", "barbell"],
      sensitiveMuscles: ["shoulders"],
    });

    expect(loadTrainingProfile()).toEqual({
      goal: "strength",
      daysPerWeek: 3,
      equipment: "home",
      experience: "intermediate",
      intensity: "hard",
      blockedExercises: ["Hack squat"],
      allowedExercises: [],
      homeGymEquipment: ["cable", "barbell"],
      sensitiveMuscles: ["shoulders"],
    });
  });

  it("returns null for malformed stored data", () => {
    localStorage.setItem("workout.training-profile.v1", JSON.stringify({ bad: true }));
    expect(loadTrainingProfile()).toBeNull();
  });

  it("filters invalid entries out of sensitiveMuscles on load", () => {
    localStorage.setItem(
      "workout.training-profile.v1",
      JSON.stringify({
        goal: "strength",
        daysPerWeek: 3,
        equipment: "home",
        experience: "intermediate",
        intensity: "hard",
        blockedExercises: [],
        allowedExercises: [],
        homeGymEquipment: [],
        sensitiveMuscles: ["shoulders", "not_a_muscle", 123],
      }),
    );
    expect(loadTrainingProfile()?.sensitiveMuscles).toEqual(["shoulders"]);
  });

  it("formats profile labels", () => {
    expect(formatGoal(DEFAULT_PROFILE.goal)).toBe("Physique");
    expect(formatEnvironment("full_gym")).toBe("Full gym");
    expect(formatExperience("beginner")).toBe("Beginner");
    expect(formatIntensity("hard")).toBe("Hard");
  });
});
