import { describe, expect, it } from "vitest";
import { getWeekPhase } from "./periodization";
import type { SessionEffort, Workout } from "./types";

// 2025-01-06 is a Monday. Week 0 starts there; "today" lives in week N.
const BASE_MONDAY = "2025-01-06";

const dateInWeek = (week: number, dayOffset: number): string => {
  const [y, m, d] = BASE_MONDAY.split("-").map(Number);
  const dt = new Date(y, m - 1, d + week * 7 + dayOffset);
  const mm = String(dt.getMonth() + 1).padStart(2, "0");
  const dd = String(dt.getDate()).padStart(2, "0");
  return `${dt.getFullYear()}-${mm}-${dd}`;
};

let nextId = 0;
const workout = (
  date: string,
  totalSets: number,
  sessionEffort?: SessionEffort,
): Workout => {
  nextId += 1;
  return {
    id: `w${nextId}`,
    date,
    source: "manual",
    createdAt: nextId,
    updatedAt: nextId,
    sessionEffort,
    exercises: [
      {
        id: `e${nextId}`,
        exerciseName: "Goblet squat",
        supersetGroup: null,
        sets: Array.from({ length: totalSets }, (_, i) => ({
          id: `s${nextId}-${i}`,
          reps: 10,
          weight: 50,
          unit: "lb" as const,
        })),
      },
    ],
  };
};

// A normal build week: two sessions, 15 sets each.
const buildWeek = (week: number, efforts: (SessionEffort | undefined)[] = []) => [
  workout(dateInWeek(week, 0), 15, efforts[0]),
  workout(dateInWeek(week, 3), 15, efforts[1]),
];

describe("getWeekPhase", () => {
  it("puts a fresh user with no history in build", () => {
    expect(getWeekPhase([], dateInWeek(0, 2))).toEqual({
      phase: "build",
      buildWeeks: 0,
      intensityScale: 1.0,
      reason: null,
    });
  });

  it("stays in build during the first weeks of a meso", () => {
    const history = [...buildWeek(0), ...buildWeek(1)];
    const phase = getWeekPhase(history, dateInWeek(2, 2));
    expect(phase.phase).toBe("build");
    expect(phase.buildWeeks).toBe(2);
    expect(phase.intensityScale).toBe(1.0);
    expect(phase.reason).toBeNull();
  });

  it("schedules a deload after 4 consecutive build weeks", () => {
    const history = [0, 1, 2, 3].flatMap((w) => buildWeek(w));
    const phase = getWeekPhase(history, dateInWeek(4, 2));
    expect(phase.phase).toBe("deload");
    expect(phase.buildWeeks).toBe(4);
    expect(phase.intensityScale).toBe(0.75);
    expect(phase.reason).toMatch(/deload/i);
  });

  it("keeps 3 build weeks in build when fatigue is normal", () => {
    const history = [
      ...buildWeek(0, ["right", "brutal"]),
      ...buildWeek(1, ["right", "right"]),
      ...buildWeek(2, ["easy", "right"]),
    ];
    const phase = getWeekPhase(history, dateInWeek(3, 2));
    expect(phase.phase).toBe("build");
    expect(phase.buildWeeks).toBe(3);
  });

  it("accelerates the deload after 3 build weeks with >= 2 brutal ratings", () => {
    const history = [
      ...buildWeek(0, ["brutal", "right"]),
      ...buildWeek(1),
      ...buildWeek(2, ["brutal", "right"]),
    ];
    const phase = getWeekPhase(history, dateInWeek(3, 2));
    expect(phase.phase).toBe("deload");
    expect(phase.buildWeeks).toBe(3);
    expect(phase.intensityScale).toBe(0.75);
    expect(phase.reason).toMatch(/brutal/i);
  });

  it("resets the chain after a materially low-volume week", () => {
    const history = [
      ...buildWeek(0),
      ...buildWeek(1),
      // Two sessions but only 8 total sets vs a trailing average of 30.
      workout(dateInWeek(2, 0), 4),
      workout(dateInWeek(2, 3), 4),
      ...buildWeek(3),
      ...buildWeek(4),
    ];
    const phase = getWeekPhase(history, dateInWeek(5, 2));
    expect(phase.phase).toBe("build");
    expect(phase.buildWeeks).toBe(2);
  });

  it("treats a vacation gap as a deload and resets the chain", () => {
    const history = [
      ...buildWeek(0),
      ...buildWeek(1),
      ...buildWeek(2),
      // week 3: nothing logged
      ...buildWeek(4),
      ...buildWeek(5),
    ];
    const phase = getWeekPhase(history, dateInWeek(6, 2));
    expect(phase.phase).toBe("build");
    expect(phase.buildWeeks).toBe(2);
  });

  it("breaks the chain on a week with a single workout", () => {
    const history = [
      ...buildWeek(0),
      ...buildWeek(1),
      ...buildWeek(2),
      workout(dateInWeek(3, 0), 15),
      ...buildWeek(4),
    ];
    const phase = getWeekPhase(history, dateInWeek(5, 2));
    expect(phase.phase).toBe("build");
    expect(phase.buildWeeks).toBe(1);
  });

  it("resets the count after a derived deload week even if the user trained hard through it", () => {
    const history = [
      ...[0, 1, 2, 3].flatMap((w) => buildWeek(w)),
      // week 4 is the derived deload; user ignored it and trained full volume
      ...buildWeek(4),
      ...buildWeek(5),
      ...buildWeek(6),
    ];
    const phase = getWeekPhase(history, dateInWeek(7, 2));
    expect(phase.phase).toBe("build");
    expect(phase.buildWeeks).toBe(2);
  });

  it("ignores workouts logged during the current week", () => {
    const history = [
      ...[0, 1, 2, 3].flatMap((w) => buildWeek(w)),
      workout(dateInWeek(4, 0), 6),
      workout(dateInWeek(4, 1), 6),
    ];
    const phase = getWeekPhase(history, dateInWeek(4, 2));
    expect(phase.phase).toBe("deload");
    expect(phase.buildWeeks).toBe(4);
  });

  it("is deterministic and stable across days within the same week", () => {
    const history = [0, 1, 2, 3].flatMap((w) => buildWeek(w));
    const monday = getWeekPhase(history, dateInWeek(4, 0));
    const sunday = getWeekPhase(history, dateInWeek(4, 6));
    expect(monday).toEqual(sunday);
    expect(getWeekPhase(history, dateInWeek(4, 0))).toEqual(monday);
  });

  it("counts brutal ratings only within the active chain", () => {
    const history = [
      ...buildWeek(0, ["brutal", "brutal"]),
      // week 1 off resets the chain, so those brutals no longer count
      ...buildWeek(2),
      ...buildWeek(3),
      ...buildWeek(4),
    ];
    const phase = getWeekPhase(history, dateInWeek(5, 2));
    expect(phase.phase).toBe("build");
    expect(phase.buildWeeks).toBe(3);
  });
});
