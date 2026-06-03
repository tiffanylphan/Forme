"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { InputClearButton } from "@/components/InputClearButton";
import { todayISO } from "@/lib/format";
import { parseImportText } from "@/lib/import";
import { loadWorkouts, normalizeWorkouts, saveWorkouts, useWorkouts } from "@/lib/storage";
import type { Workout } from "@/lib/types";

const csvEscape = (value: string | number | null | undefined): string => {
  const raw = value == null ? "" : String(value);
  return `"${raw.replace(/"/g, '""')}"`;
};

// ---- CSV export ----

const buildCSV = (workouts: Workout[]): string => {
  const rows = [
    [
      "workout_id", "date", "source", "plan_slot", "exercise",
      "set_number", "reps", "weight", "unit", "duration_sec",
      "distance_m", "progression_status", "workout_notes",
    ],
    ...workouts.flatMap((workout) =>
      workout.exercises.flatMap((exercise) =>
        exercise.sets.map((set, index) => [
          workout.id,
          workout.date,
          workout.source,
          workout.planSlot?.title ?? "",
          exercise.exerciseName,
          index + 1,
          set.reps ?? "",
          set.weight ?? "",
          set.unit,
          set.durationSec ?? "",
          set.distanceM ?? "",
          exercise.progressionStatus ?? "",
          workout.notes ?? "",
        ]),
      ),
    ),
  ];
  return rows.map((row) => row.map((cell) => csvEscape(cell)).join(",")).join("\n");
};

const downloadCSV = (workouts: Workout[], today: string) => {
  const csv = buildCSV(workouts);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `forme-workout-history-${today}.csv`;
  link.click();
  window.URL.revokeObjectURL(url);
};

// ---- Page ----

export default function DataPage() {
  const router = useRouter();
  const { workouts, ready } = useWorkouts();
  const today = todayISO();

  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleImport = () => {
    setError(null);
    const parsed = parseImportText(text);
    if (!parsed) {
      setError("Paste a CSV export or JSON array — couldn't recognise this format.");
      return;
    }
    const normalized = normalizeWorkouts(parsed);
    if (normalized.length === 0) {
      setError("No valid workouts found. Check the data and try again.");
      return;
    }
    saveWorkouts(normalized);
    setDone(true);
    setTimeout(() => router.push("/"), 1500);
  };

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <p className="text-[16px] font-medium text-text">Imported — redirecting…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[480px] px-4 pb-16 pt-6">
      <div className="mb-6">
        <Link href="/" className="text-[13px] font-medium text-text-muted">
          ← Back
        </Link>
      </div>

      <h1 className="mb-8 text-[26px] font-semibold tracking-tight text-text">
        Import / Export
      </h1>

      {/* Export */}
      <section className="mb-8">
        <p className="label-eyebrow mb-1">Export</p>
        <p className="mb-3 text-[13px] text-text-subtle">
          Download all your workouts as a CSV you can re-import later.
        </p>
        <button
          onClick={() => downloadCSV(loadWorkouts(), today)}
          disabled={!ready || workouts.length === 0}
          className="w-full rounded-full border border-[#D3D1C7] bg-white py-3 text-[14px] font-medium text-text disabled:opacity-40"
        >
          {ready && workouts.length === 0 ? "No workouts to export" : "Export CSV"}
        </button>
      </section>

      <div className="mb-8 border-t border-divider" />

      {/* Import */}
      <section>
        <p className="label-eyebrow mb-1">Import</p>
        <p className="mb-3 text-[13px] text-text-subtle">
          Paste a CSV export or JSON array. This replaces all current data.
        </p>
        <div className="relative mb-3">
          <textarea
            value={text}
            onChange={(e) => { setError(null); setText(e.target.value); }}
            placeholder={"workout_id,date,…  or  [{\"id\":\"w_…\"}]"}
            className="h-48 w-full rounded-2xl border border-[#D3D1C7] bg-surface px-4 py-3 pr-12 font-mono text-[12px] text-text outline-none focus:border-text"
          />
          {text && (
            <InputClearButton
              onClear={() => { setError(null); setText(""); }}
              label="Clear import text"
              className="right-3 top-3 -translate-y-0"
            />
          )}
        </div>
        {error && (
          <p className="mb-3 text-[12px] text-[#C4441F]">{error}</p>
        )}
        <button
          onClick={handleImport}
          disabled={!text.trim()}
          className="w-full rounded-full bg-text py-3 text-center text-[14px] font-medium text-white disabled:opacity-40"
        >
          Import
        </button>
      </section>
    </div>
  );
}
