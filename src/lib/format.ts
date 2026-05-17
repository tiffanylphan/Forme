export const formatMuscle = (m: string): string => m.replace("_", " ");

export const normalizeSearch = (value: string): string =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

export const todayISO = (): string => {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const da = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
};

export const formatDate = (iso: string): string => {
  // Parse YYYY-MM-DD as local date (avoid TZ shift from new Date(iso))
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
};

let _idCounter = 0;
export const uid = (prefix = "id"): string => {
  _idCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${_idCounter}_${rand}`;
};
