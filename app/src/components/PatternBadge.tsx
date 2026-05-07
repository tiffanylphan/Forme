import { PATTERN_COLORS } from "@/lib/colors";
import type { Pattern } from "@/lib/types";

export function PatternBadge({ pattern }: { pattern: Pattern }) {
  const c = PATTERN_COLORS[pattern];
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
        padding: "3px 10px",
        fontSize: 10,
        borderRadius: 20,
        fontWeight: 500,
        whiteSpace: "nowrap",
      }}
    >
      {pattern}
    </span>
  );
}
