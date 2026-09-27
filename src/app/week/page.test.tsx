import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import WeekPage from "./page";

const useWorkoutsMock = vi.fn();
const useTrainingProfileMock = vi.fn();

vi.mock("@/lib/storage", () => ({
  useWorkouts: () => useWorkoutsMock(),
}));

vi.mock("@/lib/profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/profile")>("@/lib/profile");
  return {
    ...actual,
    useTrainingProfile: () => useTrainingProfileMock(),
  };
});

vi.mock("@/lib/format", async () => {
  const actual = await vi.importActual<typeof import("@/lib/format")>("@/lib/format");
  return {
    ...actual,
    // Pin "today" so workout date 2026-05-18 is always within the current week
    // (week of Mon 2026-05-13 → Sun 2026-05-19).
    todayISO: () => "2026-05-18",
  };
});

describe("WeekPage", () => {
  it("renders coverage information for logged workouts", () => {
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
          date: "2026-05-18",
          source: "manual",
          createdAt: 1,
          updatedAt: 1,
          exercises: [
            {
              id: "e1",
              exerciseName: "Cable row",
              supersetGroup: null,
              sets: [
                { id: "s1", reps: 12, weight: 70, unit: "lb" },
                { id: "s2", reps: 12, weight: 70, unit: "lb" },
              ],
            },
          ],
        },
      ],
    });

    render(<WeekPage />);
    expect(screen.getByText("Movement coverage")).toBeInTheDocument();
    expect(screen.getByText("Patterns to fill")).toBeInTheDocument();
    expect(screen.getByText("Weekly muscle stimulus")).toBeInTheDocument();
    expect(screen.getByText("Muscle heat")).toBeInTheDocument();
    expect(screen.getByText("Front")).toBeInTheDocument();
    expect(screen.getByText("Back")).toBeInTheDocument();
    expect(screen.getByText("Most worked")).toBeInTheDocument();
    expect(screen.getByText("Top muscle focus")).toBeInTheDocument();
  });

  it("labels a muscle past its floor but under its ceiling as in range with its percentage", () => {
    // 3-day physique beginner back floor is 8.5 (10 sets × 1.0 × 0.85) and the
    // ceiling is 26; 12 Cable rows (primaryPerSet 1) put it at ~141% of the
    // floor — inside the band, so the honest read is "in range", with the
    // percentage so a lifter can see how far past the floor they are.
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 3,
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
          date: "2026-05-18",
          source: "manual",
          createdAt: 1,
          updatedAt: 1,
          exercises: [
            {
              id: "e1",
              exerciseName: "Cable row",
              supersetGroup: null,
              sets: Array.from({ length: 12 }, (_, i) => ({
                id: `s${i}`,
                reps: 12,
                weight: 70,
                unit: "lb" as const,
              })),
            },
          ],
        },
      ],
    });

    render(<WeekPage />);
    expect(screen.getByText("In range (141%)")).toBeInTheDocument();
    expect(screen.queryByText(/Over ceiling/)).not.toBeInTheDocument();
  });

  it("recommends adding sets to the lagging side of a push/pull imbalance", () => {
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
          date: "2026-05-18",
          source: "manual",
          createdAt: 1,
          updatedAt: 1,
          exercises: [
            {
              id: "e1",
              exerciseName: "DB flat bench press",
              supersetGroup: null,
              sets: [
                { id: "s1", reps: 10, weight: 60, unit: "lb" },
                { id: "s2", reps: 10, weight: 60, unit: "lb" },
              ],
            },
            {
              id: "e2",
              exerciseName: "Cable row",
              supersetGroup: null,
              sets: [
                { id: "s3", reps: 12, weight: 70, unit: "lb" },
                { id: "s4", reps: 12, weight: 70, unit: "lb" },
                { id: "s5", reps: 12, weight: 70, unit: "lb" },
                { id: "s6", reps: 12, weight: 70, unit: "lb" },
                { id: "s7", reps: 12, weight: 70, unit: "lb" },
                { id: "s8", reps: 12, weight: 70, unit: "lb" },
              ],
            },
          ],
        },
      ],
    });

    render(<WeekPage />);
    // Pull (6 sets) outweighs push (2 sets) by set count, and the push
    // muscles (shoulders/triceps) are genuinely under their weekly targets —
    // the recommendation should name them specifically, not say "push sets".
    expect(screen.getByText(/add chest\/shoulders\/triceps sets to close the gap/)).toBeInTheDocument();
  });

  it("notes when a set-count imbalance doesn't reflect a real muscle-level gap", () => {
    // 3-day physique beginner pull-side floors are back 8.5, rear_delts 3.3 and
    // biceps 3.3 — 9 Cable rows (primaryPerSet 1), 7 DB reverse flys and 6 curls
    // (primaryPerSet 0.65) clear all three, while 32 push sets keep the
    // set-count ratio (32:22 ≈ 1.45:1) past the imbalance threshold.
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 3,
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
          date: "2026-05-18",
          source: "manual",
          createdAt: 1,
          updatedAt: 1,
          exercises: [
            {
              id: "e1",
              exerciseName: "DB flat bench press",
              supersetGroup: null,
              sets: Array.from({ length: 32 }, (_, i) => ({
                id: `p${i}`,
                reps: 10,
                weight: 60,
                unit: "lb" as const,
              })),
            },
            {
              id: "e2",
              exerciseName: "Cable row",
              supersetGroup: null,
              sets: Array.from({ length: 9 }, (_, i) => ({
                id: `s${i}`,
                reps: 12,
                weight: 70,
                unit: "lb" as const,
              })),
            },
            {
              // biceps carries a weekly target now, so cover it directly —
              // this test is about the "no real gap" branch, not biceps.
              id: "e4",
              exerciseName: "Cable curl",
              supersetGroup: null,
              sets: Array.from({ length: 6 }, (_, i) => ({
                id: `c${i}`,
                reps: 12,
                weight: 20,
                unit: "lb" as const,
              })),
            },
            {
              id: "e3",
              exerciseName: "DB reverse fly",
              supersetGroup: null,
              sets: Array.from({ length: 7 }, (_, i) => ({
                id: `r${i}`,
                reps: 12,
                weight: 15,
                unit: "lb" as const,
              })),
            },
          ],
        },
      ],
    });

    render(<WeekPage />);
    // Push is over pull by set count, but pull muscles (back/rear_delts)
    // are already at/over their weekly targets from the volume above — the
    // flag should say so instead of naming muscles that don't need more work.
    expect(
      screen.getByText(/by set count, but pull muscles are already meeting their weekly targets/),
    ).toBeInTheDocument();
  });

  it("renders empty state when no workouts are logged", () => {
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
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<WeekPage />);
    expect(screen.getByText("No workouts logged in this week yet.")).toBeInTheDocument();
  });
});
