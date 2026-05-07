import { describe, expect, it } from "vitest";
import { findExercise } from "./exercises";
import { movementOf } from "./movement";

describe("movementOf", () => {
  it("maps unilateral squats to single-leg", () => {
    const exercise = findExercise("DB Bulgarian split squat");
    expect(exercise).toBeDefined();
    expect(movementOf(exercise!)).toBe("single_leg");
  });

  it("maps rows to pull", () => {
    const exercise = findExercise("Cable row");
    expect(movementOf(exercise!)).toBe("pull");
  });

  it("skips calf-only movements", () => {
    const exercise = findExercise("Standing calf raise");
    expect(movementOf(exercise!)).toBeNull();
  });
});
