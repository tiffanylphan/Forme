import { describe, expect, it } from "vitest";
import { findExercise } from "./exercises";
import { directionOf, matchesMuscleFilter } from "./exercise-predicates";

describe("matchesMuscleFilter", () => {
  const legCurl = findExercise("Leg curl")!; // primary: hamstrings, secondary: []
  const romanianDeadlift = findExercise("DB Romanian deadlift")!; // primary: hamstrings, glutes; secondary: back, core

  it("returns true when no filter is given", () => {
    expect(matchesMuscleFilter(legCurl, {})).toBe(true);
  });

  it("include: matches when the exercise hits an included muscle as primary", () => {
    expect(matchesMuscleFilter(legCurl, { include: ["hamstrings"] })).toBe(true);
  });

  it("include: matches when the exercise hits an included muscle as secondary", () => {
    expect(matchesMuscleFilter(romanianDeadlift, { include: ["core"] })).toBe(true);
  });

  it("include: excludes when the exercise hits none of the included muscles", () => {
    expect(matchesMuscleFilter(legCurl, { include: ["glutes"] })).toBe(false);
  });

  it("exclude: excludes when the exercise hits an excluded muscle as primary", () => {
    expect(matchesMuscleFilter(romanianDeadlift, { exclude: ["glutes"] })).toBe(false);
  });

  it("exclude: excludes when the exercise hits an excluded muscle as secondary", () => {
    expect(matchesMuscleFilter(romanianDeadlift, { exclude: ["back"] })).toBe(false);
  });

  it("exclude: matches when the exercise hits none of the excluded muscles", () => {
    expect(matchesMuscleFilter(legCurl, { exclude: ["glutes", "back"] })).toBe(true);
  });

  it("combines include and exclude", () => {
    // Romanian deadlift includes hamstrings but also touches glutes — excluding glutes wins.
    expect(
      matchesMuscleFilter(romanianDeadlift, { include: ["hamstrings"], exclude: ["glutes"] }),
    ).toBe(false);
    // Leg curl includes hamstrings and touches nothing else.
    expect(
      matchesMuscleFilter(legCurl, { include: ["hamstrings"], exclude: ["glutes"] }),
    ).toBe(true);
  });
});

describe("directionOf", () => {
  const cases: Array<[string, "horizontal" | "vertical" | null]> = [
    ["Cable row", "horizontal"],
    ["Barbell bent-over row", "horizontal"],
    ["Face pull", "horizontal"],
    ["Lat pulldown", "vertical"],
    ["Chin-up", "vertical"],
    ["DB overhead press", "vertical"],
    ["Barbell bench press", "horizontal"],
    ["Push-up", "horizontal"],
    ["DB lateral raise", null],
    ["Cable curl", null],
    ["Barbell back squat", null],
  ];
  it.each(cases)("%s → %s", (name, expected) => {
    const ex = findExercise(name);
    expect(ex, name).toBeDefined();
    expect(directionOf(ex!)).toBe(expected);
  });

  it("lets an explicit tag override inference", () => {
    const ex = { ...findExercise("Cable row")!, direction: "vertical" as const };
    expect(directionOf(ex)).toBe("vertical");
  });
});
