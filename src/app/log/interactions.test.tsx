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
          title: "Upper A",
          summary: "Back and shoulder emphasis.",
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
});
