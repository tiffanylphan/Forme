# Planner Debugging Guide

This file covers how to **diagnose unexpected planner behavior** — wrong slot selected, override
mechanisms firing incorrectly, slotId mismatches. For adjusting constants once you know what to
change, see [planner-tuning-notes.md](./planner-tuning-notes.md).

---

## 1. Reading the displayed output

- `sessionIndex` ("4/4") = `selectedSlotIndex + 1` in the split template — it is a slot
  position, not a count of completed sessions. "4/4" can appear on the very first workout of
  the week.
- `slotRecommendations` on the draft exposes every candidate's score. Inspect these before
  assuming the planner is broken — the right slot often has the highest score and something
  else changed the final pick.

---

## 2. The probe script pattern

When a real user data scenario misbehaves, the fastest path is a small throw-away script that
runs the generator against real data and dumps all scores:

```ts
// probe-slot.ts  — DELETE before committing
import * as fs from "fs";
import { normalizeWorkouts } from "./src/lib/storage";
import { generateNextWorkout } from "./src/lib/generator";
import type { TrainingProfile } from "./src/lib/profile";
import type { HomeGymEquipmentType } from "./src/lib/exercise-availability";

const workouts = normalizeWorkouts(JSON.parse(fs.readFileSync("/tmp/workouts.json", "utf-8")));
// for CSV exports: parse rows first, then pass to normalizeWorkouts

const profile: TrainingProfile = { /* match the user's profile */ };
const draft = generateNextWorkout(workouts, "YYYY-MM-DD", /*seed*/ 42, profile);

console.log("Selected:", draft.split.slotId, draft.split.title);
draft.slotRecommendations.forEach(r =>
  console.log(`  [${r.rank}] ${r.slotId} score=${r.score.toFixed(2)} recommended=${r.isRecommended}`)
);
```

Run with: `unset NODE_OPTIONS && npx tsx probe-slot.ts`

---

## 3. Score vs. pick discrepancy

If the selected slot has a **lower score** than another incomplete slot in `slotRecommendations`,
an override mechanism fired *after* `pickBestSplitSlotIndex`. The override pipeline runs in
this order inside `generateNextWorkout`:

1. `getNextSplitSlotIndex` → calls `pickBestSplitSlotIndex` internally
2. `maybeOverrideForCriticalGap` — forces a slot if a critical movement pattern (need ≥ 3)
   is absent from the base pick
3. `maybeOverrideForStalledBias` — forces the preferred bias type when one side has 2+ more
   stalled exercises than the other

Add a temporary `console.log` at the return of each function to trace where the index changes.

---

## 4. Stall pressure analysis

`maybeOverrideForStalledBias` fires when `stalledBiasPressure.upper >= stalledBiasPressure.lower + 1`
(or vice versa). To compute it manually for a set of workouts:

- For each exercise in recent history, call `getStallState(name, workouts)`.
- Group stalled exercises by `movementOf(name)` (in `src/lib/movement.ts`).
- `push`, `pull`, `carry_core` → upper pressure.
- `squat`, `hinge`, `single_leg` → lower pressure.
- Accessory/isolation exercises (lateral raises, reverse flies) count the same as compounds —
  they can skew the count if a single upper accessory keeps stalling.

The override is guarded: it is suppressed when `incompletePreferred < incompleteOpposite`
(the preferred type has fewer remaining cycle slots than the other type). If the override is
firing unexpectedly, print `incompleteIndices` and count upper vs. lower slots in it.

---

## 5. SlotId storage verification

When workouts don't seem to track to the right slot, verify what was actually loaded:

```ts
workouts.forEach(w => console.log(w.date, JSON.stringify(w.planSlot)));
```

Common problems:

- `slotId` is a stale string from before a schema rename (e.g. `"upper_a_back_shoulders"`).
  `normalizeWorkout` re-derives `slotId` from `planSlot.title` on every load via
  `slotIdFromTitle` in `src/lib/storage.ts`, so stale stored values get corrected. If a new
  title format is not recognized, add it to the `known` map in `slotIdFromTitle`.
- `planSlot` is `undefined` on CSV-imported rows because the `plan_slot` column title did not
  match any known key — same fix applies.

---

## 6. Key inputs to check

| Variable | Where computed | What it affects |
|---|---|---|
| `incompleteIndices` | `getIncompleteSplitSlotIndices` | Which slots are candidates |
| `weeklyBiasBalance` | `summarizeWeeklyBiasBalance` | Lead penalties in scoring |
| `stalledBiasPressure` | inside `generateNextWorkout` | `maybeOverrideForStalledBias` trigger |
| `recentWorkoutsForSlotSelection` | `coverage.workouts + crossWeekRecentWorkouts` | Feeds all of the above |
| `slotRecommendations` | returned on `draft` | Final scores per candidate |

---

## 7. Diagnostic workflow

```
1. Print slotRecommendations scores.
2. Does the selected slot have the highest score among incompleteIndices?
   YES → override didn't fire. Investigate scoreExercise / deficit computation.
   NO  → an override fired. Add console.log to maybeOverrideForCriticalGap
         and maybeOverrideForStalledBias to identify which one changed the index.
3. If stalledBias fired unexpectedly:
   - Print stalledBiasPressure (upper vs. lower count).
   - Print incompleteIndices — check if incompletePreferred < incompleteOpposite
     (the guard that suppresses the override when preferred type leads the cycle).
4. If slot scores all look wrong:
   - Verify recentWorkoutsForSlotSelection has the right workouts.
   - Check that planSlot is present and slotId is correct on each workout.
```
