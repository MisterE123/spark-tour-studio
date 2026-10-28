# Overnight experience improvements

Branch: `codex/experimental-experience-2026-10-28`  
Baseline: main commit `72c759b`, Studio **1.22.3**  
Review target: **October 28, 2026, 7:00 AM America/New_York**

This branch is experimental. It runs GitHub CI and keeps changes in reviewable
commits. It must not publish a release or merge into main without approval.
The normal 1.22.3 executable remains in `release/` for comparison. Local test
projects, logs, generated assets and executables stay out of Git.

## Ready for user testing

The baseline release already includes import dismissal, nearby-floor teleport
targeting and the Scene → Mesh → View → Bubble inspector order.

### Responsive VR teleport targeting

Aim at a distant uncached area, then immediately at nearby floor. The new aim
should become usable without waiting for the old download. A neutral marker
appears immediately while checking. Switch aiming hands, release the old hand,
or change scenes while aiming: an old request must not cancel a newer target or
move the visitor later. Current floor support and the existing XR session stay
intact. In the controlled stalled-request regression, a new aim reached green
in 49 ms; this is a test result, not a Quest hardware latency promise.

### Optional automatic detail adjustment

In **Tools → Performance presets → Automatic adjustment**, enable the option
and choose a desktop target of 30–60 FPS. Save a named preset, save the project
and export. On the slower laptop, close settings and view Hungars Aerial for
several seconds; reopen settings to inspect the effective **Auto detail** value.
The runtime adjusts only the splat budget between 25% and 100% of the authored
target. Disabling restores that target. Loading, invisible tabs, editor actions,
menus, content and lost XR focus do not count as slow viewing. Continuous
streaming does not prevent adjustment. XR uses the headset's refresh rate.

Controlled tests cover sustained 2–3 FPS, isolated long stalls, bounded recovery
and unchanged authored settings, camera, physics and XR session. Actual laptop
or Quest speedup remains unmeasured. This may soften fine detail and cannot
guarantee a target frame rate. Legacy presets remain unchanged while the option
is unused. Presets saved with the new option enabled require this supporting
build; remove the option from each saved preset before reopening in main 1.22.3.

### Editor workflow and selection safeguards

The initial screen has New/Open actions; an empty tour offers direct RAD/PLY
imports. **Import queue** has its own correctly named header, counts and add-file
actions, so files can be queued without closing it. Pause/resume and per-item
Retry/Dismiss remain available. Closing a utility restores the prior inspector
tab and the selected Mesh shape.

Test **Edit → Duplicate/Delete/Frame selected** with an empty Bubble, View or
Mesh selection. These actions should be disabled and must not act on the scene.
Then select and duplicate/delete a bubble or Mesh shape, Undo, save and reopen.
The focused native regression verifies these operations and original-file
preservation, including selecting the second Mesh shape across utility dialogs.

### Authored entry and first-frame presentation

Open a scene with a saved entry view, especially an automatically animated orbit.
The viewer positions that camera before the splat is added to the paging scene,
so background/collider preparation cannot start refinement from the previous
camera. The cover stays visible while initial splat data is arriving and orbit
animation waits. It reveals once a first view is available, with an 8-second
bound after resource preparation. This is not a promise that every distant tree
has reached full detail. The regression holds real requests only in its test
harness; the product adds no simulated network latency.

Precision toggles preserve camera, walking state and tracked XR pose while a new
first frame prepares. Scene links prepare their destination before it is painted.
Resource availability is separate from user-interaction readiness, avoiding a
race that initially interfered with precision restoration during review.

### Identifiable experimental Studio builds

The Studio header has a small **Experimental** badge. **Help → About & licenses**
shows the branch, compiled commit and whether local changes were included.
Exported visitor code does not contain the badge or experimental branch details.
`npm run package:experimental` builds Windows x64 previews into the ignored
`experimental-release/` folder with **Experimental** and a commit identifier in
the executable name. Publishing is disabled and the stable release stays intact.

## Work in progress

- Check the feature-set CI run after pushing the verified changes.
- Review scene-deletion content cleanup and consistent busy/preview safeguards.
- Audit startup loading and the transition from a coarse scene to useful detail;
  any title-screen preparation must stay bounded and avoid audio or collision
  work before it is needed.
- Continue reviewing consistency, incomplete features and avoidable work.

## Verified local checkpoint

Compiled feature commit: `79e6c4127b5c2fb94937bb7d32d47461eacefc87`.

Local preview: `experimental-release/3DGS Perspectives Studio 1.22.3 Experimental 79e6c412.exe`.
SHA-256: `b75395b7c590094d7dbe3e75dcb9749e55df0c12403484bfcde418ce78df549a`.
It was built from a clean source tree, launches through its actual portable EXE,
shows the correct experimental identity and closes normally. The native packaged
identity check confirms that Studio-only metadata is absent from visitor code.

The stable `release/3DGS Perspectives Studio 1.22.3.exe` remains byte-for-byte
unchanged (SHA-256 `c0cde256a9a0c0fea4ca01c778ce1e0fa348ae979c71a6c6507ce7c7d1759507`).
Newer overnight checkpoints may supersede this preview; use the final handoff's
build and keep this entry as the first verified comparison point.

The setup-only branch CI at `27d4dab` passed. Feature-set CI for `79e6c412` is
running at <https://github.com/MisterE123/spark-tour-studio/actions/runs/40628332289>.
No experimental release or merge has been created.

## Validation and handoff

- Baseline: 347 unit/integration tests pass.
- Baseline: packaged editor import dismissal, Mesh controls, export and reopen pass.
- Baseline: packaged teleport recovery, step edges, release tremor, obstacle
  retargeting and unchanged XR session pass.
- Baseline: actual portable Windows executable launches and closes normally;
  release archive checksums verified.
- Add completed experimental improvements, exact user-test steps, measured
  results and known limitations here as each item is verified.
- Reviewed combined experimental unit run: **368 tests passed**.
- Real-request startup presentation, responsive teleport cancellation, adaptive
  detail, portrait/landscape/small-phone UI, editor workflow and native preset
  persistence/export checks pass.
- Existing precision continuity and real WebXRManager stereo/head-safety checks
  pass, including scale changes, cold collision data and OS-menu focus recovery.
- Experimental build identity checks pass; viewer dependencies exclude that
  Studio-only metadata.
- Actual Quest hardware comfort and slow-laptop performance require user testing.
- Stop overnight work around the review target and leave this branch unmerged.
