"use client";

import { useEffect, useMemo, useState } from "react";
import { EXERCISES } from "@/lib/exercises";
import { MUSCLE_GROUPS, PATTERNS, EQUIPMENT } from "@/lib/types";
import type { Equipment, MuscleGroup, Pattern } from "@/lib/types";
import { formatMuscle, normalizeSearch } from "@/lib/format";
import { MuscleTag } from "./MuscleTag";
import { PatternBadge } from "./PatternBadge";

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (exerciseName: string) => void;
  onRemove?: (exerciseName: string) => void;
  // Names already added — surface a count badge on those rows.
  alreadyAddedCounts?: Record<string, number>;
};

export function ExercisePicker({
  open,
  onClose,
  onPick,
  onRemove,
  alreadyAddedCounts = {},
}: Props) {
  const [search, setSearch] = useState("");
  const [muscle, setMuscle] = useState<MuscleGroup | null>(null);
  const [pattern, setPattern] = useState<Pattern | null>(null);
  const [equip, setEquip] = useState<Equipment | null>(null);

  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

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
      if (muscle && !ex.primary.includes(muscle) && !ex.secondary.includes(muscle)) return false;
      return true;
    });
  }, [search, muscle, pattern, equip]);

  const clearFilters = () => {
    setSearch("");
    setMuscle(null);
    setPattern(null);
    setEquip(null);
  };

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
              const active = muscle === m;
              return (
                <button
                  key={m}
                  onClick={() => setMuscle(active ? null : m)}
                  style={{
                    background: active ? "#1a1a18" : "#F1EFE8",
                    color: active ? "#fff" : "#5F5E5A",
                  }}
                  className="shrink-0 rounded-full px-3 py-1 text-[12px] font-medium capitalize"
                >
                  {m.replace("_", " ")}
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
        </div>

        {/* Active filter row */}
        <div className="flex items-center justify-between px-4 pb-2 pt-1">
          <span className="text-[12px] text-text-subtle">
            {filtered.length} result{filtered.length !== 1 ? "s" : ""}
          </span>
          {(search || muscle || pattern || equip) && (
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
