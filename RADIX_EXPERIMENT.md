# Radix / SOGS experiment

Branch: `Experiemental-Radix-SOGS` (the requested spelling).
Based on the released Studio **1.23.0**. Main and its portable executable are
separate from this experiment. This branch runs its own CI. After its checks pass,
GitHub publishes a clearly labeled **experimental prerelease**, with a unique
`radix-sogs-experiment-*` tag and checksums. It does not change the stable latest
release or use a `v*` release tag.

Downloads include a complete **Windows x64 experimental ZIP** containing the
portable editor, local tour launcher, web-runtime ZIP, instructions, build
identity, full component notices and checksums. The standalone EXE and runtime
ZIP remain separate downloads as well. CI verifies the complete archive before
uploading it; a missing editor bundle fails publication.

## Current verified delivery — October 30

The GPU-preferred importer and corrected native packaging are compiled at
`29c38edfe332dfb617bcca9e7fa6cfaf65cdc0bf`, with clean build metadata.
[Experimental CI 41063088479](https://github.com/MisterE123/spark-tour-studio/actions/runs/41063088479)
passed all 492 tests, actual pre/post-package conversion, rendering/selectors,
collision meshers, XR continuity, native queued authoring/export, retained RAD
scene replacement, portable launch and full ZIP verification. The gated
[experimental prerelease](https://github.com/MisterE123/spark-tour-studio/releases/tag/radix-sogs-experiment-5-1-29c38edf)
is published; its complete Windows ZIP matches its published checksum manifest.

Local portable: `experimental-release/3DGS Perspectives Studio 1.23.0 Experimental 29c38edf.exe`.
SHA-256: `9f61a6413468a0172466ebf9f1a912efd93773dad4da500ac84a9a70786c4dab`.
Local complete ZIP: `experimental-artifacts/3DGS-Perspectives-Studio-1.23.0-Radix-SOGS-Experimental-29c38edf-windows-x64.zip`.
SHA-256: `7dd9926ac473d8ea96603b1cdee49adbae28ab4839665d451928950cf3533616`.
GitHub's independently built ZIP SHA-256:
`cd5df0a7d7c40b33d34e19c262a0c7edb62ad93cacbd1e1d073180fddbff0c4a`.
Local actual portable startup/About/normal close and packaged Studio identity/
visitor graph checks pass in `test-output/portable smoke 1793367259132` and
`test-output/studio-build-1793367392936`. Full archive and publication checksum
gates pass in `test-output/sogs-gpu-delivery-zip.log` and
`test-output/sogs-gpu-local-publish-gates.log`.

## Scope and provenance

The shared viewer uses **Radix 0.0.1** behind `src/rendering/backend.ts`.
Navigation, collisions, viewpoints, stories, branding and project persistence
remain outside that boundary. Renderer-specific settings use the optional
`performance.radix` namespace; opening an older project retains its Spark data.

Radix's SOGS LoD support is currently **example code**, adapted here from
World Labs' commit `b831cc5e98b52a83b6f0ac6ba5fc50b5ac883be1`. It is not a stable
public SOGS loader API. The renderer distribution is pinned to the official
0.0.1 archive, verified by SHA-256, and vendored to avoid the preview package's
platform-specific build dependencies. See
[adapter notes](src/rendering/radix/README.md) and
[provenance](src/rendering/radix/vendor/PROVENANCE.json).

**License:** the renderer and adapted SOGS LoD modules are Copyright © 2026
WORLD LABS TECHNOLOGIES, INC., **MIT**. Their full permission notice is retained
in [the original license](src/rendering/radix/vendor/LICENSE) and
[THIRD_PARTY.md](THIRD_PARTY.md). Studio and every exported website include the
full `licenses/Radix-LICENSE.txt`, source revisions in
`Radix-PROVENANCE.json`, and local adaptation details in `Radix-SOGS-ADAPTER.md`.
These components retain their upstream copyright; they are not presented as
original Studio code. The application wrapper is separately MIT licensed.

The editor-only converter uses PlayCanvas splat-transform 3.10.3,
PlayCanvas engine 2.23.3, libwebp and bundled Node.js 24.21.0. It prefers WebGPU
through pinned `webgpu` 0.6.2 / Dawn on Windows x64, with explicit CPU fallback.
Exact hashes,
full licenses (including embedded SuperSplat Viewer code) and the adapted Node
filesystem implementation's provenance ship under `sogs-tools/`. Those editor
tools are not copied into visitor websites. Conversion and runtime operation
need no installed Node or fetched application code.

**Processing** offers Automatic (GPU preferred), GPU only and CPU only. GPU work
accelerates both LoD reduction and SOG compression. Adapter initialization
failure can use CPU; a failed GPU attempt is discarded before Automatic retries
once on CPU from the unchanged input. GPU only reports failure instead of
silently changing backends. Large adaptive reductions require GPU support in
the pinned library; CPU conversion uses uniform reduction when that capability
limit is reached. The original finest level and selected SH degree are retained.
`conversion-report.json` records requested/effective backends, actual level
counts, reduction methods and fallback reasons beside the completed scene.
Reduced budgets round upward by at most one Gaussian, avoiding an unnecessary
full adaptive planning pass when an odd-sized input is halved.

The GPU runtime's actual Dawn/Tint BSD-3-Clause license and full DirectX compiler
notices accompany the authoring tools and complete Windows ZIP. This does not
change the World Labs MIT license of the renderer/SOGS LoD adapter above.

## Port an existing project copy

1. Copy the existing project folder and open that copy in this Studio build.
   Keep the original project and stable editor for comparison.
2. Select a scene and choose **Replace scene splat**. Choose existing SOGS or
   convert the original Gaussian splat PLY to **streamed SOGS LoD**. Replacement
   keeps the scene ID, alignment, views, bubbles, descriptions, audio, links and
   collision metadata. Use input with the same coordinate system. It does not
   guess a new alignment or regenerate an existing collider.
3. Conversion keeps the original files, runs in the import queue, and switches
   the source only on success. Cancel/failure leaves the previous source intact.
   Choose SH degree, adaptive/uniform reduction, number of reduced levels and
   chunk size. Default output includes the finest source level plus four reduced
   levels. SOG compression is lossy; unchanged point count is not lossless storage.
4. Check scale/orientation, entry views and collision alignment. Preview and tune
   **Radix** performance settings. Save a named preset if useful.
5. Export to a new folder. Portable export copies the complete manifest/texture
   graph; referenced export retains configured remote assets. Keep every SOGS
   manifest and texture path together when moving assets to a CDN.

Supported entry points are `.sog`, loose `meta.json` and streamed
`lod-meta.json`. LoD is provided by the last format; a lone `.sog` is not a
streamed scene. New RAD imports are disabled, while their original implementation
and existing project references are retained for replacement and future support.
Existing RAD scenes show guidance until replaced; they are not silently converted.

Unsupported or missing scene data does not prevent opening, editing or saving a
project. The viewport shows **Rendering unavailable** with **Replace scene
splat**; a missing or malformed supported SOGS source also offers **Retry scene**.
The effective source includes hosting overrides. Unsupported scenes allocate no
splat, background or collision resources and do not apply an entry camera.
Camera-dependent placement/capture tools wait until a supported scene is ready;
numeric settings, views, stories, links and source replacement remain available.

## Renderer and headset limits

- The performance panel reports the actual **WebGPU** or **WebGL2 / CPU sort**
  backend. Unsupported WebGPU can fall back; this is not labeled as GPU sorting.
- Automatic selection uses the WebGL path on immersive-capable browsers that
  lack `XRGPUBinding`. WebGPU XR is an upstream preview and needs real headset
  testing. `?radixBackend=webgpu-gl` forces the fallback before entering a tour.
- One renderer, canvas and animation loop remain alive across scene changes.
  Scene loading replaces assets and preserves an active XR session.
- Selected and resident budgets apply **per splat asset**. A foreground and
  splat background each consume their own budget; statistics show their sum.
  Textures, mandatory coarse coverage and pending work add memory overhead.
- Splat surface picking is an approximate coarse ellipsoid proxy (at most
  12,000 samples per asset). Collision picking and movement use the actual
  collider. This approximation can affect placement on very fine features.
- Collision generation scans finest source ranges, independent of the displayed
  LoD. Existing GLB and paged collision assets retain their shared runtime.

## User testing and performance comparison

Test copies of North Graveyard, East Inside Graveyard and Hungars Aerial:
source replacement, saved views and stories, transitions, collision alignment,
Walk/Drone teleporting, controller tracking loss/recovery, mobile portrait and
landscape, and offline/shared exports. Confirm the About build identity and
actual renderer backend before comparing.

Compare stable Spark and this build on the **same device, camera path, viewport,
SH degree and visible detail**. Record cold time to coarse coverage and useful
detail, selected/shown/resident counts, median and slow-frame times, peak memory
and visual differences. Test warm cache separately. A higher FPS with fewer
visible splats or reduced quality is not a like-for-like improvement. Conversion
size, network, texture decode and GPU memory can dominate independently of sort
speed. Software GPU tests prove behavior, not hardware performance.

No measured Quest/VPS frame-rate or time-to-photorealism improvement is claimed
until those comparisons run on real hardware. Completed validation and the tested
experimental executable are recorded below.

## Validation record

Local source checkpoint (Windows x64, Node 24.21.0):

- **462/462 unit and integration tests pass**, no skips:
  `test-output/radix-unit-final.log`.
- Typecheck, web build and local license generation pass:
  `test-output/radix-final-source-build.log`.
- Actual NVIDIA Ampere **WebGPU** and WebGL rendering pass with real PLY →
  three-level SOGS conversion, SH1/SH0 replacement, 50 selection drags with stable
  compiled programs, transformed picking, first-draw readiness, failed coarse
  coverage/retry and held-decode cancellation:
  `test-output/radix backend 1793336313767/result.json`.
- Real browser workers scan only finest SOGS ranges and produce both actual
  **GLB and paged collision** outputs, including transformed occupied cells:
  `test-output/splat-leaves-worker-1793334791415/result.json`.
- Real Three XR manager and stereo rendering retain the same session, cameras,
  renderer and canvas through mode/scene changes, failures/recovery and two
  controller-driven Walk teleports. Next-session resolution, scaled walking,
  physical head alignment and failed-session cleanup pass:
  `test-output/radix XR 1793336274425/result.json`.
  The headset hardware boundary is emulated, not a physical Quest test.
- Native chooser/queue, failed and canceled jobs, canceled and successful
  SOGS/PLY replacement, five-level default conversion, true running cancellation,
  private-view story, save/reopen and offline three-scene export pass:
  `test-output/radix-authoring-1793337661010/result.json` (7/7 phases).
  Original authoring survives exact round trips. Exported full World Labs MIT
  notice/provenance and bundled converter file hashes are checked. The cold
  exported viewer runs beneath `/tour/` with originals unavailable and external
  requests blocked. No unexpected page, graphics, HTTP or external-resource
  errors occurred.

The native/strict XR checks exposed a mixed-texture binding cleanup bug that
the simpler renderer check missed. The adapter now clears only decoder texture
bindings before disposal; it preserves XR framebuffer state. They also caught
the difference between Three's culling camera and the physical stereo midpoint.
Both corrections have before/after evidence and remain covered in CI.

The dedicated `Radix SOGS experimental builds` workflow packages the same tools,
runs all four browser/native checks, verifies the actual portable executable and
dependency graph, then publishes an experimental prerelease with checksums.
Portable packaging and the complete branch CI have passed. This remains an
experiment, not a claim of complete Spark API parity.

Initial clean-source local preview: `experimental-release/3DGS Perspectives Studio
1.23.0 Experimental b7e028db.exe`, compiled from
`b7e028dbebaa4693fe298716b7920a8f138c8823`, `dirty=false`.
SHA-256: `b04f913f80b9d929bc519e034ab8600b102a2048e6b38315e8248d9a407c711d`.
Actual portable launch/About/normal close and packaged Studio/visitor identity
checks pass in `test-output/portable smoke 1793337086364` and
`test-output/studio-build-1793337121995`.

The first branch CI run, `41006504011`, passed units, packaging, rendering,
collision generation and XR. Its final native check completed the real product
operations, then failed on its own unused WebGPU diagnostic request in a forced
WebGL fixture and ordinary software-driver ReadPixels performance notices.
The test now reads the existing renderer rather than requesting another adapter.
Only the exact driver performance notice is classified and retained separately;
graphics validation errors, deleted textures and unknown warnings remain failures.
This repair changes tests and documentation only; the compiled application above
remains current.

Initial delivery verification:

- Full branch [CI 41007920729](https://github.com/MisterE123/spark-tour-studio/actions/runs/41007920729)
  passed at `dcb13f9fc3bf0a6e9ed8ae820e9701dd2a996094`, including all 462 tests,
  converter packaging, backend/selectors, both meshers, persistent XR, actual
  packaged queue/replacement/offline authoring, portable launch/close and
  experimental identity checks. The gated publishing job also passed.
- Published [experimental prerelease](https://github.com/MisterE123/spark-tour-studio/releases/tag/radix-sogs-experiment-2-1-dcb13f9f)
  includes the portable Studio, standalone tour launcher, web runtime, notices,
  build identity and checksums. Its Studio is compiled at `dcb13f9f`; the local
  `b7e028db` executable above has identical application source, with the later
  commit changing only tests and this document. The stable latest release is
  unchanged.
- The actual exported SEA launcher works with Node absent from PATH, serves
  byte-exact compressed `.sog` data and correct 206 ranges, renders the archive
  in the offline browser, serves the complete adapter MIT notice and shuts down
  cleanly: `test-output/radix-launcher-1793338431673/result.json`.
- Final packaged offline authoring reports no page, graphics, HTTP or external
  resource errors. Local NVIDIA WebGPU rendering is verified; physical Quest
  comfort, controller behavior and comparative device/VPS performance remain
  user-test boundaries.

No Hungars project originals were changed. Main remains at the released
`bd7707805a82645200fc774b547485f931c94499`; this branch has not been merged.
The stable local `release/3DGS Perspectives Studio 1.23.0.exe` SHA-256 remains
`c25903f082020a619e9c3e09705931051cff1b32c4269241d95f2e754c7fbd2b`.

### Retained-source migration regression

The follow-up `scripts/radix-invalid-scenes-check.mjs` is part of experimental
CI. It holds unsupported scenes open in the native editor, checks that rendering
resources remain absent, exercises invalid/valid transitions and hosting
overrides, and saves/reopens before replacing a retained RAD source through the
normal queue. A missing supported SOGS source is repaired and retried in the same
runtime. This specifically covers the project-porting workflow rather than
immediately moving from a legacy scene to a new import.

The reported October 30 closure has a separate native Windows crash record:
`c0000005` in `explorerframe.dll_unloaded`. Replaying the original seven-scene
metadata in an isolated profile did not reproduce a process crash. That record
does not establish that rejecting RAD caused the native fault, and the rendering
preflight change is not claimed to repair that unproven shell failure. The
original Hungars project folders remain untouched.

### GPU-preferred conversion regression

The bundled converter now includes the pinned Windows Dawn runtime and compiler
libraries. Automatic selects a hardware WebGPU adapter when available, with a
clean CPU restart after a failed GPU batch. Explicit CPU and GPU selections are
available for testing. A software adapter is identified in the report and is
not preferred over CPU by Automatic. Large CPU adaptive jobs switch to uniform
reduction only at the pinned library's demonstrated multi-block capability limit.

`scripts/sogs-conversion-check.mjs` is part of branch CI. It runs the bundled
converter without Node on PATH and with JavaScript networking blocked, verifies
native dependencies and notices, performs an actual WGSL readback, checks odd
detail counts, signed coordinates and SH1 color data, and exercises missing-GPU
fallback, explicit GPU failure and active cancellation. Local hardware runs use
an NVIDIA RTX 3090; hosted CI may honestly report CPU when hardware is absent.
Device-loss/validation/OOM and fresh-process CPU retry policies also have focused
tests. These checks do not promise a particular conversion speed on other GPUs.

Packaging uses a separate resource mapping rooted at the native package itself:
Electron Builder skips a source-root `node_modules` before applying positive
globs. A regression uses its actual copy implementation, and CI reruns the
conversion checks against the completed package, including dependency hashes.

Local follow-up checkpoint: 490/490 unit/integration tests pass in
`test-output/sogs-gpu-final-unit.log`. The real offline hardware/CPU check passes
in `test-output/sogs-conversion-1793365938726/result.json`: both paths produce
2,047 / 1,024 / 512 Gaussians, preserve the finest signed coordinates and SH1
colors within measured compression error, and pass fallback/cancellation tests.

The exact packaged tools also pass real GPU/CPU SH1 and SH3 round trips,
offline operation without Node on PATH, missing-native fallback, strict GPU-only
failure, active cancellation and all native dependency/license hashes:
`test-output/sogs-conversion-1793366916220/result.json` and
`test-output/sogs-conversion-1793367568102/result.json`. SH3 retains all 45
harmonic coefficients; measured maximum coefficient error is below 0.000155.
Actual native GUI Processing choices, queue execution details after acknowledgment,
replacement, cancellation, Save/reopen and portable export all pass in
`test-output/radix-authoring-1793366045205/result.json`.

### Full-size Hungars Aerial validation

A separate byte-copy of the supplied 3,471,052,437-byte PLY converted on the
RTX 3090 using required WebGPU, adaptive reduction, SH0, five total levels and
one compression iteration. It completed and validated 1,201 graph files in
3,284.5 seconds (about 55 minutes), with no CPU fallback. Report:
`test-output/aerial-gpu-1793364522744/result.json`. This is an actual conversion
time for those settings, not a CPU/GPU speed comparison or a promise for other
hardware/default compression settings. Disk partitioning and CPU work remain.

The long run began before the odd-budget rounding improvement, so its reduced
counts use floor rounding: 13,996,173 / 6,998,086 / 3,499,043 / 1,399,617 /
699,808. The current packaged tool rounds reduced budgets upward by at most
one point and is independently exercised on both CPU and GPU. Finest detail
count is unchanged. The original PLY's complete SHA-256, size and modification
time remain unchanged; final hash:
`60f1013f8b0e9200eb847e99903f46dd52170f14b1b29f3f5948f7a97b1a0f06`.
Before/after records are in the same evidence directory.

The complete generated scene loads and renders in the built WebGPU viewer,
including the original isolated Hungars Aerial authored camera poses. Two views
share one runtime/canvas/renderer and stream actual metadata/textures without
external requests, HTTP failures, page errors or GPU errors:
`test-output/aerial-sogs-render-1793368321967/result.json` and
`test-output/aerial-sogs-render-1793368413907/result.json`. These deliberately
small-budget checks establish loading and coordinate continuity, not final image
quality or frame rates. Mandatory coarse coverage can exceed the requested
budget (about 700,000 coarse splats for this default five-level output); more
reduced levels can provide lighter overview data for large scenes.

A separate higher-detail pass using the preserved authored cameras also passes:
`test-output/aerial-sogs-render-1793368547338/result.json`. With 2M selected /
4M resident limits, actual selected/shown splats rise to 939,375 from the coarse
699,823, with paging settled and 36 chunk metadata files / 180 texture requests.
The screenshots show the church/property in the expected orientation. Runtime,
renderer, canvas, camera and rig identities remain unchanged between views;
there are no failed/external requests, page errors or GPU errors. Those limits
are upper budgets, not a claim that two million splats were drawn or an FPS
benchmark. Physical Quest behavior and comparative performance remain user tests.

### Scene/view detail inheritance and frame diagnostics — source checkpoint

Tour Performance settings now establish the reusable defaults. **Scene detail &
distances** and **Viewpoint detail & distances** can override individual distance,
LoD-level, fallback and streaming/sort-threshold policies. Unchecked controls
inherit; Reset removes only that scope's policy. Effective order is tour/visitor
settings → scene → selected viewpoint. Moving away from an authored view restores
the scene policy, and changing scenes never copies the previous scene's values
into the new one. Entry-view policies apply before the destination pager starts.
Device budgets, resolution, SH, projection/backend and XR settings remain global.
Sparse JSON contracts are in `specs/performance/scene.schema.json` and
`viewpoint.schema.json`; named preset exchange stays independent of scene data.

The Scene inspector has a collapsed **Frame performance** panel with 60 seconds
of raw frame-time peaks, current/average FPS, slowest frame and 50 ms+ frame count.
Reset remains usable during Walk Preview while metadata stays locked. The ring
buffer is bounded; the graph refreshes at most four times per second and stops
refreshing while closed. Initial covers, hidden tabs and suspended XR break
continuity; genuine visible paging/preparation stalls remain recorded. The panel
does not appear in visitor tours. Tune defaults through Tour Performance and use
the scene/view controls for authored detail policies.

Optional automatic adjustment also handles demonstrated sustained visible
sub-1-FPS cadence, rather than indefinitely rejecting every long interval as an
inactive gap. Isolated long pauses still do not lower detail. No artificial
network or rendering delay was added to the product. Viewpoint Preview now pauses
unneeded streamed physics work, including late worker replies; Edit, Walk and
Drone resume verified local collision coverage instead of bypassing collision.

User-test sequence:

1. Give the aerial scene a longer detail distance than a room. Add a closer view
   with its own distance. Select each view, leave it for Drone, switch scenes and
   return; confirm the correct policy returns without a camera reset.
2. Save/reopen and export a copy. Check the same scene/view differences in the
   visitor. Replacing a splat should retain these authored policies.
3. Open Frame performance, Reset, enter Walk Preview and reproduce a hitch.
   Check slowest-frame/spike readings as well as average FPS. Reset during Preview
   and confirm Name and other authoring controls remain locked.
4. Enable automatic detail only when desired; compare its temporary budget scale
   with manual settings on the actual viewing device.

Focused source verification passes 38 unit tests covering presets, sparse
inheritance, range constraints, frame history and adaptive feedback; TypeScript
also passes. Real-runtime browser checks cover 16 inheritance/scene/view/pager
cases and raw frame sampling:
`test-output/scene performance 1793393853466/result.json`. Isolated editor UI checks
cover seven scene/view cases and six graph cases, including Preview Reset:
`test-output/scene performance UI 1793393736217/result.json` and
`test-output/frame performance UI 1793394337453/result.json`. Adaptive integration
and eleven physics lifecycle/XR continuity cases pass in
`test-output/radix adaptive 1793392423980/result.json` and
`test-output/collision preview lifecycle 1793395401457/result.json`. The added
case resumes a collider with an intentionally oversized transformed window:
rendering does not throw, preparation rejects with the bounded-window notice,
and restoring alignment rebuilds fresh valid Walk coverage in the same world.
The combined native authoring/export regression also passes nine checks,
including scene/view policy persistence through source replacement, Save/reopen,
portable export and a cold offline visitor under a subdirectory. Actual Walk
Preview keeps metadata locked while Frame performance Reset remains usable:
`test-output/radix-authoring-1793395087705/result.json`. The complete unit and
integration checkpoint passes 509/509 tests in 251.9 seconds, and the production
web build passes. The subsequent bounded-window resume guard is verified by the
eleven-case lifecycle check above. These checks are included in experimental CI;
the successful repaired source/Windows job is recorded below.

Remaining hitch limit: the original Aerial collision data was served read-only to
an isolated CPU browser probe, without loading splats or stopping the user's
imports. Across 524 physics steps and 621 Drone helper calls, the initial physics
step cost about 78 ms, later steps stayed at or below 0.6 ms and helper calls at or
below 1.6 ms in the sampled route. This supports removing unnecessary late
physics work; it does not explain every hitch under full rendering load. The
actual North Graveyard hardware run still contains frame gaps above 100 ms at
high detail, while its warm physics steps are much shorter. Full-renderer,
conversion/GPU contention and device-specific behavior remain under investigation.
Do not treat the graph, inheritance changes or paused Viewpoint physics as proof
that all Drone/Walk stutters are fixed, or as a measured FPS gain on Quest/VPS.
User originals and the running import session were not changed by these checks.

### Standalone renderer handoff

The asset-free developer reproduction and report are in
`repros/radix-buffer-growth/`. The pinned, unmodified Radix sorter independently
reproduces synchronous buffer-growth hitches: 70.1 ms at five million entries
versus 0.4 ms on the same-capacity replay; wrappers disabled gives 67.3/0.5 ms.
Four mapped 28.8 MB buffers account for 46.1 ms of native allocation time. A
separate procedural renderer with verified visible pixels gives 73.0/0.7 ms.
These observations isolate the allocation path without SOG, Studio, physics or
XR. The separate mostly-idle native Walk gaps remain unassigned; the report
explicitly preserves simultaneous-conversion and browser/driver caveats.

`artifacts/radix-buffer-growth-repro-2026-10-30.zip` is an ignored local handoff,
2,577,850 bytes, SHA-256
`c9eb2948df992e002196437fa0a0e323ad4d5c613e295a52209571851aab0148`.
It includes the offline page, independent editable npm-pinned source, full MIT
notices, report, raw synthetic measurements/profile and sanitized integration
evidence. It contains no user tour assets or private full application trace.
Four metric tests, real hardware growth/replay, visible-render/readback smoke,
pending preparation cancellation and repeated Stop/Run checks pass. Nothing has
been posted or uploaded to upstream. Runtime/vendor code is unchanged by this
diagnostic; a scratch-allocation performance improvement remains an upstream or
future integration task rather than a claimed fix in this build.

Verified local preview: `experimental-release/3DGS Perspectives Studio 1.23.0
Experimental de76b6f4.exe`, compiled from clean source
`de76b6f4aa22baa40fa7f6e17778827849787632`. SHA-256:
`1a636b08182257a80fd673ed45c63310b37251e34eae68e9a3c2a6b5f7e0cb30`.
Actual portable launch, About and normal close pass at
`test-output/portable smoke 1793396476708/result.json`; packaged experimental
identity and the visitor dependency graph pass at
`test-output/studio-build-1793396475821/result.json`. The stable 1.23.0 executable
remains unchanged (`c25903f082020a619e9c3e09705931051cff1b32c4269241d95f2e754c7fbd2b`).
No original project was saved or source asset changed by these checks; the
existing Studio was left open and returned to the Aerial Front preview. Imports
were never stopped, paused or canceled by the performance investigation.

### Windows CI software graphics correction

Run `41133043991` passed 509 units, packaging, both meshers, XR and scene/view
policies, then failed the strict WebGPU adaptive check: the hosted Edge
156.0.4314.56 returned null for every adapter request and correctly fell back to
WebGL. The backend assertion was retained. An isolated local browser matrix
reproduced the same failure in the pinned headless shell. Explicit D3D11 WARP
for ANGLE plus SwiftShader for WebGPU creates genuine software devices without
depending on the RTX 3090. CI now installs the full Chrome for Testing revision
pinned by Playwright, runs this strict check before packaging, and retains Edge
coverage in the other checks. Browser/version/path, GPU service and actual
renderer/device diagnostics are captured independently on failure.

All 31 adaptive/backend/stereo cases pass with Chrome 153.0.8010.12 and Edge
156.0.4314.50 using those software paths:
`test-output/radix adaptive 1793405748558/result.json` and
`test-output/radix adaptive 1793405801748/result.json`.
The actual WebGPU device reports Google/SwiftShader; the GL path reports
Microsoft Basic Render Driver/WARP. These changes affect test configuration
only. The verified `de76b6f4` local executable and developer handoff are unchanged.

The repaired source/Windows build job passed in run
[`41149470779`](https://github.com/MisterE123/spark-tour-studio/actions/runs/41149470779),
including strict real software WebGPU, selector/mesh/XR checks, scene/view
performance controls, packaged authoring/export, unsupported-scene recovery,
portable launch and full experimental ZIP artifact. Separate prerelease
publication was not monitored. The fix changes no application runtime code.

### Clean follow-up for the roughly 250 ms pauses

After the user finished conversion and closed Studio, one owned viewer at a time
retested North Graveyard at its saved 5M selected/16M resident settings. The
minimal Edge runtime measured two sequential 120-second epochs: normal count
readback had a 50.0 ms maximum frame interval; bypassing actual GPU readback had
66.7 ms. Both had zero intervals over 100 ms, and no sorting scratch growth.
Normal readback remains enabled in the product: this comparison does not support
disabling it as a stutter fix. Evidence:
`test-output/North walk readback AB 1793406096550/controlled-analysis.json`.
Both epochs contain stationary and held-key walking sections, but this older
helper used default walking height/step; routes also diverged slightly at
collisions. It is a controlled readback comparison, not an exact native camera
benchmark.

The full packaged Electron editor then retained its normal glass UI, real count
readback and authored 1.45 m height/0.52 m step. Across 150 seconds (stationary,
walking, stationary), the maximum interval was 66.6 ms, walking maximum 50.0 ms,
and maximum synchronous rendering callback 14.7 ms, with zero intervals over
100 ms or page/GPU errors. Directly recorded Electron 44.4.5/Chromium
152.0.7977.130, NVIDIA hardware WebGPU and 1520×935/DPR-one drawing dimensions
avoid confusing this native test with the separate Edge browser. Original tour,
hosting and source-registry hashes are unchanged. Evidence:
`test-output/North native editor clean 1793406776769/controlled-analysis.json`.
The original minimal-browser pixel-ratio setting was a cap of two on a DPR-one
context; its effective backing was 1280×720, not 2560×1440. The developer report
and sanitized evidence correct that distinction.

These bounded clean tests did not reproduce the original 250–383 ms idle-main
gaps. They weaken warm physics, periodic readback, or Electron/glass alone as
explanations. The original native capture included a running GPU conversion;
contention remains plausible, not proven. The clean editor contains later
application changes (`de76b6f4` versus `29c38edf`) while the pinned Radix module
is unchanged. No speculative runtime change or claim that all stutters are
fixed follows from the negative tests. The separately reproduced buffer-growth
callback hitch remains distinct.

The final controlled native comparison retains one fixed walking position,
4,991,574 shown/15,881,104 resident splats and zero pending loads while gently
turning ±0.12 radians every 30 seconds. Three measured 60-second windows use
normal glass/readback: baseline, bounded pulsed WebGPU compute on the same RTX
3090, and recovery. Frame p95 is 16.8/33.2/16.8 ms; worst intervals are
33.5/66.6/49.9 ms, with zero intervals over 100 ms. CPU maxima are
13.1/11.7/12.5 ms. The fixed-capacity helper preallocates 8 MiB, uses one awaited
batch at a time, and completes 749 batches in 60.011 seconds. It degrades cadence
and then recovers without reproducing the historical pause.

Final evidence: `test-output/North native controlled final 1793408302832/`.
Each phase has independently saved raw frame/metrics, CPU profile and GPU-process
trace; incremental checkpoints, input/lifecycle logs, GPU samples and calibrated
external-helper logs survive interruption. Independent review confirms zero
measured input/drift, constant counts, and exactly one cross-boundary interval
excluded per phase. All in-window rows remain. A prior run interrupted by the
user's confirmed interaction is excluded; two startup/guard fixture mistakes
were corrected before the final measured load ran. No product crash is inferred.

Limits: this is a stationary Walk position with active yaw, not a physical
walking/teleport route. Preallocated arithmetic does not reproduce the actual
converter's allocations, uploads or queue depth. An unrelated roughly 10-second
CPU/file audit read has uncertain overlap with baseline/load; no data was removed
because of it. Trace transfer occurs outside measurements, so starting yaw can
differ despite each window covering two full cycles. Filesystem timestamps for
the identified same-card WebGPU conversion encompass the original capture,
but no per-stage wall times establish exact GPU-dispatch overlap. The report
keeps this uncertainty separate from the demonstrated sorting-allocation hitch.

Historical developer handoff (superseded by the Radix-only revision below):
`artifacts/radix-buffer-growth-repro-2026-10-30-v2.zip`, 2,584,620 bytes,
SHA-256 `768a9f74f27dc47078e5788a14fa26381ee88f7ab565f8f4962d06c7db8219ed`.
The original ZIP remains unchanged. Revision two adds the clean comparisons,
corrected browser/pixel metadata and sanitized limitations; its reproduction
`app.js` is byte-identical to the original handoff. All 30 entries and dependency
notices were checked, the JSON parses, and the four reproduction metrics tests
pass. Private assets and full native traces are not included.

The current `de76b6f4` experimental executable is unchanged and remains the
verified local application; no runtime change or new version follows from this
diagnostic follow-up. Its SHA-256 and the stable 1.23.0 executable's hash were
rechecked and match the checkpoints above. Owned native/helper/sampler processes
exited normally, and all three original project metadata hashes are unchanged.

### Upstream handoff narrowed to experimentally isolated Radix behavior

The user requested a report containing only issues pinned to Radix's own path.
`repros/radix-buffer-growth/REPORT.md` and its README now cover one reproducible
performance issue: synchronous scratch-capacity growth inside sorting. Native
Studio freezes, the unassigned 250 ms waits, collision work, conversion timing
and generic contention experiments are internal investigations, excluded from
the developer handoff. Earlier bundles are historical, not the current handoff.

Fresh standalone measurements with no Studio, converter, compute helper or
peer diagnostic renderer reproduce the five-million-key transition. Normal
desktop activity remains documented (16–25% ambient GPU); no exclusive-idle-OS
claim is made. Unprofiled sorter timings are 73.4/0.9 ms growth/replay with
instrumentation, 74.0/0.9 ms without wrappers, and 73.2/0.6 ms in an independent
repeat. Six allocations total 47.9 ms within the first callback: four 28.8 MB
key/value buffers plus offsets/histograms. Same-sorter replay creates no buffers
and grows no capacity. The report identifies Radix's synchronous allocation
placement while keeping native allocator costs properly attributed across
Three/browser/driver/hardware. Supplementary visible-renderer evidence is
explicitly separated from the unprofiled timing controls.

Clean source evidence: `test-output/radix clean standalone 1793409240696/` and
the independent repeat `test-output/radix clean repeat 1793409365491/`.
The new tracked `evidence/sort-capacity-growth.json` is a concise standalone
summary. The builder copies that summary and an explicit raw-file allowlist;
it never copies internal integration evidence and refuses nonempty output
directories to prevent stale investigation files being carried forward.

Current developer ZIP: `artifacts/radix-buffer-growth-repro-2026-10-30-v5.zip`,
2,565,453 bytes / 31 entries. SHA-256:
`46a16c7ecdbd5396bf6bb56deda7f5890aa029f4bdfd897b33073431d950fd30`.
It contains only the standalone source/page, clean measurements, supplementary
profile/screenshots, provenance and licenses. No previous bundle was overwritten.
Reproduction `app.js` is byte-identical to revision two; this changes report scope
and packaging, not the viewer/editor renderer. Four metrics tests pass. Local
archive verification checks raw completion/errors, pins/notices, exclusion of
internal evidence in both default/measured builds, and rejection of nonempty
outputs without changing the existing ZIP:
`test-output/radix-only-handoff-verification.json`.
The request acknowledges Radix's existing `SplatRenderer.prepare(camera)` for the
current collection and specifically asks about reserving future scratch capacity.
Revision five adds a plain-language Problem statement above Reproduced issue;
the measured evidence and reproduction code are unchanged.

### Quest XR overlays, controls and automatic detail

The actual Quest 3 capture identified repeated exceptions in the tour's manual
`renderer.clearDepth()` call, after the splat draw and before the overlay pass.
Three's common renderer creates a clear-only context with no camera; its WebGL
array-depth path then dereferences that camera. The device was using genuine
OVR multiview and an array-backed XR target. This aborted every affected frame
before menus/bubbles, readiness completion and automatic-detail feedback. It can
also block movement through incomplete readiness or an invisible open menu.
This is an integration fix, separate from the Radix developer handoff above.

All overlay materials now explicitly ignore scene depth, including controller
rays. The redundant standalone depth clear is removed without changing vendor
code, tracked poses or XR session ownership. A temporary in-memory correction
in the user's existing Quest tab restored UI and frame rate, confirmed by the
user. Their export files were not modified. Before/after evidence is local in
`test-output/quest-radix-snapshot-1793416725914/` and
`test-output/quest-radix-depth-proof-1793416990102/`.

Automatic detail now has an explicit immersive policy: opted-in XR starts with
a temporary selected budget of at most 750,000 per asset, responds to sustained
overload promptly, uses the headset refresh rate, and recovers detail cautiously.
It can reduce below the old quarter-budget limit and continues sampling while
XR menus/content are open. Authored presets are unchanged; opting out keeps the
chosen manual ceiling. Desktop/mobile behavior retains its existing policy.
Source coarse coverage can exceed the requested budget, so no frame-rate
guarantee is made. Actual stereo selection tests retain that coverage instead
of silently dropping chunks to satisfy a number.

The animation loop also ignores Three's timestamp-less bootstrap callback.
Previously an actual session-end bootstrap poisoned the average frame time with
NaN even though later timestamps recovered. The expanded real-manager test
reproduces the old failure and verifies finite timing through exit/re-entry and
failed-session recovery.

Verification: 515/515 unit/integration tests pass in 162.4 seconds at
`test-output/unit-radix-xr-fix-2026-10-30.log`; production build/type-check passes.
The expanded fallback XR fixture covers both hands, Drone/Walk movement, vertical
movement, snap turning, grip and wrist-menu actions, menu movement blocking,
visible menu pixels in both eyes and all original scene/teleport/session checks:
`test-output/radix XR 1793417271604/result.json`. A new projection-layer fixture
checks real eye textures on hardware and CI software rendering, and is included
in branch CI: `test-output/radix XR layers 1793416928262/result.json` and
`test-output/radix XR layers 1793417019536/result.json`. Desktop ANGLE advertises
OVR without the multisample entry point required by pinned Three, so these tests
explicitly report genuine multiview unavailable rather than emulating it. The
Quest capture/user confirmation provides the physical multiview evidence.

Adaptive tests use actual Three XRManager, production streaming and one shared
session/camera/rig: `test-output/radix adaptive 1793417108345/result.json`.
They assert the XR entry seed, prompt overload response, continued menu/content
feedback, actual reduced selected counts and source coverage. A synthetic-clock
rewind in the fixture was corrected; no backend ownership gate was removed.

Remaining live LoD investigation: the user reports inconsistent nearby refinement
after UI recovery. North's mandatory coarse coverage is 748,652 splats, leaving
only 1,348 refinement headroom at a 750,000 budget; tied nearby promotions can
cost more. Production CPU selection reproduces this coarse-nearby behavior, while
1M budgets refine containing leaves through the sampled 0–10 m approaches:
`test-output/north-selection-cpu-1793417496232/result.json`. This demonstrates a
budget/source-granularity limit, not that it caused the user's current session.
Live capture paused while the headset was asleep; no request/camera defect is
claimed without the matching live desired/shown/budget state.

### Coverage-aware XR refinement and teleport recovery

A follow-up reproduced two automatic-detail defects without network variation.
After sustained overload, the controller could request less than a source's
mandatory coarse coverage. North still draws 748,652 splats even when asked for
40,000; recovering through those ineffective requests delayed visible detail.
Separately, a 220 ms comfort fade every five seconds repeatedly erased the eight
seconds of healthy evidence needed to recover. Even otherwise steady 90 Hz
viewing could remain at the 750k entry seed indefinitely. These are demonstrated
controller problems; they are not proof of the cause of the older live session's
individual missing refinements.

The backend now exposes its effective selectable coverage floor, using exactly
the selector's allowed level range and sparse-level fallback. Cached level chains
avoid a new per-frame leaf scan. Fixed environment/non-LoD splats are excluded.
Because the budget applies separately to each asset, the shared reduction stops
at the smallest attached visible LoD floor: another asset can still become
cheaper below a larger asset's floor. This does not raise authored ceilings or
change residency, distance settings, source files or the streaming/sort ownership
guards. Desktop/mobile policy is unchanged.

Brief visible XR fades now pause observation instead of discarding it. Covered
frames and elapsed time do not count as healthy or slow evidence. Covers longer
than 500 ms, hidden/system-menu state, loading, tracking loss and invalid clocks
still require fresh observation. Detail increases remain gradual.

The production-browser regression uses actual selection and Three's XR manager:
`test-output/radix adaptive 1793418897463/result.json`. Overload stops at 8,192
mandatory fixture splats; healthy viewing with repeated 220 ms fades increases
actual selected detail to 16,384 in the same session. Constrained single-level
coverage and both rendering backends are checked. Stereo controls/session
regressions pass at `test-output/radix XR 1793418951816/result.json` and
`test-output/radix XR layers 1793418965466/result.json`. These are bounded fixture
proofs, not measured Quest frame-rate or hosted time-to-detail claims.

A read-only production-selector check on North's actual metadata holds the same
2 m approach, distance settings and 90-degree reference FOV. At 750k, both
containing leaves remain at L4. With current feedback at 90 FPS and the same
recurring fades, the request reaches 950k after 9.23 seconds; both leaves then
select finest L0. Evidence:
`test-output/north-selection-cpu-1793417496232/adaptive-recovery.json`.
The original metadata hash is unchanged. This isolates selection/recovery, not
the headset's actual cadence, download completion or exact eye FOV.

User test: make a fresh export with automatic detail enabled. Enter North in VR,
check grip menu visibility and stick movement, then approach nearby features and
teleport every few seconds. With healthy delivery, nearby detail should recover
instead of remaining stuck because of the fades. Repeat with Hungars Aerial and
with automatic detail disabled to compare the authored distance/level limits.
The earlier temporary headset correction disappears on refresh; the new export
contains the permanent fixes. Original exports and tour assets remain untouched.

Combined checkpoint: all 523 unit/integration tests pass in 185.6 seconds
(`test-output/unit-radix-xr-coverage-fades-2026-10-31.log`), production
build/type-check passes, and the stereo/adaptive checks above pass after the
coverage/fade integration. An independent review found no additional ownership,
authored-ceiling, per-frame leaf-traversal or suspension issue. Physical Quest
validation of this newly exported build is still required.
