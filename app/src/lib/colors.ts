import type { MuscleGroup, Pattern } from "./types";

type ColorPair = { bg: string; text: string };

export const MUSCLE_COLORS: Record<MuscleGroup, ColorPair> = {
  quads: { bg: "#E6F1FB", text: "#0C447C" },
  glutes: { bg: "#EEEDFE", text: "#3C3489" },
  hamstrings: { bg: "#E1F5EE", text: "#085041" },
  calves: { bg: "#F1EFE8", text: "#444441" },
  chest: { bg: "#FAECE7", text: "#712B13" },
  back: { bg: "#E6F1FB", text: "#0C447C" },
  shoulders: { bg: "#FAEEDA", text: "#633806" },
  rear_delts: { bg: "#FBEAF0", text: "#72243E" },
  biceps: { bg: "#EAF3DE", text: "#27500A" },
  triceps: { bg: "#EAF3DE", text: "#27500A" },
  core: { bg: "#FAEEDA", text: "#633806" },
  hip_flexors: { bg: "#F1EFE8", text: "#444441" },
};

export const PATTERN_COLORS: Record<Pattern, ColorPair> = {
  push: { bg: "#FAECE7", text: "#712B13" },
  pull: { bg: "#E6F1FB", text: "#0C447C" },
  hinge: { bg: "#EEEDFE", text: "#3C3489" },
  squat: { bg: "#E1F5EE", text: "#085041" },
  core: { bg: "#FAEEDA", text: "#633806" },
  plyo: { bg: "#FBEAF0", text: "#72243E" },
  conditioning: { bg: "#F1EFE8", text: "#444441" },
  carry: { bg: "#FCEBEB", text: "#791F1F" },
};

// Cycle of soft colors used for superset grouping in the logger.
export const SUPERSET_COLORS: ColorPair[] = [
  { bg: "#E6F1FB", text: "#0C447C" },
  { bg: "#FAECE7", text: "#712B13" },
  { bg: "#E1F5EE", text: "#085041" },
  { bg: "#EEEDFE", text: "#3C3489" },
  { bg: "#FAEEDA", text: "#633806" },
  { bg: "#FBEAF0", text: "#72243E" },
];
