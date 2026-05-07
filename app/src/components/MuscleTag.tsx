import { MUSCLE_COLORS } from "@/lib/colors";
import { formatMuscle } from "@/lib/format";
import type { MuscleGroup } from "@/lib/types";

type Size = "sm" | "md";

export function MuscleTag({
  muscle,
  size = "sm",
  faded = false,
}: {
  muscle: MuscleGroup;
  size?: Size;
  faded?: boolean;
}) {
  const c = MUSCLE_COLORS[muscle];
  const padding = size === "md" ? "3px 10px" : "2px 8px";
  const fontSize = size === "md" ? 11 : 10;
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        padding,
        fontSize,
        borderRadius: 6,
        fontWeight: 500,
        opacity: faded ? 0.55 : 1,
        whiteSpace: "nowrap",
      }}
    >
      {formatMuscle(muscle)}
    </span>
  );
}
