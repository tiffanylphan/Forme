# Forme – AI Agent Guidelines

## Tech stack
- Next.js 16 App Router, React 19, TypeScript
- Vitest for tests (`npm test`)
- Tailwind CSS for styling
- localStorage / sessionStorage for all data — no backend

## When adding new functionality or exercises
- Add or update a test for it.
- When fixing a bug, add a test that fails without the fix and passes with it, so the bug can't regress.
- Run `npm test` before reporting the task complete.
- If adding exercises changes a filter count in `src/app/library/page.test.tsx`, update that test.

### Adding a single exercise — checklist

1. Add one entry to the `EXERCISES` array in `src/lib/exercises.ts`. Required fields:
   - `name` — canonical Title Case name shown in the UI
   - `primary` — muscles the exercise primarily targets (drives planning)
   - `secondary` — muscles engaged but not primary targets
   - `equipment` — one of: `barbell` `dumbbell` `cable` `band` `bodyweight` `machine` `kettlebell` `other`
   - `pattern` — one of: `push` `pull` `hinge` `squat` `carry` `core` `plyo` `conditioning`
   - `aliases` (optional) — alternative names users might search or log (e.g. `["KB high pull"]`)
   - `tracksDuration: true` (optional) — static holds tracked in seconds instead of reps (Plank, wall sit, etc.)

2. **Choose `pattern` carefully** — it determines how the planner categorizes the exercise:

   | `pattern` | Planner movement | Notes |
   |---|---|---|
   | `push` | push | Pressing: chest, shoulders, triceps |
   | `pull` | pull | Rows, pulldowns, curls |
   | `hinge` | hinge (or `single_leg` if name matches) | Hip-dominant posterior chain |
   | `squat` | squat (or `single_leg` if name matches) | Knee-dominant |
   | `carry` | carry_core | Loaded carries |
   | `core` | carry_core | Planks, anti-rotation, direct core |
   | `plyo` | null — won't drive planning, finishers only | Jumps, hops |
   | `conditioning` | null — won't drive planning, finishers only | Complex multi-joint |

   `single_leg` is inferred automatically by `movementOf()` (`src/lib/movement.ts`) from the
   exercise name — matches: "lunge", "split squat", "step-up", "single-leg", "pistol", "cossack".
   Just set `pattern: "squat"` or `"hinge"` and name the exercise accordingly.

3. Place it near similar exercises in `exercises.ts` — the file is grouped by pattern/equipment.

4. If the new exercise has `hamstrings` in `primary` or `secondary`, increment the count in the
   hamstrings filter assertion in `src/app/library/page.test.tsx`.

5. **Consider aliases** — if the exercise has common shorthand names, alternate spellings, or names
   users are likely to type when logging (e.g. "DB step ups" for "Box step-up", "Dumbbell drags"
   for "Plank drag"), add them to the `aliases` array so they resolve correctly from log entries.
   Also check whether an existing exercise already covers the new name before adding a duplicate.

6. **Finisher-eligible exercises must appear in a finisher template** — `npm test` will catch this
   via the "gives every finisher-eligible exercise a home" assertion in `generator.test.ts`. An
   exercise is finisher-eligible if its movement is `carry_core` (pattern `core` or `carry`) or it
   passes the accessible conditioning/metabolic checks (`pattern: "conditioning"` with dumbbell/
   bodyweight/band equipment, or is on the named metabolic list). If the new exercise is
   finisher-eligible, either add it to an existing appropriate template in `src/lib/finishers.ts`
   or create a new one. Prefer creating a new template if the exercise doesn't fit cleanly into an
   existing circuit.

7. Run `npm test` and confirm all tests pass.

## Before pushing code
- Run `npm test && npm run build --webpack` and confirm both pass.
- Do not push if either command fails.

## Project conventions
- Exercises are defined in `src/lib/exercises.ts` as an `Exercise[]`.
- Storage helpers live in `src/lib/storage.ts`.
- Planner tuning lives in `src/lib/planner-tuning.ts`; see `docs/planner-tuning-notes.md` for a guide to diagnosing and adjusting planner behavior.
- Planner debugging (diagnosing unexpected slot or exercise picks): see `docs/planner-debugging.md`.
- Tests live alongside source files (`*.test.ts` / `*.test.tsx`).
- No comments unless the WHY is non-obvious.
- Prefer editing existing files over creating new ones.
- Do not add error handling for scenarios that can't happen.

## Git hooks setup (one-time, per clone)
Run this once after cloning to activate the repo's pre-push hook:
```
git config core.hooksPath .githooks
```
