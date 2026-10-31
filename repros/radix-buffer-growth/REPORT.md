# Radix 0.0.1: synchronous scratch-buffer growth during sorting

Prepared for the Radix developers, 30 October 2026.

## Reproduced issue

Increasing the working count causes `WgpuSplatSorter.sort` to grow scratch
storage synchronously inside its sorting callback. A standalone synthetic
reproduction records a **73.4 ms** callback at five million keys, compared with
**0.9 ms** when the identical count is replayed on the same, already-grown sorter.

The page imports only unmodified Radix 0.0.1 and Three.js 0.186.1. It needs no
application, scene asset, streaming, physics or XR integration. The maximum-size
input texture is prepared and uploaded before timing; each sorter warms for five
seconds before the growth/replay comparison. Count readback is off.

| Sorter-only test | 5M growth callback | Same-sorter 5M replay maximum |
| --- | ---: | ---: |
| Allocation instrumentation on | 73.4 ms | 0.9 ms |
| Allocation instrumentation off | 74.0 ms | 0.9 ms |
| Fresh instrumented repeat | 73.2 ms | 0.6 ms |

The first two runs measure three seconds at each count; the independent repeat
measures one second. No CPU profiler runs in these sorter-only tests. Disabling
allocation wrappers preserves the hitch, so the wrapper is not its explanation.

## Directly measured allocation path

At the five-million transition, four key/value capacities grow from **3,600,000
to 7,200,000 elements**. In that same 73.4 ms callback, six native
`GPUDevice.createBuffer` calls total **47.9 ms**:

- Four mapped-at-creation key/value buffers of **28,800,000 bytes** each.
- A **14,064-byte** block-offset buffer.
- A **3,600,384-byte** histogram buffer.

The instrumented five-million replay records **zero buffer creations and zero
capacity growth**. Raw events include descriptors, synchronous durations, stacks
and capacity transitions. Smaller count transitions show increasing allocation
cost before the largest transition.

```text
WgpuSplatSorter.sort
  WgpuCompact.compact / WgpuRadixSort.sortIndirect
    WgpuComputeBatch.submit
      Three compute bindings / storage attributes
        WebGPUAttributeUtils.createAttribute
          GPUDevice.createBuffer
```

At Radix commit `e36742ee524a844ca79fbec8ea910d5598123690`:

- `src/wgpu/WgpuBuffer.ts`: `ensureCapacity` grows storage by doubling;
  `setCapacity` replaces its storage attribute and creates CPU typed-array backing.
- `src/wgpu/WgpuCompact.ts` and `src/wgpu/WgpuRadixSort.ts`: compaction and sorting
  request that capacity while executing the sort.
- Three's `WebGPUAttributeUtils.createAttribute` creates mapped GPU storage,
  copies the typed array and unmaps it.

A separate procedural `SplatRenderer` run also exercises this path with verified
visible splats. Its screenshot and CPU profile are supplementary evidence; the
unprofiled sorter-only controls above are the timing comparison.

## Reproduce

1. Serve the supplied folder on localhost. `node server.mjs` prints an available
   loopback address; any localhost static server works. No npm install is needed
   to run the bundled page.
2. Open it in a WebGPU-capable browser and keep it visible. Choose **Sorter only**,
   leave readback off, and use the default counts:
   `250000,750000,1750000,3600000,5000000`.
3. Run growth and replay. One persistent sorter processes both passes. Inspect
   the five-million callback, allocation events and capacity changes.
4. Download JSON, then repeat with allocation instrumentation disabled.

Start with smaller counts on constrained devices. The UI estimates storage,
excluding driver/pipeline overhead and temporary overlap of old/new allocations.
Runtime code, source, source maps, license notices and measured results are local.
The `source/` folder can be independently rebuilt using its pinned dependencies.

## Measurement scope

The fresh runs used Windows x64, an NVIDIA RTX 3090 (24 GiB), driver 610.88 and
Microsoft Edge 156.0.4314.50 with actual NVIDIA/Ampere WebGPU. Preflight found no
Studio, splat converter, compute helper or other diagnostic renderer. Normal
desktop/browser processes remained; ambient GPU utilization was 16–25%.
`evidence/synthetic/environment.json` and GPU samples record those conditions.

These are synchronous JavaScript/native-call wall times, not GPU execution
timestamps or a universal frame-rate claim. Native allocation cost depends on
Three, browser, driver and hardware. The demonstrated Radix issue is the placement
of substantial scratch growth on the synchronous sorting path: fixed input/count
replay removes those allocations and their callback spike. No claim is made that
Radix implements the native allocator or that these exact timings apply elsewhere.
All runs completed without page/GPU errors or external asset requests.

## Requested improvement

`SplatRenderer.prepare(camera)` already prepares the current collection before
drawing. The remaining case is future count growth as more splats become available.
Could `WgpuSplatSorter` expose capacity reservation independently of the current
collection, or could compute-generated scratch avoid large CPU backing arrays and
mapped copies? That would let streaming integrations move this measured cost out
of an interactive sorting callback.

The pinned Radix module is unchanged. Its SHA-256 is
`8633fa532e88358df44b907dc2d01d7cc6206c4f0fa5ceed7f56bf26161442e6`.
Dependency provenance and MIT notices accompany the reproduction.
