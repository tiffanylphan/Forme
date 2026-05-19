# Planner Tuning Notes

This file is a quick guide for adjusting planner behavior without hunting through
`generator.ts`.

Core tuning lives in [src/lib/planner-tuning.ts](/Users/tiffanyphan/code/workout-project/src/lib/planner-tuning.ts).

## Mental model

The planner now works in four layers:

1. Weekly stimulus deficits decide what the user needs most.
2. Recovery and overlap decide what is reasonable today.
3. Session fatigue budgeting decides how much total stress fits in one workout.
4. Split structure and movement coverage shape the result, but should not dominate it.

If behavior feels wrong, first decide which layer is wrong before changing numbers.

## Common adjustments

### The planner is too lower-heavy

Start here:

- `splitSelection.leadCatchupBoost`
- `splitSelection.leadSameSidePenalty`
- `weeklyBiasBalance.sideLeadThreshold`
- `workoutBias.lowerLeadThreshold`

What to do:

- Decrease `leadCatchupBoost` if upper sessions are not catching up enough.
- Increase `leadSameSidePenalty` if lower slots keep repeating too easily.
- Lower `sideLeadThreshold` if the planner is too slow to recognize upper deficits.

### The planner is too upper-heavy

Start here:

- `splitSelection.leadCatchupBoost`
- `splitSelection.leadSameSidePenalty`
- `workoutBias.upperLeadThreshold`

What to do:

- Raise `upperLeadThreshold` if hybrid/manual sessions are getting labeled upper too easily.
- Reduce upper catch-up pressure by lowering `leadCatchupBoost`.

### The planner is too conservative on recovery

Start here:

- `exerciseSelection.primaryRecoveryPenaltyWeight`
- `exerciseSelection.secondaryRecoveryPenaltyWeight`
- `exerciseSelection.latestSessionPrimaryOverlapWeight`
- `exerciseSelection.latestSessionSecondaryOverlapWeight`
- `fatigueBudget.baseThreeDay`
- `fatigueBudget.baseFourDay`
- `fatigueBudget.baseFiveDay`

What to do:

- Lower recovery and overlap weights if the planner avoids too much good work.
- Raise the fatigue budget if sessions are consistently too light.

Use caution:

- Increasing session budgets changes total session density more than changing a single overlap weight.

### The planner is not conservative enough on recovery

Start here:

- `exerciseSelection.primaryRecoveryPenaltyWeight`
- `exerciseSelection.plannedPrimaryOverlapWeight`
- `exerciseSelection.defaultBudgetPenaltyMultiplier`
- `fatigueBudget.base*`

What to do:

- Increase the recovery and planned-overlap penalties if the draft stacks too many similar stressors.
- Lower the fatigue budget if sessions routinely feel too dense.

### The planner is too light on direct arm work

Start here:

- `slotInference.armBiasNoDirectPenalty`
- `slotInference.armBiasDirectBonus`
- `exerciseSelection.physiqueArmBiasBonus`
- `exerciseSelection.armBiasBudgetPenaltyMultiplier`

What to do:

- Increase `physiqueArmBiasBonus` if Upper B days still under-deliver arm work.
- Increase `armBiasNoDirectPenalty` if inferred/manual upper-arm sessions are not matching well.
- Lower `armBiasBudgetPenaltyMultiplier` if fatigue budgeting is suppressing needed arm finishers.

### The planner repeats the same movement family too often

Start here:

- `exerciseSelection.repeatExercisePenalty`
- `exerciseSelection.repeatFamilyPenalty`
- `exerciseSelection.repeatClaimedFamilyPenalty`
- `splitSelection.fullOverlapPenalty`
- `splitSelection.partialOverlapPenalty`

What to do:

- Increase family repetition penalties first.
- Increase movement-overlap penalties only if slot choice itself is also too repetitive.

### The planner drifts too far from the split

Start here:

- `splitSelection.slotOrderPenalty`
- `slotInference.sameBiasCompletedMargin`
- `slotInference.completedMargin`
- `slotInference.lowConfidenceThreshold`

What to do:

- Increase `slotOrderPenalty` to make earlier incomplete slots slightly stickier.
- Increase the confidence margins if manual/imported sessions are consuming slots too aggressively.

### The planner follows the split too rigidly

Start here:

- `splitSelection.slotOrderPenalty`
- `splitSelection.deficitCoverageWeight`
- `splitSelection.topDeficitWeight`

What to do:

- Lower `slotOrderPenalty` if structure is overpowering deficits.
- Increase deficit weights if real muscle needs are not winning often enough.

## Safe tuning workflow

1. Change one section at a time.
2. Prefer small moves, usually `5-15%`.
3. Run `npm test`.
4. Check the scenario fixtures in `src/lib/generator.test.ts`.
5. Compare a few real planner outputs before making another change.

## Good defaults

Use these as a rule of thumb:

- If a behavior problem shows up in slot choice, start in `splitSelection` or `slotInference`.
- If it shows up in specific exercise picks, start in `exerciseSelection`.
- If the whole workout feels too dense or too easy, start in `fatigueBudget`.
- If the planner is saying the right slot but the wrong reason, check `rationale`.
