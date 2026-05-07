"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { MuscleTag } from "@/components/MuscleTag";
import { EXERCISES } from "@/lib/exercises";
import { todayISO } from "@/lib/format";
import {
  buildDraftExercise,
  generateNextWorkout,
  stashDraft,
} from "@/lib/generator";
import { movementOf, MOVEMENT_COLORS, MOVEMENT_LABELS } from "@/lib/movement";
import {
  formatEnvironment,
  formatExperience,
  formatGoal,
  useTrainingProfile,
} from "@/lib/profile";
import { useWorkouts } from "@/lib/storage";
import type { DraftExercise, DraftSection, WorkoutDraft } from "@/lib/generator";
import type { MovementPattern } from "@/lib/types";

const SECTION_TITLE: Record<DraftSection["kind"], string> = {
  compound: "Compound",
  accessory: "Accessory",
  superset: "Superset",
  finisher: "Finisher",
};

const formatTarget = (t: number | string): string =>
  typeof t === "number" ? `${t}` : t;

type SwapTarget = {
  sectionIdx: number;
  exerciseIdx: number;
  movement: MovementPattern | null;
  targets: (number | string)[];
};

export default function NextPage() {
  const { workouts, ready } = useWorkouts();
  const { profile, ready: profileReady } = useTrainingProfile();
  const today = todayISO();
  const [seed, setSeed] = useState<number>(() => Math.floor(Math.random() * 1e9));
  const router = useRouter();

  const baseDraft = useMemo(
    () => generateNextWorkout(workouts, today, seed, profile),
    [workouts, today, seed, profile],
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
        <>
          <section className="mb-5 rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4">
            <div className="mb-1 flex items-center justify-between">
              <p className="label-eyebrow">This week&apos;s slot</p>
              <span className="text-[12px] text-text-subtle">
                {draft.split.sessionIndex} / {draft.split.totalSessions}
              </span>
            </div>
            <h2 className="text-[18px] font-semibold text-text">
              {draft.split.title}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-text-subtle">
              {draft.split.summary}
            </p>
          </section>

          {profileReady && profile && (
            <section className="mb-5 rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4">
              <div className="mb-2 flex items-center justify-between">
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
              </div>
            </section>
          )}

          {profileReady && !profile && (
            <section className="mb-5 rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="label-eyebrow mb-1">Setup</p>
                  <p className="text-[14px] leading-relaxed text-text">
                    Add your training profile so the planner can use your goal,
                    frequency, equipment, and experience.
                  </p>
                </div>
                <Link
                  href="/onboarding"
                  className="shrink-0 rounded-full border border-[#D3D1C7] px-3 py-1.5 text-[12px] font-medium text-text"
                >
                  Set up
                </Link>
              </div>
            </section>
          )}

          {/* Rationale */}
          <section className="mb-5 rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4">
            <p className="label-eyebrow mb-2">Why this routine</p>
            <ul className="space-y-1.5">
              {draft.rationale.map((r, i) => (
                <li key={i} className="text-[13px] leading-snug text-text">
                  · {r}
                </li>
              ))}
            </ul>
          </section>

          {/* Sections */}
          <div className="space-y-3">
            {draft.sections.map((sec, si) => (
              <SectionCard
                key={si}
                section={sec}
                sectionIdx={si}
                onSwapRequest={(ei, movement, targets) =>
                  setSwapTarget({
                    sectionIdx: si,
                    exerciseIdx: ei,
                    movement,
                    targets,
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
        </>
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
        movement={swapTarget?.movement ?? null}
        excludeNames={draftNames}
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

// ---------- Section card ----------

function SectionCard({
  section,
  sectionIdx,
  onSwapRequest,
}: {
  section: DraftSection;
  sectionIdx: number;
  onSwapRequest: (
    exerciseIdx: number,
    movement: MovementPattern | null,
    targets: (number | string)[],
  ) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#E6E3D8] bg-surface">
      <div className="flex items-center justify-between border-b border-divider px-4 py-2.5">
        <span className="label-eyebrow">{SECTION_TITLE[section.kind]}</span>
        <span className="text-[11px] text-text-subtle">
          {section.rounds} rounds · {section.repScheme}
        </span>
      </div>
      <div className="divide-y divide-divider">
        {section.exercises.map((ex, ei) => (
          <ExerciseRow
            key={`${sectionIdx}-${ei}-${ex.name}`}
            ex={ex}
            onSwap={() => onSwapRequest(ei, ex.movement, ex.targets)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------- Exercise row ----------

function ExerciseRow({
  ex,
  onSwap,
}: {
  ex: DraftExercise;
  onSwap: () => void;
}) {
  const movColor = ex.movement ? MOVEMENT_COLORS[ex.movement] : null;
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
  movement,
  excludeNames,
  knownExercises,
  onClose,
  onPick,
}: {
  open: boolean;
  movement: MovementPattern | null;
  excludeNames: Set<string>;
  knownExercises: Set<string>;
  onClose: () => void;
  onPick: (name: string) => void;
}) {
  const [search, setSearch] = useState("");
  const movColor = movement ? MOVEMENT_COLORS[movement] : null;

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const options = useMemo(() => {
    return EXERCISES.filter((ex) => {
      if (excludeNames.has(ex.name)) return false;
      if (movement && movementOf(ex) !== movement) return false;
      if (search && !ex.name.toLowerCase().includes(search.toLowerCase()))
        return false;
      return true;
    }).sort((a, b) => {
      // Familiar exercises first.
      const af = knownExercises.has(a.name) ? 0 : 1;
      const bf = knownExercises.has(b.name) ? 0 : 1;
      return af - bf || a.name.localeCompare(b.name);
    });
  }, [movement, excludeNames, knownExercises, search]);

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
              Swap exercise
            </h2>
            {movement && movColor && (
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
          familiar exercises shown first
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
