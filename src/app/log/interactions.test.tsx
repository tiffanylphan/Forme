import { render, screen, within } from "@testing-library/react";
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
});
