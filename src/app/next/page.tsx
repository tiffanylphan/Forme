"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MuscleTag } from "@/components/MuscleTag";
import { computeCoverage, weekContaining } from "@/lib/coverage";
import { environmentAllowsExercise } from "@/lib/exercise-availability";
import { EXERCISES } from "@/lib/exercises";
import { formatMuscle, todayISO } from "@/lib/format";
import {
  buildDraftExercise,
  generateNextWorkout,
  stashDraft,
} from "@/lib/generator";
import { movementOf, MOVEMENT_COLORS, MOVEMENT_LABELS } from "@/lib/movement";
import {
  DEFAULT_PROFILE,
  formatEnvironment,
  formatExperience,
  formatGoal,
  formatIntensity,
  useTrainingProfile,
} from "@/lib/profile";
import { useWorkouts } from "@/lib/storage";
import type { DraftExercise, DraftSection, WorkoutDraft } from "@/lib/generator";
import type { Exercise, MovementPattern, MuscleGroup } from "@/lib/types";

const SECTION_TITLE: Record<DraftSection["kind"], string> = {
  compound: "Set",
  accessory: "Set",
  superset: "Superset",
  finisher: "Finisher",
};

const sectionTitleFor = (section: DraftSection): string => {
  if (section.kind === "superset" && section.repScheme.includes("strength pairing")) {
    return "Strength pair";
  }
  if (section.kind === "superset" && section.exercises.length > 2) {
    return "Circuit";
  }
  if (section.kind === "finisher") {
    return "Finisher circuit";
  }
  return SECTION_TITLE[section.kind];
};

const formatTarget = (t: number | string): string =>
  typeof t === "number" ? `${t}` : t;

type SwapTarget = {
  sectionIdx: number;
  exerciseIdx: number;
  currentName: string;
  movement: MovementPattern | null;
  targets: (number | string)[];
  mode: "standard" | "finisher";
};

type DisplaySection =
  | {
      kind: "single";
      section: DraftSection;
      sectionIdx: number;
    }
  | {
      kind: "set_group";
      entries: Array<{ section: DraftSection; sectionIdx: number }>;
    };

type SwapRole =
  | "horizontal_pull"
  | "vertical_pull"
  | "rear_delt_pull"
  | "arm_pull"
  | "vertical_press"
  | "shoulder_isolation"
  | "chest_press"
  | "arm_push"
  | "hinge_glute"
  | "hinge_hamstring"
  | "single_leg_lower"
  | "bilateral_squat"
  | "carry_core"
  | "general";

const familyOf = (ex: Exercise): string => {
  const name = ex.name.toLowerCase();
  if (name.includes("hip thrust") || name.includes("glute bridge")) return "hip_thrust";
  if (name.includes("romanian deadlift") || name.includes("rdl")) return "rdl";
  if (name.includes("deadlift")) return "deadlift";
  if (name.includes("split squat") || name.includes("bulgarian")) return "split_squat";
  if (name.includes("lunge")) return "lunge";
  if (name.includes("step-up")) return "step_up";
  if (name.includes("row")) return "row";
  if (
    name.includes("pulldown") ||
    name.includes("pull-up") ||
    name.includes("chin-up")
  ) {
    return "vertical_pull";
  }
  if (
    name.includes("face pull") ||
    name.includes("reverse fly") ||
    name.includes("pull-apart")
  ) {
    return "rear_delt";
  }
  if (
    name.includes("lateral raise") ||
    name.includes("front raise") ||
    name.includes("arnold")
  ) {
    return "shoulder_isolation";
  }
  if (name.includes("overhead press") || name.includes("landmine press")) {
    return "vertical_press";
  }
  if (name.includes("squat") || name.includes("leg press") || name.includes("hack squat")) {
    return "squat_pattern";
  }
  if (name.includes("leg curl")) return "leg_curl";
  if (name.includes("carry")) return "carry";
  if (ex.pattern === "core") return "core";
  return `${ex.pattern}_${ex.equipment}`;
};

const overlapCount = (a: readonly string[], b: readonly string[]): number =>
  a.filter((item) => b.includes(item)).length;

const sameMuscleSet = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((item) => b.includes(item));

const hasPrimary = (ex: Exercise, muscle: MuscleGroup): boolean =>
  ex.primary.includes(muscle);

const similarityTier = (
  candidate: Exercise,
  current: Exercise | undefined,
): number => {
  if (!current) return 99;
  const sameFamily = familyOf(candidate) === familyOf(current);
  const exactPrimaryMatch = sameMuscleSet(candidate.primary, current.primary);
  const primaryOverlap = overlapCount(candidate.primary, current.primary);
  const secondaryOverlap = overlapCount(candidate.secondary, current.secondary);

  if (sameFamily && exactPrimaryMatch) return 0;
  if (exactPrimaryMatch) return 1;
  if (primaryOverlap > 0 && secondaryOverlap > 0) return 2;
  if (primaryOverlap > 0) return 3;
  return 4;
};

const roleOf = (ex: Exercise): SwapRole => {
  const name = ex.name.toLowerCase();
  if (ex.pattern === "pull") {
    if (
      name.includes("face pull") ||
      name.includes("reverse fly") ||
      name.includes("pull-apart")
    ) {
      return "rear_delt_pull";
    }
    if (
      name.includes("pulldown") ||
      name.includes("pull-up") ||
      name.includes("chin-up")
    ) {
      return "vertical_pull";
    }
    if (name.includes("curl")) return "arm_pull";
    if (name.includes("row")) return "horizontal_pull";
  }
  if (ex.pattern === "push") {
    if (
      name.includes("lateral raise") ||
      name.includes("front raise") ||
      name.includes("arnold") ||
      name.includes("sunrise raise") ||
      name.includes("prone press")
    ) {
      return "shoulder_isolation";
    }
    if (
      name.includes("tricep") ||
      name.includes("skull crusher") ||
      name.includes("pushdown")
    ) {
      return "arm_push";
    }
    if (name.includes("overhead press") || name.includes("landmine press") || name.includes("pike push-up")) {
      return "vertical_press";
    }
    return "chest_press";
  }
  if (ex.pattern === "hinge") {
    if (hasPrimary(ex, "glutes")) return "hinge_glute";
    return "hinge_hamstring";
  }
  if (movementOf(ex) === "single_leg") return "single_leg_lower";
  if (ex.pattern === "squat") return "bilateral_squat";
  if (movementOf(ex) === "carry_core" || ex.pattern === "carry" || ex.pattern === "core") {
    return "carry_core";
  }
  return "general";
};

const similarityScore = (
  candidate: Exercise,
  current: Exercise | undefined,
  knownExercises: Set<string>,
): number => {
  let score = 0;
  if (!current) return knownExercises.has(candidate.name) ? 1 : 0;

  if (familyOf(candidate) === familyOf(current)) score += 12;
  score += overlapCount(candidate.primary, current.primary) * 5;
  score += overlapCount(candidate.secondary, current.secondary) * 2;
  score += overlapCount(candidate.primary, current.secondary) * 1;
  score += overlapCount(candidate.secondary, current.primary) * 1;
  if (candidate.equipment === current.equipment) score += 3;
  if (candidate.pattern === current.pattern) score += 2;
  if (knownExercises.has(candidate.name)) score += 1;

  return score;
};

const isFinisherSwapCandidate = (ex: Exercise): boolean =>
  ex.pattern === "conditioning" ||
  ex.pattern === "plyo" ||
  ex.pattern === "carry" ||
  movementOf(ex) === "carry_core";

const DEFAULT_RATIONALE_COUNT = 2;
const LONG_RATIONALE_LENGTH = 90;

const prioritizeRationale = (rationale: string[]): string[] =>
  [...rationale].sort((a, b) => {
    const score = (line: string): number => {
      let value = 0;
      if (line.includes("This is")) value += 5;
      if (line.includes("Still building")) value += 4;
      if (line.includes("Avoiding muscles")) value += 3;
      if (line.includes("Untouched this week")) value += 2;
      if (line.includes("Hit only once")) value += 1;
      return value;
    };
    return score(b) - score(a);
  });

const buildDisplaySections = (sections: DraftSection[]): DisplaySection[] => {
  const display: DisplaySection[] = [];
  let currentSetGroup: Array<{ section: DraftSection; sectionIdx: number }> = [];

  const flushSetGroup = () => {
    if (currentSetGroup.length === 0) return;
    if (currentSetGroup.length === 1) {
      const [{ section, sectionIdx }] = currentSetGroup;
      display.push({ kind: "single", section, sectionIdx });
    } else {
      display.push({ kind: "set_group", entries: currentSetGroup });
    }
    currentSetGroup = [];
  };

  sections.forEach((section, sectionIdx) => {
    if (section.kind === "compound" || section.kind === "accessory") {
      currentSetGroup.push({ section, sectionIdx });
      return;
    }
    flushSetGroup();
    display.push({ kind: "single", section, sectionIdx });
  });

  flushSetGroup();
  return display;
};

export default function NextPage() {
  const { workouts, ready } = useWorkouts();
  const { profile, ready: profileReady } = useTrainingProfile();
  const today = todayISO();
  const [seed, setSeed] = useState<number>(0);
  const [preferredExercises, setPreferredExercises] = useState<string[]>([]);
  const router = useRouter();

  const baseDraft = useMemo(
    () =>
      generateNextWorkout(workouts, today, seed, profile, { preferredExercises }),
    [workouts, today, seed, profile, preferredExercises],
  );

  // Manual per-exercise swaps: { seed, map } — the seed acts as a generation
  // tag so that swaps from a previous regenerate never bleed into the new draft.
  // Keying by seed avoids any setState-in-effect.
  const [swapState, setSwapState] = useState<{
    seed: number;
    map: Record<string, DraftExercise>;
  }>({ seed, map: {} });

  // Swaps are only valid for the current seed; treat as empty otherwise.
  const swaps = useMemo(
    () => (swapState.seed === seed ? swapState.map : {}),
    [swapState, seed],
  );

  // Effective draft: base + manual swaps applied on top.
  const draft = useMemo((): WorkoutDraft => {
    if (Object.keys(swaps).length === 0) return baseDraft;
    return {
      ...baseDraft,
      sections: baseDraft.sections.map((sec, si) => ({
        ...sec,
        exercises: sec.exercises.map((ex, ei) => swaps[`${si}-${ei}`] ?? ex),
      })),
    };
  }, [baseDraft, swaps]);

  // Names currently in the draft — exclude these from swap options.
  const draftNames = useMemo(
    () => new Set(draft.sections.flatMap((s) => s.exercises.map((e) => e.name))),
    [draft],
  );

  const knownExercises = useMemo(
    () => new Set(workouts.flatMap((w) => w.exercises.map((e) => e.exerciseName))),
    [workouts],
  );
  const displaySections = useMemo(() => buildDisplaySections(draft.sections), [draft.sections]);
  const coverage = useMemo(
    () => computeCoverage(workouts, weekContaining(today)),
    [workouts, today],
  );

  const [swapTarget, setSwapTarget] = useState<SwapTarget | null>(null);

  const applySwap = (exerciseName: string) => {
    if (!swapTarget) return;
    const ex = EXERCISES.find((e) => e.name === exerciseName);
    if (!ex) return;
    const { sectionIdx, exerciseIdx, targets } = swapTarget;
    const newEx = buildDraftExercise(ex, targets, workouts, knownExercises);
    setSwapState((prev) => ({
      seed,
      map: { ...(prev.seed === seed ? prev.map : {}), [`${sectionIdx}-${exerciseIdx}`]: newEx },
    }));
    setSwapTarget(null);
  };

  const regenerate = () => {
    setSeed(Math.floor(Math.random() * 1e9));
    // swapState.seed will differ from the new seed, so swaps auto-reset.
  };

  const bringBackLift = (exerciseName: string) => {
    setPreferredExercises((current) =>
      current.includes(exerciseName) ? current : [...current, exerciseName],
    );
  };

  const accept = () => {
    stashDraft({ source: "manual", draft });
    router.push("/log");
  };

  return (
    <div className="mx-auto max-w-[480px] px-4 pb-32 pt-6">
      <div className="mb-3">
        <Link href="/" className="text-[13px] font-medium text-text-muted">
          ← Back
        </Link>
      </div>

      <header className="mb-5">
        <p className="label-eyebrow">Suggestion</p>
        <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-text">
          Your next workout
        </h1>
      </header>

      {!ready && (
        <div className="rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-5 text-[13px] text-text-subtle">
          Loading…
        </div>
      )}

      {ready && (
        <div className="space-y-5">
          <PlanningCard
            draft={draft}
            coverage={coverage}
            profile={profile}
            profileReady={profileReady}
          />

          <RationaleCard
            rationale={draft.rationale}
            rotatedOffLifts={draft.rotatedOffLifts}
            onBringBack={bringBackLift}
          />
          <BookendCard block={draft.mobility} eyebrow="Before you lift" />

          {/* Sections */}
          <div className="space-y-5">
            {displaySections.map((displaySection, index) => (
              <SectionCard
                key={index}
                displaySection={displaySection}
                onSwapRequest={(sectionIdx, exerciseIdx, movement, targets, mode) =>
                  setSwapTarget({
                    sectionIdx,
                    exerciseIdx,
                    currentName: draft.sections[sectionIdx]?.exercises[exerciseIdx]?.name ?? "",
                    movement,
                    targets,
                    mode,
                  })
                }
              />
            ))}
          </div>

          {draft.sections.length === 0 && (
            <div className="rounded-2xl border border-dashed border-[#D3D1C7] px-4 py-8 text-center">
              <p className="text-[14px] text-text-subtle">
                Couldn&apos;t build a session — log a workout first so we
                have something to balance against.
              </p>
            </div>
          )}

          {draft.sections.length > 0 && (
            <BookendCard block={draft.cooldown} eyebrow="After you finish" />
          )}
        </div>
      )}

      {/* Bottom actions */}
      {ready && draft.sections.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-10 mx-auto max-w-[480px] border-t border-divider bg-bg/95 px-4 py-3 backdrop-blur">
          <div className="flex gap-2">
            <button
              onClick={regenerate}
              className="flex-1 rounded-full border border-[#D3D1C7] bg-white py-3 text-[14px] font-medium text-text-muted"
            >
              Regenerate
            </button>
            <button
              onClick={accept}
              className="flex-[2] rounded-full bg-text py-3 text-[14px] font-medium text-white"
            >
              Use this routine →
            </button>
          </div>
        </div>
      )}

      {/* Swap picker — key resets search state whenever the target changes */}
      <SwapPicker
        key={swapTarget ? `${swapTarget.sectionIdx}-${swapTarget.exerciseIdx}` : "closed"}
        open={swapTarget !== null}
        currentName={swapTarget?.currentName ?? null}
        movement={swapTarget?.movement ?? null}
        mode={swapTarget?.mode ?? "standard"}
        excludeNames={draftNames}
        profile={profile ?? DEFAULT_PROFILE}
        knownExercises={knownExercises}
        onClose={() => setSwapTarget(null)}
        onPick={applySwap}
      />
    </div>
  );
}

function ProfileChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[#F1EFE8] px-3 py-1 text-[12px] font-medium text-text-muted">
      {children}
    </span>
  );
}

function PlanningCard({
  draft,
  coverage,
  profile,
  profileReady,
}: {
  draft: WorkoutDraft;
  coverage: ReturnType<typeof computeCoverage>;
  profile: ReturnType<typeof useTrainingProfile>["profile"];
  profileReady: boolean;
}) {
  return (
    <section className="rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-eyebrow">This week&apos;s slot</p>
          <h2 className="mt-1 text-[18px] font-semibold text-text">
            {draft.split.title}
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-text-subtle">
            {draft.split.summary}
          </p>
        </div>
        <span className="shrink-0 text-[12px] text-text-subtle">
          {draft.split.sessionIndex} / {draft.split.totalSessions}
        </span>
      </div>

      {profileReady && profile ? (
        <div className="mt-3 border-t border-divider pt-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="label-eyebrow">Training profile</p>
            <Link href="/onboarding" className="text-[12px] font-medium text-text-muted">
              Edit
            </Link>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <ProfileChip>{formatGoal(profile.goal)}</ProfileChip>
            <ProfileChip>{profile.daysPerWeek} days/week</ProfileChip>
            <ProfileChip>{formatEnvironment(profile.equipment)}</ProfileChip>
            <ProfileChip>{formatExperience(profile.experience)}</ProfileChip>
            <ProfileChip>{formatIntensity(profile.intensity)}</ProfileChip>
          </div>
        </div>
      ) : profileReady ? (
        <div className="mt-3 flex items-start justify-between gap-3 border-t border-divider pt-3">
          <p className="text-[13px] leading-relaxed text-text">
            Add your training profile so the planner can use your goal, frequency, equipment, and experience.
          </p>
          <Link
            href="/onboarding"
            className="shrink-0 rounded-full border border-[#D3D1C7] px-3 py-1.5 text-[12px] font-medium text-text"
          >
            Set up
          </Link>
        </div>
      ) : null}

      <div className="mt-3 border-t border-divider pt-3">
        <WeeklyTargetCard
          targetPrimaryStimulus={draft.split.targetPrimaryStimulus ?? draft.split.targetPrimarySets}
          coverage={coverage}
          embedded
        />
      </div>
    </section>
  );
}

function RationaleCard({
  rationale,
  rotatedOffLifts,
  onBringBack,
}: {
  rationale: string[];
  rotatedOffLifts: string[];
  onBringBack: (exerciseName: string) => void;
}) {
  const ordered = useMemo(() => prioritizeRationale(rationale), [rationale]);
  const shouldCollapse =
    ordered.length > DEFAULT_RATIONALE_COUNT ||
    ordered.some((line) => line.length > LONG_RATIONALE_LENGTH);
  const [expanded, setExpanded] = useState(false);
  const visible = shouldCollapse && !expanded
    ? ordered.slice(0, DEFAULT_RATIONALE_COUNT)
    : ordered;

  return (
    <section className="rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="label-eyebrow">Why this routine</p>
        {shouldCollapse && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-[12px] font-medium text-text-muted"
          >
            {expanded ? "Show less" : `Show ${ordered.length - DEFAULT_RATIONALE_COUNT} more`}
          </button>
        )}
      </div>
      <ul className="space-y-1.5">
        {visible.map((line, index) => (
          <li key={`${index}-${line}`} className="text-[13px] leading-snug text-text">
            · {line}
          </li>
        ))}
      </ul>
      {rotatedOffLifts.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {rotatedOffLifts.map((exerciseName) => (
            <button
              key={exerciseName}
              type="button"
              onClick={() => onBringBack(exerciseName)}
              className="rounded-full border border-[#D3D1C7] bg-white px-3 py-1 text-[12px] font-medium text-text"
            >
              Bring back {exerciseName}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function WeeklyTargetCard({
  targetPrimaryStimulus,
  coverage,
  embedded = false,
}: {
  targetPrimaryStimulus: Partial<Record<MuscleGroup, number>>;
  coverage: ReturnType<typeof computeCoverage>;
  embedded?: boolean;
}) {
  const rows = useMemo(
    () =>
      Object.entries(targetPrimaryStimulus)
        .filter((entry): entry is [MuscleGroup, number] => {
          const [, target] = entry;
          return typeof target === "number" && target > 0;
        })
        .sort((a, b) => b[1] - a[1])
        .map(([muscle, target]) => {
          const done = coverage.muscleStats[muscle]?.primaryStimulus ?? 0;
          const pct = Math.min(100, Math.round((done / target) * 100));
          return {
            muscle,
            target,
            done,
            pct,
            remaining: Math.max(0, target - done),
          };
        }),
    [coverage, targetPrimaryStimulus],
  );
  const [expanded, setExpanded] = useState(false);

  if (rows.length === 0) return null;

  const visibleRows = expanded ? rows : rows.slice(0, 3);

  return (
    <section className={embedded ? "" : "rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-3"}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div>
          <p className="label-eyebrow">Weekly target stimulus</p>
          <p className="mt-0.5 text-[11px] text-text-subtle">Weighted primary stimulus for this slot.</p>
        </div>
        {rows.length > 3 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-[11px] font-medium text-text-muted"
          >
            {expanded ? "Show less" : `Show ${rows.length - 3} more`}
          </button>
        )}
      </div>
      <div className="space-y-2.5">
        {visibleRows.map((row) => (
          <div key={row.muscle}>
            <div className="mb-1 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <MuscleTag muscle={row.muscle} />
                <span className="text-[11px] text-text-subtle capitalize">
                  {row.remaining === 0
                    ? "On target"
                    : `${row.remaining.toFixed(1)} stimulus left`}
                </span>
              </div>
              <span className="font-mono text-[12px] text-text">
                {row.done.toFixed(1)}/{row.target.toFixed(1)}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[#ECE8DE]">
              <div
                className="h-full rounded-full bg-text"
                style={{ width: `${row.pct}%` }}
                aria-label={`${formatMuscle(row.muscle)} ${row.done.toFixed(1)} of ${row.target.toFixed(1)} stimulus`}
              />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function BookendCard({
  block,
  eyebrow,
}: {
  block: { title: string; items: string[]; complementary?: string[] };
  eyebrow: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (block.items.length === 0) return null;

  const complementary = block.complementary ?? [];
  const visibleItems = expanded ? block.items : block.items.slice(0, 2);

  return (
    <section className="rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="label-eyebrow">{eyebrow}</p>
          <h3 className="mt-0.5 text-[15px] font-semibold text-text">{block.title}</h3>
        </div>
        {block.items.length > 2 && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-[11px] font-medium text-text-muted"
          >
            {expanded ? "Show less" : `Show ${block.items.length - 2} more`}
          </button>
        )}
      </div>
      <ul className="mt-2 space-y-1">
        {visibleItems.map((item) => (
          <li key={item} className="text-[13px] leading-snug text-text">
            · {item}
          </li>
        ))}
      </ul>
      {complementary.length > 0 && (
        <div className="mt-2 border-t border-divider pt-2">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-text-subtle">
            Complementary mobility
          </p>
          <ul className="mt-1 space-y-1">
            {complementary.map((item) => (
              <li key={item} className="text-[12px] leading-snug text-text-muted">
                · {item}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

// ---------- Section card ----------

function SectionCard({
  displaySection,
  onSwapRequest,
}: {
  displaySection: DisplaySection;
  onSwapRequest: (
    sectionIdx: number,
    exerciseIdx: number,
    movement: MovementPattern | null,
    targets: (number | string)[],
    mode: "standard" | "finisher",
  ) => void;
}) {
  if (displaySection.kind === "set_group") {
    const firstEntry = displaySection.entries[0];
    const sharedRounds = `${firstEntry.section.rounds} rounds`;
    const sharedRepScheme = firstEntry.section.repScheme;

    return (
      <div className="overflow-hidden rounded-2xl border border-[#E6E3D8] bg-surface">
        <div className="flex items-start justify-between gap-3 border-b border-divider px-4 py-2.5">
          <span className="label-eyebrow">Strength pair</span>
          <div className="min-w-0 text-right">
            <div className="text-[11px] text-text-subtle">{sharedRounds}</div>
            {sharedRepScheme && (
              <div className="text-[10px] leading-snug text-text-subtle">
                {sharedRepScheme}
              </div>
            )}
          </div>
        </div>
        <div className="divide-y divide-divider">
          {displaySection.entries.flatMap(({ section, sectionIdx }) =>
            section.exercises.map((ex, ei) => (
              <ExerciseRow
                key={`${sectionIdx}-${ei}-${ex.name}`}
                ex={ex}
                onSwap={() =>
                  onSwapRequest(sectionIdx, ei, ex.movement, ex.targets, "standard")
                }
              />
            )),
          )}
        </div>
      </div>
    );
  }

  const { section, sectionIdx } = displaySection;
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E6E3D8] bg-surface">
      <div className="flex items-start justify-between gap-3 border-b border-divider px-4 py-2.5">
        <span className="label-eyebrow">{sectionTitleFor(section)}</span>
        <div className="min-w-0 text-right">
          <div className="text-[11px] text-text-subtle">{section.rounds} rounds</div>
          <div className="text-[10px] leading-snug text-text-subtle">
            {section.repScheme}
          </div>
        </div>
      </div>
      <div className={section.kind === "finisher" ? "space-y-2 px-3 py-3" : "divide-y divide-divider"}>
        {section.exercises.map((ex, ei) => (
          <ExerciseRow
            key={`${sectionIdx}-${ei}-${ex.name}`}
            ex={ex}
            compact={section.kind === "finisher"}
            onSwap={() =>
              onSwapRequest(
                sectionIdx,
                ei,
                ex.movement,
                ex.targets,
                section.kind === "finisher" ? "finisher" : "standard",
              )
            }
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Exercise row ----------

function ExerciseRow({
  ex,
  compact = false,
  onSwap,
}: {
  ex: DraftExercise;
  compact?: boolean;
  onSwap: () => void;
}) {
  const movColor = ex.movement ? MOVEMENT_COLORS[ex.movement] : null;
  const recentTrend = ex.progression.recentHistory.slice(0, 3);
  const trendLabel = recentTrend.map((entry) => entry.status).join(" → ");
  if (compact) {
    return (
      <div className="rounded-xl border border-[#E6E3D8] bg-white px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-[14px] font-medium leading-snug text-text">
              {ex.name}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {ex.movement && movColor && (
                <span
                  style={{ background: movColor.bg, color: movColor.text }}
                  className="rounded-full px-2.5 py-0.5 text-[10px] font-medium"
                >
                  {MOVEMENT_LABELS[ex.movement]}
                </span>
              )}
              {ex.primary.map((m) => (
                <MuscleTag key={m} muscle={m} />
              ))}
            </div>
          </div>
          <button
            onClick={onSwap}
            className="shrink-0 rounded-full border border-[#E6E3D8] px-2.5 py-0.5 text-[10px] font-medium text-text-muted"
          >
            Swap
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {ex.targets.map((t, i) => (
            <span
              key={i}
              className="rounded-md bg-[#FAFAF7] px-2 py-1 font-mono text-[12px] text-text-muted"
            >
              R{i + 1}: {formatTarget(t)}
            </span>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-medium text-text">
              {ex.name}
            </h3>
            {!ex.isFamiliar && (
              <span className="rounded-full bg-[#FAEEDA] px-2 py-0.5 text-[10px] font-medium text-[#633806]">
                new
              </span>
            )}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {ex.movement && movColor && (
              <span
                style={{ background: movColor.bg, color: movColor.text }}
                className="rounded-full px-2.5 py-0.5 text-[10px] font-medium"
              >
                {MOVEMENT_LABELS[ex.movement]}
              </span>
            )}
            {ex.primary.map((m) => (
              <MuscleTag key={m} muscle={m} />
            ))}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
        <div className="text-right">
            <div className="font-mono text-[14px] text-text">
              {ex.suggestedWeight != null
                ? `${ex.suggestedWeight} ${ex.unit}`
                : "—"}
            </div>
            <div className="text-[10px] text-text-subtle">suggested</div>
          </div>
          <button
            onClick={onSwap}
            className="rounded-full border border-[#E6E3D8] px-2.5 py-0.5 text-[10px] font-medium text-text-muted"
          >
            Swap
          </button>
        </div>
      </div>
      <div className="mt-2 space-y-1">
        {ex.progression.lastSummary && (
          <p className="text-[11px] text-text-subtle">
            Last: <span className="font-mono">{ex.progression.lastSummary}</span>
          </p>
        )}
        {recentTrend.length > 0 && (
          <div className="space-y-1">
            <p className="text-[11px] text-text-subtle">
              Trend: <span className="capitalize">{trendLabel}</span>
            </p>
            <div className="flex flex-wrap gap-1">
              {recentTrend.map((entry) => (
                <span
                  key={`${entry.date}-${entry.summary}-${entry.status}`}
                  className="rounded-full bg-[#F1EFE8] px-2 py-0.5 text-[10px] text-text-muted"
                >
                  {entry.status} · {entry.summary}
                </span>
              ))}
            </div>
          </div>
        )}
        <p className="text-[11px] text-text-subtle">
          Goal: {ex.progression.goal}
        </p>
        <p className="text-[11px] text-text-subtle">
          Next: {ex.progression.nextStep}
        </p>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {ex.targets.map((t, i) => (
          <span
            key={i}
            className="rounded-md bg-[#FAFAF7] px-2 py-1 font-mono text-[12px] text-text-muted"
          >
            R{i + 1}: {formatTarget(t)}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------- Swap picker bottom sheet ----------

function SwapPicker({
  open,
  currentName,
  movement,
  mode,
  excludeNames,
  profile,
  knownExercises,
  onClose,
  onPick,
}: {
  open: boolean;
  currentName: string | null;
  movement: MovementPattern | null;
  mode: "standard" | "finisher";
  excludeNames: Set<string>;
  profile: { equipment: "full_gym" | "dumbbells" | "home"; blockedExercises: string[] };
  knownExercises: Set<string>;
  onClose: () => void;
  onPick: (name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const movColor = movement ? MOVEMENT_COLORS[movement] : null;
  const finisherMode = mode === "finisher";
  const currentExercise = useMemo(
    () => EXERCISES.find((ex) => ex.name === currentName),
    [currentName],
  );

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const options = useMemo(() => {
    const filtered = EXERCISES.filter((ex) => {
      if (excludeNames.has(ex.name)) return false;
      if (!environmentAllowsExercise(ex, profile)) return false;
      if (finisherMode) {
        if (!isFinisherSwapCandidate(ex)) return false;
      } else if (movement && movementOf(ex) !== movement) {
        return false;
      }
      if (search && !ex.name.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    });

    if (search || !currentExercise || finisherMode) {
      return filtered.sort((a, b) => {
        const scoreDiff =
          similarityScore(b, currentExercise, knownExercises) -
          similarityScore(a, currentExercise, knownExercises);
        if (scoreDiff !== 0) return scoreDiff;
        const af = knownExercises.has(a.name) ? 0 : 1;
        const bf = knownExercises.has(b.name) ? 0 : 1;
        return af - bf || a.name.localeCompare(b.name);
      });
    }

    const currentRole = roleOf(currentExercise);
    const sameRole = filtered.filter((exercise) => roleOf(exercise) === currentRole);
    const roleScoped = sameRole.length > 0 ? sameRole : filtered;
    const sortedRoleScoped = [...roleScoped].sort((a, b) => {
      const scoreDiff =
        similarityScore(b, currentExercise, knownExercises) -
        similarityScore(a, currentExercise, knownExercises);
      if (scoreDiff !== 0) return scoreDiff;
      const af = knownExercises.has(a.name) ? 0 : 1;
      const bf = knownExercises.has(b.name) ? 0 : 1;
      return af - bf || a.name.localeCompare(b.name);
    });
    const bestTier = Math.min(
      ...roleScoped.map((exercise) => similarityTier(exercise, currentExercise)),
    );
    let directMatches = roleScoped.filter(
      (exercise) => similarityTier(exercise, currentExercise) <= Math.min(bestTier + 1, 2),
    );
    if (directMatches.length < 4) {
      directMatches = sortedRoleScoped.slice(0, Math.min(4, sortedRoleScoped.length));
    }

    return directMatches.sort((a, b) => {
      const scoreDiff =
        similarityScore(b, currentExercise, knownExercises) -
        similarityScore(a, currentExercise, knownExercises);
      if (scoreDiff !== 0) return scoreDiff;
      const af = knownExercises.has(a.name) ? 0 : 1;
      const bf = knownExercises.has(b.name) ? 0 : 1;
      return af - bf || a.name.localeCompare(b.name);
    });
  }, [currentExercise, excludeNames, finisherMode, knownExercises, movement, profile, search]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: "rgba(26, 26, 24, 0.4)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[480px] flex-col rounded-2xl bg-surface"
        style={{ maxHeight: "72vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-2 pb-3">
          <div>
            <h2 className="text-[17px] font-semibold tracking-tight text-text">
              {finisherMode ? "Swap finisher" : "Swap exercise"}
            </h2>
            {!finisherMode && movement && movColor && (
              <span
                style={{ background: movColor.bg, color: movColor.text }}
                className="mt-1 inline-block rounded-full px-2.5 py-0.5 text-[10px] font-medium"
              >
                {MOVEMENT_LABELS[movement]} only
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-[14px] font-medium text-text-muted"
          >
            Cancel
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            autoFocus
            className="w-full rounded-[10px] border border-[#D3D1C7] bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-[#888780]"
          />
        </div>

        <p className="px-4 pb-1 text-[11px] text-text-subtle">
          {options.length} alternative{options.length !== 1 ? "s" : ""} ·
          {finisherMode
            ? " finisher-friendly options shown first"
            : " most directly comparable matches shown first"}
        </p>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {options.map((ex) => {
            const familiar = knownExercises.has(ex.name);
            return (
              <button
                key={ex.name}
                onClick={() => onPick(ex.name)}
                className="block w-full border-b border-divider py-3 text-left active:bg-[#FAFAF7]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[14px] font-medium text-text">
                    {ex.name}
                  </span>
                  {!familiar && (
                    <span className="shrink-0 rounded-full bg-[#FAEEDA] px-2 py-0.5 text-[10px] font-medium text-[#633806]">
                      new
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {ex.primary.map((m) => (
                    <MuscleTag key={m} muscle={m} />
                  ))}
                  <span className="text-[10px] text-text-subtle">
                    · {ex.equipment}
                  </span>
                </div>
              </button>
            );
          })}
          {options.length === 0 && (
            <div className="py-10 text-center text-[14px] text-text-subtle">
              No alternatives found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
