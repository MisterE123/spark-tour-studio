# Radix / SOGS experiment

Branch: `Experiemental-Radix-SOGS` (the requested spelling).
Based on the released Studio **1.23.0**. Main and its portable executable are
separate from this experiment. This branch runs its own CI. After its checks pass,
GitHub publishes a clearly labeled **experimental prerelease**, with a unique
`radix-sogs-experiment-*` tag and checksums. It does not change the stable latest
release or use a `v*` release tag.

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

The editor-only CPU converter uses PlayCanvas splat-transform 3.10.3,
PlayCanvas engine 2.23.3, libwebp and bundled Node.js 24.21.0. Exact hashes,
full licenses (including embedded SuperSplat Viewer code) and the adapted Node
filesystem implementation's provenance ship under `sogs-tools/`. Those editor
tools are not copied into visitor websites. Conversion and runtime operation
need no installed Node or fetched application code.

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
until those comparisons run on real hardware. Validation evidence and the tested
experimental executable will be recorded below after integration checks finish.

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
  `test-output/radix-authoring-1793336391495/result.json`.
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
Portable packaging and the branch's first GitHub run are the final delivery
checks; their executable/run links will accompany the handoff. This remains an
experiment, not a claim of complete Spark API parity.

Clean-source local preview: `experimental-release/3DGS Perspectives Studio
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
remains current. The complete packaged workflow and repaired CI are being rerun.
