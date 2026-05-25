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

vi.mock("@/lib/format", async () => {
  const actual = await vi.importActual<typeof import("@/lib/format")>("@/lib/format");
  return {
    ...actual,
    // Pin "today" so workout date 2026-05-18 is always within the current week
    // (week of Mon 2026-05-13 → Sun 2026-05-19).
    todayISO: () => "2026-05-18",
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
        intensity: "standard",
      },
    });
    useWorkoutsMock.mockReturnValue({
      ready: true,
      workouts: [
        {
          id: "w1",
          date: "2026-05-18",
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
    expect(screen.getByText("Weekly muscle stimulus")).toBeInTheDocument();
    expect(screen.getByText("Muscle heat")).toBeInTheDocument();
    expect(screen.getByText("Front")).toBeInTheDocument();
    expect(screen.getByText("Back")).toBeInTheDocument();
    expect(screen.getByText("Most worked")).toBeInTheDocument();
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
        intensity: "standard",
      },
    });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<WeekPage />);
    expect(screen.getByText("No workouts logged in this week yet.")).toBeInTheDocument();
  });
});
