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
  popEditWorkout: () => popEditWorkoutMock(),
  upsertWorkout: (workout: unknown) => upsertWorkoutMock(workout),
}));

describe("LogPage", () => {
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
    await user.click(screen.getByText("Save"));

    expect(upsertWorkoutMock).toHaveBeenCalledTimes(1);
    const savedWorkout = upsertWorkoutMock.mock.calls[0][0];
    expect(savedWorkout.id).toBe("workout-1");
    expect(savedWorkout.exercises).toHaveLength(1);
    expect(routerPushMock).toHaveBeenCalledWith("/workout/workout-1");
  });

  it("restores a saved draft indicator", () => {
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
    expect(screen.getByText("Restored your in-progress workout draft.")).toBeInTheDocument();
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
    await user.click(screen.getByText("Save"));

    expect(upsertWorkoutMock).toHaveBeenCalledTimes(1);
    expect(upsertWorkoutMock.mock.calls[0][0].planSlot).toEqual({
      slotId: "upper_back_shoulder",
      title: "Upper A",
    });
  });
});
