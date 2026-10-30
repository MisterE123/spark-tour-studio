# Radix experiment rendering adapter

This adapter uses **Radix 0.0.1**, an MIT-licensed preview by **World Labs Technologies, Inc.** The full upstream license is preserved in [vendor/LICENSE](vendor/LICENSE). It must also accompany the packaged Studio and every exported website through their dependency notices.

## What comes from upstream

- `vendor/radix.module.js`, `vendor/radix-core.module.js` and `vendor/types/` are unmodified files from the published `@sparkjsdev/radix@0.0.1` npm archive. The two adjacent `.d.ts` entry files are local type-resolution glue. CPU SOG decoding imports the DOM-free core entry, including in collision workers.
- `sog/{sog,webp,zip,sh,resident,gpuDecode,lod,lodStream}.ts` are adapted from the **example code**, not a published SOG loading API, at [sparkjsdev/radix commit b831cc5e98b52a83b6f0ac6ba5fc50b5ac883be1](https://github.com/sparkjsdev/radix/tree/b831cc5e98b52a83b6f0ac6ba5fc50b5ac883be1/examples/sogs). Every adapted file identifies that source and its MIT copyright.
- [vendor/PROVENANCE.json](vendor/PROVENANCE.json) records package/source commits, the official archive, its integrity and SHA-256, the exact distribution hash, and hashes of the original example files. The npm package commit differs from the example commit only in documentation/package metadata.

Local adaptations replace external imports with the pinned distribution, validate metadata and ranges, propagate cancellation, retain/release GPU resources, bound queued image preparation, retry streaming failures, report initial coverage failures, and apply the editor's source-local selection tint. Updating upstream means comparing those explicitly preserved adaptations rather than replacing the folder blindly.

`index.ts`, `surface-proxy.ts` and `../backend.ts` are application integration code. They retain the application's navigation, physics, annotations and authoring model outside the renderer boundary.

## Integration contract

`await createRadixBackend()` creates one initialized Three `WebGPURenderer` and one splat renderer. Add `backend.node` to the primary scene. The backend owns both and disposes them, its worker pool, and its canvas. Call `backend.update(camera,time)` before the primary scene render and `backend.markRendered()` immediately afterward.

`backend.createAsset(url,options)` returns an ordinary `SplatAssetGroup` immediately. Set its authored transform and **attach it before awaiting `initialized`**. Its initialization promise waits for valid metadata and initial coarse LoD coverage; frame updates must continue while loading. `hasPresented(asset)` independently confirms that this backend has drawn the asset, including the applied collection on the CPU-sort fallback. A scene switch replaces assets without replacing the backend, renderer, animation loop or XR session.

Assets expose local `bounds`, `stats`, `setMaxSh`, `invalidateTransform`, `setSelection`, `retry` and `dispose`. Initial failures reject `initialized`. Later detail failures call `onError`; they retain the coarse scene and can retry within the same document. An asset's optional `AbortSignal` cancels requests and invalidates pending results. `dispose` is idempotent.

All attached splat assets share one combined collection. On the WebGL2 CPU-sort fallback, the LoD stream waits for the previous combined collection's sort to land before advancing, so a moving camera cannot indefinitely outrun newly selected detail. Reference-counted `release` callbacks keep old sort collections valid until retired.

In stereo, the private shared head is the midpoint of the actual tracked eyes. Three's union-frustum camera is offset behind that point, so the adapter passes a private camera to Radix for LoD, projection and sorting while leaving the tracked eye matrices and camera rig unchanged. Before temporary decoder textures are disposed, the WebGL fallback clears the decoder's 2D/array texture bindings through the pinned Three backend's texture-state methods. This keeps the binding cache coherent with Radix's raw texture readbacks without resetting XR's framebuffer or other render state. Those compatibility methods must be reviewed when Three is updated.

Two compatibility details are backed by regression cases rather than assumed renderer parity:

- Three's stereo union/culling camera was 32 mm behind the actual eye midpoint in the measured test. Correcting only the LoD camera would leave Radix projection and its shared sort offset, so the adapter supplies the same physical-head proxy to all three. `scripts/radix-xr-check.mjs` observes the real internal Radix camera transform as well as the LoD head and verifies that the original stereo eyes, renderer, session and sort view retain their identity through navigation and scene changes. Its hardware boundary is simulated.
- WebGL can bind a 2D texture and an array texture simultaneously on one unit, while the pinned Three fallback's cache remembers only its most recent target for that unit. Deleting a decoder array table can therefore leave a hidden stale binding that Radix's raw readback subsequently restores. The adapter clears both targets on each decoder-capable unit **before** deletion, updating Three's texture cache and restoring the previously active unit. It deliberately preserves framebuffers, draw buffers, viewport and other XR state. A full `renderer.resetState()` is unsuitable here: the live-XR regression demonstrated new draw-buffer errors from resetting its external framebuffer. Strict browser and native checks reject deleted-texture binds and graphics validation errors.

## Current experiment limits

- SOG v2 `.sog`, SOGS v1 ZIP, unbundled `meta.json`, and streamed `lod-meta.json` are supported. RAD scene import is intentionally disabled even though the underlying library has a nonpaged RAD codec.
- Selected/resident LoD budgets are **per asset**. A foreground scene and splat background can each consume their budget. Statistics sum both. LoD distance settings are normalized scene meters and are converted to source-local units for transformed assets.
- Pending LoD preparation is limited to four file jobs and an estimated 128 MiB of decoded channel images. A single oversized chunk is rejected with an instruction to export smaller chunks. Existing resident resources remain alive while an old CPU sort uses them.
- Radix has no public splat raycast API. Surface picking uses an approximate ellipsoid proxy sampled from coarse resident coverage, with at most 12,000 splats per asset. Walking uses the actual collision mesh. This approximation is not a source of full-resolution collision geometry.
- WebGPU uses a GPU sort; the WebGL2 fallback uses a worker sort. Backend reporting states which path is active. On an immersive-capable browser without `XRGPUBinding`, automatic selection retains the WebGL2 path so XR can use the same renderer. A desktop browser can still choose WebGPU without that XR binding.
- Upstream WebGPU XR is a preview and has not been verified by its authors on headset hardware. Physical headset behavior and performance require testing. The adapter forwards the requested XR projection-layer scale; it does not modify the headset or browser settings.
- The renderer uses `directCanvas:false` for standard Three mesh/UI color handling. No renderer benchmark is a promise of higher frame rate, loading speed, or visible detail on a particular device.

Runtime code, workers, shaders and this license are bundled locally. No CDN dependency is required by the adapter.

## Regression checks

Run `node scripts/radix-backend-check.mjs` after preparing the bundled SOG conversion tools. The check creates a real Gaussian PLY, converts it to three streamed SOG levels, and exercises actual rendering, visible selection tint with stable shader programs, transformed coarse picking, world-meter LoD distances, first-draw readiness, scene continuity, failed initial coverage/retry, canceled image requests, resource disposal and synthetic stereo. Its default software graphics run records a WebGPU fallback honestly. Set `RADIX_BACKEND_HARDWARE=1` to allow the machine's hardware adapter; inspect the recorded **actual** backend and adapter information.

Graphics allocation/deletion instrumentation belongs only to this fixture. Product code contains no artificial network delay, test graphics hooks or device configuration changes. Synthetic stereo is not physical headset validation, and these functional checks are not frame-rate or image-quality benchmarks.
