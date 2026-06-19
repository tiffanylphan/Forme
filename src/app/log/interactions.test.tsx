import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import LogPage from "./page";

const popDraftMock = vi.fn();
const getWorkoutMock = vi.fn();
const popEditWorkoutMock = vi.fn();
const upsertWorkoutMock = vi.fn();

vi.mock("@/lib/generator", () => ({
  popDraft: () => popDraftMock(),
}));

vi.mock("@/lib/storage", () => ({
  getWorkout: (id: string) => getWorkoutMock(id),
  loadWorkouts: () => [],
  popEditWorkout: () => popEditWorkoutMock(),
  upsertWorkout: (workout: unknown) => upsertWorkoutMock(workout),
}));

describe("LogPage interactions", () => {
  it("adds an exercise through the picker and allows editing sets", async () => {
    const user = userEvent.setup();
    popEditWorkoutMock.mockReturnValue(null);
    popDraftMock.mockReturnValue(null);
    getWorkoutMock.mockReturnValue(null);

    render(<LogPage />);

    await user.click(screen.getByText("+ Add exercise"));
    await user.type(screen.getByPlaceholderText("Search exercises…"), "cable row");
    await user.click(screen.getByText("Cable row"));

    expect(screen.getAllByText("Cable row").length).toBeGreaterThan(0);
    expect(screen.getByText("Save")).not.toHaveAttribute("disabled");

    const repsInput = screen.getAllByPlaceholderText("—")[0];
    await user.type(repsInput, "12");
    expect(repsInput).toHaveValue(12);

    await user.click(screen.getByText("+ Add set"));
    expect(screen.getAllByLabelText("Remove set")).toHaveLength(2);
  });

  it("logs static holds like Plank in seconds rather than reps", async () => {
    const user = userEvent.setup();
    popEditWorkoutMock.mockReturnValue(null);
    popDraftMock.mockReturnValue(null);
    getWorkoutMock.mockReturnValue(null);
    let persistedWorkout: Record<string, unknown> | null = null;
    upsertWorkoutMock.mockImplementation((savedWorkout) => {
      persistedWorkout = savedWorkout as Record<string, unknown>;
    });

    render(<LogPage />);

    await user.click(screen.getByText("+ Add exercise"));
    await user.type(screen.getByPlaceholderText("Search exercises…"), "Plank");
    await user.click(screen.getByText("Plank"));

    expect(screen.getByText("Sec")).toBeInTheDocument();
    expect(screen.queryByText("Reps")).not.toBeInTheDocument();

    const durationInput = screen.getAllByPlaceholderText("—")[0];
    await user.type(durationInput, "45");
    expect(durationInput).toHaveValue(45);

    await user.click(screen.getByText("Save"));

    const saved = persistedWorkout as {
      exercises: Array<{ sets: Array<{ reps: number | null; durationSec: number | null }> }>;
    } | null;
    expect(saved?.exercises[0]?.sets[0]?.durationSec).toBe(45);
    expect(saved?.exercises[0]?.sets[0]?.reps).toBeNull();
  });

  it("shows an error instead of navigating when save verification fails", async () => {
    const user = userEvent.setup();
    popEditWorkoutMock.mockReturnValue(null);
    popDraftMock.mockReturnValue(null);
    upsertWorkoutMock.mockImplementation(() => {});
    getWorkoutMock.mockReturnValue(null);

    render(<LogPage />);

    await user.click(screen.getByText("+ Add exercise"));
    await user.type(screen.getByPlaceholderText("Search exercises…"), "cable row");
    await user.click(screen.getByText("Cable row"));
    await user.click(screen.getByText("Save"));

    expect(
      screen.getByText(
        "Save failed. Your workout is still kept in this browser so you can try again.",
      ),
    ).toBeInTheDocument();
  });

  it("allows swapping an exercise while editing", async () => {
    const user = userEvent.setup();
    popEditWorkoutMock.mockReturnValue({
      id: "workout-1",
      date: "2026-05-06",
      source: "manual" as const,
      createdAt: 10,
      updatedAt: 11,
      exercises: [
        {
          id: "ex1",
          exerciseName: "Cable row",
          supersetGroup: null,
          sets: [{ id: "set1", reps: 12, weight: 70, unit: "lb" as const }],
        },
      ],
    });
    getWorkoutMock.mockReturnValue(null);

    render(<LogPage />);
    await screen.findByText("Edit workout");

    await user.click(screen.getByText("Swap"));
    await user.type(screen.getByPlaceholderText("Search exercises…"), "lat pulldown");
    await user.click(screen.getByText("Lat pulldown"));

    expect(screen.getByText("Lat pulldown")).toBeInTheDocument();
    expect(screen.queryByText("Cable row")).not.toBeInTheDocument();
  });

  it("allows swapping an exercise from a generated routine before saving", async () => {
    const user = userEvent.setup();
    popEditWorkoutMock.mockReturnValue(null);
    popDraftMock.mockReturnValue({
      source: "manual",
      draft: {
        split: {
          slotId: "upper_back_shoulder",
          title: "Upper A · Back/Shoulders",
          summary: "Upper session theme with back, shoulders, and glute support.",
          sessionIndex: 2,
          totalSessions: 4,
          targetPrimarySets: { back: 8, shoulders: 5 },
        },
        mobility: {
          title: "5-minute warm-up",
          items: ["Band row x 15"],
          complementary: ["Arm circles x 20s each way"],
        },
        cooldown: {
          title: "Cooldown",
          items: ["Lat stretch x 30s"],
          complementary: [],
        },
        rationale: [],
        sections: [
          {
            kind: "compound",
            rounds: 3,
            repScheme: "3 x 10",
            exercises: [
              {
                name: "Cable row",
                primary: ["back"],
                secondary: ["biceps"],
                pattern: "pull",
                movement: "pull",
                targets: [10, 10, 10],
                suggestedWeight: 70,
                unit: "lb",
                isFamiliar: false,
              },
            ],
          },
        ],
      },
    });
    getWorkoutMock.mockReturnValue(null);

    render(<LogPage />);
    await screen.findByText("Log workout");

    await user.click(screen.getByText("Swap"));
    await user.type(screen.getByPlaceholderText("Search exercises…"), "lat pulldown");
    await user.click(screen.getByText("Lat pulldown"));

    expect(screen.getByText("Lat pulldown")).toBeInTheDocument();
    expect(screen.queryByText("Cable row")).not.toBeInTheDocument();
  });

  it("clears a restored draft and removes the warm-up block", async () => {
    const user = userEvent.setup();
    popEditWorkoutMock.mockReturnValue(null);
    popDraftMock.mockReturnValue(null);
    getWorkoutMock.mockReturnValue(null);
    sessionStorage.setItem(
      "workout.log-draft.v1",
      JSON.stringify({
        workoutId: "draft-1",
        date: "2026-05-06",
        source: "manual",
        exercises: [
          {
            id: "ex1",
            exerciseName: "Cable row",
            supersetGroup: null,
            sets: [{ id: "set1", reps: 12, weight: 70, unit: "lb" }],
          },
        ],
        planSlot: {
          slotId: "upper_back_shoulder",
          title: "Upper A · Back/Shoulders",
        },
        pendingDraft: {
          split: {
            slotId: "upper_back_shoulder",
            title: "Upper A · Back/Shoulders",
            summary: "Upper session theme with back, shoulders, and glute support.",
            sessionIndex: 2,
            totalSessions: 4,
            targetPrimarySets: { back: 8, shoulders: 5 },
          },
          mobility: {
            title: "5-minute warm-up",
            items: ["Band row x 15"],
            complementary: [],
          },
          cooldown: {
            title: "Cooldown",
            items: ["Lat stretch x 30s"],
            complementary: [],
          },
          rationale: [],
          sections: [],
        },
        notes: "",
        isEditing: false,
        defaultUnit: "lb",
      }),
    );

    render(<LogPage />);
    expect(await screen.findByText("Restored your in-progress workout draft.")).toBeInTheDocument();
    expect(screen.getByText("Before you lift")).toBeInTheDocument();

    await user.click(screen.getByText("Clear draft"));

    expect(screen.queryByText("Before you lift")).not.toBeInTheDocument();
    expect(screen.queryByText("Cable row")).not.toBeInTheDocument();
    expect(screen.getByText("No exercises yet. Tap below to add your first one.")).toBeInTheDocument();
  });

  it("links finisher exercises together as a superset group when hydrating a draft", async () => {
    const user = userEvent.setup();
    popEditWorkoutMock.mockReturnValue(null);
    let persistedWorkout: Record<string, unknown> | null = null;
    upsertWorkoutMock.mockImplementation((savedWorkout) => {
      persistedWorkout = savedWorkout as Record<string, unknown>;
    });
    popDraftMock.mockReturnValue({
      source: "manual",
      draft: {
        split: {
          slotId: "upper_back_shoulder",
          title: "Upper A · Back/Shoulders",
          summary: "Upper session",
          sessionIndex: 2,
          totalSessions: 4,
          targetPrimarySets: { back: 8 },
        },
        rationale: [],
        rotatedOffLifts: [],
        mobility: { title: "Warm-up", items: [], complementary: [] },
        cooldown: { title: "Cooldown", items: [], complementary: [] },
        sections: [
          {
            kind: "finisher",
            rounds: 3,
            repScheme: "8 reps each · finisher circuit",
            exercises: [
              { name: "Burpee", primary: ["core"], secondary: [], pattern: "conditioning", movement: null, targets: [8, 8, 8], suggestedWeight: null, unit: "lb", isFamiliar: true, progression: { lastSummary: null, goal: "", nextStep: "", recentHistory: [] } },
              { name: "High knees", primary: ["core"], secondary: [], pattern: "conditioning", movement: null, targets: [20, 20, 20], suggestedWeight: null, unit: "lb", isFamiliar: true, progression: { lastSummary: null, goal: "", nextStep: "", recentHistory: [] } },
            ],
          },
        ],
        slotRecommendations: [],
      },
    });
    getWorkoutMock.mockImplementation(() => persistedWorkout);

    render(<LogPage />);
    await screen.findByText("Log workout");
    await user.click(screen.getByText("Save"));

    const saved = upsertWorkoutMock.mock.calls[0]?.[0] as { exercises: Array<{ supersetGroup: string | null }> } | undefined;
    expect(saved?.exercises).toHaveLength(2);
    const group0 = saved?.exercises[0]?.supersetGroup;
    const group1 = saved?.exercises[1]?.supersetGroup;
    expect(group0).not.toBeNull();
    expect(group0).toBe(group1);
  });

  it("adds a round to a routine-hydrated superset block", async () => {
    const user = userEvent.setup();
    popEditWorkoutMock.mockReturnValue(null);
    popDraftMock.mockReturnValue({
      source: "manual",
      draft: {
        split: {
          slotId: "upper_back_shoulder",
          title: "Upper A · Back/Shoulders",
          summary: "Upper session",
          sessionIndex: 2,
          totalSessions: 4,
          targetPrimarySets: { back: 8, shoulders: 5 },
        },
        mobility: { title: "5-minute warm-up", items: [], complementary: [] },
        cooldown: { title: "Cooldown", items: [], complementary: [] },
        rationale: [],
        sections: [
          {
            kind: "compound",
            rounds: 3,
            repScheme: "3 x 10",
            exercises: [
              {
                name: "Cable row",
                primary: ["back"],
                secondary: ["biceps"],
                pattern: "pull",
                movement: "pull",
                targets: [10, 10, 10],
                suggestedWeight: 70,
                unit: "lb",
                isFamiliar: false,
              },
            ],
          },
        ],
      },
    });
    getWorkoutMock.mockReturnValue(null);

    render(<LogPage />);
    await screen.findByText("Round 3");
    expect(screen.queryByText("Round 4")).not.toBeInTheDocument();

    await user.click(screen.getByText("+ Add round"));

    expect(screen.getByText("Round 4")).toBeInTheDocument();
  });

  it("auto-clears draft metadata after removing the last exercise", async () => {
    const user = userEvent.setup();
    popEditWorkoutMock.mockReturnValue(null);
    popDraftMock.mockReturnValue({
      source: "manual",
      draft: {
        split: {
          slotId: "upper_back_shoulder",
          title: "Upper A · Back/Shoulders",
          summary: "Upper session theme with back, shoulders, and glute support.",
          sessionIndex: 2,
          totalSessions: 4,
          targetPrimarySets: { back: 8, shoulders: 5 },
        },
        mobility: {
          title: "5-minute warm-up",
          items: ["Band row x 15"],
          complementary: [],
        },
        cooldown: {
          title: "Cooldown",
          items: ["Lat stretch x 30s"],
          complementary: [],
        },
        rationale: [],
        sections: [
          {
            kind: "compound",
            rounds: 3,
            repScheme: "3 x 10",
            exercises: [
              {
                name: "Cable row",
                primary: ["back"],
                secondary: ["biceps"],
                pattern: "pull",
                movement: "pull",
                targets: [10, 10, 10],
                suggestedWeight: 70,
                unit: "lb",
                isFamiliar: false,
              },
            ],
          },
        ],
      },
    });
    getWorkoutMock.mockReturnValue(null);

    render(<LogPage />);
    expect(await screen.findByText("Before you lift")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Remove"));

    expect(screen.queryByText("Before you lift")).not.toBeInTheDocument();
    expect(screen.queryByText("Clear draft")).not.toBeInTheDocument();
    expect(screen.getByText("No exercises yet. Tap below to add your first one.")).toBeInTheDocument();
  });
});
