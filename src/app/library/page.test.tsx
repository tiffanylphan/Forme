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

  it("shows muscle counts that match the clicked filter results", async () => {
    const user = userEvent.setup();
    render(<LibraryPage />);

    await user.click(screen.getByRole("button", { name: /hamstrings/i }));

    expect(screen.getByText("31 results")).toBeInTheDocument();
    expect(screen.getAllByText(/31 exercises/i).length).toBeGreaterThan(0);
  });

  it("matches search terms even when punctuation differs", async () => {
    const user = userEvent.setup();
    render(<LibraryPage />);

    await user.type(screen.getByPlaceholderText("Search exercises..."), "single leg hip thrust");
    expect(screen.getByText("Bench single-leg hip thrust")).toBeInTheDocument();
  });

  it("shows newly added exercises in search", async () => {
    const user = userEvent.setup();
    render(<LibraryPage />);

    await user.type(screen.getByPlaceholderText("Search exercises..."), "sumo squat");
    expect(screen.getByText("DB sumo squat")).toBeInTheDocument();
  });
});
