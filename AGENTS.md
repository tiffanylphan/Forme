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
