import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";

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

describe("Home page", () => {
  it("renders the training profile and recent workouts", () => {
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
          date: "2026-05-06",
          source: "external",
          notes: "",
          createdAt: 1,
          updatedAt: 1,
          exercises: [
            {
              id: "e1",
              exerciseName: "Cable row",
              supersetGroup: null,
              sets: [{ id: "s1", reps: 12, weight: 70, unit: "lb" }],
            },
          ],
        },
      ],
    });

    render(<Home />);

    expect(screen.getByText("Training profile")).toBeInTheDocument();
    expect(screen.getByText("Physique")).toBeInTheDocument();
    expect(screen.getByText("Recent workouts")).toBeInTheDocument();
    expect(screen.getByText(/Cable row/)).toBeInTheDocument();
    expect(screen.getByText("Outside Forme")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import / Export" })).toHaveAttribute(
      "href",
      "/data",
    );
  });

  it("shows what is left to each muscle's floor this week once something is logged", async () => {
    const { todayISO } = await vi.importActual<typeof import("@/lib/format")>("@/lib/format");
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
        intensity: "standard",
        blockedExercises: [],
        allowedExercises: [],
        homeGymEquipment: [],
        sensitiveMuscles: [],
      },
    });
    useWorkoutsMock.mockReturnValue({
      ready: true,
      workouts: [
        {
          id: "w1",
          date: todayISO(),
          source: "manual",
          createdAt: 1,
          updatedAt: 1,
          exercises: [
            {
              id: "e1",
              exerciseName: "Cable row",
              supersetGroup: null,
              sets: Array.from({ length: 4 }, (_, i) => ({ id: `s${i}`, reps: 12, weight: 70, unit: "lb" })),
            },
          ],
        },
      ],
    });

    render(<Home />);

    expect(screen.getByText(/Left to floor:/)).toBeInTheDocument();
    expect(screen.getByText(/Left to floor:.*quads/)).toBeInTheDocument();
  });

  it("shows empty state when no workouts exist", () => {
    useTrainingProfileMock.mockReturnValue({ ready: true, profile: null });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<Home />);
    expect(screen.getByText("No workouts logged yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import / Export" })).toHaveAttribute(
      "href",
      "/data",
    );
  });
});
