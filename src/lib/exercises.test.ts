"use client";

import { describe, expect, it } from "vitest";
import { canonicalExerciseName, findExercise } from "./exercises";

describe("exercises", () => {
  it("resolves common aliases to canonical exercise entries", () => {
    expect(findExercise("Barbell RDL")?.name).toBe("Barbell Romanian deadlift");
    expect(findExercise("DB box step ups")?.name).toBe("Box step-up");
    expect(findExercise("Butterfly situps")?.name).toBe("Butterfly sit-up");
    expect(findExercise("Cable row machine")?.name).toBe("Cable row");
    expect(findExercise("Lat pull down machine")?.name).toBe("Lat pulldown");
  });

  it("preserves canonical names when normalizing imported exercise text", () => {
    expect(canonicalExerciseName("Woman makers")).toBe("Woman maker");
    expect(canonicalExerciseName("DB skullcrushers")).toBe("DB skull crusher");
    expect(canonicalExerciseName("Barbell incline bench")).toBe("Barbell incline bench press");
  });

  it("includes the newly added exercises", () => {
    expect(findExercise("DB side lunge to high pull")?.pattern).toBe("conditioning");
    expect(findExercise("DB squat to reverse lunge")?.pattern).toBe("squat");
    expect(findExercise("DB overhead marches")?.pattern).toBe("carry");
  });
});
