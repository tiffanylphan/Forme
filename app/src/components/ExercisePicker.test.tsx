import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ExercisePicker } from "./ExercisePicker";

describe("ExercisePicker", () => {
  it("filters and selects exercises", async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();

    render(
      <ExercisePicker
        open
        onClose={() => {}}
        onPick={onPick}
        alreadyAddedCounts={{ "Cable row": 1 }}
      />,
    );

    await user.type(screen.getByPlaceholderText("Search exercises…"), "cable row");
    expect(screen.getByText("Cable row")).toBeInTheDocument();
    expect(screen.getByText("1×")).toBeInTheDocument();

    await user.click(screen.getByText("Cable row"));
    expect(onPick).toHaveBeenCalledWith("Cable row");
  });

  it("shows empty state when filters remove all exercises", async () => {
    const user = userEvent.setup();
    render(
      <ExercisePicker open onClose={() => {}} onPick={() => {}} />,
    );

    await user.type(screen.getByPlaceholderText("Search exercises…"), "not-a-real-exercise");
    expect(screen.getByText("No exercises match your filters")).toBeInTheDocument();
  });
});
