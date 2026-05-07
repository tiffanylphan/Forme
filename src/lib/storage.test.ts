"use client";

import { describe, expect, it } from "vitest";
import {
  deleteWorkout,
  getWorkout,
  loadWorkouts,
  popEditWorkout,
  saveWorkouts,
  stashEditWorkout,
  useWorkouts,
  upsertWorkout,
} from "./storage";
import type { Workout } from "./types";
import { act, renderHook } from "@testing-library/react";

const makeWorkout = (id: string): Workout => ({
  id,
  date: "2026-05-06",
  source: "manual",
  notes: "note",
  createdAt: 1,
  updatedAt: 1,
  exercises: [
    {
      id: `ex-${id}`,
      exerciseName: "Cable row",
      supersetGroup: null,
      sets: [{ id: `set-${id}`, reps: 12, weight: 70, unit: "lb" }],
    },
  ],
});

describe("storage", () => {
  it("saves and loads workouts", () => {
    saveWorkouts([makeWorkout("w1")]);
    expect(loadWorkouts()).toHaveLength(1);
    expect(getWorkout("w1")?.exercises[0].exerciseName).toBe("Cable row");
  });

  it("upserts workouts by id", () => {
    upsertWorkout(makeWorkout("w1"));
    upsertWorkout({ ...makeWorkout("w1"), notes: "updated", updatedAt: 2 });
    expect(loadWorkouts()).toHaveLength(1);
    expect(getWorkout("w1")?.notes).toBe("updated");
  });

  it("deletes workouts", () => {
    upsertWorkout(makeWorkout("w1"));
    upsertWorkout(makeWorkout("w2"));
    deleteWorkout("w1");
    expect(loadWorkouts().map((w) => w.id)).toEqual(["w2"]);
  });

  it("stashes edit handoff in sessionStorage", () => {
    const workout = makeWorkout("edit");
    stashEditWorkout(workout);
    expect(popEditWorkout()?.id).toBe("edit");
    expect(popEditWorkout()).toBeNull();
  });

  it("updates the cached snapshot immediately after save", () => {
    const { result } = renderHook(() => useWorkouts());

    act(() => {
      saveWorkouts([makeWorkout("w1")]);
    });

    expect(result.current.workouts.map((w) => w.id)).toEqual(["w1"]);
  });
});
