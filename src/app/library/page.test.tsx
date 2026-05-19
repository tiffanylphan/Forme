import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LibraryPage from "./page";

const saveTrainingProfileMock = vi.fn();
const useTrainingProfileMock = vi.fn();

vi.mock("@/lib/profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/profile")>("@/lib/profile");
  return {
    ...actual,
    saveTrainingProfile: (profile: unknown) => saveTrainingProfileMock(profile),
    useTrainingProfile: () => useTrainingProfileMock(),
  };
});

describe("LibraryPage", () => {
  const defaultProfile = {
    goal: "physique",
    daysPerWeek: 4,
    equipment: "full_gym" as const,
    experience: "beginner" as const,
    intensity: "standard" as const,
    blockedExercises: [],
  };

  const renderPage = () => {
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: defaultProfile,
    });
    render(<LibraryPage />);
  };

  beforeEach(() => {
    saveTrainingProfileMock.mockReset();
    useTrainingProfileMock.mockReset();
  });

  it("filters exercises by search and expands details", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Search exercises..."), "db snatch");
    expect(screen.getByText("DB snatch")).toBeInTheDocument();

    await user.click(screen.getByText("DB snatch"));
    expect(screen.getByText(/Primary:/)).toBeInTheDocument();
    expect(screen.getByText(/Equipment:/)).toBeInTheDocument();
  });

  it("shows empty state when filters remove all exercises", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Search exercises..."), "zzzz");
    expect(screen.getByText("No exercises match your filters")).toBeInTheDocument();
  });

  it("shows muscle counts that match the clicked filter results", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: /hamstrings/i }));

    expect(screen.getByText("37 results")).toBeInTheDocument();
    expect(screen.getAllByText(/37 exercises/i).length).toBeGreaterThan(0);
  });

  it("matches search terms even when punctuation differs", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Search exercises..."), "single leg hip thrust");
    expect(screen.getByText("Bench single-leg hip thrust")).toBeInTheDocument();
  });

  it("shows newly added exercises in search", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Search exercises..."), "sumo squat");
    expect(screen.getByText("DB sumo squat")).toBeInTheDocument();
  });

  it("lets the library mark an exercise unavailable for the planner", async () => {
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByPlaceholderText("Search exercises..."), "nordic hamstring curl");
    await user.click(screen.getByText("Nordic hamstring curl"));
    await user.click(screen.getByRole("button", { name: "Mark unavailable" }));

    expect(saveTrainingProfileMock).toHaveBeenCalledWith({
      ...defaultProfile,
      blockedExercises: ["Nordic hamstring curl"],
      allowedExercises: [],
    });
  });
});
