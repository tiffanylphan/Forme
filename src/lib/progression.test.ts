import { describe, expect, it } from "vitest";
import { evaluateProgressionStatus, getStallState } from "./progression";
import type { Workout } from "./types";

const workout = (
  id: string,
  date: string,
  exerciseName: string,
  sets: Array<{ reps?: number | null; weight?: number | null; durationSec?: number | null }>,
): Workout => ({
  id,
  date,
  source: "manual",
  createdAt: 1,
  updatedAt: 1,
  exercises: [
    {
      id: `${id}-ex`,
      exerciseName,
      supersetGroup: null,
      sets: sets.map((set, index) => ({
        id: `${id}-set-${index}`,
        reps: set.reps ?? null,
        weight: set.weight ?? null,
        durationSec: set.durationSec ?? null,
        unit: "lb",
      })),
    },
  ],
});

describe("evaluateProgressionStatus", () => {
  it("returns baseline when there is no previous performance", () => {
    const status = evaluateProgressionStatus("Cable row", [
      { id: "s1", reps: 12, weight: 70, unit: "lb" },
    ], []);
    expect(status).toBe("baseline");
  });

  it("marks higher load with similar reps as progressed", () => {
    const status = evaluateProgressionStatus(
      "Cable row",
      [
        { id: "s1", reps: 12, weight: 75, unit: "lb" },
        { id: "s2", reps: 10, weight: 75, unit: "lb" },
      ],
      [
        workout("w1", "2026-05-05", "Cable row", [
          { reps: 12, weight: 70 },
          { reps: 10, weight: 70 },
        ]),
      ],
    );
    expect(status).toBe("progressed");
  });

  it("marks equal load and reps as held", () => {
    const status = evaluateProgressionStatus(
      "Cable row",
      [
        { id: "s1", reps: 12, weight: 70, unit: "lb" },
        { id: "s2", reps: 10, weight: 70, unit: "lb" },
      ],
      [
        workout("w1", "2026-05-05", "Cable row", [
          { reps: 12, weight: 70 },
          { reps: 10, weight: 70 },
        ]),
      ],
    );
    expect(status).toBe("held");
  });

  it("marks lower reps at the same load as missed when volume drops significantly", () => {
    const status = evaluateProgressionStatus(
      "Cable row",
      [
        { id: "s1", reps: 10, weight: 70, unit: "lb" },
        { id: "s2", reps: 8, weight: 70, unit: "lb" },
      ],
      [
        workout("w1", "2026-05-05", "Cable row", [
          { reps: 12, weight: 70 },
          { reps: 10, weight: 70 },
        ]),
      ],
    );
    expect(status).toBe("missed");
  });

  it("marks higher load with fewer reps as progressed when reps held up", () => {
    const status = evaluateProgressionStatus(
      "Cable row",
      [
        { id: "s1", reps: 10, weight: 75, unit: "lb" },
        { id: "s2", reps: 9, weight: 75, unit: "lb" },
        { id: "s3", reps: 9, weight: 75, unit: "lb" },
        { id: "s4", reps: 8, weight: 75, unit: "lb" },
      ],
      [
        workout("w1", "2026-05-05", "Cable row", [
          { reps: 12, weight: 70 },
          { reps: 10, weight: 70 },
          { reps: 10, weight: 70 },
          { reps: 10, weight: 70 },
        ]),
      ],
    );
    expect(status).toBe("progressed");
  });

  it("marks higher load with significantly fewer reps as held not missed", () => {
    const status = evaluateProgressionStatus(
      "Cable row",
      [
        { id: "s1", reps: 6, weight: 80, unit: "lb" },
        { id: "s2", reps: 6, weight: 80, unit: "lb" },
      ],
      [
        workout("w1", "2026-05-05", "Cable row", [
          { reps: 12, weight: 70 },
          { reps: 12, weight: 70 },
        ]),
      ],
    );
    expect(status).toBe("held");
  });

  it("marks same weight with small volume drop as held not missed", () => {
    // Previous: 4×12 @ 70 = 3360 vol. Current: 4×11 @ 70 = 3080 (91.7% of previous)
    const status = evaluateProgressionStatus(
      "Cable row",
      [
        { id: "s1", reps: 11, weight: 70, unit: "lb" },
        { id: "s2", reps: 11, weight: 70, unit: "lb" },
        { id: "s3", reps: 11, weight: 70, unit: "lb" },
        { id: "s4", reps: 11, weight: 70, unit: "lb" },
      ],
      [
        workout("w1", "2026-05-05", "Cable row", [
          { reps: 12, weight: 70 },
          { reps: 12, weight: 70 },
          { reps: 12, weight: 70 },
          { reps: 12, weight: 70 },
        ]),
      ],
    );
    expect(status).toBe("held");
  });

  it("uses max weight across sets not last set weight", () => {
    // Progressive sets — max is highest set, not last
    const status = evaluateProgressionStatus(
      "Cable row",
      [
        { id: "s1", reps: 10, weight: 70, unit: "lb" },
        { id: "s2", reps: 8, weight: 75, unit: "lb" },
        { id: "s3", reps: 6, weight: 80, unit: "lb" },
        { id: "s4", reps: 6, weight: 75, unit: "lb" }, // drop-off last set
      ],
      [
        workout("w1", "2026-05-05", "Cable row", [
          { reps: 10, weight: 70 },
          { reps: 8, weight: 75 },
          { reps: 6, weight: 80 },
          { reps: 6, weight: 80 },
        ]),
      ],
    );
    // Max weight same (80), total reps same (30) → held
    expect(status).toBe("held");
  });

  it("marks two flat or missed results in a row as stalled", () => {
    const workouts: Workout[] = [
      {
        ...workout("w1", "2026-05-05", "Cable row", [
          { reps: 12, weight: 70 },
          { reps: 10, weight: 70 },
        ]),
        exercises: [
          {
            ...workout("w1", "2026-05-05", "Cable row", [
              { reps: 12, weight: 70 },
              { reps: 10, weight: 70 },
            ]).exercises[0],
            progressionStatus: "held",
          },
        ],
      },
      {
        ...workout("w2", "2026-05-07", "Cable row", [
          { reps: 10, weight: 70 },
          { reps: 8, weight: 70 },
        ]),
        exercises: [
          {
            ...workout("w2", "2026-05-07", "Cable row", [
              { reps: 10, weight: 70 },
              { reps: 8, weight: 70 },
            ]).exercises[0],
            progressionStatus: "missed",
          },
        ],
      },
    ];

    expect(getStallState("Cable row", workouts)).toBe("stalled");
  });
});
