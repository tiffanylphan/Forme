import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import WorkoutDetailPage from "./page";
import {
  routerPushMock,
  useParamsMock,
} from "../../../../test/setup";

const deleteWorkoutMock = vi.fn();
const stashEditWorkoutMock = vi.fn();
const useWorkoutsMock = vi.fn();

vi.mock("@/lib/storage", () => ({
  deleteWorkout: (id: string) => deleteWorkoutMock(id),
  stashEditWorkout: (workout: unknown) => stashEditWorkoutMock(workout),
  useWorkouts: () => useWorkoutsMock(),
}));

describe("WorkoutDetailPage", () => {
  it("renders workout detail and stashes edit handoff", async () => {
    const user = userEvent.setup();
    useParamsMock.mockReturnValue({ id: "workout-1" });
    useWorkoutsMock.mockReturnValue({
      ready: true,
      workouts: [
        {
          id: "workout-0",
          date: "2026-05-04",
          source: "manual",
          createdAt: 0,
          updatedAt: 0,
          exercises: [
            {
              id: "e0",
              exerciseName: "Cable row",
              progressionStatus: "held",
              supersetGroup: null,
              sets: [
                { id: "s0-1", reps: 12, weight: 65, unit: "lb" },
                { id: "s0-2", reps: 10, weight: 65, unit: "lb" },
              ],
            },
          ],
        },
        {
          id: "workout-1",
          date: "2026-05-06",
          source: "manual",
          notes: "Felt strong",
          createdAt: 1,
          updatedAt: 1,
          exercises: [
            {
              id: "e1",
              exerciseName: "Cable row",
              progressionStatus: "progressed",
              supersetGroup: null,
              sets: [
                { id: "s1", reps: 12, weight: 70, unit: "lb" },
                { id: "s2", reps: 10, weight: 75, unit: "lb" },
              ],
            },
            {
              id: "e2",
              exerciseName: "Plank",
              progressionStatus: "baseline",
              supersetGroup: null,
              sets: [
                { id: "s3", reps: null, weight: null, unit: "lb", durationSec: 45 },
              ],
            },
          ],
        },
      ],
    });

    render(<WorkoutDetailPage />);
    expect(screen.getByText("Cable row")).toBeInTheDocument();
    expect(screen.getByText("Progressed")).toBeInTheDocument();
    expect(screen.getByText("Recent history")).toBeInTheDocument();
    expect(screen.getByText(/65 lb x 12\/10/)).toBeInTheDocument();
    expect(screen.getByText("Felt strong")).toBeInTheDocument();

    // Duration-based holds display as seconds, not as a bare rep count.
    expect(screen.getByText("45s")).toBeInTheDocument();

    await user.click(screen.getByText("Edit"));
    expect(stashEditWorkoutMock).toHaveBeenCalledTimes(1);
    expect(routerPushMock).toHaveBeenCalledWith("/log");
  });

  it("deletes a workout after confirmation", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => true));
    useParamsMock.mockReturnValue({ id: "workout-1" });
    useWorkoutsMock.mockReturnValue({
      ready: true,
      workouts: [
        {
          id: "workout-1",
          date: "2026-05-06",
          source: "manual",
          createdAt: 1,
          updatedAt: 1,
          exercises: [
            {
              id: "e1",
              exerciseName: "Cable row",
              supersetGroup: null,
              sets: [{ id: "s1", reps: 12, weight: 70, unit: "lb" }],
            },
          ],
        },
      ],
    });

    render(<WorkoutDetailPage />);
    await user.click(screen.getByText("Delete workout"));
    expect(deleteWorkoutMock).toHaveBeenCalledWith("workout-1");
    expect(routerPushMock).toHaveBeenCalledWith("/");
  });
});
