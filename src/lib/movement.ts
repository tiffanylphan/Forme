import type { Exercise, MuscleGroup, MovementPattern } from "./types";

const UNILATERAL_RX =
  /single-leg|split squat|\blunge\b|step-up|pistol|cossack|bench single/i;
const CALF_RX = /calf raise/i;

// Map an exercise to one of the six fundamental movement patterns.
// Returns null for plyo, conditioning, and calf-only exercises — those can
// still be logged manually but they don't drive planning.
export function movementOf(ex: Exercise): MovementPattern | null {
  if (CALF_RX.test(ex.name)) return null;
  switch (ex.pattern) {
    case "core":
    case "carry":
      return "carry_core";
    case "push":
      return "push";
    case "pull":
      return "pull";
    case "squat":
      return UNILATERAL_RX.test(ex.name) ? "single_leg" : "squat";
    case "hinge":
      return UNILATERAL_RX.test(ex.name) ? "single_leg" : "hinge";
    case "plyo":
    case "conditioning":
      return null;
  }
}

export const MOVEMENT_LABELS: Record<MovementPattern, string> = {
  squat: "Squat",
  hinge: "Hinge",
  push: "Push",
  pull: "Pull",
  single_leg: "Single-leg",
  carry_core: "Carry / core",
};

export const MOVEMENT_BLURBS: Record<MovementPattern, string> = {
  squat: "Quad-dominant",
  hinge: "Hip / posterior chain",
  push: "Horizontal & vertical press",
  pull: "Horizontal & vertical pull",
  single_leg: "Lunges, step-ups, splits",
  carry_core: "Carries, planks, anti-rotation",
};

export const MOVEMENT_COLORS: Record<MovementPattern, { bg: string; text: string }> = {
  squat: { bg: "#E1F5EE", text: "#085041" },
  hinge: { bg: "#EEEDFE", text: "#3C3489" },
  push: { bg: "#FAECE7", text: "#712B13" },
  pull: { bg: "#E6F1FB", text: "#0C447C" },
  single_leg: { bg: "#FAEEDA", text: "#633806" },
  carry_core: { bg: "#FBEAF0", text: "#72243E" },
};

export const FOCUSABLE_MUSCLES = [
  "glutes",
  "hamstrings",
  "quads",
  "adductors",
  "back",
  "shoulders",
  "rear_delts",
  "core",
] as const satisfies readonly MuscleGroup[];
export type FocusableMuscle = (typeof FOCUSABLE_MUSCLES)[number];

// Maps each focusable muscle to bilateral movement patterns only. single_leg is intentionally
// omitted so muscle focus stays independent of unilateral/bilateral structure — single_leg
// remains accessible via the advanced movement grid. The per-muscle exercise score boost still
// applies to single-leg exercises with the focused muscle in primary.
export const MUSCLE_TO_MOVEMENTS: Record<FocusableMuscle, MovementPattern[]> = {
  glutes: ["hinge"],
  hamstrings: ["hinge"],
  quads: ["squat"],
  adductors: ["squat"],
  back: ["pull"],
  shoulders: ["push"],
  rear_delts: ["pull"],
  core: ["carry_core"],
};

export function muscleSetToMovements(muscles: readonly MuscleGroup[]): MovementPattern[] {
  const seen = new Set<MovementPattern>();
  muscles.forEach((m) => {
    if (MUSCLE_TO_MOVEMENTS[m as FocusableMuscle]) {
      MUSCLE_TO_MOVEMENTS[m as FocusableMuscle].forEach((mp) => seen.add(mp));
    }
  });
  return [...seen];
}
