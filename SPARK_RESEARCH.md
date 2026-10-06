# Spark research for the virtual tour package

Researched September 25, 2026. This is a capability assessment and proposed architecture, not an implemented or benchmarked application.

## Verified release

The latest stable release is **@sparkjsdev/spark 2.2.0**, released September 11, 2026. Both GitHub releases and the npm `latest` tag agree. Its published peer dependency is Three.js >=0.180.0. Pin exact versions and use a lockfile for reproducible exports. [Release notes](https://github.com/sparkjsdev/spark/releases/tag/v2.2.0), [tagged package manifest](https://github.com/sparkjsdev/spark/blob/v2.2.0/package.json).

Relevant 2.2.0 changes include faster sorting, experimental faster LoD traversal, consolidated embedded WASM, and a fix for continued LoD fetching/decoding after scene changes. Reported performance improvements are configuration dependent, not promises for this tour. The release removes legacy renderer classes. Some older quick-start pages still reference `NewSparkRenderer`; implement against the pinned package's exports/types and current `SparkRenderer` API. [Release notes](https://github.com/sparkjsdev/spark/releases/tag/v2.2.0).

## Capability fit

| Requirement | Spark capability | Tour application work |
| --- | --- | --- |
| Large RAD scenes | Paged streaming and precomputed LoD | Asset validation, loading/error UI, source configuration |
| Multiple scenes | Multiple transformed SplatMesh objects | Scene graph, starting cameras, transitions, unloading policy |
| Floating bubbles | Coexists with Three.js objects; raycasting available | Bubble rendering, selection, content and scene-link actions |
| Desktop/mobile navigation | Keyboard, mouse, gamepad and multitouch controls | Accessible controls help, movement modes and settings |
| Immersive viewing | WebGL2/Three.js rendering with WebXR support | Session lifecycle, controller interaction and XR interface |
| Title screen and editor | Rendering primitives | All authoring UI, project persistence and export logic |
| Portable EXE and website | Browser runtime | Local HTTP launcher, folder export and hosting instructions |

Spark is the rendering foundation. Tour authoring, navigation rules and packaging are application features. [Overview](https://sparkjs.dev/docs/overview/), [controls](https://sparkjs.dev/docs/controls/), [SplatMesh](https://sparkjs.dev/docs/splat-mesh/).

Other available capabilities include procedural splats, shader modifiers, opacity/color changes, splat editing primitives and skeletal deformation. These could support future transitions or annotations but are not prerequisites for the first tour editor. [SplatMesh API](https://sparkjs.dev/docs/splat-mesh/).

## RAD streaming and memory

The intended loading path is `new SplatMesh({ url, paged: true })`. A prepared RAD already carries LoD; generating LoD in the browser is unnecessary. Spark supports both a monolithic RAD and a RAD header referencing separate RADC chunks. Preserve all referenced companion files and their relative paths. [LoD guide](https://sparkjs.dev/docs/lod-getting-started/).

Use platform-scaled detail budgets, with a user quality multiplier. Spark exposes LoD budgets and fixed foveation; extended precision is available for large-coordinate captures at additional memory cost. Prefer a local scene origin where practical. Dataset size does not equal the number of splats rendered simultaneously. [LoD guide](https://sparkjs.dev/docs/lod-getting-started/), [2.0 features](https://sparkjs.dev/docs/new-features-2.0/).

Recommended lifecycle: load the selected scene, show initialization progress, reveal it when usable, and dispose the previous scene. Make preloading optional and bounded. Avoid default crossfades that keep two large scenes resident on small devices.

For CDN hosting, monolithic RAD requests use HTTP byte ranges; ensure actual partial-content responses, not a server silently returning the entire file. Configure cross-origin access for the website. Chunk filenames resolve relative to the RAD URL. A signed query on a header URL does not automatically authenticate every sibling chunk; validate the chosen CDN authorization scheme. These conclusions follow from the tagged pager source. [SplatPager 2.2.0](https://github.com/sparkjsdev/spark/blob/v2.2.0/src/SplatPager.ts).

## LichtFeld interoperability

The user has successfully opened a LichtFeld RAD export in Spark's viewer. Accept this as confirmed interoperability for the tested export and proceed with RAD as the input format. Reuse that export as the first application regression fixture; do not treat general LichtFeld compatibility as a blocker. The exact viewer/exporter versions and whether that test exercised paged streaming were not specified.

Historical context only: closed issue #1310 reports incompatibilities in some earlier exports. Keep normal per-file loading diagnostics; no mandatory conversion step is warranted by the user's working workflow. [Historical compatibility report](https://github.com/MrNeRF/LichtFeld-Studio/issues/1310).

If validation fails, diagnose the exporter/version first. Spark's own offline build-lod tool is a fallback conversion route from a supported source format; it should not become an implicit conversion requirement inside the tour editor.

## Fully bundled runtime

All application runtime code can live inside the exported folder: viewer, optional editor, Spark, Three.js, UI dependencies, fonts, icons and any helper resources. Spark's tagged worker implementation imports an inline worker; 2.2.0 release notes confirm embedded WASM consolidation. Bundle installed dependencies locally instead of using CDN script imports. [Worker source](https://github.com/sparkjsdev/spark/blob/v2.2.0/src/SplatWorker.ts), [release notes](https://github.com/sparkjsdev/spark/releases/tag/v2.2.0).

Proposed export:

```text
Tour/
  Launch Tour.exe
  index.html
  editor.html             # optional
  assets/                 # bundled scripts, styles and runtime resources
  config/tour.json        # scenes, cameras, hotspots, settings
  config/hosting.json     # asset base URL and optional per-scene overrides
  splats/                 # RAD plus any RADC companions
  media/                  # local images, video, thumbnails
  pages/                  # one standalone HTML page per embed
  licenses/               # dependency notices
  README.txt
```

Proposed modes:

1. Portable: code, splats and media all local. Launcher serves the folder on loopback HTTP and opens a browser. No installed Node.js or Internet should be required by the finished launcher.
2. Hosted: upload the same web files to a static host with HTTPS and range support.
3. Hybrid: keep code on the website and change `assetBaseUrl` to a CDN. Absolute per-scene overrides permit mixed hosting without rebuilding JavaScript.

The launcher is a local server plus browser opener, not a bundled browser by default. Opening `index.html` through `file://` is not the supported execution path. An optional editor included in a hosted export edits a local working project and exports/downloads changes; persisting changes to a remote host requires a separate authenticated service.

Optional external embeds and remote splats still need their external services. An offline export should identify them and offer local media alternatives. Bundling the source project for future development can be a separate export option from bundling runnable code.

## WebXR and interaction

WebXR requires a compatible browser/device and secure context. Serve the public site over HTTPS. A headset accessing a PC's plain HTTP LAN address is different from localhost on that headset. Feature-detect immersive sessions and retain desktop/mobile viewing. [WebXR specification](https://www.w3.org/TR/webxr/).

Design bubbles as Three.js objects selectable by mouse, touch and controller ray. Each embed gets its own standalone local page, e.g. `pages/history.html`, and a page ID in the tour configuration. Desktop viewing opens it in a panel. XR viewing loads its supported content into an in-world page panel within the existing tour runtime. Page packaging and XR rendering are separate responsibilities.

Candidate for the page renderer: `three-html-render`, which provides HTML textures, a rasterization fallback and a WebXR VR example. It is a promising prototype dependency, not a verified general-purpose browser inside VR. Bundle a pinned version locally if adopted. Its documented fallback has CSS/input limitations, and actual headset scrolling, controller input, text entry and frame cost require testing. [Project documentation](https://github.com/repalash/three-html-render), [VR example](https://repalash.com/three-html-render/examples/webxr-vr.html).

Three.js `HTMLMesh` is another option for simple controlled content, documented primarily for rendering GUI elements onto a plane. It is not evidence of arbitrary webpage compatibility. [HTMLMesh](https://threejs.org/docs/pages/HTMLMesh.html).

Native HTML-in-Canvas remains experimental according to its proposal. It explicitly excludes cross-origin iframe content from readable rendering, including nested cross-origin frames inside a same-origin page. Consequently, wrapping an external embed in our own HTML page does not make that embed renderable as an XR texture. Same-origin authored content is the initial candidate; third-party embeds require an explicit supported provider path, a browser/DOM-overlay path where available, or a declared fallback. No universal cross-headset arbitrary-page viewer was verified by this research. [HTML-in-Canvas proposal](https://github.com/WICG/html-in-canvas#read-back-allowed-rendering), [DOM overlays specification](https://www.w3.org/TR/webxr-dom-overlays-1/).

### Persistent XR session: required architecture

Keep one top-level document, WebGL renderer, canvas, animation loop and XR session for the entire tour. Scene links dispatch internal scene-change actions; they never navigate the browser, call `session.end()`, request a replacement session or recreate the renderer. Replace the active scene group/SplatMesh and its hotspots, and move the camera rig to the destination entry pose while retaining headset tracking. Loading/fade/error panels stay inside the current session. [Three.js XR rendering model](https://threejs.org/manual/pages/how-to-create-vr-content.html).

Embed pages must not own a second XR session. Route their tour links through a defined message/action bridge to the parent viewer; validate the origin and sending window for cross-document messages. Closing a panel restores tour interaction without restarting XR. External page navigation cannot carry the same XRSession into a new document, so it must not be used for tour scene transitions.

Acceptance check: switch aerial -> exterior -> interior repeatedly and verify `renderer.xr.getSession()` retains object identity, no application-triggered `end` event occurs and no new permission/entry prompt appears. Keep this requirement even if the chosen HTML page renderer changes.

Spark's tagged raycasting implementation handles paged data using currently selected indices; it is not an all-resolution query of the entire remote capture. Use occasional splat picking for editor placement and lightweight bubble hit targets for continuous interaction. Provide position gizmos and numeric placement too. Collision-free walking requires an additional navigation/collision design; splat picking alone is not a physics system. [Tagged raycasting implementation](https://github.com/sparkjsdev/spark/blob/v2.2.0/src/SplatMesh.ts).

## Implementation and validation sequence

1. Use the user's successfully viewed LichtFeld export to verify the application's pinned Spark 2.2.0 paged loading path, including companion chunks if applicable.
2. Bundle a minimal viewer and verify a cold start with external Internet blocked and an empty browser cache.
3. Test range requests and cross-origin streaming with the intended host/CDN.
4. Add shared tour schema, scene lifecycle, desktop/mobile controls and hotspots.
5. Add editor scene setup, camera capture, hotspot placement/content, save/reopen and export.
6. Package the Windows launcher and test on a machine without developer tooling.
7. Prototype standalone embed pages with the candidate HTML renderer; test local content and representative third-party embeds separately.
8. Test real target headsets: entry/exit, controller selection, scene transitions within the same XRSession, page scrolling/input, content fallback and performance.

Research supports architectural feasibility, and the user reports a successful LichtFeld export test in Spark's viewer. Implementation and automated verification now exist in this workspace. See README.md and TEST_RESULTS.md for the delivered application and test evidence; real capture and headset acceptance remain manual.
