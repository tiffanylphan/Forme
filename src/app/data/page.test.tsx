import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { parseImportText } from "@/lib/import";
import DataPage from "./page";

const useWorkoutsMock = vi.fn();
const loadWorkoutsMock = vi.fn();
const saveWorkoutsMock = vi.fn();
const normalizeWorkoutsMock = vi.fn();

vi.mock("@/lib/storage", () => ({
  useWorkouts: () => useWorkoutsMock(),
  loadWorkouts: () => loadWorkoutsMock(),
  saveWorkouts: (...args: unknown[]) => saveWorkoutsMock(...args),
  normalizeWorkouts: (...args: unknown[]) => normalizeWorkoutsMock(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const workout = {
  id: "w1",
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
};

// ---- parseImportText unit tests ----

describe("parseImportText", () => {
  it("parses a JSON array", () => {
    const result = parseImportText(JSON.stringify([workout]));
    expect(result).toEqual([workout]);
  });

  it("parses CSV into row objects", () => {
    const csv = [
      "workout_id,date,source,plan_slot,exercise,set_number,reps,weight,unit,duration_sec,distance_m,progression_status,workout_notes",
      "w1,2026-05-06,manual,,Cable row,1,12,70,lb,,,baseline,",
    ].join("\n");
    const result = parseImportText(csv);
    expect(result).toHaveLength(1);
    expect((result![0] as Record<string, unknown>).workout_id).toBe("w1");
    expect((result![0] as Record<string, unknown>).exercise).toBe("Cable row");
    expect((result![0] as Record<string, unknown>).reps).toBe("12");
  });

  it("handles quoted CSV fields with commas", () => {
    const csv = [
      "workout_id,date,source,plan_slot,exercise,set_number,reps,weight,unit,duration_sec,distance_m,progression_status,workout_notes",
      'w1,2026-05-06,manual,,Cable row,1,12,70,lb,,,baseline,"Good, felt strong"',
    ].join("\n");
    const result = parseImportText(csv);
    expect((result![0] as Record<string, unknown>).workout_notes).toBe("Good, felt strong");
  });

  it("parses CSV with quoted headers (spreadsheet export format)", () => {
    const csv = [
      '"workout_id","date","source","plan_slot","exercise","set_number","reps","weight","unit","duration_sec","distance_m","progression_status","workout_notes"',
      '"w1","2026-05-06","manual","","Cable row","1","12","70","lb","","","baseline",""',
    ].join("\n");
    const result = parseImportText(csv);
    expect(result).toHaveLength(1);
    expect((result![0] as Record<string, unknown>).workout_id).toBe("w1");
    expect((result![0] as Record<string, unknown>).exercise).toBe("Cable row");
    expect((result![0] as Record<string, unknown>).reps).toBe("12");
  });

  it("returns null for unrecognised input", () => {
    expect(parseImportText("not valid at all")).toBeNull();
    expect(parseImportText("")).toBeNull();
  });
});

// ---- DataPage integration tests ----

describe("DataPage", () => {
  it("shows export button when workouts exist", () => {
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [workout] });
    loadWorkoutsMock.mockReturnValue([workout]);
    render(<DataPage />);
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
  });

  it("disables export when no workouts", () => {
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });
    render(<DataPage />);
    expect(screen.getByRole("button", { name: "No workouts to export" })).toBeDisabled();
  });

  it("imports pasted CSV successfully", () => {
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });
    normalizeWorkoutsMock.mockReturnValue([workout]);
    render(<DataPage />);

    const csv = [
      "workout_id,date,source,plan_slot,exercise,set_number,reps,weight,unit,duration_sec,distance_m,progression_status,workout_notes",
      "w1,2026-05-06,manual,,Cable row,1,12,70,lb,,,baseline,",
    ].join("\n");

    fireEvent.change(screen.getByPlaceholderText(/workout_id/), { target: { value: csv } });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(normalizeWorkoutsMock).toHaveBeenCalled();
    expect(saveWorkoutsMock).toHaveBeenCalledWith([workout]);
  });

  it("imports pasted JSON successfully", () => {
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });
    normalizeWorkoutsMock.mockReturnValue([workout]);
    render(<DataPage />);

    fireEvent.change(screen.getByPlaceholderText(/workout_id/), {
      target: { value: JSON.stringify([workout]) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(saveWorkoutsMock).toHaveBeenCalledWith([workout]);
  });

  it("shows an error for unrecognised input", () => {
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });
    render(<DataPage />);

    fireEvent.change(screen.getByPlaceholderText(/workout_id/), {
      target: { value: "garbage data" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Import" }));

    expect(screen.getByText(/couldn't recognise/i)).toBeInTheDocument();
    expect(saveWorkoutsMock).not.toHaveBeenCalled();
  });
});
