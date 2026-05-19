"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MUSCLE_COLORS, PATTERN_COLORS } from "@/lib/colors";
import { environmentAllowsExercise } from "@/lib/exercise-availability";
import { EXERCISES } from "@/lib/exercises";
import { formatMuscle, normalizeSearch } from "@/lib/format";
import { DEFAULT_PROFILE, saveTrainingProfile, useTrainingProfile } from "@/lib/profile";
import { EQUIPMENT, MUSCLE_GROUPS, PATTERNS } from "@/lib/types";
import type { Equipment, MuscleGroup, Pattern } from "@/lib/types";

export default function LibraryPage() {
  const { profile } = useTrainingProfile();
  const [filterMuscle, setFilterMuscle] = useState<MuscleGroup | null>(null);
  const [filterPattern, setFilterPattern] = useState<Pattern | null>(null);
  const [filterEquipment, setFilterEquipment] = useState<Equipment | null>(null);
  const [expandedExercise, setExpandedExercise] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const activeProfile = profile ?? DEFAULT_PROFILE;

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    return EXERCISES.filter((ex) => {
      if (q) {
        const nameMatch = normalizeSearch(ex.name).includes(q);
        const muscleMatch = ex.primary.concat(ex.secondary).some(
          (m) => normalizeSearch(formatMuscle(m)).includes(q),
        );
        if (!nameMatch && !muscleMatch) return false;
      }
      if (filterPattern && ex.pattern !== filterPattern) return false;
      if (filterEquipment && ex.equipment !== filterEquipment) return false;
      if (
        filterMuscle &&
        !ex.primary.includes(filterMuscle) &&
        !ex.secondary.includes(filterMuscle)
      )
        return false;
      return true;
    });
  }, [filterMuscle, filterPattern, filterEquipment, search]);

  // Unavailable exercises (wrong equipment or explicitly blocked) sink to the bottom.
  const sortedFiltered = useMemo(
    () =>
      [...filtered].sort((a, b) => {
        const aOut = !environmentAllowsExercise(a, activeProfile);
        const bOut = !environmentAllowsExercise(b, activeProfile);
        return Number(aOut) - Number(bOut);
      }),
    [filtered, activeProfile],
  );

  // Counts reflect what's actually available for the user's environment.
  const muscleStats = useMemo(() => {
    const counts: Record<MuscleGroup, number> = {} as Record<MuscleGroup, number>;
    MUSCLE_GROUPS.forEach((m) => {
      counts[m] = EXERCISES.filter(
        (ex) =>
          (ex.primary.includes(m) || ex.secondary.includes(m)) &&
          environmentAllowsExercise(ex, activeProfile),
      ).length;
    });
    return counts;
  }, [activeProfile]);

  const clearFilters = () => {
    setFilterMuscle(null);
    setFilterPattern(null);
    setFilterEquipment(null);
    setSearch("");
  };

  const toggleBlockedExercise = (name: string) => {
    const blocked = activeProfile.blockedExercises.includes(name);
    const ex = EXERCISES.find((e) => e.name === name);
    // Check equipment compatibility ignoring blocked/allowed lists
    const equipmentAllows = !ex || environmentAllowsExercise(ex, activeProfile.equipment);

    if (blocked || !equipmentAllows) {
      // Allowing: remove from blocked. If equipment doesn't support this exercise,
      // also add to allowedExercises so the override persists.
      const blockedExercises = activeProfile.blockedExercises.filter((item) => item !== name);
      const allowedExercises = !equipmentAllows
        ? [...(activeProfile.allowedExercises ?? []), name].sort((a, b) => a.localeCompare(b))
        : (activeProfile.allowedExercises ?? []).filter((item) => item !== name);
      saveTrainingProfile({ ...activeProfile, blockedExercises, allowedExercises });
    } else {
      // Blocking: add to blocked, clear any explicit allow override
      const blockedExercises = [...activeProfile.blockedExercises, name].sort((a, b) => a.localeCompare(b));
      const allowedExercises = (activeProfile.allowedExercises ?? []).filter((item) => item !== name);
      saveTrainingProfile({ ...activeProfile, blockedExercises, allowedExercises });
    }
  };

  const hasFilters = filterMuscle || filterPattern || filterEquipment || search;

  return (
    <div className="mx-auto max-w-[480px] px-4 pb-16 pt-6">
      <div className="mb-3">
        <Link href="/" className="text-[13px] font-medium text-text-muted">
          ← Back
        </Link>
      </div>
      <div className="mb-7">
        <h1 className="text-[26px] font-semibold tracking-tight text-text">
          Exercise library
        </h1>
        <p className="mt-1 text-[14px] text-text-subtle">
          {EXERCISES.length} exercises · {MUSCLE_GROUPS.length} muscle groups ·{" "}
          {PATTERNS.length} patterns
        </p>
        <p className="mt-3 text-[13px] text-text-subtle">
          Tap an exercise to mark it unavailable for the planner.
          {activeProfile.blockedExercises.length > 0 &&
            ` ${activeProfile.blockedExercises.length} blocked right now.`}
        </p>
      </div>

      {/* Muscle group grid */}
      <div className="mb-6">
        <p className="label-eyebrow mb-2.5">Exercises by muscle group</p>
        <div className="grid grid-cols-3 gap-1.5">
          {MUSCLE_GROUPS.map((m) => {
            const active = filterMuscle === m;
            const c = MUSCLE_COLORS[m];
            return (
              <button
                key={m}
                onClick={() => setFilterMuscle(active ? null : m)}
                style={{
                  background: active ? c.text : c.bg,
                  color: active ? "#fff" : c.text,
                }}
                className="rounded-lg px-1.5 py-2 text-center text-[11px] font-medium transition"
              >
                {formatMuscle(m)}
                <span className="mt-0.5 block text-[10px] opacity-70">
                  {muscleStats[m]} exercises
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Pattern filter */}
      <div className="mb-4">
        <p className="label-eyebrow mb-2">Movement pattern</p>
        <div className="flex flex-wrap gap-1.5">
          {PATTERNS.map((p) => {
            const active = filterPattern === p;
            const c = PATTERN_COLORS[p];
            return (
              <button
                key={p}
                onClick={() => setFilterPattern(active ? null : p)}
                style={{
                  background: active ? c.text : c.bg,
                  color: active ? "#fff" : c.text,
                }}
                className="rounded-full px-3.5 py-1 text-[12px] font-medium"
              >
                {p}
              </button>
            );
          })}
        </div>
      </div>

      {/* Equipment */}
      <div className="mb-5">
        <p className="label-eyebrow mb-2">Equipment</p>
        <div className="flex flex-wrap gap-1.5">
          {EQUIPMENT.map((e) => {
            const active = filterEquipment === e;
            return (
              <button
                key={e}
                onClick={() => setFilterEquipment(active ? null : e)}
                style={{
                  background: active ? "#2C2C2A" : "#F1EFE8",
                  color: active ? "#fff" : "#5F5E5A",
                }}
                className="rounded-full px-3.5 py-1 text-[12px] font-medium"
              >
                {e}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="search"
          placeholder="Search exercises..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-[10px] border border-[#D3D1C7] bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-[#888780]"
        />
      </div>

      {hasFilters && (
        <div className="mb-4 flex items-center gap-2">
          <span className="text-[12px] text-text-subtle">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
          <button
            onClick={clearFilters}
            className="text-[12px] font-medium text-accent underline"
          >
            Clear all
          </button>
        </div>
      )}

      <div>
        {sortedFiltered.map((ex) => {
          const isOpen = expandedExercise === ex.name;
          const blocked = activeProfile.blockedExercises.includes(ex.name);
          const envIncompatible = !blocked && !environmentAllowsExercise(ex, activeProfile);
          const unavailable = blocked || envIncompatible;
          const pc = PATTERN_COLORS[ex.pattern];
          return (
            <div
              key={ex.name}
              onClick={() => setExpandedExercise(isOpen ? null : ex.name)}
              className={`cursor-pointer border-b border-divider py-3.5 transition-opacity ${unavailable ? "opacity-50" : ""}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[14px] font-medium text-text">{ex.name}</span>
                <div className="flex items-center gap-1.5">
                  {blocked && (
                    <span className="whitespace-nowrap rounded-full bg-[#F1E5E1] px-2.5 py-0.5 text-[10px] font-medium text-[#8E4D3C]">
                      Blocked
                    </span>
                  )}
                  {envIncompatible && (
                    <span className="whitespace-nowrap rounded-full bg-[#F1EFE8] px-2.5 py-0.5 text-[10px] font-medium text-[#888780]">
                      Unavailable
                    </span>
                  )}
                  <span
                    style={{ background: pc.bg, color: pc.text }}
                    className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[10px] font-medium"
                  >
                    {ex.pattern}
                  </span>
                </div>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {ex.primary.map((m) => (
                  <span
                    key={m}
                    style={{
                      background: MUSCLE_COLORS[m].bg,
                      color: MUSCLE_COLORS[m].text,
                    }}
                    className="rounded-md px-2 py-0.5 text-[10px] font-medium"
                  >
                    {formatMuscle(m)}
                  </span>
                ))}
              </div>
              {isOpen && (
                <div className="mt-2.5 rounded-lg bg-[#FAFAF7] px-3 py-2.5 text-[12px]">
                  <div className="mb-1.5">
                    <span className="font-medium text-text-subtle">Primary: </span>
                    <span className="text-text">{ex.primary.map(formatMuscle).join(", ")}</span>
                  </div>
                  <div className="mb-1.5">
                    <span className="font-medium text-text-subtle">Secondary: </span>
                    <span className="text-text">
                      {ex.secondary.length > 0 ? ex.secondary.map(formatMuscle).join(", ") : "none"}
                    </span>
                  </div>
                  <div className="mb-1.5">
                    <span className="font-medium text-text-subtle">Equipment: </span>
                    <span className="text-text">{ex.equipment}</span>
                  </div>
                  <div className="mb-3">
                    <span className="font-medium text-text-subtle">Pattern: </span>
                    <span className="text-text">{ex.pattern}</span>
                  </div>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      toggleBlockedExercise(ex.name);
                    }}
                    className={`rounded-full px-3 py-1.5 text-[12px] font-medium ${
                      blocked
                        ? "bg-text text-white"
                        : "border border-[#D3D1C7] bg-white text-text-muted"
                    }`}
                  >
                    {blocked || envIncompatible ? "Allow in planner" : "Mark unavailable"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="py-10 text-center text-[14px] text-text-subtle">
          No exercises match your filters
        </div>
      )}
    </div>
  );
}
