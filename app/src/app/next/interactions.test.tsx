import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import NextPage from "./page";

const useWorkoutsMock = vi.fn();
const useTrainingProfileMock = vi.fn();
const stashDraftMock = vi.fn();

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

vi.mock("@/lib/generator", () => ({
  buildDraftExercise: (_exercise: unknown, targets: (number | string)[]) => ({
    name: "Barbell bent-over row",
    primary: ["back"],
    secondary: ["biceps", "rear_delts", "core"],
    pattern: "pull",
    movement: "pull",
    targets,
    suggestedWeight: 95,
    unit: "lb",
    isFamiliar: true,
  }),
  generateNextWorkout: () => ({
    split: {
      slotId: "upper_a",
      title: "Upper A",
      summary: "Back and shoulder emphasis.",
      sessionIndex: 1,
      totalSessions: 4,
    },
    rationale: ["This is Upper A: Back and shoulder emphasis."],
    sections: [
      {
        kind: "compound",
        rounds: 4,
        repScheme: "10 / 8 / 8 / 6 — build weight",
        exercises: [
          {
            name: "Cable row",
            primary: ["back"],
            secondary: ["biceps", "rear_delts"],
            pattern: "pull",
            movement: "pull",
            targets: [10, 8, 8, 6],
            suggestedWeight: 70,
            unit: "lb",
            isFamiliar: true,
          },
        ],
      },
    ],
  }),
  stashDraft: (draft: unknown) => stashDraftMock(draft),
}));

describe("NextPage interactions", () => {
  it("swaps an exercise within the allowed movement family", async () => {
    const user = userEvent.setup();
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

    render(<NextPage />);
    expect(screen.getByText("Cable row")).toBeInTheDocument();

    await user.click(screen.getByText("Swap"));
    expect(screen.getByText("Swap exercise")).toBeInTheDocument();
    expect(screen.getByText("Pull only")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search…"), "barbell bent");
    await user.click(screen.getByText("Barbell bent-over row"));

    expect(screen.getByText("Barbell bent-over row")).toBeInTheDocument();
    expect(screen.queryByText("Swap exercise")).not.toBeInTheDocument();
  });

  it("stashes the selected routine when accepted", async () => {
    const user = userEvent.setup();
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

    render(<NextPage />);
    await user.click(screen.getByText("Use this routine →"));
    expect(stashDraftMock).toHaveBeenCalledTimes(1);
    const payload = stashDraftMock.mock.calls[0][0] as { source: string; draft: { split: { title: string } } };
    expect(payload.source).toBe("manual");
    expect(payload.draft.split.title).toBe("Upper A");
  });
});
