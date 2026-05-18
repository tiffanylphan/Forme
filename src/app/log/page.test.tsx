import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import LogPage from "./page";
import { routerPushMock } from "../../../test/setup";

const popDraftMock = vi.fn();
const getWorkoutMock = vi.fn();
const popEditWorkoutMock = vi.fn();
const upsertWorkoutMock = vi.fn();

vi.mock("@/lib/generator", () => ({
  popDraft: () => popDraftMock(),
}));

vi.mock("@/lib/storage", () => ({
  getWorkout: (id: string) => getWorkoutMock(id),
  loadWorkouts: () => getWorkoutMock("all") ?? [],
  popEditWorkout: () => popEditWorkoutMock(),
  upsertWorkout: (workout: unknown) => upsertWorkoutMock(workout),
}));

describe("LogPage", () => {
  it("opens a per-exercise guide sheet with exercise coaching", async () => {
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
    popDraftMock.mockReturnValue(null);
    getWorkoutMock.mockReturnValue(null);

    render(<LogPage />);
    await screen.findByText("Edit workout");
    await user.click(screen.getByText("How"));

    expect(screen.getByText("Quick setup and form cues for this lift.")).toBeInTheDocument();
    expect(screen.getAllByText("Cable row")).toHaveLength(2);
    expect(screen.getByText((content) => content.includes("Drive elbow toward hip"))).toBeInTheDocument();
    expect(screen.getByText("Builds upper-back thickness and supports posture.")).toBeInTheDocument();
  });

  it("saves an edited workout and navigates back to detail", async () => {
    const user = userEvent.setup();
    let persistedWorkout: Record<string, unknown> | null = null;
    const workout = {
      id: "workout-1",
      date: "2026-05-06",
      source: "manual" as const,
      notes: "existing",
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
    };

    popEditWorkoutMock.mockReturnValue(workout);
    popDraftMock.mockReturnValue(null);
    upsertWorkoutMock.mockImplementation((savedWorkout) => {
      persistedWorkout = savedWorkout as Record<string, unknown>;
    });
    getWorkoutMock.mockImplementation(() => persistedWorkout);

    render(<LogPage />);
    await screen.findByText("Edit workout");
    await user.click(screen.getByText("Save"));

    expect(upsertWorkoutMock).toHaveBeenCalledTimes(1);
    const savedWorkout = upsertWorkoutMock.mock.calls[0][0];
    expect(savedWorkout.id).toBe("workout-1");
    expect(savedWorkout.exercises).toHaveLength(1);
    expect(savedWorkout.exercises[0].progressionStatus).toBe("baseline");
    expect(routerPushMock).toHaveBeenCalledWith("/workout/workout-1");
  });

  it("restores a saved draft indicator", async () => {
    popEditWorkoutMock.mockReturnValue(null);
    popDraftMock.mockReturnValue(null);
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
          title: "Upper A",
        },
        notes: "",
        isEditing: false,
        defaultUnit: "lb",
      }),
    );

    render(<LogPage />);
    expect(await screen.findByText("Restored your in-progress workout draft.")).toBeInTheDocument();
  });

  it("persists the planned split slot when saving a generated draft", async () => {
    const user = userEvent.setup();
    let persistedWorkout: Record<string, unknown> | null = null;

    popEditWorkoutMock.mockReturnValue(null);
    popDraftMock.mockReturnValue({
      source: "manual",
      draft: {
        split: {
          slotId: "upper_back_shoulder",
          title: "Upper A",
          summary: "Back and shoulder emphasis.",
          sessionIndex: 2,
          totalSessions: 4,
          targetPrimarySets: {
            back: 8,
            shoulders: 5,
          },
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
    upsertWorkoutMock.mockImplementation((savedWorkout) => {
      persistedWorkout = savedWorkout as Record<string, unknown>;
    });
    getWorkoutMock.mockImplementation(() => persistedWorkout);

    render(<LogPage />);
    await screen.findByText("Log workout");
    await user.click(screen.getByText("Save"));

    expect(upsertWorkoutMock).toHaveBeenCalledTimes(1);
    expect(upsertWorkoutMock.mock.calls[0][0].planSlot).toEqual({
      slotId: "upper_back_shoulder",
      title: "Upper A",
    });
  });

  it("shows the warm-up for a generated routine in the logger", async () => {
    popEditWorkoutMock.mockReturnValue(null);
    popDraftMock.mockReturnValue({
      source: "manual",
      draft: {
        split: {
          slotId: "upper_back_shoulder",
          title: "Upper A",
          summary: "Back and shoulder emphasis.",
          sessionIndex: 2,
          totalSessions: 4,
          targetPrimarySets: {
            back: 8,
            shoulders: 5,
          },
        },
        mobility: {
          title: "5-minute warm-up",
          items: ["Band row x 15", "Arm circles x 20s each way"],
          complementary: ["Scap push-up x 10"],
        },
        cooldown: {
          title: "Cooldown and stretch",
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
    expect(screen.getByText("5-minute warm-up")).toBeInTheDocument();
    expect(screen.getByText("· Band row x 15")).toBeInTheDocument();
    expect(screen.getByText("Complementary mobility")).toBeInTheDocument();
    expect(screen.getByText("· Scap push-up x 10")).toBeInTheDocument();
  });

  it("preserves grouped superset structure from a generated routine", async () => {
    popEditWorkoutMock.mockReturnValue(null);
    popDraftMock.mockReturnValue({
      source: "manual",
      draft: {
        split: {
          slotId: "upper_back_shoulder",
          title: "Upper A",
          summary: "Back and shoulder emphasis.",
          sessionIndex: 2,
          totalSessions: 4,
          targetPrimarySets: {
            back: 8,
            shoulders: 5,
          },
        },
        mobility: {
          title: "5-minute warm-up",
          items: ["Band row x 15"],
          complementary: [],
        },
        cooldown: {
          title: "Cooldown and stretch",
          items: ["Lat stretch x 30s"],
          complementary: [],
        },
        rationale: [],
        sections: [
          {
            kind: "compound",
            rounds: 4,
            repScheme: "10 / 8 / 8 / 6 — build weight",
            exercises: [
              {
                name: "Cable row",
                primary: ["back"],
                secondary: ["biceps"],
                pattern: "pull",
                movement: "pull",
                targets: [10, 8, 8, 6],
                suggestedWeight: 70,
                unit: "lb",
                isFamiliar: true,
              },
            ],
          },
          {
            kind: "accessory",
            rounds: 3,
            repScheme: "12–15 reps · short rest",
            exercises: [
              {
                name: "DB lateral raise",
                primary: ["shoulders"],
                secondary: ["rear_delts"],
                pattern: "push",
                movement: "push",
                targets: [15, 12, 12],
                suggestedWeight: 10,
                unit: "lb",
                isFamiliar: true,
              },
            ],
          },
        ],
      },
    });
    getWorkoutMock.mockReturnValue(null);

    render(<LogPage />);

    const supersetHeader = await screen.findByText((content) =>
      content.includes("Superset · 2 exercises · 4 rounds"),
    );
    const supersetCard = supersetHeader.closest("div.overflow-hidden.rounded-2xl");
    expect(supersetCard).not.toBeNull();
    expect(screen.getAllByText((content) => content.includes("Superset · 2 exercises · 4 rounds"))).toHaveLength(1);
    expect(screen.getByText("Cable row")).toBeInTheDocument();
    expect(screen.getByText("DB lateral raise")).toBeInTheDocument();
    expect(screen.getByText("10 / 8 / 8 / 6 — build weight")).toBeInTheDocument();
  });

  it("persists progression status when a previous performance exists", async () => {
    const user = userEvent.setup();
    let persistedWorkout: Record<string, unknown> | null = null;

    popEditWorkoutMock.mockReturnValue(null);
    popDraftMock.mockReturnValue({
      source: "manual",
      draft: {
        split: {
          slotId: "upper_back_shoulder",
          title: "Upper A",
          summary: "Back and shoulder emphasis.",
          sessionIndex: 2,
          totalSessions: 4,
          targetPrimarySets: { back: 8, shoulders: 5 },
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
                isFamiliar: true,
                progression: {
                  lastSummary: "65 lb x 10/10/10",
                  goal: "Match or beat 10/10/10 reps with solid form.",
                  nextStep: "Last time cleared the target. Add 2.5-5 lb if technique stays crisp.",
                  recentHistory: [
                    { date: "2026-05-05", summary: "65 lb x 10/10/10", status: "progressed" },
                  ],
                },
              },
            ],
          },
        ],
      },
    });
    getWorkoutMock.mockImplementation((id: string) => {
      if (id === "all") {
        return [
          {
            id: "prior",
            date: "2026-05-05",
            source: "manual",
            createdAt: 1,
            updatedAt: 1,
            exercises: [
              {
                id: "prior-ex",
                exerciseName: "Cable row",
                supersetGroup: null,
                sets: [
                  { id: "p1", reps: 10, weight: 65, unit: "lb" },
                  { id: "p2", reps: 10, weight: 65, unit: "lb" },
                  { id: "p3", reps: 10, weight: 65, unit: "lb" },
                ],
              },
            ],
          },
        ];
      }
      return persistedWorkout;
    });
    upsertWorkoutMock.mockImplementation((savedWorkout) => {
      persistedWorkout = savedWorkout as Record<string, unknown>;
    });

    render(<LogPage />);
    await screen.findByText("Log workout");
    await user.click(screen.getByText("Save"));

    expect(upsertWorkoutMock.mock.calls[0][0].exercises[0].progressionStatus).toBe("progressed");
  });
});
