# Overnight experience improvements

Branch: `codex/experimental-experience-2026-10-28`  
Baseline: main commit `72c759b`, Studio **1.22.3**  
Review target: **October 28, 2026, 7:00 AM America/New_York**

This branch is experimental. It runs GitHub CI and keeps changes in reviewable
commits. It must not publish a release or merge into main without approval.
The normal 1.22.3 executable remains in `release/` for comparison. Local test
projects, logs, generated assets and executables stay out of Git.

## Ready for user testing

No experimental changes have finished verification yet. The baseline release
already includes import dismissal, nearby-floor teleport targeting and the
Scene → Mesh → View → Bubble inspector order.

## Work in progress

- Audit startup loading and the transition from a coarse scene to useful detail.
- Improve VR targeting responsiveness and consistency without weakening collision.
- Review editor wording, discoverability, unfinished controls and redundant UI.
- Review performance defaults and opportunities to avoid unnecessary work.

## Validation and handoff

- Baseline: 347 unit/integration tests pass.
- Baseline: packaged editor import dismissal, Mesh controls, export and reopen pass.
- Baseline: packaged teleport recovery, step edges, release tremor, obstacle
  retargeting and unchanged XR session pass.
- Baseline: actual portable Windows executable launches and closes normally;
  release archive checksums verified.
- Add completed experimental improvements, exact user-test steps, measured
  results and known limitations here as each item is verified.
- Stop overnight work around the review target and leave this branch unmerged.
