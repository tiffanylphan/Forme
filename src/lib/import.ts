const parseCsvLine = (line: string): string[] => {
  const values: string[] = [];
  let cur = "", inQuote = false;
  for (const ch of line) {
    if (ch === '"') { inQuote = !inQuote; }
    else if (ch === "," && !inQuote) { values.push(cur); cur = ""; }
    else { cur += ch; }
  }
  values.push(cur);
  return values;
};

const parseCSVRows = (text: string): Record<string, unknown>[] => {
  const lines = text.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const obj: Record<string, unknown> = {};
    headers.forEach((h, i) => {
      const v = values[i]?.trim() ?? "";
      obj[h] = v === "" ? null : v;
    });
    return obj;
  });
};

export const parseImportText = (text: string): unknown[] | null => {
  const trimmed = text.trim();

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // not JSON, fall through
  }

  const firstLine = trimmed.split("\n")[0] ?? "";
  if (firstLine.includes("workout_id") && firstLine.includes("exercise")) {
    const rows = parseCSVRows(trimmed);
    if (rows.length > 0) return rows;
  }

  return null;
};
