# Planner Architecture Reference

The planner (`generateNextWorkout` in [src/lib/generator.ts](../src/lib/generator.ts)) is a
single-pass pipeline of soft-scoring stages sharing mutable session state. Nothing here is an
isolated function: changing one weight moves candidates relative to *every* other bonus and
penalty, and the seeded RNG makes even no-op-looking edits reshuffle picks. This doc maps the
pipeline, the scoring conventions and WHY they exist, every tuning knob, and the known cascade
risks.

Companion docs:
- [planner-tuning-notes.md](./planner-tuning-notes.md) — symptom → knob playbook.
- [planner-debugging.md](./planner-debugging.md) — diagnosing a wrong slot/exercise pick.

Line anchors below are `file:line` at time of writing; when they drift, the symbol names are the
durable reference.

---

## 0. Module map

| Module | Role |
|---|---|
| `src/lib/generator.ts` | The pipeline. `generateNextWorkout` (≈ generator.ts:1707) does everything below. |
| `src/lib/planner-tuning.ts` | All behavior weights/thresholds (`PLANNER_TUNING`). See §4. |
| `src/lib/splits.ts` | `SplitSlot` templates per profile, `resolveSplitVariants` (3-day upper A/B flip, splits.ts:318), `getWeeklyTargetStimulus`. |
| `src/lib/coverage.ts` | Weekly window (`weekContaining`, Monday-start), `computeCoverage` (muscle/movement stats), `estimateExerciseStimulus` (per-set stimulus by movement class), `distributeRecoveryStress`, `recentMuscleStressWithin` (decayed), **`effortFactor` (new in this change)** — set-level load-aware stimulus scaling: each set's stimulus is scaled by effort relative to the user's heaviest logged weight for that exercise in-window, clamped to [0.7, 1.25], neutral 1.0 for bodyweight/duration/no-reference sets (coverage.ts:204). Weekly coverage — and therefore deficits and saturation — is effort-weighted, not raw set counts. |
| `src/lib/session-feedback.ts` | **New in this change.** `effortBudgetMultiplier`: maps recent "easy / about right / brutal" session ratings to a fatigue-budget multiplier in [0.85, 1.1]. |
| `src/lib/periodization.ts` | **New in this change.** `getWeekPhase` (periodization.ts:62): derives a build/deload phase from weekly history (workout count, volume drop ratio, consecutive build weeks, brutal-rating count); `intensityScale` 1.0 in build, 0.75 in deload. |
| `src/lib/movement.ts` | `movementOf`: exercise → one of six movement patterns, or `null` for plyo/conditioning/calf (null = never a planned pick, finishers only). `single_leg` inferred by name regex. |
| `src/lib/exercise-predicates.ts` | `familyOf`, anchor/isolation predicates, `MOVEMENT_PRIORITY`, `PRIMARY_MUSCLE_PRIORITY`, `SECONDARY_MUSCLE_PRIORITY`, `COMPOUND_MOVEMENTS`, `ACCESSORY_MOVEMENTS`. |
| `src/lib/finishers.ts` | `FINISHER_TEMPLATES` (curated circuits with `tags`, `requiresHardMode`). |
| `src/lib/progression.ts` | `getStallState` → `"none" | "watch" | "stalled"`; drives rotation, section reordering, stalled-bias override. |
| `src/lib/exercises.ts` | `EXERCISES` array. **Array order and tags feed the seeded RNG stream — see §5.1.** |

---

## 1. The generation pipeline

`generateNextWorkout(workouts, todayISO, seed, profile, overrides)` runs three phases in order:
**derive state → select slot → assemble session**. All phases read the same derived state; the
assembly phase also mutates shared per-session state (`used`, `claimedFamilies`,
`claimedMovements`, `claimedMuscleCounts`, `plannedSessionStress`, `plannedPrimaryStimulus`,
`pendingPicks`).

### 1.1 State derivation (generator.ts:1714–1844)

| State | Where | What it is |
|---|---|---|
| `coverage` | generator.ts:1715–1716 | `computeCoverage` over the Monday-start week containing today. Effort-weighted (see coverage.ts `effortFactor`). |
| `recent` | generator.ts:1717 | Muscles stressed in last **48h** (`recentMusclesWithin`). Feeds finisher scoring + rationale. |
| `recentStress` | generator.ts:1718 | Decayed per-muscle recovery stress over last **96h** (`recentMuscleStressWithin`; half-life = max(24h, 0.4·window)). Feeds `scoreExercise` recovery penalty. |
| `rng` / `finisherRng` | generator.ts:1719–1726 | Two independent mulberry32 streams; `finisherRng` gets **two warm-up draws** (see §5.1). |
| `split` | generator.ts:1727–1731 | `resolveSplitVariants(getSplitTemplate(profile))` — 3-day physique flips upper A/B based on the last logged upper slot. |
| `need` | generator.ts:1733–1741 | Per movement pattern: 0 days hit this week → 3, 1 day → 1, 2+ → 0. |
| `weeklyMuscleTargets` | generator.ts:1745–1750 | Sum of every slot's `targetPrimaryStimulus` per muscle. |
| `muscleSaturation` | generator.ts:1751–1758 | `weeklyPrimaryDone / weeklyTarget` per targeted muscle. ≥1.0 = over target. Drives slot filter, near-cap and over-target penalties. |
| `muscleDeficits` | generator.ts:1759 (`computeMuscleDeficits`, generator.ts:955) | `max(0, weeklyTarget − (primary + secondary stimulus done))`. Note: deficits count secondary stimulus; saturation counts only primary. |
| `stalledExerciseNames` / `watchedExerciseNames` / `stalledFamilies` | generator.ts:1760–1764, 1941–1950 | From `getStallState` per exercise. |
| `stalledBiasPressure` | generator.ts:1765 (`summarizeStalledBiasPressure`, generator.ts:634) | Count of stalled exercises grouped upper (push/pull) vs lower (hinge/squat/single_leg); carry_core counts toward neither. Feeds the stalled-bias override. |
| `yesterdayPrimary` | generator.ts:1776–1788 | Primary stimulus logged exactly **yesterday** (calendar-adjacent). A muscle hard-dosed yesterday (≥ `sessionTarget.hardDoseYesterdayThreshold` = 5.5 ≈ one 4-set compound) gets **zero in-session entitlement** today. Core/hip_flexors exempt. |
| `lastSessionMovements` / `lastSessionExerciseNames` | generator.ts:1769–1803 | Movements from the most recent workout (any age); exact exercise names only if it was within 2 days. |
| `recentSessionStressMaps` | generator.ts:1804–1813 | Muscle stress of last 2 workouts, decayed 1.0 / 0.65 (`recentSessionOverlap`). |
| Cross-week window | generator.ts:1815–1824 | Workouts with explicit `planSlot` from the last `splitSelection.crossWeekRecencyDays` (5) days *before* Monday are treated as completed this cycle (`recentWorkoutsForSlotSelection`). |
| `incompleteIndices` | generator.ts:1840–1844 | `getIncompleteSplitSlotIndices` over the combined window; **same-week fallback**: if counting last week's tail marks everything complete, recompute from this week's workouts alone so cross-week recency never deletes a slot. |
| `keystoneAnchor` | generator.ts:3131–3147 | The lift that opened the most recent session of *this same slot*, 3–14 days back — re-anchored unless stalled, disqualified, or its muscles were hard-dosed yesterday. |
| `currentWeekExerciseNames` / `currentWeekFamilies` / `recentLowerFamilies` | generator.ts:1905–1934 | Repeat-penalty inputs (week-level; lower families also tracked across last 2 sessions). |

Slot completion for slotless/manual workouts is *inferred*: `inferCompletedSlotIds`
(generator.ts:824) scores each workout against each slot (`scoreWorkoutForSlot`,
generator.ts:695, weights in `PLANNER_TUNING.slotInference`) with confidence-margin guards so an
ambiguous workout doesn't consume a slot.

### 1.2 Slot selection (generator.ts:1846–1904)

Execution order (note the nesting at generator.ts:1846–1876 — **stalled-bias runs BEFORE
critical-gap**):

```
getNextSplitSlotIndex  →  maybeOverrideForStalledBias  →  maybeOverrideForCriticalGap
```

1. **`getNextSplitSlotIndex`** (generator.ts:1370)
   - Filters incomplete slots through the **bias-aware saturation filter**:
     `slotHasOverTargetMajorMuscle` (generator.ts:1354) drops a slot only when a *major* target
     (≥ `saturationOverTargetMajorMuscleThreshold` = 4) is **decisively** over target
     (> `saturationFilterThreshold` = 1.0). The graduated penalties in `scoreSplitSlot` own the
     1.0–1.3× band — filtering at exactly 1.0 previously deleted a quad day because Monday's
     lunges nudged quads past target.
   - **Alternating-bias restore guard** (generator.ts:1388–1403): if the filter leaves only
     slots matching yesterday's bias, the filtered-out opposite-bias slots are restored and the
     penalties arbitrate on score — the filter must never force back-to-back same-bias days.
   - Scores candidates with `scoreSplitSlot` (generator.ts:1047): deficit coverage ratio
     (priority-weighted), top-3 deficit values, preferred/allowed movement need, slot-order
     stickiness, saturation penalties, last-session movement overlap, recent-muscle-fatigue
     penalty, lower-fatigue→upper-pull pivot, and lower/upper weekly-lead catch-up (capped).
   - If nothing is incomplete, re-scores **all** slots (still saturation-filtered).
2. **`maybeOverrideForStalledBias`** (generator.ts:1537) — when one side has ≥1 more stalled
   exercises than the other, re-pick the best incomplete slot of the preferred bias.
   **Guards**: no-op when pressure is tied ("mixed"), when the preferred bias has *fewer*
   remaining incomplete slots than the opposite bias (generator.ts:1562–1569 — accessory stalls
   must not push the cycle further out of balance), or when the base pick already matches.
3. **`maybeOverrideForCriticalGap`** (generator.ts:1439) — late-week rescue for a movement with
   need ≥ 3 that the base slot can't serve. **Guards**: skipped entirely on a fresh week
   (`incompleteIndices.length === 0` — everything is "critical" on day one); squat/single_leg
   treat each other as coverage (both knee-dominant, generator.ts:1470–1474); prefers incomplete
   slots, saturation-filters within the eligible pool, and only overrides when the
   critical-capable slot (+6 preferred-movement bump) actually outscores the base.

Then: `rankSplitSlotIndices` + `buildSlotRecommendations` expose all scores on the draft
(`draft.slotRecommendations`); `overrides.forcedSlotId` bypasses the pick (generator.ts:1893);
`adaptSelectedSlot` (generator.ts:982) may rewrite a physique upper slot into a pull-biased
catch-up slot when lower fatigue is high and the pull deficit leads the press deficit.

### 1.3 Session assembly (generator.ts:1952–3833)

Stages run in this order. Each stage picks via `pickBest`/`pickForMovement` (all funneling
through `scoreExercise`, §2) and claims picks via `claimWithStress`, which updates the shared
state the *next* stage scores against. Unclaimed in-batch picks are visible via `pendingPicks` /
`pendingRdlPick` / `pendingHingePick` so superset partners aren't scored blind to each other
(generator.ts:2932–2962).

| # | Stage | Where | Notes |
|---|---|---|---|
| 1 | **Anchor (main lift)** | generator.ts:3085–3163 | Fallback chain: `keystoneAnchor` → fresh-anchor (`freshAnchorFilter`: excludes anchors whose primaries were hard-dosed yesterday, generator.ts:3119–3126) → plain anchor filter → **anchor guarantee**: retry with `allowNegative` (floor −100) so a saturated week still gets a main lift. Lower slots use `lowerAnchorFilter` (strong lower anchor + heavy equipment or single_leg); upper slots use `upperCompoundFilter` (true pull/press compounds only); back-focused upper slots force a pull anchor regardless of `need.pull` (generator.ts:3104–3108). |
| 2 | **Secondary lift** | generator.ts:3164–3231 | Complementary compound (upper: compound-first, then back/shoulder or arm-bias isolation; lower: glute-biased first, then back/shoulder support). Avoids double-barbell with the anchor in the last fallback. |
| 2b | **Strength pairing** | generator.ts:3233–3283 | In hard mode, anchor+secondary render as one "strength pairing" superset; a barbell secondary leads a non-barbell anchor unless it's an arm isolation. Otherwise separate compound + accessory sections. **Saturated-support trim**: the support slot is structurally guaranteed (scoring can only pick the least-bad candidate, never drop it), so when every non-core primary muscle of the support move is already at/past its weekly target, its dose drops from 4 sets to `sessionTarget.saturatedSupportSets` (2), a rationale line explains why, and those muscles join `saturationClosedMuscles` — treated as allowance-spent for the rest of the draft (bonus collapse + full overshoot pricing) so accessories can't re-spend the freed allowance on the same muscle. |
| 3 | **First accessory superset** | generator.ts:3286–3305 | `addSuperset` over `ACCESSORY_MOVEMENTS`; physique gates candidates to slot-theme work. `noHeavyBarbellCircuit` bars heavy barbell hinge/squat/push from all short-rest volume (hip thrust exempt). |
| 4 | **Second accessory superset / tri-set** | generator.ts:3324–3340 | `addCircuit` (3 exercises) when `useTrisetAccessory` (hard mode + not home + (3-day or balanced)), else another superset. |
| 5 | **Supplemental cross-over** | generator.ts:3344–3359 | For each `slot.supplementalMovements` not yet present, a 3-round block. Supplemental movements are excluded from slot scoring on purpose (splits.ts:11–13). |
| 6 | **Fill-ins** | generator.ts:3387–3441 | If < 5 exercises: one more accessory block (core-eligible if the session has none). Physique arm-bias slots missing direct arm work get a 2-round arm finish; 4-day physique upper slots missing lower support get a 2-round glute block. |
| 7 | **Core block** | generator.ts:3443–3461 | Skipped once weekly core saturation ≥ `sessionTarget.coreBlockSaturationCutoff` (0.75) — core rides along on nearly everything and headlines most finishers. |
| 8 | **Completeness guarantee** | generator.ts:3468–3491 | While `totalExercises() < sessionTarget.minSessionExercises` (4): take the least-bad *legal* picks (`allowNegative` — hard blocks still excluded). Deep saturation can null every normal stage below the −10 floor; a program never hands the user a 2-exercise day. |
| 9 | **Finisher** | generator.ts:3493–3833 | Two paths, see below. Always the last section. |
| 10 | **Reorder** | generator.ts:3995–4007 | Sections containing watch/stalled lifts move to right after the anchor (form quality early); section 1 stays first; the finisher stays last. Stable partition. |

**Finisher paths.** Template path: `templateApplies` hard-gates (tags vs slot bias, all-off-theme
exercise rejection, used/environment, posterior-hinge stacking, claimed hip_thrust/rdl families,
per-template-cumulative muscle-cap check, generator.ts:3498–3578); `templateScore` soft-ranks
(generator.ts:3579); a **shortlist** of templates within `finisherVariety.templateShortlistSpread`
(2.5) of the top score is drawn from **uniformly** with `finisherRng` — weighting inside the
shortlist would collapse variety back onto the top 1–2 (generator.ts:3637–3671).
`overrides.excludeFinisherTemplateIds` (the Shuffle feature) removes on-screen templates; if that
empties the pool, one is parked as `fallbackSingletonTemplate` and the **ad-hoc path** runs
instead: a greedy pick of up to 3 exercises scored by `sortFinisherScore` (pre-drawn
`finisherRng` noise × `adHocNoiseWeight`), with family/movement/muscle-cap dedupe
(generator.ts:3699–3796), then `pickBestFinisher` as last resort, then the parked template.
Finisher stress bills at `fatigueBudget.finisherStressMultiplier` (0.6).

---

## 2. Scoring conventions — and why

### 2.1 The three floors

| Constant | Value | Meaning |
|---|---|---|
| `HARD_BLOCK_SCORE` | −1000 (generator.ts:2018) | Absolute exclusions: no movement pattern (plyo/conditioning/calf), environment/goal disallows, movement not in slot's allowed+supplemental, second pick from a single-instance family (`biceps_isolation`, `triceps_isolation`, `hip_thrust`, `rdl`), muscle-overlap cap exceeded, second back-primary on a lower day, second direct adduction (generator.ts:2019–2053). |
| `pickBest` floor | −10 (generator.ts:2565) | A stage returns `null` (section skipped) rather than a candidate scoring ≤ −10. |
| `allowNegative` floor | −100 (generator.ts:2565) | Used **only** by the anchor guarantee and the completeness guarantee: the least-bad *legal* pick beats an anchorless or 2-exercise session. |

**Why −1000 and not −10:** soft penalties routinely stack a *legitimate* candidate below −10
(see §4 interaction warnings). If hard blocks sat at −10, a heavily-penalized-but-legal pick
could rank *below* a hard-blocked one and the blocked exercise (e.g. a second hip thrust) would
win. −1000 keeps blocks unreachable by any penalty stack; −100 keeps `allowNegative` safely
above it.

### 2.2 Per-set-saturating deficit closure

In `scoreExercise`, the dominant bonus is `closure = min(weeklyDeficit, stimulusPerSet)` ×
priority × focus × `deficitClosureWeight` (8.5) (generator.ts:2085–2241). Because closure
saturates at **one set's stimulus** and weekly deficits are computed once per generation, the
bonus for a deficient muscle is *identical for the 1st and the 6th pick of the session* — the
weekly gap doesn't shrink as the draft grows.

**Why session-target discipline collapses bonuses instead of only adding penalties:** any
capped penalty loses to an uncapped, always-maximal bonus (closure × 8.5 alone is worth tens of
points for a high-priority muscle). So `sessionTarget` does both (generator.ts:2094–2167):

- once a muscle's planned-in-session primary stimulus reaches its **allowance**, its closure AND
  magnitude bonuses are multiplied by `saturatedClosureMultiplier` (0.1) — the bonus collapses;
- overshoot is *also* penalized (`overshootPenaltyWeight` 2.5, capped at 15 **per primary
  muscle**), deliberately small: per `planner-tuning.ts` comments, the cap stays near the family
  hard-block scale so this term steers rather than deletes candidates.

`allowance = entitledTarget × headroomMultiplier (1.25) + baseAllowance (2.5)`, ×2 for strength
(`strengthAllowanceMultiplier` — deadlift + RDL back-to-back is intentional there).

### 2.3 The entitlement chain

`entitledTarget` (generator.ts:2114–2127) is what the slot may still spend on a muscle, in order
of increasingly tight regimes:

1. **Slot target** — early in the week (< 50% of weekly target done) the slot's own plan
   governs: a fresh back day still pairs a row with a vertical pull.
2. **Weekly-remaining tightening** — once `weeklyPrimaryDone ≥ weeklyTarget ×
   remainingEntitlementThreshold` (0.5), entitlement drops to
   `min(slotTarget, weeklyTarget − weeklyPrimaryDone)`: one row, not three, when back has 1
   stimulus left.
3. **Zero on saturation** — at `weeklyPrimaryDone ≥ weeklyTarget` the same formula bottoms out
   at 0; only `baseAllowance` headroom remains.
4. **Zero on yesterday-hard-dose** — `yesterdayPrimary[m] ≥ hardDoseYesterdayThreshold` (5.5)
   forces `entitledTarget = 0` outright (core/hip_flexors exempt). This is the 48h-rule
   enforcement for back-to-back training days; the anchor filters (`freshAnchorFilter`,
   keystone freshness) apply the same rule to main-lift choice.

Counterweight: slot-targeted muscles still under **half** their weekly target with nothing
planned get `untouchedTargetPrimaryBonus`/`untouchedTargetSecondaryBonus` (anchor pick exempt)
so small targets (adductors: 2, rear_delts: 4) don't finish the week under floor
(generator.ts:2148–2164, 2204–2213).

### 2.4 Other structural conventions

- **Weekly vs session accounting**: `overTargetPenalty`/`nearCapPenalty` compare against
  *weekly* saturation; `sessionTarget` compares against *this draft's* planned stimulus. They
  are independent and additive.
- **Muscle-overlap hard cap** (`muscleOverlap`, generator.ts:1992–2013): exercise-equivalents
  (primary = 1, secondary = 0.5) per muscle per session, cap 5, tightened by 1 for
  watch/stalled-touched ("rebuild") muscles and user-flagged sensitive muscles, floor 1.
  Exceeding it is a hard block, independent of all soft budgets.
- **Fatigue budget**: `sessionFatigueBudget` (generator.ts:2788–2799) = per-days-per-week base
  ± hard/lower/strength/home adjustments. Projected overage is an **uncapped** per-point
  penalty with per-context multipliers (arm-bias 0.3, lower-slot upper work 0.3, default 0.9).
  `effortBudgetMultiplier` (session-feedback, new in this change) scales the budget by recent
  session ratings; `getWeekPhase().intensityScale` (periodization, new in this change) scales
  intensity 1.0/0.75 for build/deload.
- **Movement ordering** (`sortedByNeed`, generator.ts:2873–2884): candidates are tried in
  need-order biased by `preferredMovementOrderBias` and against already-claimed movements —
  with pre-drawn per-movement noise so sort comparators stay pure (see §5.1).

---

## 3. PLANNER_TUNING reference

All knobs live in [src/lib/planner-tuning.ts](../src/lib/planner-tuning.ts). Values inline for
scale; the source is authoritative.

### 3.1 `workoutBias` — classifying logged/manual workouts (consumed by `inferWorkoutBias`, generator.ts:603)

| Knob | Value | Consumer | Notes |
|---|---|---|---|
| `strongLowerStressMultiplier` | 1.1 | generator.ts:607 | Strong-lower stress inflates "lower" reading. |
| `directArmStimulusMultiplier` | 0.35 | generator.ts:610 | Direct arm work only partially counts as "upper". |
| `lowerLeadThreshold` | 3 | generator.ts:612 | Lower lead needed to classify "lower". |
| `upperLeadThreshold` | 3.5 | generator.ts:614 | Upper lead needed to classify "upper"… |
| `upperStrongLowerCap` | 4 | generator.ts:615 | …unless strong-lower stress ≥ this (stays "mixed"). |

### 3.2 `weeklyBiasBalance` — lower/upper session counting (consumed by `summarizeWeeklyBiasBalance`, generator.ts:649)

| Knob | Value | Consumer | Notes |
|---|---|---|---|
| `strongLowerFloor` / `lowerStimulusFloor` | 4 / 6 | generator.ts:667–668 | Slotless workout counts as 0.75 lower / 0.25 upper past these. |
| `sideLeadThreshold` | 2 | generator.ts:674,678 | Stimulus lead to count a slotless workout as one full side. |
| `strongLowerSplitLower` / `strongLowerSplitUpper` | 0.75 / 0.25 | generator.ts:670–671, 683–684 | Fractional attribution. |
| `mixedSplit` | 0.5 | generator.ts:688–689 | Ambiguous workouts split evenly. |

### 3.3 `slotInference` — matching logged workouts onto slots (consumed by `scoreWorkoutForSlot` generator.ts:695 and `inferCompletedSlotIds` generator.ts:824)

| Knob | Value | Consumer | Notes |
|---|---|---|---|
| `targetMatchWeight` | 2.4 | generator.ts:726 | Capped-at-target stimulus match; the dominant term. |
| `focusMatchWeight` | 1.25 | generator.ts:727 | |
| `offTargetPrimaryPenalty` | 0.35 | generator.ts:728 | |
| `preferredMovementWeight` / `crossBiasMovementWeight` / `allowedMovementWeight` | 1.2 / 0.15 / 0.6 | generator.ts:742–750 | Cross-bias allowed movements (lower move on upper slot) score far below same-bias. |
| `carryCoreFocusWeight` | 0.75 | generator.ts:754 | |
| `upperStrongLowerPenalty` | 3 | generator.ts:758 | Strong-lower work on an upper slot. |
| `lowerBackShoulderPenalty` / `lowerDirectArmPenalty` | 0.35 / 0.5 | generator.ts:761–764 | |
| `focusPrimaryWeight` / `targetPrimaryWeight` / `focusSecondaryWeight` | 0.8 / 0.35 / 0.3 | generator.ts:770–778 | |
| `lowerStrongAnchorBonus` / `upperBackShoulderBonus` / `upperDirectArmBonus` | 0.45 / 0.45 / 0.3 | generator.ts:783–789 | |
| `lowerPosterior*` / `lowerQuad*` (4 bonuses/penalties + 2 imbalance penalties) | 0.5–8 | generator.ts:793–807 | Slot-specific: distinguish `lower_glute_ham` vs `lower_glute_quad`. |
| `upperStrongLowerSetThreshold` / `upperStrongLowerSetPenalty` / `upperMixedLowerPenalty` | 4 / 2 / 10 | generator.ts:809–813 | |
| `armBiasNoDirectPenalty` / `armBiasDirectBonus` | 8 / 0.75 | generator.ts:816–818 | Arm-bias slots demand direct arm work. |
| `mixedExplicitSkipScoreThreshold` | 12 | generator.ts:905 | Minimum absolute score for *any* inference to consume a slot (name is narrower than behavior). |
| `sameBiasCompletedMargin` / `sameBiasConfidenceThreshold` | 8 / 4 | generator.ts:913–914 | Guards against a same-bias repeat consuming a second slot. |
| `completedMargin` / `lowConfidenceThreshold` | 5 / 3 | generator.ts:921,925 | Low-confidence match consumes the *first* eligible slot instead of the best-scoring one. |

### 3.4 `splitSelection` — choosing the next slot (consumed by `scoreSplitSlot` generator.ts:1047, `slotHasOverTargetMajorMuscle` generator.ts:1354, `adaptSelectedSlot` generator.ts:982, cross-week window generator.ts:1817)

| Knob | Value | Consumer | Notes / interaction warnings |
|---|---|---|---|
| `deficitCoverageWeight` | 10 | generator.ts:1091 | × fraction-of-slot-plan-still-deficient (priority-weighted; 1.0 on a fresh week). |
| `topDeficitWeight` / `secondDeficitWeight` / `thirdDeficitWeight` | 1.6 / 0.9 / 0.45 | generator.ts:1092–1094 | Absolute deficit values — scale with slot target sizes, so retuning slot targets in splits.ts silently retunes these. |
| `preferredNeedTopWeight` / `preferredNeedSecondWeight` / `allowedNeedWeight` | 3 / 1.25 / 0.5 | generator.ts:1096–1098 | × movement need × `MOVEMENT_PRIORITY`. |
| `slotOrderPenalty` | 1 | generator.ts:1102 | × slot index. The only thing keeping split order sticky. |
| `saturationHighThreshold` / `saturationHighPenalty` | 0.9 / 10 | generator.ts:1126–1127 | Avg saturation of the slot's targeted muscles. |
| `saturationMediumThreshold` / `saturationMediumPenalty` | 0.7 / 4 | generator.ts:1128–1129 | |
| `saturationOverTargetThreshold` / `saturationOverTargetPenalty` / `saturationOverTargetPenaltyScale` | 1.0 / 20 / 20 | generator.ts:1122–1125 | Fires on the max *major* muscle only; 20 + 20×excess easily dominates all deficit bonuses. |
| `saturationOverTargetMajorMuscleThreshold` | 4 | generator.ts:1115, 1358 | Defines "major" for both the penalty and the hard filter — support targets (glutes: 2 on upper slots) never trigger either. |
| `saturationFilterThreshold` | 1.0 | generator.ts:1366 | The hard filter. Must stay ≥ `saturationOverTargetThreshold` or the graduated band disappears. Guarded by the alternating-bias restore (generator.ts:1388). |
| `fullOverlapPenalty` / `partialOverlapPenalty` | 6 / 3 | generator.ts:1139–1140 | Last-session preferred-movement overlap (≥100% / ≥67%). |
| `leadThreshold` / `leadCatchupBoost` / `leadSameSidePenalty` / `leadCap` | 1.25 / 3 / 2.5 / 8 | generator.ts:1193–1223 | Weekly lower/upper balance correction, capped both ways. |
| `crossWeekRecencyDays` | 5 | generator.ts:1817 | Days before Monday whose explicit-slot workouts count as done this cycle. Raising it can mark most of the split complete on Monday (the same-week fallback then rescues, generator.ts:1840). |
| `recentFatigueSlotPenaltyWeight` | 0.9 | generator.ts:1151 | × sum of recent fatigue on the slot's focus muscles. |
| `lowerBiasFatigueThreshold` / `lowerBiasFatiguePenaltyWeight` | 6 / 1.6 | generator.ts:1179, 1186 | Lower-fatigue pivot: when lower fatigue is high AND upper-pull deficit leads. |
| `upperPullPivotGapThreshold` / `upperPullPivotBonus` | 2 / 10 | generator.ts:1180, 1183 | +10 to back/rear-delt upper slots in the pivot condition. |
| `lowerBackSupportMisreadPenalty` | 8 | generator.ts:1188 | Stops a lower slot with a tiny `back` target from "answering" an upper-pull deficit. |
| `adaptiveUpperPull*` (4 knobs) | 6 / 4 / 2 / 4 | generator.ts:1008–1019 | Gate `adaptSelectedSlot`'s pull-biased rewrite of physique upper slots (and its strict no-press variant). |

### 3.5 `recentSessionOverlap`

| Knob | Value | Consumer | Notes |
|---|---|---|---|
| `latestDecay` / `priorDecay` | 1 / 0.65 | generator.ts:1810–1811 | Decay for the last-2-workout stress maps feeding both slot fatigue and exercise overlap penalties. |

### 3.6 `exerciseSelection` — `scoreExercise` (generator.ts:2019–2544) and finisher scorers

Bonuses (b) and penalties (p). **The −10 `pickBest` floor is the interaction to watch: any
penalty growth here can null a whole stage** (§2.1, §5.2).

| Knob | Value | Consumer | Notes / warnings |
|---|---|---|---|
| `movementNeedWeight` | 2.75 | generator.ts:2066 | × remaining movement need (claimed subtracts). |
| `fallbackMovementPriorityWeight` | 0.15 | generator.ts:2075 | Used when goal isn't physique/balanced. |
| `primaryFocusMultiplier` / `secondaryFocusMultiplier` | 1.2 / 1.1 | generator.ts:2092, 2195 | Multiply closure for slot-focus muscles. |
| `userFocusPrimaryMultiplier` / `userFocusSecondaryMultiplier` | 1.6 / 1.3 | generator.ts:2090, 2193 | Override-focus muscles beat slot focus. |
| `secondaryClosureWeight` | 0.55 | generator.ts:2201, 2219 | Secondary-tag closure AND magnitude discount. |
| `deficitClosureWeight` | 8.5 | generator.ts:2241 | **The dominant bonus.** See §2.2. |
| `deficitMagnitudeCap` / `deficitMagnitudeWeight` | 18 / 0.10 | generator.ts:2166, 2214, 2242 | Small tie-breaker toward bigger gaps. |
| `primaryRecoveryPenaltyWeight` / `secondaryRecoveryPenaltyWeight` | 0.32 / 0.1 | generator.ts:2171, 2223 | × 96h decayed stress × recoveryPerSet. Capped by `recoveryPenaltyCap`. |
| `latestSessionPrimaryOverlapWeight` / `latestSessionSecondaryOverlapWeight` | 0.16 / 0.05 | generator.ts:2177, 2229 | × last-2-session stress (decayed). Capped by `overlapPenaltyCap`. |
| `plannedPrimaryOverlapWeight` / `plannedSecondaryOverlapWeight` | 0.12 / 0.04 | generator.ts:2182, 2234 | × stress already planned into this draft. Same cap. |
| `primaryPriorityWeight` / `secondaryPriorityWeight` | 0.35 / 0.2 | generator.ts:2186, 2238 | × muscle priority × physique factor. |
| `nearCapSaturationThreshold` / `nearCapPenaltyWeight` | 0.9 / 5 | generator.ts:2255–2259 | Primary-tag-only weekly-saturation ramp. Uncapped but small. |
| `overTargetThreshold` / `overTargetPenalty` / `overTargetPenaltyScale` | 1.0 / 2 / 4 | generator.ts:2288–2293 | Tiered weekly over-target penalty, primary+secondary tags. |
| `overTargetHighThreshold` / `overTargetHighPenalty` / `overTargetHighPenaltyScale` | 1.25 / 5 / 10 | generator.ts:2282–2287 | |
| `overTargetSecondaryWeight` | 0.5 | generator.ts:2276 | Secondary tags half-count. |
| `overTargetPenaltyCap` | 8 | generator.ts:2296 | Deliberately < 10 so this term alone can never breach the −10 floor. |
| `recoveryPenaltyCap` / `overlapPenaltyCap` | 7.5 / 4.5 | generator.ts:2298–2299 | Each alone < 10; **together they can breach it**. |
| `armBiasBudgetPenaltyMultiplier` / `lowerBiasUpperMovementBudgetPenaltyMultiplier` / `defaultBudgetPenaltyMultiplier` | 0.3 / 0.3 / 0.9 | generator.ts:2304–2311 | × budget overage, **uncapped** — late-session picks in a dense draft can go arbitrarily negative; this is what usually pushes fill-ins below −10. |
| `physique*` (8 knobs) | 0.5–1.2 | generator.ts:2314–2342 | Goal-flavor bonuses; glute bonuses gated off once glutes are over target. |
| `strengthHeavyEquipmentBonus` | 1.4 | generator.ts:2346 | |
| `fullGym*` / `dumbbellEnv*` / `home*` (8 knobs) | 0.3–2.2 | generator.ts:2348–2382 | Equipment-environment shaping; unlocked home-gym equipment reuses full-gym bonuses. |
| `beginnerTechnicalBarbellPenalty` / `beginnerNovelLiftPenalty` | 1.2 / 0.8 | generator.ts:2385–2386 | |
| `barbellCapPenalty` | 12 | generator.ts:2390 | 3rd+ barbell lift in a session — alone enough to breach the −10 floor. |
| `stalledExercisePenalty` / `watchedExercisePenalty` / `stalledFamilySubBonus` | 7 / 2.5 / 1.6 | generator.ts:2393–2396 | Rotation pressure; the sub bonus steers to a sibling in the stalled family. |
| `knownExerciseBonus` | 1 | generator.ts:2399 | |
| `earlyBackAnchorBonus` / `earlyBackSupportPenalty` / `earlyPushAnchorBonus` / `earlyPushIsolationPenalty` | 2.4 / 1.8 / 2.4 / 1.8 | generator.ts:2406–2419 | First-pull/first-push shaping on focus slots. |
| `upperPullRepeatVerticalPenalty` / `upperPullNeedsRowPenalty` / `upperPullRowBalanceBonus` / `upperPullSupportBeforeRowPenalty` | 12 / 4 / 3 / 3 | generator.ts:2453–2468 | Row/vertical-pull balance on back-focus slots; the 12 is floor-breaching by design. |
| `preferredMovementBonus` | 0.9 | generator.ts:2422 | |
| `repeatExercisePenalty` / `repeatFamilyPenalty` (+ strength variants) | 2.4 / 1.2 (0.6 / 0.4) | generator.ts:2423–2434 | Week-level repeats. |
| `repeatClaimedFamilyPenalty` (+ strength variant) | 4 (1.5) | generator.ts:2435–2441 | × in-session family count. |
| `repeatDirectArmIsolationPenalty` | 10 | generator.ts:2446 | Belt-and-braces on top of the family hard block. |
| `unilateralFamilyPenalty` / `repeatedUnilateralFamilyPenalty` | 7 / 12 | generator.ts:2478–2479, 3630–3631 | Also applied to finisher **templates** containing unilateral knee families. |
| `repeatedSingleLegPenalty` / `repeatedSingleLegHardPenalty` | 2.5 / 8 | generator.ts:2482–2483 | |
| `repeatedHingePenalty` / `repeatedHingeHardPenalty` | 3 / 8 | generator.ts:2489–2490 | Non-strength only. |
| `repeatedDeadliftFamilyPenalty` | 20 | generator.ts:2511 | Effective soft-block, all goals. |
| `posteriorChainOverloadPenalty` | 100 | generator.ts:2504 | Effective soft-block (3rd hinge-dominant pick, non-strength). Counts pending picks. |
| `repeatedRdlFamilyPenalty` | 6 | **(no consumer — dead knob)** | The rdl family is handled by the hard block at generator.ts:2027 and the posterior-overload penalty instead. |
| `recentLowerFamilyRepeatPenalty` | 2.5 | generator.ts:2517 | Lower family seen in last 2 sessions. |
| `focusPrimaryBonus` / `focusSecondaryBonus` | 0.6 / 0.15 | generator.ts:2530, 2540 | |
| `targetRemainingWeight` / `targetReachedPenalty` | 0.1 / 0.35 | generator.ts:2535–2536 | Slot-target nudges (weekly-done based). |
| `randomnessWeight` | 2.0 | generator.ts:2542 | Uniform noise per scored candidate. Bigger = more variety AND more seed-sensitivity; comparable to several real bonuses. |

### 3.7 `sessionTarget` — in-session discipline (§2.2–2.3)

| Knob | Value | Consumer | Notes / warnings |
|---|---|---|---|
| `headroomMultiplier` / `baseAllowance` | 1.25 / 2.5 | generator.ts:2129–2130 | Allowance formula. `baseAllowance` alone is what a fully-saturated muscle still gets. |
| `overshootPenaltyWeight` / `overshootPenaltyCap` | 2.5 / 15 | generator.ts:2144–2145 | Cap is **per primary muscle** — multi-primary exercises can accrue up to 15 each. |
| `saturatedClosureMultiplier` | 0.1 | generator.ts:2139 | The bonus collapse. Raising it re-enables muscle-stacking. |
| `remainingEntitlementThreshold` | 0.5 | generator.ts:2125 | Where the weekly-remaining regime kicks in. |
| `untouchedTargetPrimaryBonus` / `untouchedTargetSecondaryBonus` | 3 / 2 | generator.ts:2163, 2212 | Under-half-target nudges; anchor exempt. |
| `finisherSaturatedMusclePenalty` | 6 | generator.ts:2586, 3611 | Per saturated primary muscle, in `pickBestFinisher` AND `templateScore` — **stacks per exercise per muscle; 2–3 hits push a template out of the 2.5-wide shortlist entirely** (bonus stacking collapsing finisher shortlists works the same way in reverse). |
| `strengthAllowanceMultiplier` | 2 | generator.ts:2132 | |
| `preferredMovementOrderBias` / `claimedMovementOrderPenalty` | 0.5 / 0.6 | generator.ts:2876, 2869 | Movement-ordering (`sortedByNeed`), not scoring. |
| `strengthClaimedOrderMultiplier` | 0 | generator.ts:2526, 2871 | Zeroes both the claimed-order demotion AND `lastSessionExercisePenalty` for strength. |
| `lastSessionExercisePenalty` | 6 | generator.ts:2524 | Exact lift from a ≤2-day-old session (carry_core exempt). |
| `coreBlockSaturationCutoff` | 0.75 | generator.ts:3447 | Core block stand-down. |
| `minSessionExercises` | 4 | generator.ts:3470 | Completeness guarantee target. |
| `hardDoseYesterdayThreshold` | 5.5 | generator.ts:2120, 3124 | ≈ one 4-set compound. Same constant as the test suite's `HARD_DOSE` (week-simulation.test.ts:374) — **change both together or the 48h tests fail**. |

### 3.8 `muscleOverlap`, `finisherVariety`, `fatigueBudget`, `rationale`

| Knob | Value | Consumer | Notes / warnings |
|---|---|---|---|
| `muscleOverlap.capCount` | 5 | generator.ts:1993 | Per-muscle exercise-equivalents hard cap. |
| `muscleOverlap.rebuildMuscleCapReduction` / `sensitiveMuscleCapReduction` / `minCap` | 1 / 1 / 1 | generator.ts:1994–1998 | Reductions stack; floor 1. |
| `finisherVariety.templateShortlistSpread` | 2.5 | generator.ts:3646 | Shortlist width. Any template bonus > 2.5 (or stacked `finisherSaturatedMusclePenalty`) collapses the shortlist to 1–2 templates — the hard-mode bonus is 0.75 for exactly this reason (generator.ts:3587–3590). |
| `finisherVariety.adHocNoiseWeight` | 1.5 | generator.ts:3759 | Ad-hoc finisher noise. |
| `fatigueBudget.baseThreeDay` / `baseFourDay` / `baseFiveDay` | 30 / 25 / 21 | generator.ts:2790–2793 | Session budget. Changes total session density more than any single overlap weight. |
| `fatigueBudget.hardModeBonus` / `lowerBiasBonus` / `strengthBonus` / `homePenalty` | 4 / 2 / 2 / 1 | generator.ts:2796–2799 | |
| `fatigueBudget.finisherStressMultiplier` | 0.6 | generator.ts:3681, 3732, 3817 | Finishers bill at 60% stress. |
| `fatigueBudget.finisherBudgetPenaltyMultiplier` | 0.75 | generator.ts:3757 | Ad-hoc finisher budget-overage penalty. |
| `rationale.*` (4 knobs) | — | generator.ts:1324, 3849, 3907, 3912, 3916 | User-facing copy thresholds only — **`recentFocusStressThreshold` is also read by `buildSlotRecommendations` for the caution line**, so it's not purely cosmetic. |

---

## 4. Known cascade risks

### 4.1 Seeded-RNG sensitivity (the #1 "why did my unrelated change move a pick")

- **mulberry32 first-draw correlation**: mulberry32's first outputs for nearby seeds are strongly
  correlated. This once collapsed the finisher template draw onto one index across seed sweeps
  (10/12 sessions, same finisher). Fix: `finisherRng` takes **two warm-up draws** before any use
  (generator.ts:1719–1726). Any new use of a fresh mulberry32 stream needs the same treatment.
- **One shared `rng` stream, consumed per scored candidate**: `scoreExercise` draws `rng()` once
  for every candidate that survives the hard blocks (generator.ts:2542). Therefore anything that
  changes *which or how many candidates get scored* shifts the stream for every later pick:
  - a **tag change in exercises.ts** (pattern, primary/secondary muscle, equipment, even a
    rename that changes `movementOf`/`familyOf`/predicate results) changes hard-block outcomes →
    different draw count → every subsequent seeded pick in the session (and week simulation) can
    reshuffle;
  - **adding/removing/reordering entries in `EXERCISES`** does the same (pickBest iterates the
    array in order);
  - so do changes to slot `allowedMovements`, environment rules, or goal gates.
  This is why exercise-audit changes routinely flip week-simulation seeds even when "no scoring
  changed". Expect to re-run the full suite and judge failures on *invariants*, not on
  which specific exercise moved.
- Sort comparators never call `rng()` directly — noise is pre-drawn (`movementNoise`
  generator.ts:2860, `finisherNoise` generator.ts:3725) because JS sort calls comparators a
  variable number of times. Keep it that way.

### 4.2 Penalty stacks vs the −10 floor

Individual caps (`overTargetPenaltyCap` 8, `recoveryPenaltyCap` 7.5, `overlapPenaltyCap` 4.5,
per-muscle overshoot 15) are each below or near 10, but they are **additive**, and the fatigue
budget penalty is **uncapped**. On a saturated or dense week, entire stages return `null`
(section silently skipped) — that is expected, and the anchor + completeness guarantees exist to
absorb it. When tuning a penalty upward, check the week-simulation suite for sessions shrinking,
not just for the behavior you targeted.

### 4.3 Bonus stacking vs collapse mechanisms

Deficit-closure bonuses (weight 8.5) dominate everything; the discipline mechanisms work by
*collapsing them* (×0.1), not by out-penalizing them. If you add a new bonus, ask whether the
sessionTarget collapse should apply to it too — a bonus that survives saturation re-creates the
muscle-stacking bug the sessionTarget section was built to kill. Same in the finisher shortlist:
bonuses/penalties larger than `templateShortlistSpread` (2.5) silently turn the weighted draw
into a deterministic pick.

### 4.4 Cross-coupled constants

- `hardDoseYesterdayThreshold` (5.5) ↔ week-simulation `HARD_DOSE` (5.5) — must move together.
- `saturationFilterThreshold` ≥ `saturationOverTargetThreshold`, or the graduated penalty band
  between them vanishes.
- Slot `targetPrimaryStimulus` values in splits.ts are the *units* of deficits, saturation, and
  entitlements — editing a slot target retunes `topDeficitWeight`-style absolute weights and
  `saturationOverTargetMajorMuscleThreshold`'s notion of "major" (≥4) at the same time.
- `estimateExerciseStimulus` per-set values (coverage.ts:156) are the units of *everything*
  (deficits, budgets, hard-dose threshold). `effortFactor` (new) now scales these per set — a
  week of light logged loads reads as less coverage than the same sets at full load.

### 4.5 Debugging workflow

1. **Probe script** (full recipe in [planner-debugging.md](./planner-debugging.md)): a throwaway
   `probe.ts` that loads real workout JSON, calls `generateNextWorkout` with a fixed seed, and
   dumps `draft.slotRecommendations` + sections. Run with:
   `unset NODE_OPTIONS && npx tsx probe.ts` (the `unset` avoids the repo's node options leaking
   into tsx). Delete before committing.
2. **Slot wrong?** Check `slotRecommendations` scores first. If the selected slot is *not* the
   top-scoring incomplete slot, an override fired — the pipeline order is
   `getNextSplitSlotIndex → maybeOverrideForStalledBias → maybeOverrideForCriticalGap`
   (generator.ts:1846–1876).
3. **Exercise wrong?** Temporarily log `scoreExercise` components (the local `s`,
   `deficitClosureScore`, `sessionTargetPenalty`, budget overage) for the expected and actual
   picks; nine times out of ten the "wrong" pick legitimately outscored on deficit closure.
4. **Seed sweep**: loop seeds 0–19 (like `STAT_SEEDS`) before concluding a behavior is
   systematic rather than one seed's noise draw.

### 4.6 Invariants enforced by `src/lib/week-simulation.test.ts`

The suite simulates full compliant weeks (generate → log verbatim → generate next) across a
profile matrix and seed banks (`HARD_SEEDS`, 20 `STAT_SEEDS`, `DIRTY_SEEDS`). These are the
product guarantees — **fix the planner, don't loosen the thresholds** (their comments say so
explicitly):

| Invariant | Test | Threshold |
|---|---|---|
| Determinism | week-simulation.test.ts:205 | Same seed → same week. |
| **Slot completion** | :214 | Every split slot completed exactly once per week, all profiles × seeds. |
| **Coverage floors** | :227–275 | No targeted muscle at zero; majors (target ≥ 4) ≥ 50%; support targets ≥ 25%. |
| Statistical coverage | :280–309 | Mean major coverage ≥ 75% across 20 seeds; ≤ 2 seeds with any major < 60%. |
| No consecutive repeats | :311 | ≤1 shared non-finisher exercise between consecutive sessions, and only carry_core. |
| Opener rotation | :334 | Consecutive sessions never open with the same movement pattern. |
| Compound-family rotation | :353 | No compound family repeated from the previous session. |
| **48h rules** | :375–408, :554 | A muscle dosed ≥ 5.5 primary (non-finisher) never takes ≥ 5.5 again the next calendar day — including hostile Mon/Tue/Wed schedules (core/hip_flexors exempt). |
| Dirty-state recovery | :410–491 | Correct remaining slots with priors logged; off-plan manual workouts don't cause slot repeats. |
| Saturation discipline | :497 | After a 20-set hip-thrust binge, every later session ≤ 7 glute stimulus while still closing other majors ≥ 50%. |
| Constrained equipment | :533, :585 | Dumbbell weeks: nothing at zero, majors ≥ 40%. Home weeks: every session ≥ 4 non-finisher exercises (**completeness**), two weeks deep. |
| **Keystones** | generator.test.ts:2969 ("re-anchors a slot on its previous week's main lift") | Anchor continuity for a repeated slot; week-simulation's opener-rotation and family-rotation tests bound it from the other side. |

`generator.test.ts` (~3000 lines) holds the scenario fixtures for individual mechanisms
(keystone anchor, fresh-anchor, overrides, finisher gates); week-simulation holds the emergent
whole-week guarantees.
