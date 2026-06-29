import { fireEvent, render, screen } from "@testing-library/react";
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

  it("shows Configure focus button and opens the muscle picker modal", () => {
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
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);

    expect(screen.getByRole("button", { name: "Configure focus" })).toBeInTheDocument();
    expect(screen.queryByText("Configure workout")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Configure focus" }));

    expect(screen.getByText("Configure workout")).toBeInTheDocument();
    expect(screen.getByText("Choose muscles to prioritize. The planner picks exercises and movements to match.")).toBeInTheDocument();
    // The 8 focusable muscle tiles appear as toggle buttons (aria-label = formatted muscle name)
    expect(screen.getByRole("button", { name: "glutes" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "hamstrings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "quads" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "adductors" })).toBeInTheDocument();
    // Movement tiles are not visible by default — they appear under the advanced toggle
    expect(screen.queryByRole("button", { name: "Squat" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Hinge" })).not.toBeInTheDocument();
  });

  it("selecting muscles and confirming shows muscle labels in the configured pill", () => {
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
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);

    fireEvent.click(screen.getByRole("button", { name: "Configure focus" }));
    // Use exact name match so the tile (aria-label="glutes") is found, not the confirm button
    fireEvent.click(screen.getByRole("button", { name: "glutes" }));
    fireEvent.click(screen.getByRole("button", { name: "hamstrings" }));
    // Confirm button now reads "Focus on glutes · hamstrings"
    fireEvent.click(screen.getByRole("button", { name: /Focus on/ }));

    // Modal closes
    expect(screen.queryByText("Configure workout")).not.toBeInTheDocument();
    // Pill in the planning card shows the selected muscle labels
    expect(screen.getByText("glutes · hamstrings")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reset to recommended" })).toBeInTheDocument();
  });

  it("modal shows Reset to recommended when no movements are selected", () => {
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
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);

    // Open with no pre-existing selection — confirm button should read "Reset to recommended"
    fireEvent.click(screen.getByRole("button", { name: "Configure focus" }));
    expect(screen.getByRole("button", { name: "Reset to recommended" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Focus on/ })).not.toBeInTheDocument();
  });

  it("clears muscle focus when Reset to recommended is clicked from the planning card", () => {
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
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);

    fireEvent.click(screen.getByRole("button", { name: "Configure focus" }));
    fireEvent.click(screen.getByRole("button", { name: "glutes" }));
    fireEvent.click(screen.getByRole("button", { name: /Focus on/ }));
    expect(screen.getByRole("button", { name: "Reset to recommended" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Reset to recommended" }));
    expect(screen.queryByRole("button", { name: "Reset to recommended" })).not.toBeInTheDocument();
  });

  it("clears muscle focus when Regenerate is clicked", () => {
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
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);

    fireEvent.click(screen.getByRole("button", { name: "Configure focus" }));
    fireEvent.click(screen.getByRole("button", { name: "glutes" }));
    fireEvent.click(screen.getByRole("button", { name: /Focus on/ }));
    expect(screen.getByRole("button", { name: "Reset to recommended" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(screen.queryByRole("button", { name: "Reset to recommended" })).not.toBeInTheDocument();
  });
});
