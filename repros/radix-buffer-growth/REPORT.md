# WebGPU sorting-buffer growth can stall an interactive frame

Prepared for the Radix developers, 30 October 2026. This is a performance
investigation against a pinned preview, not a claim of a renderer correctness
failure or a diagnosis of every reported stutter.

## What is reproducible

A standalone page exercises the unmodified published Radix **0.0.1** and Three.js
**0.186.1**, using synthetic data. An isolated hardware run reproduced a
**70.1 ms synchronous sorting callback** without Studio, SOG decoding, network
streaming, physics, WebXR, or per-frame GPU readback. The final run records and
growth-versus-replay comparison accompany this report in `evidence/`.

At the 5,000,000-key switch, the compact and radix buffers grew from 3,600,000
to 7,200,000 elements. Four **28,800,000-byte** buffers were created with
`mappedAtCreation: true`. Their native `createBuffer` calls totaled **46.1 ms**
inside that 70.1 ms callback. Exact replay at five million used the same sorter,
created no buffers, grew no capacity, and had a maximum **0.4 ms** callback.

With the allocation wrappers disabled, growth still produced **67.3 ms**,
versus **0.5 ms** on the five-million replay. Full procedural SplatRenderer with
visible splats produced **73.0 ms**, versus **0.7 ms** on its five-million replay.
A separate low-count check confirmed a positive GPU visible count and actual
rendered pixels. The synchronous allocation hitch is therefore independently
reproduced through the upstream sorter APIs. This does not establish that the
separate GPU-idle waits below have the same cause, or promise these timings on
other hardware.

The integration originally exposed 71.2 ms and 143.2 ms rendering callbacks as
progressively refined splats arrived. A separate run recorded 116.1 ms, with
sampled ancestry through Radix sorting scratch allocation, Three's storage
attribute creation, and native `GPUDevice.createBuffer`. These samples identify
an allocation path; they are not exact nested wall-clock measurements and did
not record the original buffer capacities.

## Minimal reproduction

1. Serve the supplied standalone folder on localhost. With Node installed,
   `node server.mjs` prints an available loopback address. Any localhost static
   server also works. No npm install, CDN, Studio project or splat asset is
   needed to run the built page.
2. Keep the page visible in a WebGPU-capable browser. Record GPU, driver and
   browser versions. For a clean measurement, close unrelated GPU workloads.
3. Choose **Sorter only** and run the default increasing-count sequence. Input
   keys are prepared and uploaded before timing. One persistent sorter warms
   at the smallest count for five seconds, then processes increasing counts.
4. Inspect count transitions, synchronous callback times, buffer capacities and
   individual native buffer allocation times. The page automatically repeats
   the same counts on the same already-grown sorter as its replay control.
5. Download JSON. Repeat with instrumentation disabled. Optionally capture a
   browser Performance trace during a fresh run.
6. **Full SplatRenderer** adds projection and actual draws using one persistent
   procedural generator and prebuilt collections. The optional 1 Hz visible
   count readback is disabled by default; test it separately if relevant.

Start with smaller counts on constrained devices. The default ceiling is five
million; the UI estimates storage, excluding driver/pipeline costs and temporary
overlap of old and new allocations. This is not an out-of-memory stress test.

## Relevant path in the pinned source

```text
SplatRenderer.update
  WgpuSplatSorter.sort
    WgpuCompact.compact / WgpuRadixSort.sortIndirect
      WgpuComputeBatch.submit
        Three compute bindings / attributes
          WebGPUAttributeUtils.createAttribute
            GPUDevice.createBuffer
```

At published commit `e36742ee524a844ca79fbec8ea910d5598123690`:

- `src/wgpu/WgpuBuffer.ts`: capacity growth replaces `StorageBufferAttribute`,
  doubles its capacity, and creates a new CPU typed array.
- `src/wgpu/WgpuCompact.ts` and `src/wgpu/WgpuRadixSort.ts`: compact keys,
  values, block offsets and sort scratch grow with the working count.
- Three's `WebGPUAttributeUtils.createAttribute` creates a mapped buffer,
  copies its typed array and unmaps it.

The bundled provenance records the exact upstream archive, commits and hashes.
Published Radix and Three files are not patched by this reproduction.

## Environment and measurement limits

Observed on Windows x64, NVIDIA RTX 3090 (24 GiB), driver 610.88, with actual
hardware WebGPU in Microsoft Edge 156.0.4314.50. The separate native Studio
capture used packaged Electron 44.4.5. A clean follow-up directly verified
Chromium **152.0.7977.130** in that pinned Electron package; the original trace
did not itself record the version. It is separate from the Edge build.

The user's running Studio and GPU-preferred conversion were deliberately left
running. Integration tests that added a second full scene reached 98–99% total
GPU utilization; therefore those frame-rate totals are **not** a clean renderer
benchmark. The standalone reproduction removes application dependencies but
cannot remove that concurrent workload without interrupting the user's import.
Its JSON records the measured allocation and callback durations. The later clean
follow-ups below investigate the separate long waits after conversion ended;
they do not replace the original synthetic allocation measurements.

The isolated integration browser requested a pixel-ratio cap of two, but its
context device scale was one: the inferred original backing is **1280 × 720**,
not 2560 × 1440. Clean runs directly recorded that texture size. The native
editor follow-up directly recorded a **1520 × 935** drawing buffer at DPR one.
These are different viewport/browser/UI conditions, not an identical FPS
comparison between Edge and Electron.

Instrumentation forwards original calls and records synchronous wall time.
It adds overhead; use the uninstrumented control and raw browser trace too.
The graph measures animation-frame cadence, not GPU timestamp duration. A
stage-boundary interval spans the previous frame, and UI updates outside the
callback timer can affect cadence. Correlated callback and allocation events
are stronger attribution evidence than an isolated frame-gap peak.

## A separate symptom remains unexplained

The original native capture recorded long gaps without an extra diagnostic
viewer. In the segmented Walk interval, the worst gap was **250.812 ms**, while
the maximum rendering callback was **12.821 ms**. CPU samples during the worst
gap were mostly idle; overlapping long `CrGpuMain` tasks belong to Chromium's
GPU process. Those task durations are **not hardware GPU timestamps**.

This evidence cannot distinguish Radix queue behavior, browser/driver pacing or
contention from the simultaneous conversion. Sampled periodic visible-count
readbacks did not establish a correlation with the worst gap clusters. It would
be premature to attribute these waits to Radix or claim the buffer-growth
finding explains them.

The native trace began at 20:57:58.721 UTC on 30 October and lasted 140.525 s.
A separately recorded 20,274,227-splat SOG conversion used WebGPU on the same
RTX 3090 with no CPU fallback. Its output directory was created at approximately
20:27:36 UTC and its completion report was written at 21:30:37 UTC. These bound
the recorded conversion job around the capture; its log lacks wall-clock stage
timestamps, so it cannot establish which GPU work coincided with individual gaps.

### Follow-up after conversion finished

With both the user's converter and Studio closed, the same scene and saved
Radix settings were tested using one separately owned renderer at a time.

| Clean test | Duration | Worst frame interval | Intervals over 100 ms |
| --- | ---: | ---: | ---: |
| Minimal runtime, normal 1 Hz count readback | 120 s | 50.0 ms | 0 |
| Same runtime, actual count readback bypassed | 120 s | 66.7 ms | 0 |
| Full packaged Electron editor, normal glass UI and readback | 150 s | 66.6 ms | 0 |

Both minimal-runtime epochs include 60 seconds stationary and 60 seconds of
held-key walking. Their stationary camera and selected count match; their
walking routes diverge slightly at collisions. That helper used default walking
height/step settings rather than the authored settings, so it is a readback
comparison, not an exact native navigation reproduction. The native editor test
uses the authored **1.45 m** height and **0.52 m** step, with 60 seconds stationary,
60 seconds walking and 30 seconds stationary afterward. Its maximum walking
interval was **50.0 ms** and maximum rendering callback **14.7 ms**.

Readbacks completed asynchronously in up to 88.8 ms in the minimal runtime and
63.7 ms in Electron without comparable frame stalls. Disabling readback did not
improve the measured worst interval. All three tests used warmed sorting
capacity; no scratch growth occurred in their measured windows. No page/GPU
errors occurred, and the original project metadata remained unchanged.

The roughly 250 ms idle-main waits were **not reproduced** in these bounded clean
tests. This weakens periodic count readback, warm walking physics, and the normal
Electron/glass UI alone as explanations. Shared-GPU conversion contention remains
a plausible explanation for the original capture, but removing several conditions
at once is not a causal proof. In particular, the clean editor includes later
application changes (`de76b6f4` versus original `29c38edf`); the pinned Radix module
is unchanged. This is not a claim that the intermittent problem is fixed or that
the 70 ms allocation hitch accounts for it.

A further native-editor test used the same fixed walking position and gentle
±0.12 rad turning motion with a 30-second period throughout three 60-second
windows. The middle window added an independent, precompiled WebGPU compute
helper on the same card: 8 MiB preallocated storage, about 5.2 ms per calibrated
GPU dispatch, three dispatches per awaited batch, and 3 s on / 2 s off pulses.
Only one helper batch was outstanding at a time. Trace transfer occurred outside
the measured windows; the raw frame data and input/lifecycle events were saved
incrementally. No unexpected input or horizontal camera drift occurred.

| Native turning-view window | Frame interval p95 | Worst interval | Over 100 ms |
| --- | ---: | ---: | ---: |
| No external compute | 16.8 ms | 33.5 ms | 0 |
| Pulsed bounded compute | 33.2 ms | 66.6 ms | 0 |
| No external compute, recovery | 16.8 ms | 49.9 ms | 0 |

This produced ordinary cadence degradation and recovery, **not** the original
250 ms wait. It does not exonerate the actual converter: preallocated arithmetic
does not reproduce its allocations, uploads, memory pressure or queue depth.
A separate approximately 10-second CPU/file audit read may overlap the baseline
or load period; its exact invocation time was not logged. All measured rows are
retained, with no post-hoc removal. Each window covers two turning cycles, but
the continuous motion can begin at a different angle after trace transfer. This
is an actively turning stationary Walk test, not a walking or teleport route.
The final comparison therefore narrows the tested conditions without identifying
the historical wait's exact cause. An earlier recording interrupted by confirmed
user interaction was excluded from outcome evidence.

One other integration hitch was application-owned: authored Viewpoint Preview
could prepare and step collision geometry unnecessarily. That path has been
corrected separately. Warm physical queries remained much shorter in the
measured walking routes. Neither belongs in the minimal renderer reproduction.

## Questions for upstream

- Is there a supported way to reserve sorter scratch capacity before an
  interactive frame, or warm it under a loading cover?
- Could scratch storage avoid large zero-filled CPU backing arrays and mapped
  copies when its contents are generated entirely by compute?
- Can capacity growth be scheduled incrementally, or exposed through an API
  that lets a streaming integration prepare for a larger collection?

The small reproduction, raw results, source and MIT dependency notices can be
shared independently of the user's tour. No upstream issue has been submitted.
The report/reproduction source is part of the project's Git history; private
tour assets and full integration traces are excluded from the handoff.
