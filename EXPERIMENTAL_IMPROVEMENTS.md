# Overnight experience improvements

**Release status:** the user authorized the merge after CI passed. Full source
[run 40994195022](https://github.com/MisterE123/spark-tour-studio/actions/runs/40994195022)
completed successfully, and this work is merged into main for **1.23.0**.
The pending/approval references below are historical checkpoints. The subsequent
Radix/SOGS experiment is a separate branch and is not part of this release.

Branch: `codex/experimental-experience-2026-10-28`  
Baseline: main commit `72c759b`, Studio **1.22.3**  
Review target: **October 28, 2026, 7:00 AM America/New_York**  
Follow-up: resolve the final CI failures and the reported VR Walk teleport freeze,
then verify a fresh experimental executable.

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

### October 29: physical freeze traced to old shared export; Drone targeting corrected

The North Graveyard physical freeze now has a captured cause. Although a newer
dated export existed, port 8443 was still served by the old
`Downloads/tst_exp_out-10-28-26/Launch Tour.exe` process (PID 41608). The Quest
loaded `assets/runtime-DeGdIXAE.js`, whose SHA-256
`d81341ccfc233b11266bba38a916b7399e5debceb0e9617ad4c19624d72ab6d9`
matches that old export exactly. A fresh host request returned HTTP 200 with
those same bytes and their October 28 modification date. Refreshing the page
therefore reloaded the old runtime from the active server; the new files in the
October 29 folder were not being served.

The actual Quest CPU trace captures the original cached-query completion loop:
92.31% of 20,560 sampled stacks include the old teleport completion closure,
whose `finally` calls `updateTeleport()` again. The loaded script lacks the
corrected exact-ray retention. Evidence is recorded in
`test-output/quest-trace-1793329883313/trace.json`, `profile-analysis.json`,
`old-runtime-proof.json` and `freeze-conclusion.json`. This confirms the October
28 failure below on physical hardware; it does not demonstrate a new failure
in `b96a242`.

The dated `Downloads/tst_exp_out-10-29-26` export contains the corrected
`runtime-CyOvULPW.js`, SHA-256
`a9ddfc569b54b9b0117389c40fd4b1058f97470aa927dd586ba324308de0ab6b`,
matching the verified `b96a242` runtime. Both launchers had been running: the new
export initially used port 51966 while yesterday's launcher retained 8443.
After restarting sharing, port 8443 belongs to the October 29 export (PID 38540).
Read-only inspection of the actual Quest page confirms it loaded
`runtime-CyOvULPW.js`, at
`test-output/quest-correct-runtime-1793330941204/result.json`.
The user reports no freeze on this corrected version, and reports successful
export and desktop viewing. Yesterday's browser/package regression and green
CI remain valid. No additional Walk product change is justified by this capture.

The Drone false-red cause is confirmed. Its paged-collision check required a
standing walking capsule above the picked splat, even though Drone movement uses
a camera sphere. A low obstacle could reject the unused body while the actual
head destination was clear. It also prepared collision data around the picked
surface instead of the scaled physical headset destination, and used an
uncancelable string-key preparation whose late completion could clear ownership
of a newer request to the same target.

The scoped source correction now checks the same head sphere as Drone movement
and the existing GLB teleport path. The surface remains the feet-plane anchor;
actual tracked height, horizontal physical offset and VR scale are preserved.
It prepares the actual head destination, shows a neutral marker while checking,
uses abortable request identity, and publishes the result without calling the
query again. Known blocked head positions remain red. Failed/incomplete
preparation observes a three-second retry backoff. Retargeting, release, menu
blocking, loss of tracking and mode/scene changes cannot authorize stale moves.
Walk resolution and collision internals are unchanged by this correction.

The rebuilt source passes the actual Spark/Three XR regression at
`test-output/XR Drone teleport 1793328212212/result.json`. It proves a real
Spark-picked target with a blocked standing body but clear head becomes green
and is reached through native trigger release. A 0.25 scene VR scale prepares
the actual head at 7.39 m with a neutral pending marker; a still larger head
crossing the room roof remains red. It also checks canceled/restarted identical
targets, inert late results after blocking/tracking loss/retarget/mode changes,
rejection backoff, advancing stereo frames and ordinary timers, and unchanged
session/renderer/camera/rig/stereo identities. Only the physical XR platform and
controlled asynchronous hold/rejection are emulated; Spark picking, paged
coverage and Rapier head clearance are real. The focused check is registered
beside the existing XR liveness check in branch CI. Build evidence:
`test-output/build-quest-drone-2026-10-29.log`. The combined source checkpoint passes **436/436** unit and
integration tests in 132.7 seconds at
`test-output/unit-quest-drone-2026-10-29.log`. Existing Walk stereo liveness,
request cancellation and full scaled head-safety regressions also pass at
`test-output/XR teleport liveness 1793328311137/`,
`test-output/teleport cancellation 1793328413344/` and
`test-output/xr head collision 1793328413916/`.

The current clean-source Windows preview is
`experimental-release/3DGS Perspectives Studio 1.22.3 Experimental 17238ddb.exe`,
compiled from `17238ddb50280e498edcacddfd96617cb0b4162b` with `dirty=false`.
Its runtime matches source correction `979a895`; the later commit records only
the real-device diagnosis and successful user retest. SHA-256:
`137b02f84a399740cbcbc3746210fa8551be61fb9268a434a4c19d7dedc67295`.
The actual portable launch/About/normal-close check passes at
`test-output/portable smoke 1793331431977/`; packaged experimental identity and
the visitor dependency graph pass at `test-output/studio-build-1793331432151/`.
The stable 1.22.3 executable hash remains
`c0cde256a9a0c0fea4ca01c778ce1e0fa348ae979c71a6c6507ce7c7d1759507`.
Full branch CI for source `979a895` is running without reported failures at
[run 40994195022](https://github.com/MisterE123/spark-tour-studio/actions/runs/40994195022).
Wait for its green result before merging. Main remains unchanged; a merge has
not been authorized. Verification-only documentation pushes are held while
that source run finishes.

Headset USB trust and keep-awake were ADB device settings for diagnosis, not
app or exported-tour behavior. Temporary Wi-Fi ADB and its host forward were
disabled after capture; the user-requested USB trust/keep-awake remain enabled.

The earlier device capture at
`test-output/quest-capture-1793326598459/renderer19364-threads.txt`
records `CrRendererMain` at 100% CPU, with the renderer process near 99% in
`browser-cpu-live.txt`. The subsequent live Wi-Fi profiler trace above resolves
that busy renderer to the old JavaScript completion loop, rather than an
unidentified graphics stall. The user's original projects and export files
remain unchanged; choosing the correct launcher changes which folder is served.

For the next user test, re-export using the replacement preview once provided.
In North Graveyard, aim in Drone around low obstacles and at nearby/distant
surfaces: safe camera positions should reach green; a cold check should first
be neutral; a head that actually intersects geometry should stay red. Hold the
trigger while retargeting, open the menu, switch hands/modes, and release;
canceled results must not move the visitor later. Repeat with authored VR scale
overrides. The Walk hardware retest on the corrected October 29 runtime now has
the user's successful confirmation. The additional Drone clearance correction
in `979a895` remains separately browser/emulated-XR verified; its specific
clearance behavior still merits a short physical Quest check in the replacement
preview.

### October 28: cached wall-grazing Walk query loop

The reported freeze has a concrete browser reproduction. A controller ray only
1 mm inside an allowed-space wall can still hit a valid floor and resolve a safe
nearby standing position. The thicker 3 mm aim-retention probe rejects that ray.
The completed query then immediately starts another query against already cached
collision data; their resolved promises can repeat without allowing another XR
frame, timer or trigger release to run. A bounded before-fix probe stopped after
501 queries: 499 repeated queries took 958 ms with no intervening animation frame
or timer. Evidence: `test-output/teleport starvation 1793193921607/result.json`.
This is event-loop starvation rather than a reported JavaScript exception.

Completed queries now publish their result without starting another query.
Exactly unchanged rays retain their already verified floor hit; changed rays
still check occlusion and the destination still requires a safe standing/head
position. Blocked UI, loading and lost tracking invalidate a held target.
Trigger release checks the current ray before committing the move.

The real Three WebXRManager regression reproduces the old freeze at
`test-output/XR teleport liveness 1793194323224/before-fix.json`: 251 queries
froze actual stereo frames and timers for 470 ms until a test-only safety cap.
The corrected default test has no query cap. It keeps an external Node watchdog
so a future freeze fails the check rather than wedging CI. The final source check
passes at `test-output/XR teleport liveness 1793195199084/result.json`, including
three actual Spark-raycast Drone teleports before switching to Walk, the first
grazing Walk teleport, held-target frame/timer progress, eight alternating-hand
teleports and three further Drone/Walk cycles. Late blocked/tracking-loss results
stay inert; all renderer/camera/rig/stereo/session identities remain unchanged,
and temporary mode leases return to zero. Only the physical XR platform boundary
is emulated. This matches the user's clarified Drone → Walk sequence.

The exact dated export `Downloads/tst_exp_out-10-28-26` contains the vulnerable
completion loop and matches the clean `97202af0` packaged visitor bytes. Its
East Inside Graveyard collision/navigation files match all 18 declared sizes
and hashes and the originals in `Hungars_local_processing/Tourv3 - Copy`.
The real scene also reproduces the geometry condition: a downward ray at
`[0.899, 1.4, -10.55]` hits floor, the wider retention probe is blocked, and a
valid nearby landing is still found. Configuration and file corruption were
ruled out for this case. Read-only evidence:
`test-output/quest-east-wall-graze-1793194834621/inspection.json`.

On Quest, retest several Drone teleports followed by switching to Walk and its
first teleport in **East Inside Graveyard**, matching the reported sequence.
Also repeat nearby/distant Walk teleports along walls and gravestones, moving
the pointer while holding the trigger and releasing at green targets. Movement
and the browser must stay responsive. Physical Quest confirmation remains
necessary; the user's original project/export is inspected read-only.

The final source build passes TypeScript/bundling. All **436/436** local unit and
integration tests pass at
`test-output/unit-experimental-teleport-freeze-2026-10-28.log`. Existing collision
failure/recovery, post occlusion and release tremor pass at
`test-output/collision recovery 1793194439558/`; canceled/retargeted requests pass
at `test-output/teleport cancellation 1793194443468/`; controller pose-loss and
authored-view comfort checks pass at `test-output/xr controller tracking 1793194466514/`
and `test-output/viewpoint comfort 1793194471815/`. Full actual Three stereo/head
safety/scale/OS-menu checks pass at `test-output/xr head collision 1793194554923/`;
precision/scene failure recovery preserves session and physical tracking at
`test-output/extended-precision-1793194601754/`.

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
Exports and file inventories now retain those records and their media as well,
so a custom page's ordinary link into a generated story still works after its
original bubble is deleted. Structured-only tours still omit unused stories.
Active local HTML has opaque dependencies, so it conservatively carries the
project's retained content; a missing required file prevents a complete export.

In Preview, scene/view/bubble fields and destructive authoring actions are
disabled, while visitor navigation and inspection remain available. A pending
save or collision job also protects authoring and Undo. Delayed placement
callbacks cannot add annotations after switching to Preview. Returning to Edit
restores controls; opening another project starts in Edit. Native import/job
results can still commit successfully. Idle settings inspector tabs retain
Undo/Redo.

### Safer Save As and text histories

Edit a scene or bubble, choose **File → Save as**, then cancel the folder picker.
The current edits, Unsaved changes indicator, Undo/Redo, selected annotation and
camera should remain exactly where they were. Canceling also leaves existing
recovery data intact and must not show a recovery dialog. Ordinary Save and a
completed Save As still persist the project and its external source mappings.

Edit one bubble's rich text, select another, and press Ctrl+Z in its text box.
Text Undo belongs to the current story; another bubble's words must never appear.
Repeat between viewpoint descriptions and after removing or reordering blocks.
Typing and image insertion retain local text Undo/Redo. Project Undo or an
external authoring replacement starts a fresh text history for the replacement.

### More reliable portable content and RAD companions

Portable export checks common HTML resource attributes, including responsive
image candidates and unquoted URLs. An external required resource keeps the
export marked incomplete; ordinary outbound links remain available. Referenced
exports can retain those remote resources. Arbitrary script execution is not a
complete dependency scanner.

A remote RAD's exported root filename now avoids its companion names, preserving
their original byte ranges and references. Ambiguous remote companions that map
different requests into one disk filename fail instead of silently using the
wrong file. Local HTML reached through stories or view descriptions also carries
its sibling assets into file history, matching folder export behavior.

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

### Focus and audio follow the active interface

While moving in the editor, click a text or number field, slider, resize handle,
inspector tab or editor menu. Held keyboard movement now stops; arrows and text
keys belong to that control. Returning to the viewport permits fresh movement.
Right-drag panning and touch/controller intent retain their existing behavior.

Return to the landing page while a scene or its audio is still loading. Scene
ambience and viewpoint narration stay paused when those requests finish. A
directory visit can resume the prepared view and its existing audio; **Enter
tour** retains its explicit authored-entry restart. Information/settings panels
keep ambience playing. Edit pauses audio, and Preview uses the current scene
and view settings. Muting in the XR menu is reflected in the desktop checkbox
when leaving VR, so its next click works predictably.

### Less startup work for Viewpoints

Open a portable export with an empty browser cache and enter a Viewpoints scene.
The collision engine now stays on disk until Walk, Drone with a collider, or
collision authoring needs it. Title-screen JavaScript is about 623 KB raw /
184 KB gzip; rendering code then warms automatically as described below.
A separate 4.34 MB raw / 1.65 MB gzip engine remains bundled locally.
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

The first complete CI run on an older browser exposed its permanent cache of a
failed module request. Physics now retries through a fresh URL for the same
locally bundled engine after a rejected download. Successful module bytes are
reused if only WASM initialization failed. The retry does not reload the tour
or end XR; both installed browser versions pass actual request-failure tests
with the real Three XR manager and stereo camera retained. Hosted sites must
serve `.mjs` as JavaScript, as documented in `HOSTING.md` and exported READMEs.

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

### Responsive landing page and 3D preparation

Cold-open an exported tour on desktop, portrait and landscape mobile. The cover,
description, scene selector, search and settings can appear while the 3D engine
prepares automatically. Enter and directory Visit buttons wait for the engine;
choosing another scene does not enter it automatically. Preferences selected
during preparation apply when it is ready. A failed engine download has a Retry
action inside the same page. If that fails again, the visitor can explicitly
Reload tour before entry; this handles browsers that cache failed imports.
The existing WebGL guidance remains. Studio never automatically reloads unsaved
authoring work.

The measured static JavaScript graph is **623,090 bytes / 184,041 gzip**, compared
with the preceding **3,972,378 / 1,290,112** checkpoint (85.7% less compressed).
Remaining runtime code still loads automatically. This improves paint ordering
and UI availability; it does not reduce total runtime download or prove a shorter
time to full splat detail on the VPS. No artificial network delay was added.

Studio can open and edit numeric settings while its engine prepares. Camera
capture, scene placement and geometry framing wait for an actual runtime, so a
click cannot create a bubble or shape at a guessed default location.

### Safe closing while work finishes

Begin importing a picture, then close Studio. Even an otherwise clean project
offers Save and close, Close without saving and Cancel. Saving waits for the
authorized import to apply, then reads the current project and hosting settings.
Cancel returns to editing. A prolonged wait or second X offers Keep waiting,
Keep editing or explicit discard; it does not leave an unresponsive window.
Existing Git operations retain their wait-or-edit protection.

Native file operations keep the project folder and source mapping captured when
they began. A project change or renderer reload cannot silently register their
result in another tour. Main-process scene queue work survives a renderer reload
but still respects project replacement and cancellation. Already started disk
writes are not undone by choosing discard.

### Reliable imported filenames

Choose or drop pictures with spaces, `#`, `%`, literal `%20` or Unicode in their
names. Import, Save As, export, reopen and browser viewing preserve those disk
names through URL encoding. Actual URL queries and fragments retain their normal
meaning. RAD companion metadata follows Spark's URL semantics: encoded names
work; a raw `#` in metadata is a fragment, not a guessed literal filename. Studio
does not rewrite original RAD files. Companion traversal and private-file
references are rejected. See [HOSTING.md](HOSTING.md) for the naming details.

### Panorama preparation overlaps scene metadata

Open a scene with an equirectangular background. Its panorama now downloads and
decodes while the foreground RAD metadata is read, removing the preceding
serial wait. The loading cover still waits for the image and the first displayed
splat view. Splat backgrounds keep their existing sequencing. This does not
change total asset size or establish a measured VPS/device speedup.

Switch scenes while loading a panorama, or change that background in Studio.
A late success is disposed and a late failure cannot affect the replacement.
An actual panorama failure gives a readable error rather than `[object Event]`.

### Controller tracking loss cannot keep an old pointer active

In VR, point one controller at a bubble while the other loses tracking. Only
the tracked hand should highlight content; both untracked hands leave no stale
caption. A hidden controller cannot select content or complete a teleport from
its last matrix. Losing pose cancels that hand's held selection/aim, and recovery
requires a fresh trigger press. The other tracked hand's active aim remains.

The real-runtime regression reproduced both wrong-hand hover and movement from
an untracked release before the correction. Actual headset tracking recovery
still needs a Quest test. No speculative per-frame cache was introduced: an
isolated desktop CPU audit found only modest savings at 40–200 bubbles.

## Work in progress

- Feature work is frozen for the morning handoff; only demonstrated verification
  failures are being repaired.
- Complete the latest combined branch CI run. Physical Quest comfort, slow-device
  performance and hosted time to sharp detail remain user acceptance checks.

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
next combined deferred-physics/import/content batch added three focused CI
checks. Run `40641161367` then exposed the bubble occlusion fixture assigning
a synthetic collision world without awaiting the newly deferred engine. Real
collider creation already awaits it. Initializing physics before that mock
preserves every occlusion assertion and the exact failed browser check passes.
Its isolated Vite scan also avoids crawling generated test-site HTML. A new
startup timing assertion waits for React's callback wiring before wrapping it;
all original rendered-readiness assertions remain in place.

Run `40647023148` reached all 414 unit tests and failed one new companion test
that compared a canonical file path with the runner's short temp-directory
spelling (`runneradmin` versus `RUNNER~1`). The source helper correctly returns
the canonical path. Comparing both canonical forms repairs the test. A Windows
junction reproduces the original mismatch; three complete filename-suite runs
through that alias pass at
`test-output/companion-canonical-ci-repair-1793171984714/`. This correction changes
tests and documentation only; the verified `ce30c048` application is unchanged.

Run `40649511781` then passed unit tests and the earlier browser checks but failed
the new failed-module recovery check. This exposed actual browser behavior:
installed Edge 155 retains a failed native module import without another request,
while Edge 156 retries it. Five forced cases reproduce the difference, including
root, dependency, held-response, HTTP failure and native import without preload.
The visitor now gets an explicit Reload tour after a failed in-page Retry; this
is available only before entering the tour. Studio's authoring page stays intact.
The test records the actual recovery path and keeps all download, renderer and
offline assertions rather than extending timeouts or suppressing the failure.

Run `40654226341` then passed the startup recovery check but exposed the same
older-browser cache behavior in the deferred physics loader. Its assertion was
correct: a live tour must recover without a page reload. The loader now emits
the self-contained compatibility engine as a local asset and retries failed
imports using a fresh query. Actual engine download/initialization failures,
unchanged real XR/stereo state and offline/subdirectory requests pass on both
Edge 155 and 156. The new CI checks retain these assertions; no timeout or
success condition was weakened. The next combined source run must complete.

## Validation and handoff

Previous verified local preview (October 28, before the Drone source correction):
compiled clean commit
`b96a24258b58707c98d0cd17d1bd2b553dacf547`.

`experimental-release/3DGS Perspectives Studio 1.22.3 Experimental b96a2425.exe`

SHA-256: `a531348797c85f6f93f843664db935dab3b7f4591c9d296807723eae29306a3f`.

Its actual portable executable launches, identifies the compiled branch/commit
and closes normally. The packaged identity check also confirms visitor code
does not inherit the Studio's experimental badge. The stable executable and
main/tag commit remain unchanged. The expanded native editor sweep has completed:
all seven checks pass, with logs under
`test-output/editor-ci-sweep/1793162643805/`.
The current actual portable launch/About/normal-close check passes at
`test-output/portable smoke 1793195586851/`; packaged identity and visitor graph
checks pass at `test-output/studio-build-1793195559385/`. Source commits after
this compiled checkpoint must state whether they affect application behavior.
The final follow-up preview record changes documentation only. The actual
packaged visitor passes the complete Drone-to-Walk teleport/stereo liveness
regression at `test-output/XR teleport liveness 1793195561705/`, using this
experimental package explicitly rather than the stable viewer directory.
Build log: `test-output/package-experimental-b96a242-2026-10-28.log`.

Full source CI [40699713308](https://github.com/MisterE123/spark-tour-studio/actions/runs/40699713308)
at this exact compiled commit **passed all 80 Windows checks/build steps**, with
no failures, including the new VR freeze regression, 436 unit/integration tests,
all native/browser checks, the portable package and uploaded artifacts. Release
publication was correctly skipped. The original final CI failures are resolved.
Main and the v1.22.3 tag remain `72c759b`; no release or merge was made.

**Re-export the tour using this build before testing on Quest.** Existing exports
retain their old runtime code; the dated test export and Tourv3 originals were
not modified. Physical Quest confirmation, slow-laptop performance and hosted
VPS time to sharp detail remain manual acceptance tests.

The preceding clean `97202af0` preview passed the full keyboard-focus regression at
`test-output/input-focus-1793187499859/` and all native/rendered/exported
hemisphere assertions at `test-output/hemisphere-background-1793187548621/`.
Its build log is `test-output/package-experimental-97202af-2026-10-28-retry.log`.
Both checks also passed in the latest complete CI run above.
Full source run
[40680633294](https://github.com/MisterE123/spark-tour-studio/actions/runs/40680633294)
passed the formerly failing focus check plus native Save/Undo, audio, offline
resources, precision and network regressions. Its remaining-stage timing exposed
a CI capacity issue: the old complete run took 45.6 minutes; its stages from
GitHub integration through packaging took 19.7 minutes. The expanded suite now
reaches that point around minute 45, exceeding the inherited one-hour job budget.
The Windows job allows 90 minutes so every existing test and artifact check can
finish. No test, individual assertion or per-test deadline was removed. Complete
source run [40687104692](https://github.com/MisterE123/spark-tour-studio/actions/runs/40687104692)
at `d29f858` passed all 79 Windows steps, including every native/browser check,
portable package and uploaded artifacts. Release publication was correctly
skipped. No application source changed during these fixture/CI-budget repairs.
The October 28 cached wall-grazing query loop is fixed and verified in
`b96a242`, including the tested Drone → Walk sequence and same-session stereo
rendering. That green run and preview supersede this pre-fix baseline. The
subsequent physical North Graveyard freeze was traced to the old export still
being served on port 8443, as recorded in the October 29 follow-up above. The
user's corrected-runtime Quest retest and export/desktop checks now pass.

Full source CI for `134bd61` completed at
[run 40659512940](https://github.com/MisterE123/spark-tour-studio/actions/runs/40659512940).
It passed all checks through native authoring, portable content, mobile,
precision, startup, physics recovery and Git workflows, then stopped in the
branding fixture. That test incorrectly treated an encoded asset URL as a disk
filename. The repaired fixture resolves canonical local paths, compares exact
original bytes, and also fetches each encoded logo/favicon/share-image URL in
both actual exported websites. The full native/exported branding check passes
at `test-output/branding 1793180463922/`, including metadata escaping, optional
credit and four responsive layouts with no external requests or browser errors.
This repair changes tests only; the verified preview's application is current.
Combined run `40666693048` passed its unit/integration, collision, startup,
physics recovery, content and pending-import checks, then stopped in the Close
fixture: the test read its prompt JSON between truncation and rewrite. Prompt
publication now writes a sibling temporary file and atomically renames it; the
reader still parses strictly and all exact dialog/save/discard assertions remain.
The failure is reproduced deterministically at
`test-output/close prompt publication 1793182855247/`: a held old-style write
produces the same parse error, while a partial temporary file leaves readers on
the last complete snapshot. All six actual native Close scenarios pass at
`test-output/editor-close-1793182825986/`, including pending Save, repeated X,
Cancel, failed/canceled imports, discard and ordinary exit. The next full source
run includes this test-only repair. The stable release, main branch and verified
preview remain unchanged.

Run `40671548454` passed the repaired Close check, encoded assets, ownership,
canceled Save As and rich-text histories, then failed the numeric-focus fixture.
That fixture used the dirty flag as its only Save completion fence and assumed
that `locator.focus()` successfully focused the field. A real native clean Save
held at its atomic rename proves that dirty can be false while authoring inputs
are still disabled: the focus attempt leaves the canvas focused and ArrowUp
held, producing exactly the observed 0.4 m movement over ten real frames.
After Save finishes and the same input is enabled, actual focus clears movement.
The navigation section stays open. Evidence:
`test-output/input-focus-1793185770283/held-save-result.json`.
The repaired fixture waits for enabled authoring controls and verifies actual
focus before testing movement. All original camera, held-key and release
assertions remain. The corrected native suite passes at
`test-output/input-focus-1793185820277/`. A test-only negative control suppresses
exactly the numeric field's runtime focus reset: the visible, enabled input is
actually focused, yet the unchanged movement assertion fails with the same
0.4 m drift at `test-output/input-focus-1793185886400/failure.json`. This confirms
that the readiness fence does not conceal a missing runtime behavior. Failures
now retain focus, disabled/inert/disclosure state, held keys and a screenshot.
A package-directory override permits the exact experimental application to run
this check without touching the stable build. No product changes were necessary.

The complete follow-up late-check sweep also reproduced an older hemisphere
fixture reading `tourRuntime.project` before asynchronous Stage preparation had
created the runtime. It now waits for that actual runtime before its existing
old-project snapshot; distinct-project/scene readiness and all native/exported
color, mesh identity, horizon pixel, eye-offset, cleanup and cancellation checks
remain unchanged. The repaired full test passes at
`test-output/hemisphere-background-1793186984602/`. A package-directory override
retains the CI default and allows safe testing of the experimental package.
The initial failure remains in `test-output/late native sweep 1793186493130/`.

All other late combined checks pass: website drafts, WebGL guidance, performance
persistence and tour directory under that same sweep folder; XR polish, real
stereo head safety and full advanced imports/conversion/export under
`test-output/late-combined-audio-agent-1793186501595/`. Full source run
`40678128228` is superseded by the corrected hemisphere fixture; this is a
verified test readiness repair, with no application behavior change.

- Baseline: 347 unit/integration tests pass.
- Baseline: packaged editor import dismissal, Mesh controls, export and reopen pass.
- Baseline: packaged teleport recovery, step edges, release tremor, obstacle
  retargeting and unchanged XR session pass.
- Baseline: actual portable Windows executable launches and closes normally;
  release archive checksums verified.
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
- Startup/Close/filename checkpoint: **414 unit/integration tests passed**.
  Two strict expected strings were updated for canonical encoded branding URLs
  and the earlier private-file rejection; asset-copy and protection assertions
  remain. Log: `test-output/unit-experimental-startup-close-verified-2026-10-28.log`.
- Portable warm-up beneath `/museum/`, blocked external origins, three layouts,
  real failed-import Retry, preference changes during preparation and retained
  explicit scene choice pass at `test-output/runtime warmup 1793169374690/`.
  No GPU context or WASM work occurs while the actual runtime request is held.
  Stage cancellation, StrictMode, one renderer and exact disposal pass at
  `test-output/stage lifecycle 1793169595431/`.
- Fresh missing-WebGL, authored-entry cover/readiness, deferred-physics retry,
  precision and full stereo WebXR checks pass. Logs include
  `test-output/startup presentation 1793169531579/`,
  `test-output/extended-precision-1793169415507/` and
  `test-output/xr head collision 1793169584656/`.
- Native Close passes six scenarios, including held read/apply, source-map
  persistence, Cancel, repeat X recovery, failed/canceled imports, discard and
  ordinary exit at `test-output/editor-close-1793169383077/`.
  Runtime-held numeric editing, no phantom placement and normal placement after
  warm-up pass at `test-output/editor-warmup-1793169697734/`.
- Actual chooser imports, encoded RAD/RADC loading in Spark, Save As mappings,
  portable export/reopen and offline media/custom HTML pass at
  `test-output/asset-filenames-1793169811968/`.
  Held chooser/copy/preset rejection after project replacement, same-root late
  registration rollback, generic renderer reload and surviving/canceled queued
  RAD jobs pass at `test-output/import-ownership-1793169895574/`.
- Follow-up native ownership checks additionally block direct Save/Save As while
  content is pending. A canceled RAD job held during its source-map write now
  rolls back only its own prefix, preserving previous registrations. These pass
  at `test-output/import-ownership-1793170111562/`; the focused asset/import/RAD
  unit checks also pass (9/9). Main-process-only follow-up; renderer build is
  unchanged. Fresh complete native authoring workflow passes at
  `test-output/editor-workflow-1793169795659/`.
- Canonical-path/panorama full suite: **414/414 passed** in 120.3 seconds at
  `test-output/unit-experimental-panorama-2026-10-28.log`.
  Both real panorama/metadata completion orders, cover readiness, early failure,
  edited/unloaded/canceled images, stale success/failure, foreground failure,
  unchanged splat-background sequencing and persistent real stereo XR pass at
  `test-output/panorama loading 1793172306556/`. The rebuilt exported viewer's
  authored camera/readiness check passes at
  `test-output/startup presentation 1793172437292/`.
- Hidden-controller selection and stale teleport were reproduced at
  `test-output/xr controller tracking 1793172647110/`; the corrected positive
  tracked-hand controls and loss/recovery cases pass at
  `test-output/xr controller tracking 1793172765014/`.
  Authored-view comfort passes with an explicit tracked trigger positive control
  at `test-output/viewpoint comfort 1793172808844/`.
- Combined rebuilt runtime preserves canceled/stalled teleport ownership and
  floor support at `test-output/teleport cancellation 1793172902280/` and the
  full real stereo/head-safety/scale/OS-menu regression at
  `test-output/xr head collision 1793172907000/`.
  The isolated CPU audit is at
  `test-output/runtime hotpath audit 1793172389800/`; its measurements exclude
  drawing and are not a Quest frame-rate claim. Only the demonstrated invalid
  controller behavior was changed; per-frame caching remains unchanged.
- Final runtime recovery passes the complete three-layout offline warm-up suite
  on both exact installed browsers: Edge 155 uses one explicit pre-entry reload
  at `test-output/runtime warmup 1793174182384/`; Edge 156 recovers in the same
  document at `test-output/runtime warmup 1793174200355/`. Each performs exactly
  two actual runtime requests and creates one GPU context. Normal preparation
  retains settings/scene choice and scene switches keep renderer/camera/rig.
  Mechanism probes are at `test-output/runtime import retry audit 1793173729569/`
  and `test-output/runtime import retry audit 1793173668062/`. WebGL guidance
  remains verified at `test-output/viewer webgl 1793174060727/`.
- Authoring/export/physics recovery checkpoint: **433/433 unit and integration
  tests passed** in 122.4 seconds at
  `test-output/unit-experimental-authoring-physics-recovery-2026-10-28.log`.
  Existing export fixtures now explicitly distinguish structured-only pruning
  from retained opaque HTML dependencies; missing media is not silently ignored.
- Real canceled Save As, dirty/clean state, selection, Undo/Redo, camera identity,
  recovery bytes, normal Save and positive Save As pass at
  `test-output/editor-save-cancel-1793175535787/`. The original error was
  reproduced before fixing the native cancellation result.
- Native rich-text histories pass nine checks at
  `test-output/richtext-history-1793176489035/`: typing, formatting/link
  normalization, separate bubbles/viewpoints/projects, project Undo, equal-content
  block removal, imported image caret and Undo/Redo, and clean Preview.
  External authoring snapshots intentionally clear local text history even
  when their text matches; ordinary active text echoes keep it.
- Portable responsive/unquoted/inline-style resource rejection and local/data
  images with outbound links pass in a real browser at
  `test-output/portable resources 1793176453549/`. Actual Spark loads both a
  renamed remote RAD root and a true self-companion after the original server
  is shut down at `test-output/remote RAD export 1793176333330/`.
- Opaque content inventory/export tests include sibling CSS/images, encoded
  filenames, private-file and symlink protections, and actual Git materialization
  and cloning without the original source directory. The shared dependency graph
  and inventory/export compatibility suites pass.
- Real failed physics downloads recover in both exact browsers at
  `test-output/lazy physics 1793176817761/` (155) and
  `test-output/lazy physics 1793176837621/` (156). Each uses exactly two engine
  requests, no page navigation, and the same real Three XR manager, session,
  ArrayCamera and stereo eyes. Failed initialization reuses the one downloaded
  module. Canceling scenes shares one pending request; worker-init failure still
  leaves walking routes usable. Offline exports contain exactly the installed
  4,340,292-byte main-thread module with embedded WASM and no duplicate vendor
  chunk. The source bubble fixture also uses this production loader.
- Fresh source precision continuity passes at
  `test-output/extended-precision-1793176936335/`; full real stereo head-safety,
  scaled clearance, cold coverage, relocation and OS-menu recovery pass at
  `test-output/xr head collision 1793176936605/`.
- Fresh full native import regression passes at
  `test-output/editor-imports-1793176936638/`: held image/caret and Preview
  changes, canceled/failed reads, globally visible errors, preset/audio/background
  imports, native collider commit, clean Save As and physical portable export.
  Every imported reference still serves the exact original bytes.
- Focus/audio checkpoint: **436/436 unit and integration tests passed** in
  116.7 seconds at `test-output/unit-experimental-focus-audio-2026-10-28.log`.
  Native held-key focus regression passes at
  `test-output/input-focus-1793178810889/`: fields, rich text, menus, tabs,
  separators, ordinary typing and Save, fresh WASD/arrows, right-pan and preserved
  touch/runtime identities. Actual prior movement under input/menu focus was
  reproduced before changing the focus-entry listener.
- Source audio lifecycle passes eight cases at
  `test-output/audio lifecycle 1793178658569/`, including the real Three XR
  manager's Options Audio action and the synchronized desktop checkbox. The
  actual portable exported website passes both held RAD and held native audio
  response orders, real play/pause events, prepared scene/view resume and local
  asset requests at `test-output/audio export 1793178868361/`. The original
  behind-title playback was reproduced before adding suspension. Enter tour
  still reloads the authored entry; settings keep ambience; editing stays quiet.
- The bounded thumbnail ownership audit found no stale callback failure. Rapid
  scenes and related projects sharing scene/view IDs produced captures associated
  with the correct project/generation. Source cancels pending capture before
  scene identity changes and creates/delivers each image synchronously. No
  speculative product change was made; corrected native proof is at
  `test-output/thumbnail-capture-audit-1793178101637/corrected-result.json`.
