"use client";

import { useEffect, useMemo, useState } from "react";
import { EXERCISES } from "@/lib/exercises";
import { matchesMuscleFilter } from "@/lib/exercise-predicates";
import { MUSCLE_GROUPS, PATTERNS, EQUIPMENT } from "@/lib/types";
import type { Equipment, MuscleGroup, Pattern } from "@/lib/types";
import { formatMuscle, normalizeSearch } from "@/lib/format";
import { muscleTargetStatusLabel, type MuscleTargetRow } from "@/lib/splits";
import { MuscleTag } from "./MuscleTag";
import { PatternBadge } from "./PatternBadge";

type MuscleFilterState = "include" | "exclude";

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (exerciseName: string) => void;
  onRemove?: (exerciseName: string) => void;
  // Names already added — surface a count badge on those rows.
  alreadyAddedCounts?: Record<string, number>;
  // Current weekly stimulus per muscle — drives the over-target badge on muscle chips.
  muscleTargetRows?: MuscleTargetRow[];
};

export function ExercisePicker({
  open,
  onClose,
  onPick,
  onRemove,
  alreadyAddedCounts = {},
  muscleTargetRows,
}: Props) {
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<Partial<Record<MuscleGroup, MuscleFilterState>>>({});
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [equip, setEquip] = useState<Equipment | null>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const cycleMuscle = (m: MuscleGroup) => {
    setMuscleFilter((prev) => {
      const next = { ...prev };
      if (next[m] === undefined) next[m] = "include";
      else if (next[m] === "include") next[m] = "exclude";
      else delete next[m];
      return next;
    });
  };

  const includeMuscles = useMemo(
    () =>
      (Object.entries(muscleFilter) as [MuscleGroup, MuscleFilterState][])
        .filter(([, state]) => state === "include")
        .map(([m]) => m),
    [muscleFilter],
  );
  const excludeMuscles = useMemo(
    () =>
      (Object.entries(muscleFilter) as [MuscleGroup, MuscleFilterState][])
        .filter(([, state]) => state === "exclude")
        .map(([m]) => m),
    [muscleFilter],
  );

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    return EXERCISES.filter((ex) => {
      if (q) {
        const nameMatch =
          normalizeSearch(ex.name).includes(q) ||
          (ex.aliases ?? []).some((alias) => normalizeSearch(alias).includes(q));
        const muscleMatch = ex.primary.concat(ex.secondary).some(
          (m) => normalizeSearch(formatMuscle(m)).includes(q),
        );
        if (!nameMatch && !muscleMatch) return false;
      }
      if (pattern && ex.pattern !== pattern) return false;
      if (equip && ex.equipment !== equip) return false;
      if (!matchesMuscleFilter(ex, { include: includeMuscles, exclude: excludeMuscles })) return false;
      return true;
    });
  }, [search, includeMuscles, excludeMuscles, pattern, equip]);

  const clearFilters = () => {
    setSearch("");
    setMuscleFilter({});
    setPattern(null);
    setEquip(null);
  };

  const activeMuscleLegend = [...includeMuscles, ...excludeMuscles];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{ background: "rgba(26, 26, 24, 0.4)" }}
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-[480px] flex-col rounded-t-2xl bg-surface"
        style={{ height: "92vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center pt-2 pb-1">
          <div className="h-1 w-10 rounded-full bg-[#D3D1C7]" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-2 pb-3">
          <h2 className="text-[18px] font-semibold tracking-tight text-text">
            Add exercise
          </h2>
          <button
            onClick={onClose}
            className="text-[14px] font-medium text-text-muted"
          >
            Done
          </button>
        </div>

        {/* Search */}
        <div className="px-4 pb-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search exercises…"
            className="w-full rounded-[10px] border border-[#D3D1C7] bg-white px-3.5 py-2.5 text-[14px] outline-none focus:border-[#888780]"
          />
        </div>

        {/* Filter chips */}
        <div className="px-4 pb-2">
          <div className="flex gap-1.5 overflow-x-auto pb-1.5" style={{ scrollbarWidth: "none" }}>
            {PATTERNS.map((p) => {
              const active = pattern === p;
              return (
                <button
                  key={p}
                  onClick={() => setPattern(active ? null : p)}
                  style={{
                    background: active ? "#1a1a18" : "#F1EFE8",
                    color: active ? "#fff" : "#5F5E5A",
                  }}
                  className="shrink-0 rounded-full px-3 py-1 text-[12px] font-medium"
                >
                  {p}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5 overflow-x-auto pb-1.5" style={{ scrollbarWidth: "none" }}>
            {MUSCLE_GROUPS.map((m) => {
              const state = muscleFilter[m];
              const row = muscleTargetRows?.find((r) => r.muscle === m);
              const overTarget = row?.status === "over";
              return (
                <button
                  key={m}
                  data-testid={`muscle-chip-${m}`}
                  onClick={() => cycleMuscle(m)}
                  aria-pressed={state !== undefined}
                  style={{
                    background: state === "include" ? "#1a1a18" : state === "exclude" ? "#F3D9D3" : "#F1EFE8",
                    color: state === "include" ? "#fff" : state === "exclude" ? "#8C3B2E" : "#5F5E5A",
                    textDecoration: state === "exclude" ? "line-through" : "none",
                  }}
                  className="shrink-0 rounded-full px-3 py-1 text-[12px] font-medium capitalize"
                >
                  {m.replace("_", " ")}
                  {overTarget && (
                    <span
                      aria-label="over weekly ceiling"
                      className="ml-1 inline-block h-1.5 w-1.5 rounded-full align-middle"
                      style={{ background: state === "include" ? "#fff" : "#C4441F" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <div className="flex gap-1.5 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            {EQUIPMENT.map((e) => {
              const active = equip === e;
              return (
                <button
                  key={e}
                  onClick={() => setEquip(active ? null : e)}
                  style={{
                    background: active ? "#1a1a18" : "#F1EFE8",
                    color: active ? "#fff" : "#5F5E5A",
                  }}
                  className="shrink-0 rounded-full px-3 py-1 text-[12px] font-medium"
                >
                  {e}
                </button>
              );
            })}
          </div>
          {activeMuscleLegend.length > 0 && muscleTargetRows && (
            <div className="mt-1.5 space-y-0.5">
              {activeMuscleLegend.map((m) => {
                const row = muscleTargetRows.find((r) => r.muscle === m);
                if (!row) return null;
                return (
                  <p key={m} className="text-[11px] text-text-subtle capitalize">
                    {m.replace("_", " ")} — {muscleTargetStatusLabel(row)}
                  </p>
                );
              })}
            </div>
          )}
        </div>

        {/* Active filter row */}
        <div className="flex items-center justify-between px-4 pb-2 pt-1">
          <span className="text-[12px] text-text-subtle">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
          {(search || activeMuscleLegend.length > 0 || pattern || equip) && (
            <button
              onClick={clearFilters}
              className="text-[12px] font-medium text-accent underline"
            >
              Clear all
            </button>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-4 pb-8">
          {filtered.map((ex) => {
            const count = alreadyAddedCounts[ex.name] ?? 0;
            return (
              <div key={ex.name} className="border-b border-divider py-3">
                <div className="flex items-start justify-between gap-3">
                  <button
                    onClick={() => onPick(ex.name)}
                    className="min-w-0 flex-1 text-left active:bg-[#FAFAF7]"
                  >
                    <div className="text-[14px] font-medium text-text">
                      {ex.name}
                    </div>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {ex.primary.map((m) => (
                        <MuscleTag key={m} muscle={m} />
                      ))}
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5 pt-0.5">
                    {count > 0 && (
                      <span
                        className="inline-flex h-6 items-center rounded-full bg-[#1a1a18] px-2.5 text-[10px] font-medium text-white"
                        title={`Added ${count}×`}
                      >
                        {count}×
                      </span>
                    )}
                    <PatternBadge pattern={ex.pattern} />
                    {count > 0 && onRemove && (
                      <button
                        type="button"
                        onClick={() => onRemove(ex.name)}
                        className="inline-flex h-6 items-center rounded-full border border-[#E6E3D8] bg-white px-2.5 text-[10px] font-medium text-text-muted"
                        aria-label={`Remove one ${ex.name}`}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="py-10 text-center text-[14px] text-text-subtle">
              No exercises match your filters
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
