import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import NextPage from "./page";

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

describe("NextPage", () => {
  it("renders the current split slot and training profile", () => {
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
      workouts: [],
    });

    render(<NextPage />);

    expect(screen.getByText("This week's slot")).toBeInTheDocument();
    expect(screen.getByText("Lower A")).toBeInTheDocument();
    expect(screen.getByText("Training profile")).toBeInTheDocument();
    expect(screen.getByText("Physique")).toBeInTheDocument();
    expect(screen.getByText("Why this routine")).toBeInTheDocument();
  });

  it("prompts for setup when no training profile exists", () => {
    useTrainingProfileMock.mockReturnValue({ ready: true, profile: null });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);
    expect(screen.getByText("Add your training profile so the planner can use your goal, frequency, equipment, and experience.")).toBeInTheDocument();
  });
});
