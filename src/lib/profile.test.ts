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
    });

    expect(loadTrainingProfile()).toEqual({
      goal: "strength",
      daysPerWeek: 3,
      equipment: "home",
      experience: "intermediate",
      intensity: "hard",
      blockedExercises: ["Hack squat"],
      allowedExercises: [],
    });
  });

  it("returns null for malformed stored data", () => {
    localStorage.setItem("workout.training-profile.v1", JSON.stringify({ bad: true }));
    expect(loadTrainingProfile()).toBeNull();
  });

  it("formats profile labels", () => {
    expect(formatGoal(DEFAULT_PROFILE.goal)).toBe("Physique");
    expect(formatEnvironment("full_gym")).toBe("Full gym");
    expect(formatExperience("beginner")).toBe("Beginner");
    expect(formatIntensity("hard")).toBe("Hard");
  });
});
