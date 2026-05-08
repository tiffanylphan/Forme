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
    progression: {
      lastSummary: "95 lb x 10/8/8/6",
      goal: "Match or beat 10/8/8/6 reps with solid form.",
      nextStep: "Last time cleared the target. Add 2.5-5 lb if technique stays crisp.",
      recentHistory: [
        { date: "2026-05-04", summary: "95 lb x 10/8/8/6", status: "progressed" },
        { date: "2026-05-01", summary: "95 lb x 10/8/7/6", status: "held" },
      ],
    },
  }),
  generateNextWorkout: () => ({
    split: {
      slotId: "upper_a",
      title: "Upper A",
      summary: "Back and shoulder emphasis.",
      sessionIndex: 1,
      totalSessions: 4,
      targetPrimarySets: {
        back: 8,
        shoulders: 5,
        rear_delts: 4,
      },
    },
    rationale: [
      "This is Upper A: Back and shoulder emphasis.",
      "Still building this slot's focus volume: back, shoulders.",
      "Hit only once: pull, push.",
    ],
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
            progression: {
              lastSummary: "70 lb x 10/8/7/6",
              goal: "Work toward 10/8/8/6 reps before increasing load.",
              nextStep: "Stay at 70 lb and add 1-2 total reps across the work sets.",
              recentHistory: [
                { date: "2026-05-05", summary: "70 lb x 10/8/7/6", status: "held" },
                { date: "2026-05-03", summary: "70 lb x 10/8/8/6", status: "progressed" },
                { date: "2026-04-30", summary: "70 lb x 9/8/7/6", status: "missed" },
              ],
            },
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

  it("shows several closest role-matched swap options", async () => {
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
    await user.click(screen.getByText("Swap"));

    const optionButtons = screen.getAllByRole("button");
    const swapStart = optionButtons.findIndex((button) =>
      within(button).queryByText("DB bent-over row"),
    );
    const singleArmRowIndex = optionButtons.findIndex((button) =>
      within(button).queryByText("DB single-arm row"),
    );
    const barbellRowIndex = optionButtons.findIndex((button) =>
      within(button).queryByText("Barbell bent-over row"),
    );
    const tBarRowIndex = optionButtons.findIndex((button) =>
      within(button).queryByText("T-bar row"),
    );

    expect(swapStart).toBeGreaterThanOrEqual(0);
    expect(singleArmRowIndex).toBeGreaterThanOrEqual(0);
    expect(barbellRowIndex).toBeGreaterThanOrEqual(0);
    expect(tBarRowIndex).toBeGreaterThanOrEqual(0);
    expect(screen.queryByText("Lat pulldown")).not.toBeInTheDocument();
    expect(screen.queryByText("Straight-arm pulldown")).not.toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes("most directly comparable matches shown first")),
    ).toBeInTheDocument();
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

  it("shows only the rationale highlights until expanded", async () => {
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

    expect(
      screen.getByText((content) =>
        content.includes("This is Upper A: Back and shoulder emphasis."),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText((content) =>
        content.includes("Still building this slot's focus volume: back, shoulders."),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText((content) => content.includes("Hit only once: pull, push.")),
    ).not.toBeInTheDocument();

    await user.click(screen.getByText("Show 1 more"));

    expect(
      screen.getByText((content) => content.includes("Hit only once: pull, push.")),
    ).toBeInTheDocument();
    expect(screen.getByText("Show less")).toBeInTheDocument();
  });

  it("renders progression coaching for each exercise", () => {
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
    expect(screen.getByText(/Last:/)).toBeInTheDocument();
    expect(screen.getByText("held · 70 lb x 10/8/7/6")).toBeInTheDocument();
    expect(screen.getByText("progressed · 70 lb x 10/8/8/6")).toBeInTheDocument();
    expect(screen.getByText(/Goal: Work toward 10\/8\/8\/6 reps/)).toBeInTheDocument();
    expect(screen.getByText(/Next: Stay at 70 lb/)).toBeInTheDocument();
  });
});
