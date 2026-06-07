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
        intensity: "standard",
        blockedExercises: [],
        allowedExercises: [],
      },
    });
    useWorkoutsMock.mockReturnValue({
      ready: true,
      workouts: [],
    });

    render(<NextPage />);

    expect(screen.getByText("This week's slot")).toBeInTheDocument();
    expect(screen.getByText("Lower A · Posterior")).toBeInTheDocument();
    expect(screen.getByText("Training profile")).toBeInTheDocument();
    expect(screen.getByText("Physique")).toBeInTheDocument();
    expect(screen.getByText("Why this routine")).toBeInTheDocument();
    expect(screen.getByText("Before you lift")).toBeInTheDocument();
    expect(screen.getByText("After you finish")).toBeInTheDocument();
    expect(screen.getByText("Weekly target stimulus")).toBeInTheDocument();
    expect(screen.getAllByText("Complementary mobility").length).toBeGreaterThan(0);
  });

  it("shows the weekly target total, not just this slot's target, in the weekly target stimulus card", () => {
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
      },
    });
    useWorkoutsMock.mockReturnValue({
      ready: true,
      workouts: [],
    });

    render(<NextPage />);

    // The displayed slot is "Lower A · Posterior", whose own glutes target is 7,
    // but the weekly total across all 4 physique slots is 7 + 2 + 6 + 2 = 17.
    // The card's "done" value is the weekly total, so its target must also be
    // the weekly total (17), not this slot's own target (7).
    expect(screen.getByText("0.0/17.0")).toBeInTheDocument();
    expect(screen.queryByText("0.0/7.0")).not.toBeInTheDocument();
  });

  it("prompts for setup when no training profile exists", () => {
    useTrainingProfileMock.mockReturnValue({ ready: true, profile: null });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);
    expect(screen.getByText("Add your training profile so the planner can use your goal, frequency, equipment, and experience.")).toBeInTheDocument();
  });
});
