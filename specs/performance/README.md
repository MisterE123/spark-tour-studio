# 3DGS Perspectives Studio performance preset format — version 1

A portable preset is a UTF-8 JSON file, conventionally `name.performance.json`:

```json
{"format":"spark-tour-performance-preset","version":1,"name":"My headset","settings":{"pixelRatio":1,"lodSplatScale":0.5,"maxSh":1}}
```

`preset.schema.json` is the JSON Schema (2020-12); `balanced.performance.json` is a complete example. The editor imports through the same runtime validator. Unsupported versions, unknown fields, wrong types, out-of-range values, blank names, and central angles larger than outer angles are rejected. Omitted settings use the defaults below. Names are trimmed, 1–80 characters. Presets contain settings only, never scripts or asset paths. Import is limited to 64 KiB.

| Setting | Range | Default | Meaning |
| --- | --- | --- | --- |
| adaptiveDetail | boolean | false | Opt in to temporary automatic detail reduction when visible frames stay slow. |
| adaptiveTargetFps | 30–60 | 60 | Desktop frame-rate goal; XR uses the session refresh rate or 72 FPS if unavailable. |
| pagedExtSplats | boolean | false | Use extended precision for the shared foreground/background streaming pool. 32 bytes per base splat instead of 16. |
| pixelRatio | 0.5–2 | 1.5 | Desktop pixel-density cap, additionally capped by device pixel ratio. Does not resize the XR framebuffer. |
| lodSplatCount | integer 0–8,000,000 | 0 | Base visible-splat target; 0 uses Spark's device defaults. |
| lodSplatScale | 0.25–2 | 1 | Multiplier on the base target. |
| lodRenderScale | 1–5 | 1 | Minimum LoD pixel size; higher reduces tiny detail. |
| maxSh | integer 0–3 | 3 | Maximum rendered spherical-harmonic color degree. Does not change the asset. |
| minSortIntervalMs | 0–200 | 0 | Minimum sorting interval in milliseconds. |
| sortRadial | boolean | true | Radial sorting; false uses depth sorting. |
| minPixelRadius | 0–3 | 0 | Cull tiny projected splats. |
| maxPixelRadius | 64–1024 | 512 | Limit large projected splats. |
| maxStdDev | 2–3 | sqrt(8) | Gaussian extent; lower reduces overdraw. |
| minAlpha | 0–0.1 | 0.5/255 | Opacity cutoff. |
| coneFov0 | 0–180 | 90 | Full-detail cone angle in degrees. |
| coneFov | 0–180 | 120 | Outer cone angle; must be >= coneFov0. Set both to 0 to disable angular foveation. |
| coneFoveate | 0.1–1 | 0.4 | Peripheral LoD detail fraction. |
| behindFoveate | 0.05–1 | 0.2 | Behind-view LoD detail fraction. |
| xrFoveation | 0–1 | 1 | XR compositor foveation; browser/headset may ignore this hint. |

Numeric settings apply live. Changing `pagedExtSplats` recreates Spark's streaming pool and reloads the current scene and its background, preserving the camera position, movement mode, and active WebXR session. The WebGL renderer and canvas are retained. The application keeps an 8,388,608-splat paging pool; extended precision uses more memory and bandwidth. Sort throttling and culling can introduce visible artifacts. Splat targets are not hard GPU-memory limits. SH rendering limits do not promise reduced streamed file size. FPS is observed frame cadence, not GPU timing; compare presets on the actual capture/device.

## Automatic detail adjustment

Automatic adjustment is off unless explicitly enabled in the editor or visitor settings. It temporarily scales the authored `lodSplatScale` between 25% and 100%, leaving the saved preset, source assets, SH degree, precision, render resolution, physics and XR session unchanged. The performance readout shows the current percentage. Disabling it or applying a preset restores the authored target immediately. This is a visible-splat target adjustment, not a memory-pool limit or a promise of reaching the requested frame rate.

Both adaptive fields are optional. When absent, the runtime uses off and 60 FPS without writing those defaults into project or preset JSON. Merely opening and saving a legacy project therefore preserves the older strict preset format. Enabling the option adds explicit metadata that requires a build supporting automatic detail; earlier releases reject those new fields. Turning it off in the controls removes both fields from the current settings. Update or remove any other saved presets that still contain adaptive metadata before reopening the project in an earlier release. The same compatibility condition applies to exported preset files and tour configuration.

Sampling begins only with a ready, visible scene containing rendered splats, after four seconds of settling. Loading covers, empty frames, hidden tabs, editor geometry work, transitions, content panels and XR focus loss do not count. Initial network waiting alone cannot lower detail. Continuous streaming does not disable adaptation: sustained slow frame cadence while detail arrives can still reduce work. This measures the overall viewing cadence rather than separating GPU, decoding and CPU costs.

Sustained frame times more than 20% above budget reduce the target by 25%, with at least five seconds between reductions. An isolated interval above 250 ms restarts sampling; three comparable slow intervals establish actual low cadence, so devices running at 2–3 FPS still receive help. Gaps above one second and inactive intervals restart sampling. Healthy cadence for six seconds permits a ten-percentage-point recovery without restarting the settling window; recovery never exceeds the authored target. A healthy new scene can recover from 25% to its full target in roughly 52 seconds. Scene or desktop/XR changes restart observation while retaining the device's current percentage. Desktop targets stop at 60 FPS so a normal 60 Hz display is not asked to reach 90 or 120 FPS. VR uses the headset's refresh rate and never resizes its framebuffer or changes tracking, locomotion, session identity, SH or precision. Test on actual target devices; lowering detail can soften fine foliage or distant surfaces, and cannot cure all fill-rate or CPU bottlenecks.

ExtSplats stores source coordinates as float32 rather than the compact pool's float16, reducing additional coordinate quantization while decoding RAD files. It cannot restore precision already lost when the source RAD was created. Spark's intermediate accumulator remains camera-relative and uses its normal compact encoding. See [Spark's precision and streaming documentation](https://sparkjs.dev/docs/lod-getting-started/#handling-huge-coordinates) and [ExtSplats encoding](https://sparkjs.dev/docs/ext-splats/).

## Tour storage and precedence

`config/tour.json` optionally contains `performance: {defaultPresetId, defaultSettings?, presets: [{id, name, settings}]}`. IDs are stable alphanumeric/underscore/hyphen strings and must be unique. There must be 1–100 presets and the default must exist. `defaultSettings`, when present, is a complete settings object validated with the same rules as preset settings. It overrides the selected preset for the tour without modifying that named snapshot. Old tours omit it and continue using the selected preset. Tours without `performance` get Balanced, Lightweight and High detail defaults. Project Save, Save As, recovery autosave, undo/redo and export preserve the library and custom adjustments.

The resolved tour settings apply when the editor opens a project or the viewer loads a tour. Visitors may select any saved preset or make temporary advanced adjustments; these survive scene changes but do not rewrite the tour. Editor tuning controls immediately update `defaultSettings`; normal project Save writes them to disk. Selecting a named preset sets `defaultPresetId` and clears `defaultSettings`. Save preset updates the selected named snapshot; Save as new preset creates and selects a new snapshot. Both clear `defaultSettings` because the selected preset now contains the current settings. Export preset writes the current settings as a reusable file.

Exports include individual `performance/<id>.performance.json` files, the resolved tour settings at `performance/active/preset.performance.json`, and this specification. The active copy uses a subdirectory so it cannot conflict with any named preset ID. These files are portable exchange copies, not a second source of configuration: edit `config/tour.json` or import a preset and re-export to change tour defaults. Importing creates and selects a new ID. Deleting the selected preset clears custom adjustments and selects the first remaining preset; deleting the last preset is disabled.

The stable runtime integration uses Spark 2.4.0. The schema version tracks the preset contract, independently of the application or renderer release. Invalid data is reported rather than silently ignored.

## Experimental Radix settings

The `Experiemental-Radix-SOGS` branch preserves the fields above and adds an optional `settings.radix` object. The experiment applies the shared `pixelRatio`, `maxSh`, `minPixelRadius`, `maxPixelRadius`, `maxStdDev`, `minAlpha`, `xrFoveation` and automatic-adjustment fields. Spark-specific tuning remains stored, but is not reinterpreted as Radix tuning. A project without the namespace uses Radix defaults in memory; merely opening and saving it does not add those defaults. Older stable versions that do not know the namespace reject presets containing it.

`radix.schema.json` describes this block; `radix-balanced.performance.json` is a complete exchange example. Angles are degrees. Distances use the normalized scene's meters; the backend converts distance thresholds into each asset's local units. Named presets, custom tour adjustments, Save, recovery, Undo and portable export all use the existing preset library and exchange format.

| Radix setting | Default | Meaning |
| --- | --- | --- |
| method | ewa | Projection method: ewa, 3dgut, htgs or raygs. |
| sortBits | 24 | Sort key precision: 16, 24 or 32 bits. |
| sortMode | auto | GPU sorting on WebGPU; CPU worker sorting on the WebGL2 fallback. Explicit cpu/gpu choices are also accepted. |
| autoSortDistance / autoSortAngle | 0.05 / 5 | CPU sort movement and turning thresholds. GPU sorting runs each frame. |
| selectedSplatBudget | 4,000,000 | Selected splats per asset, independent of saved Spark detail targets. A foreground and a splat background each receive this budget. |
| residentSplatBudget | 16,000,000 | Retained splat-data target per asset; must be at least the selected budget. Required coarse coverage, textures and pending work also consume memory. |
| lodBudgetMode | limit | limit uses distance thresholds and a budget cap; target raises detail toward the cap. |
| lodBaseDistance / lodMultiplier | 5 / 3 | Detail transition distance and the factor between successive levels (multiplier range 1.2–10). |
| lodRangeMin / lodRangeMax | 0 / 7 | Finest/coarsest allowed levels, clamped to the source's available levels. The minimum cannot exceed the maximum. |
| lodBehindPenalty | 2 | Increased effective distance behind the camera. |
| lodUnderfill | 5 | Coarser resident levels usable while selected data loads. |
| lodUpdateDistance / lodUpdateAngle | 0.5 / 90 | Camera movement/turn needed to reconsider selected levels. |
| minContribution | 0 | EWA projected opacity-area culling threshold; 0 disables it. |
| blurAmount / preBlurAmount | 0.3 / 0 | Pixel-area antialiasing blur and additional pre-blur. |
| sortGuard | 0 | CPU sort view margin; 0 keeps all splats in its sort. |
| xrResolutionScale | 1 | Eye-buffer resolution factor, applied at the next XR session start. |

Automatic detail temporarily scales each asset's effective Radix selected budget between 25% and 100%, preserving saved settings and resident limits. The readout totals visible draw/sort splats, supplied fallback splats, selected detail and resident splats across the active foreground and background, and reports the actual WebGPU/WebGL2 backend. None of these counts is a byte-memory limit. Source compression, network waiting and steady frame cadence are different measurements; renderer replacement alone does not establish a speedup on a device.
