# Standalone Radix sort-capacity reproduction

This handoff investigates one performance issue: scratch-buffer capacity grows
synchronously inside Radix's sorting callback. It uses synthetic data and the
unmodified Radix and Three.js packages. No Studio project or splat asset is needed.
See `REPORT.md` for the measured growth-versus-replay evidence and source path.

## Run the supplied page

Serve this folder on localhost or HTTPS. With Node installed:

```powershell
node server.mjs
```

Open the printed address in a WebGPU-capable browser and keep the page visible.
Any localhost static server also works. Opening `index.html` as a file is
unsupported. Browser code, licenses and source maps are local; no installation,
CDN or automatic result upload is involved.

1. Choose **Sorter only**, keep readback off, and run the default counts.
2. The maximum-size key texture is prepared and uploaded before measurement.
   One persistent sorter warms at the smallest count for five seconds, then
   processes increasing counts.
3. The page replays the exact counts on that same, already-grown sorter.
   Compare synchronous callback times, capacity changes and native allocations.
4. Repeat with allocation instrumentation disabled. Download each JSON result.
5. **Full SplatRenderer** optionally tests the same path with procedural visible
   splats and projection/drawing. Use sorter-only to isolate scratch storage.

Default maximum is five million keys. Start smaller on constrained devices.
The UI estimates storage; driver/pipeline costs and overlap of old/new buffers
are additional. This is not an out-of-memory stress test.

The graph records animation-frame cadence and synchronous callback wall time,
not hardware GPU timestamps. Instrumentation and graph updates add overhead.
Stage-crossing intervals remain in raw data but are excluded from the new
stage's interval summary. Hidden tabs stop measurement. Readback is optional
and off by default; no queue-completion wait is inserted into the measured loop.

Optional URL parameters: `mode=sort|render`,
`counts=250000,750000,1750000,3600000,5000000`, `seconds=3`,
`instrument=0|1`, `readback=0|1`, `autorun=1`.

## Source, versions and licenses

- Radix **0.0.1**, published commit
  `e36742ee524a844ca79fbec8ea910d5598123690`, MIT. Module SHA-256:
  `8633fa532e88358df44b907dc2d01d7cc6206c4f0fa5ceed7f56bf26161442e6`.
- Three.js **0.186.1**, MIT.
- Notices and Radix provenance are in `licenses/`.

The handoff's `source/` is independently rebuildable: run `npm install` and
`npm run build` there. Exact dependency versions are pinned. The supplied
browser bundle needs neither command to run.

From a Studio source checkout with its dependencies installed, create a new
output folder:

```powershell
node repros/radix-buffer-growth/build.mjs test-output/radix-handoff-new --zip
```

Add `--evidence-dir <clean-standalone-results-directory>` to include the measured
standalone JSON, screenshots and optional profile. The builder uses an explicit
evidence-file allowlist and refuses a nonempty output folder so stale research
files cannot enter the handoff. Internal application investigations are excluded.
