# Standalone Radix buffer-growth reproduction

This is a synthetic developer reproduction, separate from Studio. It contains no tour, SOG adapter, imported asset, application worker, collision system or WebXR. Nothing is uploaded. It exercises the pinned, unmodified published Radix module and Three.js.

Dependencies:

- `@sparkjsdev/radix` 0.0.1, published commit `e36742ee524a844ca79fbec8ea910d5598123690`, MIT. The shipped module SHA-256 is `8633fa532e88358df44b907dc2d01d7cc6206c4f0fa5ceed7f56bf26161442e6`.
- Three.js 0.186.1, MIT.
- The built folder includes both license notices and Radix provenance. Runtime code is bundled locally; no CDN or installation is used by the browser.

## Build and run

From the Studio source checkout with its pinned dependencies installed:

```powershell
node repros/radix-buffer-growth/build.mjs
node test-output/radix-buffer-growth-standalone/server.mjs
```

Add `--zip` to the build command to produce a sibling ZIP with the runnable offline page, readable source, source map, dependency versions and license notices. In that handoff ZIP, `source/` is independently rebuildable: run `npm install` then `npm run build` there to replace the parent `app.js` bundle using exactly Radix 0.0.1 and Three 0.186.1. The bundled page itself requires no package installation or network access.

For a measured handoff, `--evidence-dir <prepared-results-directory>` also includes the synthetic raw results, screenshots and compressed CPU profile. The tracked sanitized North integration summary is included regardless; private tour files and the original full integration trace are never bundled.

Open the loopback address printed by the server in a WebGPU-capable browser. A static server on localhost or HTTPS also works. Opening `index.html` directly as a file is unsupported. The built folder is standalone; Node is only one convenient server, not a browser runtime dependency. No Studio process needs to be stopped or launched.

## Procedure

1. Close unrelated GPU workloads for a clean run. Keep this tab visible. Record the browser, GPU and driver. An active splat converter can independently cause contention.
2. Run the default **Sorter only** mode. The maximum-size input key texture is uploaded before measurement. One persistent `WgpuSplatSorter` warms at the smallest count for five seconds, then receives increasing counts. The exact sequence is replayed on the same sorter after its capacity is large enough. No per-frame GPU readback or `queue.onSubmittedWorkDone()` is used inside the measured loop.
3. Compare the first pass's callback spikes, `createBuffer` events and `bufferCapacity` events with the fixed-capacity replay. Download the JSON. Repeating a run constructs a fresh sorter; the device/pipeline caches may remain warm.
4. Repeat with instrumentation disabled. Wrappers and event recording add CPU work, so instrumented timings are diagnostic rather than a zero-overhead benchmark.
5. Run **Full SplatRenderer** mode to include projection-texture growth and actual draws. Counts use prebuilt collections and one procedural generator; count switches do not create splat source arrays or upload files. The fixed camera and tiny splats limit fill-rate costs. This mode changes more than sort storage, so use sorter-only to isolate that path.
6. The optional **Read visible count once per second** control is off by default. Enable it in a separate run to match the application's periodic count readback. Readback completion latency is logged separately and is not a GPU timestamp. The bare reproduction never calls a count readback unless this option is enabled.

Default maximum is 5,000,000 splats. The page estimates memory before starting. Four uint32 compact/radix arrays retain CPU typed-array backing as well as GPU buffers. Capacity doubling and deferred destruction can make old and new allocations overlap; browser, pipeline and driver memory are additional. Lower counts on constrained devices. This is a performance diagnostic, not a stress-until-device-loss test.

The graph records raw animation-frame intervals and synchronous sort/render callback duration. The JSON contains count changes, per-stage summaries, optional buffer allocation descriptors/durations/stacks, capacity transitions and the full raw cadence. The first interval crossing a stage boundary stays in raw data with `previousStage` but is excluded from the new stage's interval summary. Graph/table updates happen outside the measured callback and can affect overall cadence. It does **not** report GPU timestamp duration. A long frame interval with a short CPU callback cannot by itself be blamed on buffer allocation. Hidden tabs stop the run to avoid misleading samples. Five seconds of smallest-count shader warm-up are excluded from the comparison, but an unusually slow compilation could still outlast it; inspect the trace.

Optional URL parameters: `mode=sort|render`, `counts=250000,750000,1750000,3600000,5000000`, `seconds=3`, `instrument=0|1`, `readback=0|1`, `autorun=1`. There is no timing delay or device spoofing in the page. The warm-up and stage durations only choose how long to measure normal rendering at each count.

## Original observation and attribution limits

The isolated hardware check on the same machine reproduced this without the application. At a 5,000,000-count switch, compact/sort capacities grew from 3,600,000 to 7,200,000. Four 28,800,000-byte mapped-at-creation buffers were allocated inside a 70.1 ms sorter callback; native `createBuffer` calls totaled 46.1 ms. The exact 5,000,000-count replay had no allocation/growth and a maximum 0.4 ms callback. With allocation wrappers disabled, the growth callback was 67.3 ms versus 0.5 ms on replay. Full procedural SplatRenderer with visible splats reproduced a 73.0 ms callback versus 0.7 ms on the five-million replay. These are callback wall times, not GPU execution times; the concurrent user Studio/import was left running. See REPORT.md and the accompanying synthetic evidence.

An actual North Graveyard view in Studio on Edge 156 / NVIDIA RTX 3090 produced a 116.1 ms synchronous rendering callback during refinement. Sampled CPU stacks within that interval attributed about 60 ms to native `GPUDevice.createBuffer` and 27 ms to Three's `WebGPUAttributeUtils.createAttribute` itself. The call ancestry was:

```text
SplatRenderer.update
  WgpuSplatSorter.sort
    WgpuCompact.compact / WgpuRadixSort.sortIndirect
      WgpuComputeBatch.submit
        Three Renderer.compute -> compute bindings -> attributes
          WebGPUAttributeUtils.createAttribute
            GPUDevice.createBuffer
```

This is sampled attribution with approximate profile/frame clock alignment, not exact nested wall-clock timing. The original capture did not record capacity before/after, so it established the allocation path but did not prove a particular doubling threshold. Other large frame gaps in the same capture had short CPU callbacks and mostly idle sampled CPU; they are not explained by this stack. The synthetic page is intended to test the narrower growth hypothesis without Studio or SOG.

Relevant published Radix source locations at the pinned commit:

- `src/wgpu/WgpuBuffer.ts:79` replaces a storage attribute during `setCapacity`; `:102` doubles `ensureCapacity`; `:176` creates a CPU typed array for the new `StorageBufferAttribute`.
- `src/wgpu/WgpuCompact.ts:122` grows compact keys, values and block offsets.
- `src/wgpu/WgpuRadixSort.ts:110` grows scratch keys, values and histograms.
- `src/wgpu/WgpuSplatSorter.ts:64` invokes compaction and radix sorting.
- `src/render/SplatProjector.ts:118` grows projected arrays in the full renderer path.

Three.js `src/renderers/webgpu/utils/WebGPUAttributeUtils.js:164–172` creates a buffer mapped at creation, copies the CPU typed array into it, then unmaps. The downstream native driver may account for part of its cost. These observations do not establish a Radix correctness bug, nor that every stutter has this cause. A useful upstream question is whether sort scratch can be reserved/warmed outside an interactive frame, or allocated without large zero-filled CPU arrays and mapped copies.
