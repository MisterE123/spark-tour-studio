# Spark Tour performance preset format — version 1

A portable preset is a UTF-8 JSON file, conventionally `name.performance.json`:

```json
{"format":"spark-tour-performance-preset","version":1,"name":"My headset","settings":{"pixelRatio":1,"lodSplatScale":0.5,"maxSh":1}}
```

`preset.schema.json` is the JSON Schema (2020-12); `balanced.performance.json` is a complete example. The editor imports through the same runtime validator. Unsupported versions, unknown fields, wrong types, out-of-range values, blank names, and central angles larger than outer angles are rejected. Omitted settings use the defaults below. Names are trimmed, 1–80 characters. Presets contain settings only, never scripts or asset paths. Import is limited to 64 KiB.

| Setting | Range | Default | Meaning |
| --- | --- | --- | --- |
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

These values apply live without changing the scene or ending an XR session. Sort throttling and culling can introduce visible artifacts. Splat targets are not hard GPU-memory limits: the application retains an 8,388,608-splat paging pool. SH rendering limits do not promise reduced streamed file size. FPS is observed frame cadence, not GPU timing; compare presets on the actual capture/device.

## Tour storage and precedence

`config/tour.json` optionally contains `performance: {defaultPresetId, presets: [{id, name, settings}]}`. IDs are stable alphanumeric/underscore/hyphen strings and must be unique. There must be 1–100 presets and the default must exist. Old tours without this field get Balanced, Lightweight and High detail defaults. Project Save, Save As, recovery autosave, undo/redo and export preserve the library.

The tour default applies when the editor opens a project or the viewer loads a tour. Visitors may select any saved preset or make temporary advanced adjustments; these survive scene changes but do not rewrite the tour. The editor's draft controls are a live preview: Save preset commits them to the project; project Save writes them to disk. Export preset writes the current draft as a reusable file.

Exports include individual `performance/<id>.performance.json` files and this specification. These files are portable exchange copies, not a second source of configuration: edit `config/tour.json` or import a preset and re-export to change tour defaults. Importing creates a new ID and leaves the default unchanged. Deleting the default selects the first remaining preset; deleting the last preset is disabled.

Validated against Spark 2.3.1. The schema version tracks the preset contract, independently of the application or Spark release. Invalid data is reported rather than silently ignored.
