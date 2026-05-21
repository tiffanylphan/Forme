import { PATTERN_COLORS } from "@/lib/colors";
import type { Pattern } from "@/lib/types";

export function PatternBadge({
  pattern,
  className = "",
}: {
  pattern: Pattern;
  className?: string;
}) {
  const c = PATTERN_COLORS[pattern];
  return (
    <span
      style={{
        background: c.bg,
        color: c.text,
      }}
      className={`inline-flex h-6 items-center rounded-full px-2.5 text-[10px] font-medium whitespace-nowrap ${className}`.trim()}
    >
      {pattern}
    </span>
  );
}
