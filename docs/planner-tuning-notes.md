# Planner Tuning Notes

This file is a quick guide for adjusting planner behavior without hunting through
`generator.ts`.

Core tuning lives in [src/lib/planner-tuning.ts](../src/lib/planner-tuning.ts).
For the full pipeline, every knob's consumer, and cascade risks, see
[planner-architecture.md](./planner-architecture.md).

## Mental model

The planner now works in four layers:

1. Weekly stimulus deficits decide what the user needs most.
2. Recovery and overlap decide what is reasonable today.
3. Session fatigue budgeting decides how much total stress fits in one workout.
4. Split structure and movement coverage shape the result, but should not dominate it.

If behavior feels wrong, first decide which layer is wrong before changing numbers.

Newer inputs to be aware of (new in this change):

- Weekly coverage is **effort-weighted**: `effortFactor` in `src/lib/coverage.ts` scales each
  logged set's stimulus by load relative to the user's heaviest logged weight for that exercise
  (clamped 0.7–1.25). Light logged weeks now read as less coverage, which raises deficits.
- Session ratings feed the fatigue budget: `effortBudgetMultiplier` in
  `src/lib/session-feedback.ts` scales the session budget by recent easy/right/brutal ratings
  (range 0.85–1.1) — check it before assuming `fatigueBudget.base*` is mis-tuned.
- `getWeekPhase` in `src/lib/periodization.ts` derives a build/deload phase from weekly history
  (`intensityScale` 1.0 build / 0.75 deload). A "suddenly light" week may be a scheduled deload,
  not a tuning regression.

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

### One session stacks too many lifts on the same muscle (in-session discipline)

Start here (`sessionTarget` — session-level, distinct from the weekly over-target knobs):

- `sessionTarget.headroomMultiplier`
- `sessionTarget.baseAllowance`
- `sessionTarget.saturatedClosureMultiplier`
- `sessionTarget.overshootPenaltyWeight` / `overshootPenaltyCap`

What to do:

- Lower `headroomMultiplier` or `baseAllowance` if a session keeps overshooting its slot's own
  plan (e.g. a posterior day spending half its volume on quads).
- Keep `saturatedClosureMultiplier` small (0.1): it is the collapse of a saturated muscle's
  deficit bonuses that provides the real discipline — the overshoot penalty is deliberately
  capped below the hard-block scale and cannot win on its own.
- For strength, widen via `strengthAllowanceMultiplier` instead of the shared knobs (deadlift +
  RDL in one session is intended there).

### Back-to-back training days re-hammer the same muscle

Start here:

- `sessionTarget.hardDoseYesterdayThreshold`

What to do:

- A muscle that took ≥ this much primary stimulus yesterday gets zero in-session entitlement
  today (core/hip flexors exempt), and anchors avoid it via the fresh-anchor filter. Lower it to
  be stricter about consecutive-day overlap.
- Caution: `week-simulation.test.ts` asserts the same 5.5 threshold (`HARD_DOSE`) — change both
  together.

### Small support targets (adductors, rear delts) finish the week near zero

Start here:

- `sessionTarget.untouchedTargetPrimaryBonus`
- `sessionTarget.untouchedTargetSecondaryBonus`

What to do:

- Raise these if slot-targeted muscles under half their weekly target keep getting skipped.
  The anchor pick is exempt on purpose — main-lift choice is about slot identity.

### Sessions are too small, or core/finisher blocks appear at the wrong times

Start here:

- `sessionTarget.minSessionExercises` (completeness guarantee floor)
- `sessionTarget.coreBlockSaturationCutoff` (dedicated core block stands down past this weekly
  core saturation)
- `sessionTarget.finisherSaturatedMusclePenalty` (steers finishers off already-over-target
  muscles — stacks per exercise per muscle, so raising it can collapse the finisher template
  shortlist; see also `finisherVariety.templateShortlistSpread`)

### The planner keeps picking (or refuses to pick) a slot whose muscles are already done

Start here (`splitSelection` saturation family):

- `splitSelection.saturationHighThreshold` / `saturationHighPenalty`
- `splitSelection.saturationMediumThreshold` / `saturationMediumPenalty`
- `splitSelection.saturationOverTargetThreshold` / `saturationOverTargetPenalty` /
  `saturationOverTargetPenaltyScale`
- `splitSelection.saturationFilterThreshold` (hard removal from the candidate pool)
- `splitSelection.saturationOverTargetMajorMuscleThreshold` (what counts as a slot-defining
  "major" target)

What to do:

- Prefer adjusting the graduated penalties; move `saturationFilterThreshold` only as a last
  resort, and keep it ≥ `saturationOverTargetThreshold` — the band between them is where
  incidental co-primary volume is arbitrated by score instead of deleting a slot.
- The filter is guarded against forcing back-to-back same-bias days; if you see alternation
  break, suspect the guard's inputs (last workout's `planSlot`), not the thresholds.

### Monday repeats last Friday's session (or refuses a slot it should run)

Start here:

- `splitSelection.crossWeekRecencyDays`

What to do:

- This many days of last week's tail (explicit-slot workouts only) count as completed this
  cycle. Raise it if week boundaries cause repeats; note the generator falls back to
  this-week-only completion when the cross-week view would mark everything done.

### Slot choice ignores (or overreacts to) recent fatigue

Start here:

- `splitSelection.recentFatigueSlotPenaltyWeight`
- `splitSelection.lowerBiasFatigueThreshold` / `lowerBiasFatiguePenaltyWeight`
- `splitSelection.upperPullPivotGapThreshold` / `upperPullPivotBonus`
- `splitSelection.lowerBackSupportMisreadPenalty`
- `splitSelection.adaptiveUpperPull*` (gates the physique pull-biased upper rewrite)

What to do:

- Raise `recentFatigueSlotPenaltyWeight` if slots keep landing on freshly-hammered muscles.
- The `upperPullPivot*` / `lowerBiasFatigue*` cluster is one mechanism: high lower fatigue plus
  a leading upper-pull deficit pushes toward a back/rear-delt day — tune the threshold and the
  bonus together.

### The same finisher shows up every session

Start here:

- `finisherVariety.templateShortlistSpread`
- `finisherVariety.adHocNoiseWeight`

What to do:

- Widen `templateShortlistSpread` to pull more templates into the uniform draw. Beware any
  single template bonus/penalty larger than the spread — it makes the draw deterministic (this
  is why the hard-mode template bonus is only 0.75).

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
- If the whole workout feels too dense or too easy, start in `fatigueBudget` — and check the
  session-feedback multiplier and week phase first (see "Newer inputs" above).
- If one session overloads a single muscle even though weekly totals look fine, start in
  `sessionTarget`.
- If the planner is saying the right slot but the wrong reason, check `rationale`.
