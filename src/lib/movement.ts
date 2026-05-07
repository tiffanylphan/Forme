import type { Exercise, MovementPattern } from "./types";

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
