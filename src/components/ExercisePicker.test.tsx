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

  it("can remove one already-added exercise from the picker list", async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();

    render(
      <ExercisePicker
        open
        onClose={() => {}}
        onPick={() => {}}
        onRemove={onRemove}
        alreadyAddedCounts={{ "Cable row": 2 }}
      />,
    );

    await user.type(screen.getByPlaceholderText("Search exercises…"), "cable row");
    await user.click(screen.getByRole("button", { name: "Remove one Cable row" }));

    expect(onRemove).toHaveBeenCalledWith("Cable row");
  });

  it("cycles a muscle chip through include, exclude, and back to unselected", async () => {
    const user = userEvent.setup();
    render(<ExercisePicker open onClose={() => {}} onPick={() => {}} />);

    const chip = screen.getByTestId("muscle-chip-hamstrings");
    expect(chip).toHaveAttribute("aria-pressed", "false");

    await user.click(chip); // -> include
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveStyle({ background: "#1a1a18" });

    await user.click(chip); // -> exclude
    expect(chip).toHaveAttribute("aria-pressed", "true");
    expect(chip).toHaveStyle({ textDecoration: "line-through" });

    await user.click(chip); // -> unselected
    expect(chip).toHaveAttribute("aria-pressed", "false");
  });

  it("combines an include and an exclude muscle filter", async () => {
    const user = userEvent.setup();
    render(<ExercisePicker open onClose={() => {}} onPick={() => {}} />);

    // DB Romanian deadlift hits hamstrings (primary) and glutes (primary) —
    // including hamstrings but excluding glutes should hide it, while an
    // exercise like Leg curl (hamstrings only) should remain visible.
    await user.click(screen.getByTestId("muscle-chip-hamstrings")); // include
    const glutesChip = screen.getByTestId("muscle-chip-glutes");
    await user.click(glutesChip); // include
    await user.click(glutesChip); // exclude

    expect(screen.queryByText("DB Romanian deadlift")).not.toBeInTheDocument();
    expect(screen.getByText("Leg curl")).toBeInTheDocument();
  });

  it("shows an over-target legend for an active muscle chip when target rows are supplied", async () => {
    const user = userEvent.setup();
    render(
      <ExercisePicker
        open
        onClose={() => {}}
        onPick={() => {}}
        muscleTargetRows={[
          { muscle: "glutes", target: 17, ceiling: null, done: 21.6, pct: 100, remaining: 0, overPct: 127, status: "over" },
        ]}
      />,
    );

    await user.click(screen.getByTestId("muscle-chip-glutes"));
    expect(screen.getByText(/Over ceiling \(127%\)/)).toBeInTheDocument();
  });
});
