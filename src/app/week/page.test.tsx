import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WeekPage from "./page";

const useWorkoutsMock = vi.fn();
const useTrainingProfileMock = vi.fn();

vi.mock("@/lib/storage", () => ({
  useWorkouts: () => useWorkoutsMock(),
}));

vi.mock("@/lib/profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/profile")>("@/lib/profile");
  return {
    ...actual,
    useTrainingProfile: () => useTrainingProfileMock(),
  };
});

describe("WeekPage", () => {
  it("renders coverage information for logged workouts", () => {
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
      },
    });
    useWorkoutsMock.mockReturnValue({
      ready: true,
      workouts: [
        {
          id: "w1",
          date: "2026-05-06",
          source: "manual",
          createdAt: 1,
          updatedAt: 1,
          exercises: [
            {
              id: "e1",
              exerciseName: "Cable row",
              supersetGroup: null,
              sets: [
                { id: "s1", reps: 12, weight: 70, unit: "lb" },
                { id: "s2", reps: 12, weight: 70, unit: "lb" },
              ],
            },
          ],
        },
      ],
    });

    render(<WeekPage />);
    expect(screen.getByText("Movement coverage")).toBeInTheDocument();
    expect(screen.getByText("Patterns to fill")).toBeInTheDocument();
    expect(screen.getByText("Weekly muscle targets")).toBeInTheDocument();
    expect(screen.getByText("Top muscle focus")).toBeInTheDocument();
  });

  it("renders empty state when no workouts are logged", () => {
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
      },
    });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<WeekPage />);
    expect(screen.getByText("No workouts logged in this week yet.")).toBeInTheDocument();
  });
});
