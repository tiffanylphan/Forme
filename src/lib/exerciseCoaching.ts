import { formatMuscle } from "./format";
import type { Exercise } from "./types";

export type ExerciseCoaching = {
  works: string;
  setup: string;
  cues: string[];
  mistakes: string[];
  why: string;
};

const titleCase = (value: string): string =>
  value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const musclesSummary = (exercise: Exercise): string => {
  const primary = exercise.primary.map(formatMuscle);
  const secondary = exercise.secondary.map(formatMuscle);
  if (secondary.length === 0) return primary.join(", ");
  return `${primary.join(", ")} · support from ${secondary.join(", ")}`;
};

const whyFromPrimary = (exercise: Exercise): string => {
  const lead = exercise.primary[0];
  switch (lead) {
    case "glutes":
      return "Builds glute size and helps lower-body shape.";
    case "back":
      return "Builds back width and posture strength.";
    case "shoulders":
    case "rear_delts":
      return "Adds shoulder shape and upper-body balance.";
    case "hamstrings":
      return "Builds your posterior chain and helps hinge strength.";
    case "quads":
      return "Builds leg strength and lower-body volume.";
    case "biceps":
    case "triceps":
      return "Adds direct arm work that can get lost in compound lifts.";
    case "core":
      return "Builds trunk control so your bigger lifts stay stable.";
    default:
      return "Supports the session's main training goal.";
  }
};

const lowerName = (exercise: Exercise): string => exercise.name.toLowerCase();

export const getExerciseCoaching = (exercise: Exercise): ExerciseCoaching => {
  const name = lowerName(exercise);

  if (name.includes("hip thrust") || name.includes("glute bridge")) {
    return {
      works: musclesSummary(exercise),
      setup: "Upper back on a bench or floor, ribs down, feet planted about hip-width.",
      cues: ["Tuck pelvis slightly", "Drive through mid-foot", "Squeeze glutes hard at the top"],
      mistakes: ["Overarching low back", "Pushing from toes", "Turning it into a back bend"],
      why: "High-return glute work with a strong squeeze at lockout.",
    };
  }

  if (name.includes("romanian deadlift") || name.includes("rdl")) {
    return {
      works: musclesSummary(exercise),
      setup: "Stand tall, soft knees, weights close to thighs before you hinge.",
      cues: ["Push hips back", "Keep shins mostly vertical", "Drag the weight close to legs"],
      mistakes: ["Squatting instead of hinging", "Letting the weight drift forward", "Rounding the back"],
      why: "Lengthened hamstring and glute work that is excellent for physique progress.",
    };
  }

  if (name.includes("deadlift") || name.includes("good morning") || name.includes("hyperextension")) {
    return {
      works: musclesSummary(exercise),
      setup: "Brace before the first rep and set your torso position before you move.",
      cues: ["Brace your trunk", "Push the floor away", "Finish by standing tall, not leaning back"],
      mistakes: ["Jerking the first rep", "Losing midline tension", "Hyperextending at lockout"],
      why: "Builds posterior-chain strength and reinforces a strong hinge pattern.",
    };
  }

  if (name.includes("split squat") || name.includes("lunge") || name.includes("step-up") || name.includes("pistol squat") || name.includes("cossack")) {
    return {
      works: musclesSummary(exercise),
      setup: "Set your stance first, then stay balanced before starting the working reps.",
      cues: ["Own the front leg", "Keep torso stacked", "Drive through the whole foot"],
      mistakes: ["Rushing balance", "Collapsing knee inward", "Bouncing off the bottom"],
      why: "Great unilateral lower-body work for glutes, legs, and stability.",
    };
  }

  if (name.includes("squat") || name.includes("leg press") || name.includes("leg extension") || name.includes("wall sit")) {
    return {
      works: musclesSummary(exercise),
      setup: "Set feet, brace, and keep pressure balanced through the foot before each rep.",
      cues: ["Brace before you descend", "Track knees over toes", "Stand up with control"],
      mistakes: ["Heels lifting", "Collapsing forward", "Rushing the bottom"],
      why: "Builds leg strength and lower-body training volume.",
    };
  }

  if (name.includes("row")) {
    return {
      works: musclesSummary(exercise),
      setup: "Set your torso, pack the shoulder, and start each rep from a stretched position.",
      cues: ["Drive elbow toward hip", "Keep chest proud", "Control the reach forward"],
      mistakes: ["Shrugging up", "Yanking with momentum", "Turning it into a bicep curl"],
      why: "Builds upper-back thickness and supports posture.",
    };
  }

  if (name.includes("pulldown") || name.includes("pull-up") || name.includes("chin-up")) {
    return {
      works: musclesSummary(exercise),
      setup: "Set ribs down, chest tall, and begin by pulling the shoulder blades into position.",
      cues: ["Pull elbows toward ribs", "Keep neck relaxed", "Control the stretch back up"],
      mistakes: ["Leaning way back", "Yanking with the arms only", "Shortening the top stretch"],
      why: "Builds back width and improves your vertical pulling strength.",
    };
  }

  if (name.includes("face pull") || name.includes("reverse fly") || name.includes("pull-apart")) {
    return {
      works: musclesSummary(exercise),
      setup: "Use a light enough load to keep the shoulders moving cleanly.",
      cues: ["Lead with elbows", "Open chest", "Pause briefly in the back position"],
      mistakes: ["Using too much load", "Shrugging", "Turning it into a low row"],
      why: "Adds rear-delt and upper-back work that balances pressing.",
    };
  }

  if (name.includes("curl")) {
    return {
      works: musclesSummary(exercise),
      setup: "Stand tall with elbows close to your sides before each set starts.",
      cues: ["Keep upper arm quiet", "Squeeze at the top", "Lower under control"],
      mistakes: ["Swinging the torso", "Letting elbows drift forward", "Rushing the lowering phase"],
      why: "Direct arm volume that helps complete upper-body physique work.",
    };
  }

  if (name.includes("overhead press") || name.includes("arnold press") || name.includes("landmine press") || name.includes("pike push-up")) {
    return {
      works: musclesSummary(exercise),
      setup: "Brace ribs down, squeeze glutes, and start with the load stacked near shoulder height.",
      cues: ["Press straight up", "Keep ribcage down", "Finish with biceps by ears"],
      mistakes: ["Leaning back", "Flaring ribs", "Pressing around the head instead of up"],
      why: "Builds shoulder shape and stronger overhead control.",
    };
  }

  if (name.includes("lateral raise") || name.includes("front raise") || name.includes("sunrise raise") || name.includes("prone press")) {
    return {
      works: musclesSummary(exercise),
      setup: "Choose a load you can move without body English.",
      cues: ["Lift with soft elbows", "Stop before shrugging", "Lower slowly"],
      mistakes: ["Swinging", "Shrugging to the ears", "Using too much weight"],
      why: "High-value shoulder isolation for cap and shape.",
    };
  }

  if (name.includes("bench press") || name.includes("push-up") || name.includes("dip") || name.includes("chest fly")) {
    return {
      works: musclesSummary(exercise),
      setup: "Set shoulders down and back before the first rep.",
      cues: ["Stay stacked through the trunk", "Control the bottom", "Press without bouncing"],
      mistakes: ["Shoulders rolling forward", "Flaring elbows wildly", "Cutting the range short"],
      why: "Builds pressing strength and fills out the front upper body.",
    };
  }

  if (name.includes("tricep") || name.includes("skull crusher")) {
    return {
      works: musclesSummary(exercise),
      setup: "Anchor the upper arm first so the elbow joint does most of the motion.",
      cues: ["Keep elbows mostly fixed", "Straighten fully", "Lower under control"],
      mistakes: ["Shoulders taking over", "Elbows drifting everywhere", "Using momentum"],
      why: "Adds direct tricep work that supports pressing and arm shape.",
    };
  }

  if (name.includes("plank") || name.includes("dead bug") || name.includes("bird dog") || name.includes("hollow")) {
    return {
      works: musclesSummary(exercise),
      setup: "Set ribs down and pelvis neutral before the hold or first rep.",
      cues: ["Brace as if someone will poke your stomach", "Breathe without losing tension", "Move slowly"],
      mistakes: ["Arching low back", "Holding your breath", "Rushing the reps"],
      why: "Improves trunk control so your bigger lifts stay cleaner.",
    };
  }

  if (name.includes("hanging") || name.includes("v-up") || name.includes("tuck-up") || name.includes("bicycle crunch") || name.includes("woodchop") || name.includes("pallof")) {
    return {
      works: musclesSummary(exercise),
      setup: "Lock your trunk position first so the movement comes from the intended pattern.",
      cues: ["Move with control", "Keep trunk tension", "Use a full but clean range"],
      mistakes: ["Swinging", "Yanking through hip flexors only", "Losing trunk position"],
      why: "Adds direct trunk work without needing heavy loading.",
    };
  }

  if (name.includes("carry")) {
    return {
      works: musclesSummary(exercise),
      setup: "Stand tall, grip hard, and start walking only after your trunk is braced.",
      cues: ["Stay tall", "Take short controlled steps", "Keep shoulders level"],
      mistakes: ["Leaning side to side", "Letting shoulders shrug", "Rushing the walk"],
      why: "Simple, effective core and posture work that carries over well.",
    };
  }

  if (exercise.pattern === "conditioning" || exercise.pattern === "plyo") {
    return {
      works: musclesSummary(exercise),
      setup: "Start at a pace you can repeat cleanly rather than redlining the first effort.",
      cues: ["Stay rhythmic", "Land or move quietly", "Keep output consistent"],
      mistakes: ["Going all-out too early", "Losing form under fatigue", "Letting rest get sloppy"],
      why: "Adds conditioning without replacing the strength focus of the session.",
    };
  }

  return {
    works: musclesSummary(exercise),
    setup: `Set up so the working muscles stay in charge and the load matches your current control level.`,
    cues: ["Move with control", "Use the full clean range", "Keep tension where the move is supposed to hit"],
    mistakes: ["Using momentum", "Going too heavy too early", "Shortening the range to force reps"],
    why: whyFromPrimary(exercise),
  };
};

export const formatExerciseEquipment = (exercise: Exercise): string =>
  titleCase(exercise.equipment);
