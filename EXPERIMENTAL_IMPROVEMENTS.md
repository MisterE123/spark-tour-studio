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

The broader sweep also found a short false-ready interval during asynchronous
walking preparation and a missing parent UI notification after the cover closed.
Readiness now requires completed resource preparation and a displayed first
view. Independent loading subscribers update the cover, optional tour guide and
movement help together. Start with **Show me around** on desktop and mobile:
the guide should appear when preparation ends without opening Settings first.

### Identifiable experimental Studio builds

The Studio header has a small **Experimental** badge. **Help → About & licenses**
shows the branch, compiled commit and whether local changes were included.
Exported visitor code does not contain the badge or experimental branch details.
`npm run package:experimental` builds Windows x64 previews into the ignored
`experimental-release/` folder with **Experimental** and a commit identifier in
the executable name. Publishing is disabled and the stable release stays intact.

### Faster local website delivery

Export a fresh tour and use its launcher to share with a phone or Quest on Wi-Fi.
Application text now streams with gzip when supported; an unchanged repeat
request can validate with a zero-body `304` response. In the measured build,
the shared JavaScript response fell from **8,270,888 to 2,923,284 bytes (64.7%)**.
This reduces application transfer, not RAD chunk size or GPU work. Loopback
compression adds CPU time; actual Wi-Fi speedup still needs device testing.

Range responses and binary splat/collision/media files preserve original byte
offsets. Editable files still revalidate; configuration edits are not hidden by
a long-lived cache. Validators distinguish different project roots even when
files have identical sizes and timestamps. Existing exported launchers need to
be replaced to receive this behavior. [HOSTING.md](HOSTING.md) covers VPS
compression separately; this change does not reconfigure the hosted VPS.

### Safer scene cleanup and Preview authoring

Delete a scene with information bubbles, then Undo. Its unused content records
are removed while shared content, view-linked stories and unrelated legacy
records remain. Undo restores the exact authoring data. No source files are
deleted. Generated-page links in structured stories and view descriptions now
carry their dependent pages and media into portable or referenced exports,
including linked chains and cycles. Custom HTML/scripts remain opaque; cleanup
conservatively retains content when it could contain untracked local links.

In Preview, scene/view/bubble fields and destructive authoring actions are
disabled, while visitor navigation and inspection remain available. A pending
save or collision job also protects authoring and Undo. Delayed placement
callbacks cannot add annotations after switching to Preview. Returning to Edit
restores controls; opening another project starts in Edit. Native import/job
results can still commit successfully. Idle settings inspector tabs retain
Undo/Redo.

### Keyboard-friendly information stories

Open an information bubble on desktop. Focus enters its Close button; Tab and
Shift-Tab stay within the story, including a scrollable content region and its
links. Arrow keys scroll that region. Escape closes and restores the opener
when it still exists. Keys used while a viewer overlay is blocking navigation
do not move or take control of the authored view behind it. Local HTML actions
must name a valid scene and, when supplied, a viewpoint in that scene.

Embedded documents handle their own keyboard events, so Escape inside a
sandboxed third-party iframe cannot always reach the viewer. The visible Close
button remains available. This is a desktop browser/Studio improvement; XR
continues to use the in-world content controls.

### Less startup work for Viewpoints

Open a portable export with an empty browser cache and enter a Viewpoints scene.
The collision engine now stays on disk until Walk, Drone with a collider, or
collision authoring needs it. The initial visitor JavaScript graph is about
3.97 MB raw / 1.29 MB gzip; a separate 4.33 MB raw / 1.64 MB gzip engine remains
bundled locally. The shared UI chunk shrank about 52% raw / 56% compressed.
This reduces startup transfer and compilation; it does not reduce RAD bytes or
promise a particular time to sharp detail on the VPS.

Switch into Walk or Drone, then between scenes. Collider fetching overlaps the
engine load. Canceling a destination does not cancel the engine needed by its
replacement, and the camera, canvas, renderer and XR session remain intact.
Real-browser checks cover cold Viewpoints without physics requests or compiles,
failed download and WASM initialization retries in the same document, and a
portable export served beneath `/museum/` with external origins blocked. The
navigation worker keeps its existing static bundle and initializes physics
only for physical shortcut validation. Worker code splitting is deferred.

### Imports keep their original destination

Choose or drop a picture into a bubble, then inspect another scene or enter
Preview while the file is read. The result belongs to the original bubble and
the original rich-text insertion point. Image, audio, background RAD and
performance-preset imports now share the editor's operation lock, so Save,
Save As and Open cannot interrupt them. Cancellation and failure release the
lock. Existing scene-conversion and collider job results still apply, and
performance tuning remains available in Preview. Failed imports also leave a
visible status message when their original inspector has been closed.

### Incomplete content stays lightweight

Leave an image or embed unfinished, or reopen an older draft with whitespace
around a URL. Empty, unsafe and self-referencing resources no longer create
hidden nested tours or request the tour HTML as a photograph. Captions, link
words and rich formatting stay readable. Valid local media, embedded pages,
fragment links and generated-page chains remain usable in browser, Studio,
XR and portable exports. Old malformed draft strings remain editable rather
than preventing the project from reopening.

Local downloads also handle conditional resumes conservatively: an `If-Range`
request receives the complete current file because editable local assets have
weak validators. Ordinary splat byte ranges, cache validation, gzip and HTTPS
sharing retain their existing behavior.

## Work in progress

- Check the next combined feature-set CI run and fix genuine failures.
- Audit startup loading and the transition from a coarse scene to useful detail;
  any title-screen preparation must stay bounded and avoid audio or collision
  work before it is needed.
- Assess allowing the landing page/configuration to appear before the remaining
  Spark module evaluation, and overlapping panorama loading with RAD metadata.
  These are audited candidates, not implemented changes or measured VPS gains.
- Integrate pending renderer imports with Close. A separate native audit found
  that a clean project can close during a held image copy without a prompt.
  Save/Open serialization is verified; Close needs its own bounded wait and
  fresh saved-state checks, plus immutable main-process asset ownership.
- Check chooser-imported filenames containing URL punctuation such as `#`.
  Direct source resolution reproduces truncation of `Photo #1.png`, a URI error
  for `100%.png`, and misresolution of literal `%20`. A chooser-only encoding
  change is insufficient because export also decodes and reconstructs refs.
  Compatible Save As/export and RAD companion handling remain follow-ups.
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

The setup-only branch CI at `27d4dab` passed. Feature runs at `79e6c412` and
`8edeb2d` failed in the scene-navigation fixture: it stopped rendering and then
expected display readiness immediately after resource preparation. The mode
was preserved; the new first-view cover correctly waited for rendering. The
corrected regression drives actual frames and preserves all original mode,
failure/retry and fallback assertions. The same obsolete fixture pattern was
corrected in walking, collision replacement and teleport checks. Replacement
CI will validate the combined changes. Broader local checks additionally exposed
and verified fixes for the asynchronous readiness gap and missing guide update
described above. No experimental release or merge has been created.

The `c7b682f` run then exposed a Windows temp-path assumption in the new server
abort test: its stream spy compared an unresolved temporary path with the
server's canonical path. A disposable Windows junction reproduced the exact
CI failure; matching canonical paths and asserting that each spy actually ran
fixed it. Six complete server-suite repeats passed (36/36 checks). This repair
changes the test only, not the packaged application.

The complete `17b242f` source CI then passed: run `40635900700`, including the
Windows package, all native/browser checks and uploaded build artifacts. The
next combined deferred-physics/import/content batch adds three focused CI
checks. Its result is a separate verification target.

## Validation and handoff

Latest verified local preview: compiled clean commit
`c24e179a34721f10392b768c9889acb2aa027cb7`.

`experimental-release/3DGS Perspectives Studio 1.22.3 Experimental c24e179a.exe`  
SHA-256: `670bd344d0afc6f588fd43a28aad9f2d3b63a83d4e14f52b0d94f45919ef003c`.

Its actual portable executable launches, identifies the compiled branch/commit
and closes normally. The packaged identity check also confirms visitor code
does not inherit the Studio's experimental badge. The stable executable and
main/tag commit remain unchanged. The expanded native editor sweep has completed:
all seven checks pass, with logs under
`test-output/editor-ci-sweep/1793162643805/`.
The new actual portable launch/About/normal-close check passes at
`test-output/portable smoke 1793167106880/`; packaged identity and visitor graph
checks pass at `test-output/studio-build-1793167107054/`. Source commits after
this compiled checkpoint must state whether they affect application behavior.

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
- Follow-up frozen unit/integration checkpoint: **380 tests passed**, including
  content-reference and dynamic-project cache checks.
- Follow-up walking step and 30/60/120 FPS camera checks preserve every physical
  assertion while rendering each destination through first-view readiness.
- Actual browser story focus, scrolling, Escape, navigation isolation and
  invalid/valid local iframe action checks pass.
- Complete desktop/mobile onboarding passes after the readiness notification
  repair, including guide replay, persistence, settings and bubble interruptions.
- Fresh native authoring workflow passes conservative cleanup/Undo, busy and
  Preview locks, native collider import, idle settings Undo/Redo and rich-text
  Save/Preview cycles that remain clean without phantom edits.
- Expanded native/editor sweep: all seven pass (UI polish, tour directory, XR
  polish, advanced imports, Git editor, GitHub editor and navigation cache).
- Broad native and browser checks pass for collision authoring/generation,
  paging, walking, mobile layout, branding, WebGL fallback, preset persistence
  and hemisphere backgrounds. Fresh readiness checks pass for certified air,
  scene continuity/export, precision, viewpoint comfort and full stereo XR.
- Real rebuilt launcher checks pass for cold local/HTTPS/mobile loading,
  delayed walking pages, external requests blocked, no Node on PATH and clean
  shutdown. No latency simulation was added to product code.
- Deferred-physics/content checkpoint: **390 unit/integration tests passed**.
- Real portable browser checks verify deferred physics, same-document download
  and initialization retry, unchanged renderer/camera/XR and local dynamic
  chunks beneath a subdirectory with external origins blocked. Forcing only
  worker Rapier initialization to fail leaves native and paged routes usable;
  actual walking still arrives. Successful legacy stairs, narrow-door walking
  and canceled teleport targets also pass with the rebuilt worker.
- Source precision continuity, full stereo WebXR head-safety and native/exported
  scene navigation pass. Cold title/Viewpoints make no physics requests or
  compiles. Results are in `test-output/lazy physics 1793165670207/` and
  `test-output/final-physics-worker-regressions-1793165707995/`.
- Native, visitor, generated-page and XR content resource checks pass at
  `test-output/content-resources-1793165531223/`: no nested viewer or tour-HTML
  image request; legitimate images, embeds, link labels and formatting remain.
- The full native import transaction regression passes at
  `test-output/editor-imports-1793166308822/`: original targets and caret,
  Preview changes, cancel/error unlock, visible failure after inspector change,
  native collider results, clean saves and exact preset metadata. Save As
  preserves its external source mappings and serves the original bytes;
  portable export contains physical copies. The saved-project/export distinction
  and original source files remain intact.
- Fresh editor workflow guards/Undo/reopen pass at
  `test-output/editor-workflow-1793166565939/`. The rebuilt real SEA launcher
  passes cold desktop, Quest-style HTTPS and landscape mobile checks with
  external origins blocked, delayed collision data, no Node on PATH and normal
  shutdown at `test-output/network performance 1793166963756/`.
- Stop overnight work around the review target and leave this branch unmerged.
