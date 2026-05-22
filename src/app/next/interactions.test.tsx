import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import NextPage from "./page";

const useWorkoutsMock = vi.fn();
const useTrainingProfileMock = vi.fn();
const stashDraftMock = vi.fn();
const generateNextWorkoutMock = vi.fn(
  (
    _workouts?: unknown,
    _today?: unknown,
    _seed?: unknown,
    _profile?: unknown,
    overrides?: { preferredExercises?: string[]; forcedSlotId?: string },
  ) => {
    const broughtBack = overrides?.preferredExercises?.includes("Barbell hip thrust");
    const forcedUpperB = overrides?.forcedSlotId === "upper_back_shoulder_arms";
    const split = forcedUpperB
      ? {
          slotId: "upper_back_shoulder_arms",
          title: "Upper B · Upper/Arms",
          summary: "Upper session theme with more direct arm and upper support work.",
          sessionIndex: 2,
          totalSessions: 4,
          targetPrimaryStimulus: {
            shoulders: 5,
            triceps: 4,
            biceps: 3,
          },
          targetPrimarySets: {
            shoulders: 5,
            triceps: 4,
            biceps: 3,
          },
        }
      : {
          slotId: "upper_a",
          title: "Upper A · Back/Shoulders",
          summary: "Upper session theme with back, shoulders, and glute support.",
          sessionIndex: 1,
          totalSessions: 4,
          targetPrimaryStimulus: {
            back: 8,
            shoulders: 5,
            rear_delts: 4,
          },
          targetPrimarySets: {
            back: 8,
            shoulders: 5,
            rear_delts: 4,
          },
        };
    return {
      split,
      slotRecommendations: [
        {
          slotId: "upper_a",
          title: "Upper A · Back/Shoulders",
          summary: "Upper session theme with back, shoulders, and glute support.",
          rank: 1,
          score: 42,
          isRecommended: true,
          targetPrimaryStimulus: { back: 8, shoulders: 5, rear_delts: 4 },
          targetPrimarySets: { back: 8, shoulders: 5, rear_delts: 4 },
          topMuscles: ["back", "shoulders"],
          note: "Targets the biggest remaining gaps in back, shoulders.",
          caution: null,
        },
        {
          slotId: "upper_back_shoulder_arms",
          title: "Upper B · Upper/Arms",
          summary: "Upper session theme with more direct arm and upper support work.",
          rank: 2,
          score: 35,
          isRecommended: false,
          targetPrimaryStimulus: { shoulders: 5, triceps: 4, biceps: 3 },
          targetPrimarySets: { shoulders: 5, triceps: 4, biceps: 3 },
          topMuscles: ["shoulders", "triceps", "biceps"],
          note: "Targets the biggest remaining gaps in shoulders, triceps, biceps.",
          caution: "More overlap with recent shoulders / triceps fatigue.",
        },
      ],
      mobility: {
        title: "5-minute warm-up",
        items: ["Band row x 15", "Arm circles x 20s each way"],
      },
      cooldown: {
        title: "Cooldown and stretch",
        items: ["Lat stretch on bench x 30s", "Cross-body shoulder stretch x 30s/side"],
      },
      rationale: broughtBack
        ? [
            `This is ${split.title}: ${split.summary}`,
            "Still building this slot's focus stimulus: back, shoulders.",
          ]
        : [
            `This is ${split.title}: ${split.summary}`,
            "Rotated off stalled lift: Barbell hip thrust.",
            "Still building this slot's focus stimulus: back, shoulders.",
            "Hit only once: pull, push.",
          ],
      rotatedOffLifts: broughtBack ? [] : ["Barbell hip thrust"],
      sections: [
        {
          kind: "compound",
          rounds: 4,
          repScheme: "10 / 8 / 8 / 6 — build weight",
          exercises: [
            broughtBack
              ? {
                  name: "Barbell hip thrust",
                  primary: ["glutes"],
                  secondary: ["hamstrings", "core"],
                  pattern: "hinge",
                  movement: "hinge",
                  targets: [10, 8, 8, 6],
                  suggestedWeight: 135,
                  unit: "lb",
                  isFamiliar: true,
                  progression: {
                    lastSummary: "135 lb x 10/8/8/6",
                    goal: "Rebuild 10/8/8/6 reps with clean form.",
                    nextStep: "Bring it back slightly lighter and rebuild the reps cleanly.",
                    recentHistory: [
                      { date: "2026-05-05", summary: "135 lb x 10/8/8/6", status: "missed" },
                      { date: "2026-05-03", summary: "135 lb x 10/8/8/6", status: "held" },
                    ],
                  },
                }
              : {
                  name: "Cable row",
                  primary: ["back"],
                  secondary: ["biceps", "rear_delts"],
                  pattern: "pull",
                  movement: "pull",
                  targets: [10, 8, 8, 6],
                  suggestedWeight: 70,
                  unit: "lb",
                  isFamiliar: true,
                  progression: {
                    lastSummary: "70 lb x 10/8/7/6",
                    goal: "Work toward 10/8/8/6 reps before increasing load.",
                    nextStep: "Stay at 70 lb and add 1-2 total reps across the work sets.",
                    recentHistory: [
                      { date: "2026-05-05", summary: "70 lb x 10/8/7/6", status: "held" },
                      { date: "2026-05-03", summary: "70 lb x 10/8/8/6", status: "progressed" },
                      { date: "2026-04-30", summary: "70 lb x 9/8/7/6", status: "missed" },
                    ],
                  },
                },
          ],
        },
        {
          kind: "accessory",
          rounds: 3,
          repScheme: "12–15 reps · short rest",
          exercises: [
            {
              name: "DB lateral raise",
              primary: ["shoulders"],
              secondary: ["rear_delts"],
              pattern: "push",
              movement: "push",
              targets: [15, 12, 12],
              suggestedWeight: 10,
              unit: "lb",
              isFamiliar: true,
              progression: {
                lastSummary: "10 lb x 15/12/12",
                goal: "Own all reps before moving up.",
                nextStep: "Keep the tempo clean and stay smooth.",
                recentHistory: [],
              },
            },
          ],
        },
        {
          kind: "superset",
          rounds: 4,
          repScheme: "strength pairing · main lift + support move",
          exercises: [
            {
              name: "Barbell deadlift",
              primary: ["hamstrings", "glutes", "back"],
              secondary: ["core", "quads"],
              pattern: "hinge",
              movement: "hinge",
              targets: [10, 8, 8, 6],
              suggestedWeight: 125,
              unit: "lb",
              isFamiliar: true,
              progression: {
                lastSummary: "125 lb x 8/8/8/6",
                goal: "Match or beat 10/8/8/6 reps with solid form.",
                nextStep: "Stay sharp and add load only if bar speed stays clean.",
                recentHistory: [],
              },
            },
            {
              name: "Band-assisted pull-up",
              primary: ["back", "biceps"],
              secondary: ["shoulders", "core"],
              pattern: "pull",
              movement: "pull",
              targets: [8, 8, 6, 6],
              suggestedWeight: null,
              unit: "lb",
              isFamiliar: true,
              progression: {
                lastSummary: "8/8/6/6 reps",
                goal: "Keep all reps clean before reducing assistance.",
                nextStep: "Stay controlled and own each rep.",
                recentHistory: [],
              },
            },
          ],
        },
        {
          kind: "finisher",
          rounds: 2,
          repScheme: "8–12 reps each · finisher pair",
          exercises: [
            {
              name: "Burpee",
              primary: ["quads", "core"],
              secondary: ["shoulders", "chest"],
              pattern: "conditioning",
              movement: null,
              targets: [10, 10],
              suggestedWeight: null,
              unit: "lb",
              isFamiliar: true,
              progression: {
                lastSummary: "10 / 10 reps",
                goal: "Keep the pace even across both rounds.",
                nextStep: "Stay smooth and keep the output high.",
                recentHistory: [],
              },
            },
          ],
        },
      ],
    };
  },
);

vi.mock("@/lib/storage", () => ({
  useWorkouts: () => useWorkoutsMock(),
}));

vi.mock("@/lib/profile", async () => {
  const actual = await vi.importActual<typeof import("@/lib/profile")>("@/lib/profile");
  return {
    ...actual,
    useTrainingProfile: () => useTrainingProfileMock(),
  };
});

vi.mock("@/lib/generator", () => ({
  buildDraftExercise: (exercise: {
    name: string;
    primary: string[];
    secondary: string[];
    pattern: string;
  }, targets: (number | string)[]) => ({
    name: exercise.name,
    primary: exercise.primary,
    secondary: exercise.secondary,
    pattern: exercise.pattern,
    movement:
      exercise.pattern === "pull"
        ? "pull"
        : exercise.pattern === "push"
          ? "push"
          : exercise.pattern === "hinge"
            ? "hinge"
            : exercise.pattern === "squat"
              ? "squat"
              : exercise.pattern === "carry" || exercise.pattern === "core"
                ? "carry_core"
                : null,
    targets,
    suggestedWeight: null,
    unit: "lb",
    isFamiliar: true,
    progression: {
      lastSummary: null,
      goal: "Repeat the target cleanly.",
      nextStep: "Keep the form sharp and build from there.",
      recentHistory: [
        { date: "2026-05-04", summary: "solid session", status: "progressed" },
      ],
    },
  }),
  generateNextWorkout: (...args: Parameters<typeof generateNextWorkoutMock>) =>
    generateNextWorkoutMock(...args),
  stashDraft: (draft: unknown) => stashDraftMock(draft),
}));

describe("NextPage interactions", () => {
  it("can bring back a stalled lift into the routine", async () => {
    const user = userEvent.setup();
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
        intensity: "standard",
      },
    });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);

    await user.click(screen.getByRole("button", { name: "Bring back Barbell hip thrust" }));

    expect(screen.getByText("Barbell hip thrust")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Bring back Barbell hip thrust" })).not.toBeInTheDocument();
  });

  it("swaps an exercise within the allowed movement family", async () => {
    const user = userEvent.setup();
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
        intensity: "standard",
      },
    });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);
    expect(screen.getByText("Cable row")).toBeInTheDocument();

    await user.click(screen.getAllByText("Swap")[0]);
    expect(screen.getByText("Swap exercise")).toBeInTheDocument();
    expect(screen.getByText("Pull only")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search…"), "barbell bent");
    await user.click(screen.getByText("Barbell bent-over row"));

    expect(screen.getByText("Barbell bent-over row")).toBeInTheDocument();
    expect(screen.queryByText("Swap exercise")).not.toBeInTheDocument();
  });

  it("shows several closest role-matched swap options", async () => {
    const user = userEvent.setup();
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
        intensity: "standard",
      },
    });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);
    await user.click(screen.getAllByText("Swap")[0]);

    const optionButtons = screen.getAllByRole("button");
    const swapStart = optionButtons.findIndex((button) =>
      within(button).queryByText("DB bent-over row"),
    );
    const singleArmRowIndex = optionButtons.findIndex((button) =>
      within(button).queryByText("DB single-arm row"),
    );
    const barbellRowIndex = optionButtons.findIndex((button) =>
      within(button).queryByText("Barbell bent-over row"),
    );
    const tBarRowIndex = optionButtons.findIndex((button) =>
      within(button).queryByText("T-bar row"),
    );

    expect(swapStart).toBeGreaterThanOrEqual(0);
    expect(singleArmRowIndex).toBeGreaterThanOrEqual(0);
    expect(barbellRowIndex).toBeGreaterThanOrEqual(0);
    expect(tBarRowIndex).toBeGreaterThanOrEqual(0);
    expect(screen.queryByText("Lat pulldown")).not.toBeInTheDocument();
    expect(screen.queryByText("Straight-arm pulldown")).not.toBeInTheDocument();
    expect(
      screen.getByText((content) => content.includes("most directly comparable matches shown first")),
    ).toBeInTheDocument();
  });

  it("stashes the selected routine when accepted", async () => {
    const user = userEvent.setup();
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
        intensity: "standard",
      },
    });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);
    await user.click(screen.getByText("Use this routine →"));
    expect(stashDraftMock).toHaveBeenCalledTimes(1);
    const payload = stashDraftMock.mock.calls[0][0] as { source: string; draft: { split: { title: string } } };
    expect(payload.source).toBe("manual");
    expect(payload.draft.split.title).toBe("Upper A · Back/Shoulders");
  });

  it("shows only the rationale highlights until expanded", async () => {
    const user = userEvent.setup();
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
        intensity: "standard",
      },
    });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);

    expect(
      screen.getByText((content) =>
        content.includes("This is Upper A · Back/Shoulders: Upper session theme with back, shoulders, and glute support."),
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText((content) =>
        content.includes("Still building this slot's focus stimulus: back, shoulders."),
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText((content) => content.includes("Hit only once: pull, push.")),
    ).not.toBeInTheDocument();

    await user.click(screen.getByText("Show 2 more"));

    expect(
      screen.getByText((content) => content.includes("Hit only once: pull, push.")),
    ).toBeInTheDocument();
    expect(screen.getByText("Show less")).toBeInTheDocument();
  });

  it("renders progression coaching for each exercise", () => {
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
        intensity: "standard",
      },
    });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);
    expect(screen.getAllByText(/Last:/).length).toBeGreaterThan(0);
    expect(screen.getByText("held · 70 lb x 10/8/7/6")).toBeInTheDocument();
    expect(screen.getByText("progressed · 70 lb x 10/8/8/6")).toBeInTheDocument();
    expect(screen.getByText(/Goal: Work toward 10\/8\/8\/6 reps/)).toBeInTheDocument();
    expect(screen.getByText(/Next: Stay at 70 lb/)).toBeInTheDocument();
  });

  it("uses specific section labels for paired strength work", () => {
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
        intensity: "standard",
      },
    });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);
    expect(screen.getAllByText("Strength pair").length).toBeGreaterThan(0);
  });

  it("groups compound and accessory blocks into the same strength pair card", () => {
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
        intensity: "standard",
      },
    });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);

    expect(screen.getAllByText("Strength pair")).toHaveLength(2);
    expect(screen.queryByText("Compound")).not.toBeInTheDocument();
    expect(screen.queryByText("Accessory")).not.toBeInTheDocument();
    expect(screen.getByText("Cable row")).toBeInTheDocument();
    expect(screen.getByText("DB lateral raise")).toBeInTheDocument();
  });

  it("shows one shared summary for a grouped strength pair card", () => {
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
        intensity: "standard",
      },
    });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);

    const strengthPairCards = screen
      .getAllByText("Strength pair")
      .map((node) => node.closest("div.overflow-hidden.rounded-2xl"))
      .filter((node): node is HTMLElement => Boolean(node));
    const groupedCard = strengthPairCards.find((card) =>
      within(card).queryByText("DB lateral raise"),
    );
    expect(groupedCard).not.toBeUndefined();
    expect(within(groupedCard as HTMLElement).getByText("4 rounds")).toBeInTheDocument();
    expect(
      within(groupedCard as HTMLElement).getByText("10 / 8 / 8 / 6 — build weight"),
    ).toBeInTheDocument();
    expect(within(groupedCard as HTMLElement).getAllByText("4 rounds")).toHaveLength(1);
    expect(
      within(groupedCard as HTMLElement).getAllByText("10 / 8 / 8 / 6 — build weight"),
    ).toHaveLength(1);
  });

  it("does not add extra padded wrappers around grouped strength pair exercises", () => {
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
        intensity: "standard",
      },
    });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);

    const strengthPairCards = screen
      .getAllByText("Strength pair")
      .map((node) => node.closest("div.overflow-hidden.rounded-2xl"))
      .filter((node): node is HTMLElement => Boolean(node));
    const groupedCard = strengthPairCards.find((card) =>
      within(card).queryByText("DB lateral raise"),
    );
    expect(groupedCard).not.toBeUndefined();
    expect((groupedCard as HTMLElement).querySelectorAll(":scope > div.divide-y > div.px-4.py-3")).toHaveLength(2);
  });

  it("can swap a finisher through the finisher picker", async () => {
    const user = userEvent.setup();
    useTrainingProfileMock.mockReturnValue({
      ready: true,
      profile: {
        goal: "physique",
        daysPerWeek: 4,
        equipment: "full_gym",
        experience: "beginner",
        intensity: "standard",
      },
    });
    useWorkoutsMock.mockReturnValue({ ready: true, workouts: [] });

    render(<NextPage />);
    expect(screen.getByText("Burpee")).toBeInTheDocument();

    expect(screen.getByText("Finisher circuit")).toBeInTheDocument();

    const swapButtons = screen.getAllByText("Swap");
    await user.click(swapButtons[swapButtons.length - 1]);

    expect(screen.getByText("Swap finisher")).toBeInTheDocument();
    expect(screen.queryByText("Pull only")).not.toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Search…"), "high knees");
    await user.click(screen.getByText("High knees"));

    expect(screen.getByText("High knees")).toBeInTheDocument();
    expect(screen.queryByText("Swap finisher")).not.toBeInTheDocument();
  });
});
