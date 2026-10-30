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
