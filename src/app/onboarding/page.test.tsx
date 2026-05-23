import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import OnboardingPage from "./page";
import { routerPushMock } from "../../../test/setup";

const loadTrainingProfileMock = vi.fn();
const saveTrainingProfileMock = vi.fn();
const useTrainingProfileMock = vi.fn();

vi.mock("@/lib/profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/profile")>("@/lib/profile");
  return {
    ...actual,
    loadTrainingProfile: () => loadTrainingProfileMock(),
    saveTrainingProfile: (profile: unknown) => saveTrainingProfileMock(profile),
    useTrainingProfile: () => useTrainingProfileMock(),
  };
});

describe("OnboardingPage", () => {
  it("renders the saved profile and persists updates", async () => {
    const user = userEvent.setup();
    loadTrainingProfileMock.mockReturnValue({
      goal: "physique",
      daysPerWeek: 4,
      equipment: "full_gym",
      experience: "beginner",
      intensity: "standard",
      blockedExercises: [],
      allowedExercises: [],
      homeGymEquipment: [],
    });
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
      },
    });

    render(<OnboardingPage />);

    await user.click(screen.getByText("Strength"));
    await user.click(screen.getByText("3 days / week"));
    await user.click(screen.getByText("Minimal"));
    await user.click(screen.getByText("Intermediate"));
    await user.click(screen.getByText("Hard"));
    await user.click(screen.getByText("Save profile"));

    expect(saveTrainingProfileMock).toHaveBeenCalledWith({
      goal: "strength",
      daysPerWeek: 3,
      equipment: "home",
      experience: "intermediate",
      intensity: "hard",
      blockedExercises: [],
      allowedExercises: [],
      homeGymEquipment: [],
    });
    expect(routerPushMock).toHaveBeenCalledWith("/next");
  });

  it("shows loading state until the profile hook is ready", () => {
    loadTrainingProfileMock.mockReturnValue(null);
    useTrainingProfileMock.mockReturnValue({ ready: false, profile: null });

    render(<OnboardingPage />);
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("keeps unavailable exercise controls out of setup", () => {
    loadTrainingProfileMock.mockReturnValue({
      goal: "physique",
      daysPerWeek: 4,
      equipment: "full_gym",
      experience: "beginner",
      intensity: "standard",
      blockedExercises: ["Hack squat"],
      allowedExercises: [],
      homeGymEquipment: [],
    });
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
        intensity: "standard",
        blockedExercises: ["Hack squat"],
        allowedExercises: [],
        homeGymEquipment: [],
      },
    });

    render(<OnboardingPage />);

    expect(screen.queryByText("Unavailable exercises")).not.toBeInTheDocument();
    expect(screen.queryByText(/blocked/i)).not.toBeInTheDocument();
  });
});
