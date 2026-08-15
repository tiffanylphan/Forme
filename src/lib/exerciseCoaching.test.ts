import { describe, expect, it } from "vitest";
import { getExerciseCoaching } from "./exerciseCoaching";
import { EXERCISES } from "./exercises";

describe("getExerciseCoaching", () => {
  it("gives lateral raise-family exercises a plain-language setup cue", () => {
    const exercise = EXERCISES.find((ex) => ex.name === "DB lateral raise");
    expect(exercise).toBeDefined();

    const coaching = getExerciseCoaching(exercise!);
    expect(coaching.setup).not.toMatch(/body english/i);
    expect(coaching.setup).toBe("Choose a load light enough to lift with strict form, not momentum.");
  });
});
