"use client";

import { MUSCLE_COLORS } from "@/lib/colors";
import { formatMuscle } from "@/lib/format";
import type { MuscleGroup } from "@/lib/types";

type MuscleMapDatum = {
  muscle: MuscleGroup;
  primarySets: number;
  secondarySets: number;
  targetSets: number;
  intensity: number;
};

const FRONT_GROUPS: MuscleGroup[] = [
  "shoulders",
  "chest",
  "biceps",
  "core",
  "hip_flexors",
  "quads",
];

const BACK_GROUPS: MuscleGroup[] = [
  "rear_delts",
  "back",
  "triceps",
  "glutes",
  "hamstrings",
];

const HEAT_ORDER: MuscleGroup[] = [
  "glutes",
  "back",
  "shoulders",
  "hamstrings",
  "quads",
  "core",
  "rear_delts",
  "biceps",
  "triceps",
  "chest",
  "hip_flexors",
];

const hexToRgba = (hex: string, alpha: number): string => {
  const value = parseInt(hex.replace("#", ""), 16);
  const r = (value >> 16) & 255;
  const g = (value >> 8) & 255;
  const b = value & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

function BodyColumn({
  title,
  muscles,
  byMuscle,
}: {
  title: string;
  muscles: MuscleGroup[];
  byMuscle: Partial<Record<MuscleGroup, MuscleMapDatum>>;
}) {
  return (
    <div className="rounded-2xl border border-[#E6E3D8] bg-[#FBF9F3] px-3 py-3">
      <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
        {title}
      </p>
      <div className="space-y-2">
        {muscles.map((muscle) => {
          const row = byMuscle[muscle];
          const effective = row
            ? row.primarySets + Math.round(row.secondarySets * 0.35)
            : 0;
          const pct = row?.targetSets
            ? Math.min(100, Math.round((effective / row.targetSets) * 100))
            : Math.min(100, effective * 14);
          const color = MUSCLE_COLORS[muscle].text;

          return (
            <div key={muscle}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="text-[12px] font-medium capitalize text-text">
                  {formatMuscle(muscle)}
                </span>
                <span className="font-mono text-[11px] text-text-subtle">
                  {effective}
                  {row?.targetSets ? `/${row.targetSets}` : ""}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#E8E2D8]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: hexToRgba(color, 0.85),
                  }}
                  aria-label={`${formatMuscle(muscle)} ${effective}${row?.targetSets ? ` of ${row.targetSets}` : ""}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function MuscleMap({ rows }: { rows: MuscleMapDatum[] }) {
  const byMuscle = rows.reduce<Partial<Record<MuscleGroup, MuscleMapDatum>>>(
    (acc, row) => {
      acc[row.muscle] = row;
      return acc;
    },
    {},
  );

  const ranked = HEAT_ORDER
    .map((muscle) => byMuscle[muscle])
    .filter((row): row is MuscleMapDatum => Boolean(row))
    .sort(
      (a, b) =>
        b.intensity - a.intensity ||
        b.primarySets - a.primarySets ||
        b.secondarySets - a.secondarySets,
    );

  return (
    <section className="mb-6 rounded-2xl border border-[#E6E3D8] bg-surface px-4 py-4">
      <p className="label-eyebrow mb-2">Muscle heat</p>
      <p className="mb-3 text-[12px] text-text-subtle">
        This is a cleaner view of what you trained this week. Darker bars mean
        that muscle is closer to its target volume.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <BodyColumn title="Front" muscles={FRONT_GROUPS} byMuscle={byMuscle} />
        <BodyColumn title="Back" muscles={BACK_GROUPS} byMuscle={byMuscle} />
      </div>

      {ranked.length > 0 && (
        <div className="mt-4 rounded-2xl border border-[#E6E3D8] bg-[#FBF9F3] px-3 py-3">
          <p className="mb-2 text-[12px] font-medium text-text">Most worked</p>
          <div className="flex flex-wrap gap-1.5">
            {ranked.slice(0, 8).map((row) => (
              <span
                key={row.muscle}
                className="rounded-full px-3 py-1 text-[11px] font-medium capitalize"
                style={{
                  background: hexToRgba(
                    MUSCLE_COLORS[row.muscle].text,
                    Math.max(0.14, row.intensity * 0.3),
                  ),
                  color: MUSCLE_COLORS[row.muscle].text,
                }}
              >
                {formatMuscle(row.muscle)}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
