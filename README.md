# Spark Tour Studio

Windows authoring application and a shared Spark 2.3.1 / Three.js web viewer. Exported tours include a website, editable JSON, locally bundled runtime code, and a Windows launcher.

## Run

Use the portable editor EXE in `release/`, or develop with Node.js 24 on Windows:

```powershell
npm ci
npm run build
npm run launcher
npm run bundle:collision
npm run editor
```

`npm run package` builds the web application, unsigned Node SEA launcher, and portable Electron editor. Building may download Electron and packaging tools. The resulting applications do not require Node.js on the visitor's machine. The tour launcher is approximately 94 MB because it includes its own Node runtime.

For web development, `npm run dev` serves the viewer. The desktop editor uses the production build; run `npm run build` before reopening it. `editor.html` in a regular browser explains how to launch the desktop application.

## Author a tour

1. **New**: choose an empty project directory, or **Open** an existing project/export folder.
2. **Add RAD scene**: pick a LichtFeld `.rad`, or add a hosted scene and replace its URL. Local imports reference their original files during editing.
3. Adjust scene orientation/scale under **Splat transform**. Tour coordinates use meters and Y-up. Set names, thumbnails, allowed modes and entry views. **Scene → Background** offers Solid color, Equirectangular panorama and Gaussian splat.
4. Drag to look, use Free Fly and WASD/Q/E to position the camera, then **Capture viewpoint**. Use the Views tab to rename, reorder, duplicate, update or delete viewpoints. Thumbnails are captured with each saved camera view.
5. For Walk, import a collision GLB or choose **Generate collision mesh…** and select the matching source PLY. The bundled splat-transform 3.7.0 runs locally on your GPU and creates a smooth collision surface; no separate installation is needed. RAD input is not supported by that tool. Large PLYs are first simplified into a temporary collision-only copy (2 million splats by default, or 8 million for Detailed), avoiding oversized GPU buffers. The original stays unchanged; simplified collisions can lose fine details. Choose 8, 15 or 30 cm surface detail, inspect the wireframe, set a walking start above a clear floor, then enable Walk. The generated mesh shares Spark's PLY coordinates and follows the scene transform. This is surface reconstruction, not automatic scene cleanup: openings, noisy captures and incomplete floors may need external repair.
6. Use **Place bubble** or **Bubble ahead**, then choose **Content** as its bubble type. The bubble label also supplies its popup title. Edit text, images, links and embeds directly in the Bubble inspector, or import HTML. Each new content bubble starts with its own content. Image blocks, the tour cover and scene thumbnail accept drag-and-drop, a native file chooser, or a URL/project path. Dropped images are copied into the project. Put custom pages and their dependencies in a dedicated folder: the importer includes the containing folder during export.
7. Other bubble types change scenes or go to viewpoints. Refine positions with the gizmo or inspector. Surface picking uses the currently available splat detail. Existing content can be copied from the bubble inspector; older tours remain compatible.
8. Preview, validate under **Hosting & validation**, save, then export to an empty folder outside the project.

Undo/redo covers tour edits. Autosave recovery is offered when reopening a project. Original assets are not deleted when removing scenes. Relink missing assets in the scene/content inspectors. `.sources.json` records authoring-only external file locations; it is not exported.

## Navigation

- **Viewpoints:** saved viewpoints, with a short fade.
- **Free Fly:** WASD movement, Q/E vertical movement, Shift acceleration, drag to look. Touch devices have a movement pad.
- **Walk:** Rapier capsule controller against a static triangle collision mesh. Walls, ground, slopes and low steps are handled independently of splat LoD. Starts without a nearby floor or inside collision geometry are rejected. Click a splat surface to follow a route over the collider; a guide line shows the route. Unreachable clicks do nothing. Manual movement or Escape cancels the route. The bundled Recast worker builds the walkable mesh locally.

On Quest, hold a trigger to aim and release to teleport. Point at a bubble or menu button and click the trigger to select it. Grip opens/closes the translucent tour menu. **Drone flight:** left stick moves forward/back/sideways, right stick lifts/turns. The Options tab can swap the sticks, change speed and turning, mute audio, and choose flying or fading between viewpoints. **Walk:** left stick moves, right stick turns. Snap turning defaults to 30 degrees. Scene entry retains the current mode when enabled and usable; initial entry defaults to Viewpoints when enabled. The menu has a separate confirmation before ending VR.

Scene changes keep the same renderer and XRSession. The viewer never navigates the top-level page to switch scenes. One active splat scene is retained; new scene requests invalidate older load results and dispose old buffers/physics resources.

## Export and hosting

**Portable:** includes local assets and downloads referenced remote assets. RAD metadata is read to collect `.radc` companions. Known external iframe embeds and custom-page resource references fail portable export. External hyperlinks are allowed but need Internet when opened. Review custom JavaScript that constructs network URLs dynamically; static inspection cannot establish its offline behavior.

**Referenced:** keeps remote URLs. The optional omit-local-splats setting leaves those files for separate upload. Application scripts, workers, WASM, styles and required notices remain bundled; editor-only chunks are excluded.

On Windows, run `Launch Tour.exe`. It opens the default browser and a server-control tab. Use that tab's **Stop tour server** button or close the launcher console to shut down. The default viewer binds to loopback. To use a standalone Quest or another device, open the launcher control tab and choose **Share on this network**. Select the Wi-Fi/Ethernet address, then scan the QR code or enter the displayed HTTPS address. Sharing serves read-only tour assets on that interface, supports HTTP ranges, and can be stopped separately. No Internet service, Node installation or developer mode is needed for the network server. Windows Firewall may need to allow the launcher on your private network.

For public viewing, upload the export to an HTTPS static host. Subdirectory hosting is supported. Serve `.rad` with real `206 Partial Content` responses; do not rewrite asset requests to the HTML page. Remote asset hosts must allow CORS for the tour origin. Keep companion chunk names/paths unchanged. Configure CDN authentication for all chunks, not only the RAD header.

Edit `config/hosting.json` without rebuilding:

```json
{
  "assetBaseUrl": "https://cdn.example.com/my-tour/",
  "sceneUrls": {
    "optional-scene-id": "https://other.example.com/interior.rad"
  }
}
```

Asset base applies to relative splat sources. Per-scene overrides win; an absolute scene source remains absolute. Media, colliders and application files use their own paths. Set the base to `./` for locally included splats.

A failed export retains `EXPORT_INCOMPLETE.txt`; do not distribute it. Export refuses a nonempty destination. An exported folder can be reopened in the editor, including after moving it to another machine when all required assets are included.

## Local HTTPS sharing

The launcher generates and caches a per-tour self-signed certificate under `%LOCALAPPDATA%/Spark Tour Launcher`, outside the export. It does not install a root certificate or change the firewall. The first visit on another device shows a certificate warning: verify the address against the launcher, then continue to your local tour. Meta documents this local HTTPS workflow for Quest Browser: https://developers.meta.com/horizon/documentation/web/webxr-first-steps/. Certificate handling varies by browser/device; real Quest acceptance remains a manual check. If Wi-Fi guest isolation blocks access, use the same ordinary private network. Stop sharing from the control tab when finished. The exported site and its runtime remain local; remotely referenced splats still need their configured host.

## Content and WebXR

Generated pages are exported individually under `pages/`. Browser panels are sandboxed. Generated text and image blocks have a native in-world presentation with Previous/Next controls; long text is split across pages. Links and unsupported custom/iframe content explain that they are available in browser view.

The development-only `prototype.html` evaluates `three-html-render` 0.1.2. Its rich HTML path is not enabled in the shipped viewer without real-headset validation. A custom page may request navigation via:

```js
parent.postMessage({type: 'spark-tour-action', action: 'scene', sceneId: 'destination-id'}, '*');
parent.postMessage({type: 'spark-tour-action', action: 'viewpoint', viewpointId: 'view-id'}, '*');
parent.postMessage({type: 'spark-tour-action', action: 'close'}, '*');
```

The receiver accepts messages only from the currently displayed sandboxed iframe and validates destination IDs. It never grants that frame filesystem or Electron privileges. Custom pages run with an opaque origin; scripts needing origin storage may require adaptation.

## Validation

```powershell
npm test
node scripts/smoke.mjs
node scripts/render-check.mjs
node scripts/launcher-check.mjs
node scripts/prototype-check.mjs
```

Browser smoke scripts use locally installed Microsoft Edge. Electron smoke tests use a hidden window, native-dialog test doubles, temporary project/export folders, and blocked external browser requests. Render tests use a tiny generated RAD fixture; they do not substitute for testing large LichtFeld captures.

See `MANUAL_TESTS.md` for real capture and Quest acceptance. No real headset or user capture was available during implementation. Builds are unsigned development distributions.

### RAD compatibility

The `.rad` container supports both ordinary splats and a LoD hierarchy. This tour's streaming path requires the hierarchy (`lodTree` plus child links). A LoD progress indicator during export does not prove those fields reached the output. If the editor reports a missing tree, inspect the LichtFeld export log and produce a successful LoD-enabled RAD. It does not automatically load a large flat RAD into browser memory or modify the source.

## Import a PLY (v1.1)

Choose **Import PLY scene** in the scene sidebar after creating/opening a project. Select Quality (Bhattacharyya) or Quick (Tiny LoD), choose the maximum spherical-harmonics degree, and click **Choose PLY & queue**. Degree 3 preserves all available SH coefficients; lower limits reduce output size. The converter expects supported Gaussian splat PLY data; Spark 2.3.1's PLY decoder uses binary little-endian PLY.

The editor bundles Spark 2.3.1's unmodified Rust `build-lod` tool, compiled in release mode with CPU features. End users need neither Rust nor Node.js. Conversion runs outside the renderer, with live stage messages and a Cancel button. It uses `--gsplat --rad-chunked`, validates the resulting LoD metadata and every companion chunk, then adds the scene. The original PLY is unchanged. A temporary hard link avoids copying on compatible local volumes; otherwise the PLY is copied with streaming I/O. Failed/cancelled output is removed, with available diagnostics kept in `conversion-logs/`.

Converted assets are stored in `assets/converted/<id>/` inside the project and travel through Save As/export like imported RAD assets. Save the project after importing. Large PLY files can require substantial RAM and conversion time; the converter reads the splats into memory. This release does not provide an out-of-core conversion algorithm. It does not generate collision geometry.

Developer rebuild: install Rust 1.98.1 (Windows x64 GNU or MSVC toolchain) into `.build/cargo` and `.build/rustup`, without changing PATH, or supply `CARGO_HOME` and `RUSTUP_HOME`. Run `npm run build:converter` before packaging. The script verifies the pinned Spark v2.3.1 archive checksum, uses Cargo.lock and release optimizations, and records executable provenance and license notices in `converter/`. It downloads the source archive if needed. No Rust source modifications are applied.

Importer verification: `node --test tests/converter.test.mjs`, `node scripts/ply-import-check.mjs`, and `node scripts/render-import-check.mjs <export-folder>`. Set `SPARK_PACKAGED=1` to run the import UI check against `release/win-unpacked/Spark Tour Studio.exe`.

## Viewpoints and audio (v1.4)

Viewpoints are selected from the view list, without bubbles in the scene. Selection flies smoothly to the saved camera position. An optional description appears below the view; in VR, select a long description to read it in a paged panel. Physical head tracking remains active. VR Options also offers a fade transition.

Scene audio continues across viewpoint changes. A viewpoint can play its own separate audio track when selected. Both offer a file chooser or URL, loop switch and volume control. Local audio travels with the exported tour. Playback starts after entering the tour; Mute audio affects both tracks. Changing scenes stops the previous scene and viewpoint audio.

Bubble captions keep a consistent screen size. The editor's X button offers Save and close, Close without saving, or Cancel when changes are pending.

Desktop navigation: left-drag looks around; right-drag pans in the camera plane; the wheel moves forward/back. WASD and arrow keys move relative to the actual view, including after selecting a rotated viewpoint. Desktop Free Fly follows the camera pitch; Q/E moves down/up and Shift speeds movement. Walk stays level and obeys collision geometry. Editor placement allows free translation even when preview navigation is Viewpoints; the visitor Viewpoints mode retains its fixed-position behavior. Right-click never opens the canvas browser menu or activates a bubble or walking destination.


## Performance presets (v1.5)

Open **Performance** in the editor sidebar. Tune settings against the live FPS/splat-count readout, name the result, then choose **Save preset** or **Save as new preset**. **Use as tour default** sets the initial viewer profile; Save the project to persist it. Presets participate in undo/redo and autosave. Import/export buttons exchange standalone JSON preset files between projects.

Viewer Settings includes all saved presets and Advanced performance controls. Visitor changes last across scene transitions without rewriting the project. Resolution cap applies to desktop rendering; XR foveation is a headset/browser hint. The preset controls do not change source splats, and rendered splat targets are not hard memory limits.

See [the versioned preset specification](specs/performance/README.md), [JSON Schema](specs/performance/preset.schema.json), and [complete example](specs/performance/balanced.performance.json). Export includes copies of each preset and the specification. Runtime code, WASM and workers remain bundled locally.

## Scene import queue

Add RAD scene and Import PLY scene both accept multiple files. Choose the PLY conversion method and SH degree for each batch; those settings stay attached to the queued files. Imports run serially to avoid concurrent converter memory use, and each successful import adds a scene named after its source file. RAD imports validate the paged header and companion chunks, then reference the source folder; PLY imports write converted chunks inside the project. Originals are preserved.

Open **Import queue** in the sidebar to see progress, cancel individual jobs, retry failures or clear finished jobs. **Pause after current** lets the active import finish before stopping; you can add more files while paused or running. Failed jobs do not block later imports. Editing and Save remain available during imports; switching projects, Save as, export and collision generation wait until pending imports finish or are cancelled. Completed scenes use the normal project save and autosave workflow. The pending queue is session-only and is cancelled when the editor closes; it does not resume after restart.

## Walk and mobile navigation

In Walk, hold Shift to crouch: the desktop view lowers by 60 cm and the capsule shrinks. Releasing Shift stands up only when the ceiling is clear. Space jumps from the ground; holding Space does not repeat jumps. Crouched movement is slower. Shift still accelerates Free Fly. Click-to-walk displays a flat translucent white spline ribbon; manual movement, jumping or Escape cancels the route. Free Fly sweeps a small camera volume against an available collider and slides along walls, floors and ceilings without gravity. With no collider it remains unrestricted. XR physical head penetration fades the view in both Walk and Free Fly.

The editor’s Scene → Navigation settings include **Walking view height**, a 1–2.4 m eye-height slider saved per scene in the tour. Preview and the exported viewer use that authored height. Existing scenes default to 1.7 m. Crouch lowers it by 60 cm; headset height remains physically tracked in VR. There is no height control over the viewport or in visitor settings.

Click-to-walk uses a 10 cm navigation grid to preserve narrow passages in reconstructed colliders. Clicks while the map builds are queued; newer clicks replace older destinations, and manual movement cancels pending routes. Ground picking prioritizes the collider and projects wall clicks onto nearby ground. Destinations snap to nearby navigable ground; disconnected routes remain silent.

Viewing settings include **Mobile controls**: Automatic detects touch-capable devices, Always show forces controls on, and Hide turns them off. This preference is stored locally on the device. Walk provides a movement pad, hold-to-crouch and jump buttons; Free Fly adds hold-to-rise/lower buttons. Drag the scene to look. Desktop-editor Preview offers the same override in its toolbar.

## Viewpoint camera styles

Viewpoints can be Photosphere, Orbit or Slider. Existing tours retain photosphere behavior. Selecting a viewpoint flies the shared camera smoothly to its entry pose. Dragging during a flight steers its destination while retaining the chosen geometry.

- **Photosphere:** drag to look around from a fixed point.
- **Orbit:** drag around a center at a fixed radius. Optional horizontal/vertical angle limits are in degrees; vertical movement remains below the poles.
- **Slider:** drag across an oriented plane while retaining the authored look direction. Optional width/height limit the plane; without limits, visitor dragging is unbounded.

In the editor’s Views panel, choose a type, edit geometry numerically, or click **Frame geometry** to see its 3D handles. Select a handle in the viewport and drag its transform axes: photosphere position, orbit center/radius/angle-limit handles, or slider origin/size. **Move plane / Rotate plane** selects the slider’s origin handle and the corresponding transform tool. Use Preview to try the visitor controls. Geometry belongs to the scene coordinate system and follows scene transforms.

**Auto-animate until the visitor takes control** enables slow panorama rotation, orbit movement or looping plane movement. Speed is adjustable. Bounds remain enforced. Dragging or movement input stops animation until that viewpoint is selected again; opening immersive menus pauses motion. Physical XR head tracking is retained.

Scene thumbnails default to their starting viewpoint screenshot. The editor captures screenshots when a view settles, without authoring handles or collider wireframes. Selecting a new starting view uses its saved screenshot; missing starting screenshots are captured while its scene is loaded. In Scene thumbnail, choose **Custom image** to retain URL, file-open or drag-and-drop images. **Refresh starting screenshot** regenerates the automatic thumbnail. Screenshots are stored in viewpoint data, so exported/reopened tours retain them. Automatic thumbnail generation does not add undo steps.

## Local crash diagnostics

The Windows editor saves native crash dumps and renderer/GPU failure details beneath `%APPDATA%\spark-tour-studio\diagnostics`. Reports stay on this computer and are never uploaded. If the application crashes, keep this folder with the version and the action that triggered it for diagnosis. Native dumps may contain application memory.

## Scene backgrounds

Each scene can choose a solid hex color, a 360° equirectangular image, or a second streamable RAD splat. Older scenes keep the existing dark backdrop. Panorama images support drag/drop, the file chooser and URLs; use a 2:1 JPEG, PNG, WebP or other supported image and adjust its rotation in degrees. Background splats have independent world-space position, rotation and scale, and no collision geometry. The same renderer and XR session display the foreground and background. Both splats share the performance preset’s streaming budget. Rotation/alignment changes reuse the loaded background assets.

The optional scene `background` field has one of these forms:

```json
{ "type": "solid", "color": "#264b73" }
{ "type": "panorama", "source": "media/sky.jpg", "yawDegrees": 0 }
{ "type": "splat", "source": "splats/sky.rad", "transform": { "position": [0, 0, 0], "rotation": [0, 0, 0], "scale": 1 } }
```

Transforms use meters and radians, with Y-up. Panorama images resolve relative to the site; background RAD paths use `assetBaseUrl` just like scene splats, and absolute HTTPS URLs override that base. Portable exports include background assets and required RAD companion chunks. Referenced exports preserve CDN references and apply the existing omit-splats option to background splats too.

## Changing navigation modes

Switching to Drone keeps the current camera position and facing when clear, or looks for a nearby collision-free camera position. Switching to Walk looks for a floor and full capsule clearance at the current position, then within 3 meters horizontally. If no nearby standing position works, it tries the authored walking start. Walk stays unavailable if neither location is valid. Entering a Walk-only scene and fall recovery use the walking start. Switching to Viewpoints flies to the last visited valid viewpoint in that scene, or its starting/first viewpoint. Remembered views are session-only.

Editor Preview/Edit keeps the camera pose. If the author has moved away from a viewpoint’s geometry, entering Preview keeps the new vantage point; select a saved viewpoint explicitly to use its authored navigation geometry. Initial scene loads still position the camera at the scene’s starting view. Thumbnail refresh is an explicit action and may move the camera to that starting view. Content bubbles use an info icon, scene links use a photograph icon, and viewpoint links use a camera icon. Glass uses a subtle neutral dark shade while keeping background colors visible.


### Scene navigation and unlisted views

Changing scenes retains the current movement mode when it is enabled and usable in the destination. Otherwise it uses Viewpoints when enabled, then another usable mode. Walk arrivals use the designated walking start; a scene bubble with an explicit destination viewpoint instead finds standing clearance near that viewpoint. Failed loads and retries retain the selected mode. Scene changes retain the existing renderer and XR session.

In Views, uncheck **Listed in visitor views** to hide a viewpoint from the visitor's numbered view strip and VR Views menu. Unlisted views remain editable, usable as scene/walking starts, and reachable through viewpoint or scene bubbles. All views in older projects remain listed. Project JSON stores the optional boolean `listed`; only `false` hides a view. Listing does not restrict access to a view or its content.


## License and automatic builds

Spark Tour Studio's original code is MIT-licensed; see [LICENSE](LICENSE). Bundled dependencies retain their respective terms and notices in [THIRD_PARTY.md](THIRD_PARTY.md) and the exported `licenses/` directory. Tour authors retain responsibility for their own scan and media rights.

GitHub Actions builds and tests Windows x64 on pushes to `main`, pull requests, version tags and manual runs. It installs pinned Node 24.21.0 and Rust 1.98.1, builds the Spark converter from checksum-verified source, runs the tests, builds the site/launcher/collision tools, and checks the packaged editor plus exported viewer. Branch and manual builds provide a downloadable artifact containing the portable editor, standalone tour launcher, web runtime template and SHA-256 checksums. The web runtime template contains no authored scene assets; use the editor to export an actual tour.

Pushing a new `vX.Y.Z` tag publishes a GitHub Release after the build passes. The tag must match `package.json`; existing release tags must not be moved. Update the package and lockfile version first with `npm version X.Y.Z --no-git-tag-version`, commit the change, then create and push the matching tag. The executables are unsigned. Quest hardware and GPU collision-generation acceptance remain manual checks.

Local packaging requires `npm run build:converter` once before `npm run package`. Supply `CARGO_HOME` and `RUSTUP_HOME` for the pinned Rust installation; Windows GNU and MSVC toolchains are supported. GitHub's hosted Windows runner uses MSVC. Build outputs, private configuration, local scan data and caches are excluded from Git.


A failed publishing step can be recovered through Actions → **Publish tested release** → **Run workflow**. Supply the existing version tag and the original build run ID. Publishing verifies that the tag matches the tested build commit, that the Windows packaging job passed, and that every downloadable file matches its SHA-256 manifest. It does not move tags or rebuild the application.
