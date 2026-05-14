"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { saveWorkouts } from "@/lib/storage";
import type { Workout } from "@/lib/types";

export default function ImportPage() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleImport = () => {
    setError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text.trim());
    } catch {
      setError("Invalid JSON — make sure you copied the full data.");
      return;
    }
    if (!Array.isArray(parsed)) {
      setError("Expected a JSON array of workouts.");
      return;
    }
    saveWorkouts(parsed as Workout[]);
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
    <div className="mx-auto max-w-[480px] px-4 pb-16 pt-10">
      <h1 className="mb-1 text-[22px] font-semibold tracking-tight text-text">
        Import workout data
      </h1>
      <p className="mb-6 text-[13px] text-text-subtle">
        Paste your exported JSON below. This will replace all current data.
      </p>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder='[{"id":"w_..."}]'
        className="mb-3 h-48 w-full rounded-2xl border border-[#D3D1C7] bg-surface px-4 py-3 font-mono text-[12px] text-text outline-none focus:border-text"
      />

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
    </div>
  );
}
