import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WeekPage from "./page";

const useWorkoutsMock = vi.fn();

vi.mock("@/lib/storage", () => ({
  useWorkouts: () => useWorkoutsMock(),
}));

describe("WeekPage", () => {
  it("renders coverage information for logged workouts", () => {
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
    expect(screen.getByText("Top muscle focus")).toBeInTheDocument();
  });

  it("renders empty state when no workouts are logged", () => {
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<WeekPage />);
    expect(screen.getByText("No workouts logged in this week yet.")).toBeInTheDocument();
  });
});
