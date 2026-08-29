import { describe, expect, it } from "vitest";
import { computeCoverage, weekContaining, type Coverage } from "./coverage";
import { familyOf } from "./exercise-predicates";
import { findExercise } from "./exercises";
import { generateNextWorkout, type WorkoutDraft } from "./generator";
import { movementOf } from "./movement";
import { getWeeklyTargetStimulus } from "./splits";
import type { MuscleGroup, TrainingProfile, Workout } from "./types";

// This suite simulates a user who follows the generator's recommendation for an
// entire training week: generate → log the draft verbatim → generate the next
// session from the updated history. It then asserts the week as a whole holds
// together — every split slot completed, every targeted muscle covered, and no
// back-to-back sessions that hammer the same lifts, families, or muscles.

const baseProfile: TrainingProfile = {
  goal: "physique",
  daysPerWeek: 4,
  equipment: "full_gym",
  experience: "beginner",
  intensity: "standard",
  blockedExercises: [],
  allowedExercises: [],
  homeGymEquipment: [],
  sensitiveMuscles: [],
};

const makeProfile = (overrides: Partial<TrainingProfile>): TrainingProfile => ({
  ...baseProfile,
  ...overrides,
});

const physique3 = makeProfile({ daysPerWeek: 3 });
const physique4 = baseProfile;
const physique5 = makeProfile({ daysPerWeek: 5 });
const strength3 = makeProfile({ goal: "strength", daysPerWeek: 3 });
const strength4 = makeProfile({ goal: "strength" });
const balanced4 = makeProfile({ goal: "balanced" });
const dumbbells4 = makeProfile({ equipment: "dumbbells" });

// Every full-gym profile here resolves to a split whose length equals
// daysPerWeek, so "each slot completed exactly once" is well-defined for all.
const PROFILE_MATRIX: Array<[string, TrainingProfile]> = [
  ["physique3", physique3],
  ["physique4", physique4],
  ["physique5", physique5],
  ["strength3", strength3],
  ["strength4", strength4],
  ["balanced4", balanced4],
];

// 2026-05-04 is a Monday; every date below sits inside that local-time week so
// weekContaining() and the generator agree on the window without Date math.
const TRAINING_DATES: Record<3 | 4 | 5, string[]> = {
  3: ["2026-05-04", "2026-05-06", "2026-05-08"],
  4: ["2026-05-04", "2026-05-05", "2026-05-07", "2026-05-08"],
  5: ["2026-05-04", "2026-05-05", "2026-05-06", "2026-05-08", "2026-05-09"],
};

const HARD_SEEDS = [11, 137, 424242, 9001, 55555, 771, 2026, 31415, 8888, 12321, 60601, 99];
const STAT_SEEDS = Array.from({ length: 20 }, (_, i) => i);
const DIRTY_SEEDS = [11, 424242, 9001, 771, 31415, 60601];

// Log a draft exactly as recommended, finishers included — they are part of the
// recommendation, so a compliant week gets credit for them. computeCoverage only
// reads sets.length per exercise, and one set per round matches the draft.
const draftToWorkout = (draft: WorkoutDraft, id: string, date: string, createdAt: number): Workout => ({
  id,
  date,
  source: "manual",
  createdAt,
  updatedAt: createdAt,
  planSlot: { slotId: draft.split.slotId, title: draft.split.title },
  exercises: draft.sections.flatMap((section, sectionIdx) =>
    section.exercises.map((exercise, exIdx) => ({
      id: `${id}-${sectionIdx}-${exIdx}`,
      exerciseName: exercise.name,
      supersetGroup: null,
      sets: exercise.targets.map((target, setIdx) => ({
        id: `${id}-${sectionIdx}-${exIdx}-${setIdx}`,
        reps: typeof target === "number" ? target : 10,
        weight: exercise.suggestedWeight ?? 50,
        unit: exercise.unit,
      })),
    })),
  ),
});

type SimulatedWeek = {
  workouts: Workout[];
  drafts: WorkoutDraft[];
  coverage: Coverage;
  targets: Partial<Record<MuscleGroup, number>>;
};

const runWeek = (
  activeProfile: TrainingProfile,
  baseSeed: number,
  options?: { priorWorkouts?: Workout[]; dates?: string[] },
): SimulatedWeek => {
  const dates = options?.dates ?? TRAINING_DATES[activeProfile.daysPerWeek];
  const history = [...(options?.priorWorkouts ?? [])];
  const drafts: WorkoutDraft[] = [];
  const generated: Workout[] = [];
  dates.forEach((date, dayIdx) => {
    // Per-day seed offset decorrelates days; distinct createdAt keeps ordering stable.
    const draft = generateNextWorkout(history, date, baseSeed + dayIdx * 101, activeProfile);
    const logged = draftToWorkout(draft, `sim-${baseSeed}-${dayIdx}`, date, 1000 + dayIdx);
    drafts.push(draft);
    generated.push(logged);
    history.push(logged);
  });
  return {
    workouts: generated,
    drafts,
    coverage: computeCoverage(history, weekContaining(dates[0] ?? "2026-05-04")),
    // Targets from start-of-week history: resolveSplitVariants flips the 3-day
    // upper A/B variant off the LAST logged upper, so end-of-week history would
    // describe next week's targets, not the week just trained.
    targets: getWeeklyTargetStimulus(activeProfile, options?.priorWorkouts ?? []),
  };
};

// Clean-week simulations are shared across tiers, so memoize them.
const simCache = new Map<string, SimulatedWeek>();
const simulateWeek = (label: string, activeProfile: TrainingProfile, baseSeed: number): SimulatedWeek => {
  const key = `${label}|${baseSeed}`;
  const cached = simCache.get(key);
  if (cached) return cached;
  const sim = runWeek(activeProfile, baseSeed);
  simCache.set(key, sim);
  return sim;
};

const coverageRows = (sim: SimulatedWeek) =>
  Object.entries(sim.targets).map(([muscle, target]) => {
    const stats = sim.coverage.muscleStats[muscle as MuscleGroup];
    const done = (stats?.primaryStimulus ?? 0) + (stats?.secondaryStimulus ?? 0);
    return { muscle: muscle as MuscleGroup, target: target as number, done, ratio: done / (target as number) };
  });

const coverageTable = (sim: SimulatedWeek): string =>
  coverageRows(sim)
    .map((row) => `${row.muscle.padEnd(12)} ${row.done.toFixed(1).padStart(6)}/${String(row.target).padStart(2)}  ${(row.ratio * 100).toFixed(0)}%`)
    .join("\n");

const slotSequence = (sim: SimulatedWeek): string =>
  sim.workouts.map((w) => w.planSlot?.slotId ?? "?").join(" → ");

const nonFinisherNames = (draft: WorkoutDraft): string[] =>
  draft.sections
    .filter((section) => section.kind !== "finisher")
    .flatMap((section) => section.exercises.map((exercise) => exercise.name));

const compoundFamilies = (draft: WorkoutDraft): Set<string> => {
  const compoundSections = draft.sections.filter((section) => section.kind === "compound");
  const sections = compoundSections.length > 0 ? compoundSections : draft.sections.slice(0, 1);
  const families = new Set<string>();
  sections.forEach((section) =>
    section.exercises.forEach((exercise) => {
      const meta = findExercise(exercise.name);
      if (meta) families.add(familyOf(meta));
    }),
  );
  return families;
};

const sessionPrimaryStimulus = (w: Workout): Partial<Record<MuscleGroup, number>> => {
  const cov = computeCoverage([w], weekContaining(w.date));
  const out: Partial<Record<MuscleGroup, number>> = {};
  Object.entries(cov.muscleStats).forEach(([muscle, stats]) => {
    out[muscle as MuscleGroup] = stats.primaryStimulus;
  });
  return out;
};

// Same-week prior workouts for dirty-state scenarios (mirrors the factory in
// generator.test.ts — canonical names only, so the generator sees them too).
const workout = (
  id: string,
  date: string,
  exercises: { name: string; sets: number }[],
  planSlot?: Workout["planSlot"],
): Workout => ({
  id,
  date,
  source: "manual",
  planSlot,
  createdAt: 1,
  updatedAt: 1,
  exercises: exercises.map((exercise, exIdx) => ({
    id: `${id}-${exIdx}`,
    exerciseName: exercise.name,
    supersetGroup: null,
    sets: Array.from({ length: exercise.sets }, (_, setIdx) => ({
      id: `${id}-${exIdx}-${setIdx}`,
      reps: 10,
      weight: 50,
      unit: "lb" as const,
    })),
  })),
});

describe("simulated training week", () => {
  it("is deterministic: the same seed reproduces the same simulated week", () => {
    const first = runWeek(physique4, 424242);
    const second = runWeek(physique4, 424242);
    expect(second.workouts.map((w) => w.planSlot?.slotId)).toEqual(
      first.workouts.map((w) => w.planSlot?.slotId),
    );
    expect(second.drafts.map(nonFinisherNames)).toEqual(first.drafts.map(nonFinisherNames));
  });

  it("completes every split slot exactly once across a simulated week", () => {
    for (const [label, activeProfile] of PROFILE_MATRIX) {
      for (const seed of HARD_SEEDS) {
        const sim = simulateWeek(label, activeProfile, seed);
        const slots = sim.workouts.map((w) => w.planSlot?.slotId);
        expect(
          new Set(slots).size,
          `${label} seed ${seed}: expected ${activeProfile.daysPerWeek} unique slots, got ${slotSequence(sim)}`,
        ).toBe(activeProfile.daysPerWeek);
      }
    }
  });

  it("never leaves a targeted muscle with zero stimulus after a full generated week", () => {
    for (const [label, activeProfile] of PROFILE_MATRIX) {
      for (const seed of HARD_SEEDS) {
        const sim = simulateWeek(label, activeProfile, seed);
        for (const row of coverageRows(sim)) {
          expect(
            row.done,
            `${label} seed ${seed}: ${row.muscle} untouched all week\n${coverageTable(sim)}`,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  // 0.5 of a major target ≈ one dedicated 4-set compound (~5.2 stimulus) plus
  // incidental secondary work — a floor a competent week never misses. These
  // thresholds encode the product guarantee; if they fail, fix the planner,
  // don't lower the number.
  it("reaches at least half of every major muscle's weekly target in every seed", () => {
    for (const [label, activeProfile] of PROFILE_MATRIX) {
      for (const seed of HARD_SEEDS) {
        const sim = simulateWeek(label, activeProfile, seed);
        for (const row of coverageRows(sim)) {
          if (row.target < 4) continue;
          expect(
            row.ratio,
            `${label} seed ${seed}: ${row.muscle} at ${row.done.toFixed(1)}/${row.target}\n${coverageTable(sim)}`,
          ).toBeGreaterThanOrEqual(0.5);
        }
      }
    }
  });

  // Support-level targets (< 4) are fed mostly by secondary tags at 0.2–0.5
  // stimulus per set, so 0.25 of target ≈ 2–3 secondary-tagged sets.
  it("gives support-level targets at least a quarter of their weekly volume", () => {
    for (const [label, activeProfile] of PROFILE_MATRIX) {
      for (const seed of HARD_SEEDS) {
        const sim = simulateWeek(label, activeProfile, seed);
        for (const row of coverageRows(sim)) {
          if (row.target >= 4) continue;
          expect(
            row.ratio,
            `${label} seed ${seed}: ${row.muscle} at ${row.done.toFixed(1)}/${row.target}\n${coverageTable(sim)}`,
          ).toBeGreaterThanOrEqual(0.25);
        }
      }
    }
  });

  // Statistical layer: a 0.75 mean per major means the planner is actively
  // target-seeking, not merely nonzero; the ≤2-of-20 tail allowance absorbs
  // unlucky accessory/finisher draws without letting misses become common.
  const statisticalCoverage = (label: string, activeProfile: TrainingProfile) => {
    const sims = STAT_SEEDS.map((seed) => simulateWeek(label, activeProfile, seed));
    const majors = coverageRows(sims[0]).filter((row) => row.target >= 4).map((row) => row.muscle);
    for (const muscle of majors) {
      const ratios = sims.map(
        (sim) => coverageRows(sim).find((row) => row.muscle === muscle)?.ratio ?? 0,
      );
      const mean = ratios.reduce((sum, r) => sum + r, 0) / ratios.length;
      expect(
        mean,
        `${label}: mean ${muscle} coverage ${(mean * 100).toFixed(0)}% across ${STAT_SEEDS.length} seeds`,
      ).toBeGreaterThanOrEqual(0.75);
    }
    const badSeeds = STAT_SEEDS.filter((seed) => {
      const sim = simulateWeek(label, activeProfile, seed);
      return coverageRows(sim).some((row) => row.target >= 4 && row.ratio < 0.6);
    });
    expect(
      badSeeds.length,
      `${label}: seeds with a major below 60%: ${badSeeds.join(", ")}`,
    ).toBeLessThanOrEqual(2);
  };

  it("averages at least 75% of every major muscle target across seeds (4-day physique)", () => {
    statisticalCoverage("physique4", physique4);
  });

  it("averages at least 75% of every major muscle target across seeds (3-day physique)", () => {
    statisticalCoverage("physique3", physique3);
  });

  it("does not repeat a non-core exercise in consecutive generated sessions", () => {
    for (const [label, activeProfile] of [["physique4", physique4], ["strength4", strength4]] as const) {
      for (const seed of HARD_SEEDS) {
        const sim = simulateWeek(label, activeProfile, seed);
        for (let i = 1; i < sim.drafts.length; i += 1) {
          const previous = new Set(nonFinisherNames(sim.drafts[i - 1]));
          const shared = nonFinisherNames(sim.drafts[i]).filter((name) => previous.has(name));
          expect(
            shared.length,
            `${label} seed ${seed}: day ${i} repeats ${shared.join(", ")} from day ${i - 1}`,
          ).toBeLessThanOrEqual(1);
          for (const name of shared) {
            const meta = findExercise(name);
            expect(
              meta && movementOf(meta),
              `${label} seed ${seed}: repeated ${name} on consecutive days is not core work`,
            ).toBe("carry_core");
          }
        }
      }
    }
  });

  it("rotates the opening movement pattern between consecutive sessions", () => {
    for (const [label, activeProfile] of [["physique4", physique4], ["strength4", strength4]] as const) {
      for (const seed of HARD_SEEDS) {
        const sim = simulateWeek(label, activeProfile, seed);
        const openers = sim.drafts.map((draft) => {
          const name = draft.sections[0]?.exercises[0]?.name ?? "";
          const meta = findExercise(name);
          return { name, movement: meta ? movementOf(meta) : null };
        });
        for (let i = 1; i < openers.length; i += 1) {
          expect(
            openers[i].movement,
            `${label} seed ${seed}: sessions ${i - 1} and ${i} both open with ${openers[i].movement} (${openers[i - 1].name} → ${openers[i].name})`,
          ).not.toBe(openers[i - 1].movement);
        }
      }
    }
  });

  it("does not repeat the previous session's compound family", () => {
    for (const [label, activeProfile] of [["physique4", physique4], ["strength4", strength4]] as const) {
      for (const seed of HARD_SEEDS) {
        const sim = simulateWeek(label, activeProfile, seed);
        for (let i = 1; i < sim.drafts.length; i += 1) {
          const previous = compoundFamilies(sim.drafts[i - 1]);
          const repeated = [...compoundFamilies(sim.drafts[i])].filter((family) => previous.has(family));
          expect(
            repeated.length,
            `${label} seed ${seed}: day ${i} repeats compound family ${repeated.join(", ")} from day ${i - 1}`,
          ).toBe(0);
        }
      }
    }
  });

  // 5.5 primary stimulus is just above one 4-set compound (~5.2), so this only
  // flags a muscle anchored hard on back-to-back calendar days — light support
  // volume (e.g. glute work on an upper day) stays legal. Only non-finisher
  // sections count: the invariant is about anchored lifting doses, and 3-set
  // metabolic finisher circuits are not what fatigues a muscle for tomorrow.
  const HARD_DOSE = 5.5;
  const assertNoHardBackToBack = (label: string, activeProfile: TrainingProfile) => {
    const draftPrimaryStimulus = (draft: WorkoutDraft, date: string) => {
      const stripped: WorkoutDraft = { ...draft, sections: draft.sections.filter((s) => s.kind !== "finisher") };
      return sessionPrimaryStimulus(draftToWorkout(stripped, "probe", date, 1));
    };
    for (const seed of HARD_SEEDS) {
      const sim = simulateWeek(label, activeProfile, seed);
      for (let i = 1; i < sim.drafts.length; i += 1) {
        const dayGap = Number(sim.workouts[i].date.slice(-2)) - Number(sim.workouts[i - 1].date.slice(-2));
        if (dayGap !== 1) continue;
        const before = draftPrimaryStimulus(sim.drafts[i - 1], sim.workouts[i - 1].date);
        const after = draftPrimaryStimulus(sim.drafts[i], sim.workouts[i].date);
        Object.entries(before).forEach(([muscle, dose]) => {
          if ((dose ?? 0) < HARD_DOSE) return;
          expect(
            after[muscle as MuscleGroup] ?? 0,
            `${label} seed ${seed}: ${muscle} took ${dose?.toFixed(1)} on ${sim.workouts[i - 1].date} and ${(after[muscle as MuscleGroup] ?? 0).toFixed(1)} the very next day`,
          ).toBeLessThan(HARD_DOSE);
        });
      }
    }
  };

  it("does not hammer the same muscle hard on consecutive calendar days (4-day physique)", () => {
    assertNoHardBackToBack("physique4", physique4);
  });

  // Formerly a documented defect (accessory day anchored shoulders the day
  // after Upper A): fixed by the yesterday-hard-dose entitlement rule — a
  // muscle that took >= one compound's worth of primary stimulus yesterday
  // gets no in-session entitlement today, regardless of slot.
  it("does not hammer the same muscle hard on consecutive calendar days (5-day physique)", () => {
    assertNoHardBackToBack("physique5", physique5);
  });

  it("closes out the week when two on-plan sessions are already logged", () => {
    const priors = [
      workout(
        "prior-lower-a",
        "2026-05-04",
        [
          { name: "Barbell hip thrust", sets: 4 },
          { name: "Barbell Romanian deadlift", sets: 3 },
          { name: "Plank", sets: 3 },
        ],
        { slotId: "lower_glute_ham", title: "Lower A · Posterior" },
      ),
      workout(
        "prior-upper-a",
        "2026-05-05",
        [
          { name: "Cable row", sets: 4 },
          { name: "DB overhead press", sets: 3 },
          { name: "DB reverse fly", sets: 3 },
        ],
        { slotId: "upper_back_shoulder", title: "Upper A · Back/Shoulders" },
      ),
    ];
    for (const seed of DIRTY_SEEDS) {
      const sim = runWeek(physique4, seed, { priorWorkouts: priors, dates: ["2026-05-07", "2026-05-08"] });
      const slots = sim.workouts.map((w) => w.planSlot?.slotId).sort();
      expect(
        slots,
        `seed ${seed}: generated ${slotSequence(sim)} instead of the two missing slots`,
      ).toEqual(["lower_glute_quad", "upper_back_shoulder_arms"]);
      for (const row of coverageRows(sim)) {
        const floor = row.target >= 4 ? 0.5 : 0.25;
        expect(
          row.ratio,
          `seed ${seed}: ${row.muscle} at ${row.done.toFixed(1)}/${row.target}\n${coverageTable(sim)}`,
        ).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  it("recovers when the week contains an off-plan manual workout", () => {
    const priors = [
      workout(
        "prior-lower-a",
        "2026-05-04",
        [
          { name: "Barbell hip thrust", sets: 4 },
          { name: "Barbell Romanian deadlift", sets: 3 },
          { name: "Plank", sets: 3 },
        ],
        { slotId: "lower_glute_ham", title: "Lower A · Posterior" },
      ),
      // Slotless mixed session — the kind of ad-hoc workout users actually log.
      workout("prior-offplan", "2026-05-05", [
        { name: "Goblet squat", sets: 3 },
        { name: "Cable row", sets: 3 },
        { name: "Push-up", sets: 2 },
      ]),
    ];
    for (const seed of DIRTY_SEEDS) {
      const sim = runWeek(physique4, seed, {
        priorWorkouts: priors,
        dates: ["2026-05-06", "2026-05-07", "2026-05-08"],
      });
      const slots = sim.workouts.map((w) => w.planSlot?.slotId);
      expect(
        new Set(slots).size,
        `seed ${seed}: generated a repeat slot: ${slotSequence(sim)}`,
      ).toBe(3);
      expect(
        slots,
        `seed ${seed}: re-generated the already-completed Lower A: ${slotSequence(sim)}`,
      ).not.toContain("lower_glute_ham");
      for (const row of coverageRows(sim)) {
        const floor = row.target >= 4 ? 0.5 : 0.25;
        expect(
          row.ratio,
          `seed ${seed}: ${row.muscle} at ${row.done.toFixed(1)}/${row.target}\n${coverageTable(sim)}`,
        ).toBeGreaterThanOrEqual(floor);
      }
    }
  });

  // 20 sets of hip thrust ≈ 26 glute stimulus vs a weekly target of 17 — the
  // glutes are saturated before the week's remaining sessions are generated.
  // A good plan stops anchoring glutes (≤ one honest compound's worth per
  // session) while still closing every other muscle's gap.
  it("stops piling volume onto an already-saturated muscle and still closes the rest", () => {
    const priors = [
      workout(
        "prior-glute-binge",
        "2026-05-04",
        [{ name: "Barbell hip thrust", sets: 20 }],
        { slotId: "lower_glute_ham", title: "Lower A · Posterior" },
      ),
    ];
    for (const seed of DIRTY_SEEDS) {
      const sim = runWeek(physique4, seed, {
        priorWorkouts: priors,
        dates: ["2026-05-05", "2026-05-07", "2026-05-08"],
      });
      sim.workouts.forEach((w) => {
        const gluteDose = sessionPrimaryStimulus(w).glutes ?? 0;
        expect(
          gluteDose,
          `seed ${seed}: ${w.date} (${w.planSlot?.slotId}) anchored ${gluteDose.toFixed(1)} more glute stimulus onto a saturated muscle`,
          // 7 nominal per-set units × the 1.25 effort ceiling: effort-aware
          // coverage credits low-rep top sets extra, so the same prescription
          // can read up to 25% higher without the planner adding volume.
        ).toBeLessThanOrEqual(8.75);
      });
      for (const row of coverageRows(sim)) {
        if (row.muscle === "glutes" || row.target < 4) continue;
        expect(
          row.ratio,
          `seed ${seed}: ${row.muscle} at ${row.done.toFixed(1)}/${row.target}\n${coverageTable(sim)}`,
        ).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  // The dumbbell library is much smaller, so the floor is looser (0.4 for
  // majors) — the real invariant is that no targeted muscle is stranded at zero.
  it("still touches every targeted muscle in a dumbbells-only week", () => {
    for (const seed of DIRTY_SEEDS) {
      const sim = simulateWeek("dumbbells4", dumbbells4, seed);
      for (const row of coverageRows(sim)) {
        expect(
          row.done,
          `dumbbells4 seed ${seed}: ${row.muscle} untouched all week\n${coverageTable(sim)}`,
        ).toBeGreaterThan(0);
        if (row.target >= 4) {
          expect(
            row.ratio,
            `dumbbells4 seed ${seed}: ${row.muscle} at ${row.done.toFixed(1)}/${row.target}\n${coverageTable(sim)}`,
          ).toBeGreaterThanOrEqual(0.4);
        }
      }
    }
  });

  // Hostile schedules: nothing guarantees the user trains Mon/Wed/Fri. Fully
  // consecutive training days must not re-hammer yesterday's hard-dosed
  // muscles (non-finisher primary >= ~one compound's worth on both days).
  it("avoids hard back-to-back doses on fully consecutive training days", () => {
    const draftPrimary = (draft: WorkoutDraft, date: string) => {
      const stripped: WorkoutDraft = { ...draft, sections: draft.sections.filter((s) => s.kind !== "finisher") };
      return sessionPrimaryStimulus(draftToWorkout(stripped, "probe", date, 1));
    };
    const cases: Array<[string, TrainingProfile, string[]]> = [
      ["physique3 Mon-Wed", physique3, ["2026-05-04", "2026-05-05", "2026-05-06"]],
      ["physique4 Thu-Sun", physique4, ["2026-05-07", "2026-05-08", "2026-05-09", "2026-05-10"]],
    ];
    for (const [label, activeProfile, dates] of cases) {
      for (const seed of [11, 424242, 9001]) {
        const sim = runWeek(activeProfile, seed, { dates });
        for (let i = 1; i < dates.length; i += 1) {
          const before = draftPrimary(sim.drafts[i - 1], dates[i - 1]);
          const after = draftPrimary(sim.drafts[i], dates[i]);
          (Object.entries(before) as [MuscleGroup, number][]).forEach(([muscle, dose]) => {
            if (muscle === "core" || muscle === "hip_flexors") return;
            if ((dose ?? 0) < 5.5) return;
            expect(
              after[muscle] ?? 0,
              `${label} seed ${seed}: ${muscle} ${dose?.toFixed(1)} on ${dates[i - 1]} then ${(after[muscle] ?? 0).toFixed(1)} on ${dates[i]}`,
            ).toBeLessThan(5.5);
          });
        }
      }
    }
  });

  // A constrained-equipment week (home, no gym for weeks) must still produce
  // substantial sessions — deep saturation may not null the stages down to a
  // one- or two-exercise day.
  it("keeps every session substantial across two home-equipment weeks", () => {
    const home = makeProfile({ equipment: "home" });
    for (const seed of [11, 424242]) {
      const history: Workout[] = [];
      const allDates = [
        ["2026-05-04", "2026-05-05", "2026-05-07", "2026-05-08"],
        ["2026-05-11", "2026-05-12", "2026-05-14", "2026-05-15"],
      ];
      allDates.forEach((dates, wi) => {
        dates.forEach((date, i) => {
          const draft = generateNextWorkout(history, date, seed + (wi * 5 + i) * 101, home);
          const nonFinisher = draft.sections
            .filter((s) => s.kind !== "finisher")
            .reduce((n, s) => n + s.exercises.length, 0);
          expect(
            nonFinisher,
            `home seed ${seed} W${wi + 1} ${date}: only ${nonFinisher} working exercises`,
          ).toBeGreaterThanOrEqual(4);
          history.push(draftToWorkout(draft, `h${wi}-${i}`, date, 1000 + wi * 10 + i));
        });
      });
    }
  });
});
