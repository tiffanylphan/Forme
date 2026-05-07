import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import LibraryPage from "./page";

describe("LibraryPage", () => {
  it("filters exercises by search and expands details", async () => {
    const user = userEvent.setup();
    render(<LibraryPage />);

    await user.type(screen.getByPlaceholderText("Search exercises..."), "db snatch");
    expect(screen.getByText("DB snatch")).toBeInTheDocument();

    await user.click(screen.getByText("DB snatch"));
    expect(screen.getByText(/Primary:/)).toBeInTheDocument();
    expect(screen.getByText(/Equipment:/)).toBeInTheDocument();
  });

  it("shows empty state when filters remove all exercises", async () => {
    const user = userEvent.setup();
    render(<LibraryPage />);

    await user.type(screen.getByPlaceholderText("Search exercises..."), "zzzz");
    expect(screen.getByText("No exercises match your filters")).toBeInTheDocument();
  });
});
