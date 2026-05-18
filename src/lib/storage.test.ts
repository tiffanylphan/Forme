"use client";

import { describe, expect, it } from "vitest";
import {
  deleteWorkout,
  getWorkout,
  loadWorkouts,
  normalizeWorkouts,
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

  it("normalizes imported workouts with missing optional fields", () => {
    const normalized = normalizeWorkouts([
      {
        id: "legacy-1",
        date: "2026-05-06",
        exercises: [
          {
            exerciseName: "Cable row",
            sets: [{ reps: 12, weight: 70 }],
          },
        ],
      },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.source).toBe("manual");
    expect(normalized[0]?.exercises[0]?.supersetGroup).toBeNull();
    expect(normalized[0]?.exercises[0]?.sets[0]?.unit).toBe("lb");
    expect(typeof normalized[0]?.createdAt).toBe("number");
    expect(typeof normalized[0]?.updatedAt).toBe("number");
  });

  it("drops malformed workouts instead of letting them poison storage", () => {
    saveWorkouts([
      {
        id: "broken",
        date: "2026-05-06",
        source: "manual",
        createdAt: 1,
        updatedAt: 1,
        exercises: [],
      } as Workout,
      makeWorkout("good"),
    ]);

    expect(loadWorkouts().map((workout) => workout.id)).toEqual(["good"]);
  });

  it("normalizes flattened row-per-set exports into grouped workouts", () => {
    const normalized = normalizeWorkouts([
      {
        workout_id: "flat-1",
        date: "2026-05-16",
        source: "manual",
        plan_slot: "Lower A",
        exercise: "Leg press",
        set_number: 2,
        reps: 10,
        weight: 140,
        unit: "lb",
        duration_sec: "",
        distance_m: "",
        progression_status: "baseline",
        workout_notes: "",
      },
      {
        workout_id: "flat-1",
        date: "2026-05-16",
        source: "manual",
        plan_slot: "Lower A",
        exercise: "Leg press",
        set_number: 1,
        reps: 8,
        weight: 130,
        unit: "lb",
        duration_sec: "",
        distance_m: "",
        progression_status: "baseline",
        workout_notes: "",
      },
      {
        workout_id: "flat-1",
        date: "2026-05-16",
        source: "manual",
        plan_slot: "Lower A",
        exercise: "Bear crawl",
        set_number: 1,
        reps: 20,
        weight: "",
        unit: "lb",
        duration_sec: "",
        distance_m: "",
        progression_status: "baseline",
        workout_notes: "",
      },
    ]);

    expect(normalized).toHaveLength(1);
    expect(normalized[0]?.id).toBe("flat-1");
    expect(normalized[0]?.planSlot).toEqual({
      slotId: "lower_a",
      title: "Lower A",
    });
    expect(normalized[0]?.exercises).toHaveLength(2);
    expect(normalized[0]?.exercises[0]?.exerciseName).toBe("Leg press");
    expect(normalized[0]?.exercises[0]?.sets.map((set) => set.reps)).toEqual([8, 10]);
    expect(normalized[0]?.exercises[1]?.exerciseName).toBe("Bear crawl");
    expect(normalized[0]?.exercises[1]?.sets[0]?.weight).toBeNull();
  });
});
