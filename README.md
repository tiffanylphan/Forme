# Forme

Forme is a mobile-first workout companion built with Next.js. It helps log workouts, track weekly muscle coverage, generate the next session, and track working weights over time.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Test

```bash
npm test
```

## Planner tuning

Planner behavior weights and thresholds live in [src/lib/planner-tuning.ts](/Users/tiffanyphan/code/workout-project/src/lib/planner-tuning.ts).

For a practical guide to adjusting lower/upper balance, recovery conservatism, arm volume, and session fatigue caps, see [docs/planner-tuning-notes.md](/Users/tiffanyphan/code/workout-project/docs/planner-tuning-notes.md).
