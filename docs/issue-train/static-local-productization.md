# Static/local productization train

Parent epic: #18

## Implemented slices

- #12 Capability-aware storage and runtime state
- #13 Portable shader bundle import and export
- #14 Real embeddable shader runtime export
- #15 Visual quality regression harness
- #16 Taste model observability and anti-similarity controls
- #17 Hosted deployment health and launch polish

## Validation

- `npx tsc --noEmit`
- `npm run build`
- `npm run visual:smoke`
- Static preview smoke at `/Fuzzaholic/` with no `/api` console errors

## Proof assets

- `docs/issue-assets/static-local-product-train.png`
- `visual-check-productization/report.json` from local runs, ignored by default
