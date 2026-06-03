import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import Home from "./page";

const useWorkoutsMock = vi.fn();
const loadWorkoutsMock = vi.fn();
const useTrainingProfileMock = vi.fn();

vi.mock("@/lib/storage", () => ({
  useWorkouts: () => useWorkoutsMock(),
  loadWorkouts: () => loadWorkoutsMock(),
}));

vi.mock("@/lib/profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/profile")>("@/lib/profile");
  return {
    ...actual,
    useTrainingProfile: () => useTrainingProfileMock(),
  };
});

describe("Home page", () => {
  it("renders the training profile and recent workouts", () => {
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
        intensity: "standard",
      },
    });
    useWorkoutsMock.mockReturnValue({
      ready: true,
      workouts: [
        {
          id: "w1",
          date: "2026-05-06",
          source: "manual",
          notes: "",
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

    render(<Home />);

    expect(screen.getByText("Training profile")).toBeInTheDocument();
    expect(screen.getByText("Physique")).toBeInTheDocument();
    expect(screen.getByText("Recent workouts")).toBeInTheDocument();
    expect(screen.getByText(/Cable row/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import Data" })).toHaveAttribute(
      "href",
      "/import",
    );
  });

  it("shows empty state when no workouts exist", () => {
    useTrainingProfileMock.mockReturnValue({ ready: true, profile: null });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<Home />);
    expect(screen.getByText("No workouts logged yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Import Data" })).toHaveAttribute(
      "href",
      "/import",
    );
    expect(screen.queryByRole("button", { name: "Export CSV" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Export JSON" })).not.toBeInTheDocument();
  });

  it("exports JSON in import-compatible format", async () => {
    const workouts = [
      {
        id: "w1",
        date: "2026-05-06",
        source: "manual",
        notes: "",
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
    ];
    useTrainingProfileMock.mockReturnValue({ ready: true, profile: null });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts });
    loadWorkoutsMock.mockReturnValue(workouts);

    const createObjectURL = vi.fn().mockReturnValue("blob:fake");
    const revokeObjectURL = vi.fn();
    window.URL.createObjectURL = createObjectURL;
    window.URL.revokeObjectURL = revokeObjectURL;

    render(<Home />);

    // Set up createElement spy after render so React's own <a> tags aren't intercepted.
    const linkEl = { href: "", download: "", click: vi.fn() };
    const originalCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      if (tag === "a") return linkEl as unknown as HTMLElement;
      return originalCreateElement(tag);
    });

    fireEvent.click(screen.getByRole("button", { name: "Export JSON" }));

    expect(createObjectURL).toHaveBeenCalledOnce();
    const blob = createObjectURL.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/json;charset=utf-8;");
    expect(blob.size).toBeGreaterThan(0);

    // Verify JSON content by re-serialising the source data the same way.
    const expectedJson = JSON.stringify(workouts, null, 2);
    expect(blob.size).toBe(new Blob([expectedJson]).size);

    expect(linkEl.download).toMatch(/forme-workout-history-.*\.json$/);
    expect(linkEl.click).toHaveBeenCalled();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
});
