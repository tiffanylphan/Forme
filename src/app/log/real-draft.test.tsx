import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { generateNextWorkout, stashDraft } from "@/lib/generator";
import type { TrainingProfile } from "@/lib/types";
import LogPage from "./page";

// Do NOT mock @/lib/generator here — we want the real stashDraft and popDraft
// so the sessionStorage serialize/deserialize cycle is exercised end-to-end.

const popEditWorkoutMock = () => null;

vi.mock("@/lib/storage", () => ({
  getWorkout: () => null,
  loadWorkouts: () => [],
  popEditWorkout: () => popEditWorkoutMock(),
  upsertWorkout: () => {},
}));

const profile: TrainingProfile = {
  goal: "physique",
  daysPerWeek: 4,
  equipment: "full_gym",
  experience: "beginner",
  intensity: "standard",
  blockedExercises: [],
  allowedExercises: [],
  homeGymEquipment: [],
};

describe("LogPage with real stash/pop cycle", () => {
  it("renders without crashing when the real stashDraft → popDraft pipeline is used", async () => {
    const draft = generateNextWorkout([], "2026-07-15", 0, profile);
    stashDraft({ source: "manual", draft });

    render(<LogPage />);

    expect(await screen.findByText("Log workout")).toBeInTheDocument();
    const exercises = draft.sections.flatMap((s) => s.exercises);
    expect(exercises.length).toBeGreaterThan(0);
  });
});
