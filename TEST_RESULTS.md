# Verification results

Validated on Windows x64, 2026-09-25.

- TypeScript production build: passed; Spark 2.2.0 and runtime dependencies bundled locally.
- Node test suite: 8 passed, covering schema/link validation, asset URL resolution, generated pages, HTTP ranges and containment, export round trips/incomplete exports, Rapier floors/walls/low steps, and Spark WASM RAD companion-chunk export.
- Hidden Electron/Edge integration: create, author, save and export; title screen; failed request and retry UI; two-scene switching; external networking blocked: passed.
- Actual paged RAD rendering: synthetic one-splat fixture decoded and rendered; center pixel checked: passed.
- Browser GLB importer and Explore grounding: generated floor GLB: passed. Rapid scene replacements and missing companion-chunk error reporting: passed.
- Windows launcher: starts with Node absent from PATH, paths with spaces, byte ranges, shutdown token and process exit: passed.
- Packaged Windows editor: launches, creates/saves projects, and exports the viewer, content pages, license notices and launcher: passed.
- three-html-render desktop prototype: rendered HTML successfully. The shipped viewer uses structured XR panels pending headset acceptance.

These checks use generated fixtures. They do not establish compatibility or performance for every LichtFeld capture or collision mesh. The user will manually test their existing RAD. Quest 3/3S, XRSession identity across transitions, controller ergonomics, mobile touch, real stairs/slopes/narrow passages, CDN CORS and large-scene memory behavior remain in MANUAL_TESTS.md. Executables are unsigned.

## 1.0.1 RAD compatibility finding (2026-09-28)

The supplied LichtFeld `source.rad` is 1,840,935,512 bytes with 34,999,724 splats in 535 chunks. Its root metadata has no `lodTree`, and the first RADC chunk has neither `child_count` nor `child_start`. Spark paged rendering cannot stream this flat RAD as a LoD tree.

The file records LichtFeld build `f66c82a3`. That build's RAD exporter attempts `build_bhatt_lod`, then silently retains the original input when the result is unsuccessful or has no usable tree. Therefore the UI can show LoD calculation even when the saved RAD contains no tree. The underlying reason requires LichtFeld's log (look for `build_bhatt_lod failed`); it is not established by the file.

Source: https://github.com/MrNeRF/LichtFeld-Studio/blob/f66c82a3/src/io/formats/rad.cpp#L2449

Version 1.0.1 rejects such files before adding them to Spark's paged renderer, and refuses to copy them as streamable RAD assets during export. Browser verification against the supplied file requested only 65,536 bytes and displayed the compatibility error. The input was not modified. The 9-test suite and valid-LoD rendering regression passed. This fix improves diagnosis; it does not repair or convert the capture.

## v1.1 PLY importer

- Bundled upstream Spark 2.2.0 Rust build-lod compiled with Rust 1.98.1, release optimizations, no optional GPU features.
- Real Quality and Quick conversions produce LoD RAD chunks; source bytes are preserved.
- Invalid input, cancellation before conversion, and termination of an active native conversion pass; partial output is removed.
- Electron UI import, generated scene creation, save, and portable export pass.
- Exported PLY-derived RAD renders with external requests blocked.
- No large user PLY was converted automatically. Large-capture time, peak memory, and visual fidelity still require testing on representative data.

The corrected packaged v1.1 editor also passed PLY import, save and portable export. Main-process metadata validation reads bounded RAD0 JSON directly and is cross-checked against Spark's WASM decoder, avoiding browser-module imports in Electron. The complete suite has 12 passing tests.

## v1.2 polish, collision generation and click-to-walk (2026-09-28)

- Production build passes; 17 automated tests pass. Added wall-detour/disconnected-route checks, scene/viewpoint link repair, controller axis mapping, and collision cancellation/validation.
- Packaged Electron editor passes scene deletion/undo, viewpoint capture with persisted thumbnail, actual GPU collision generation from a matching synthetic PLY, original preservation and portable export. GLB bounds verify Spark-compatible PLY axis orientation.
- splat-transform 3.7.0 and its Windows GPU dependencies are bundled outside ASAR with Node 24.21.0 and license notices. Electron Node-mode execution was unsuitable; the verified package uses its own Node executable. No system Node installation is required for generation.
- Exported viewer with external requests blocked loads its bundled Recast worker, follows a route to its destination, silently ignores unreachable destinations, and cancels on Escape.
- Render checks confirm opaque XR panels and a separate exit confirmation; simulated controller hold/release teleports onto a collision floor. This simulation is not a real XRSession or headset acceptance test.
- Round bubble rendering and the viewpoint inspector were inspected in screenshots. Shared runtime RAD pixels, collider grounding, rapid scene changes and failed chunk handling pass the rendering regression.
- Final packaged integration evidence: test-output/polish-1790642151445 (screenshots and exported fixture).

Quest hardware, large captures, real-world collision quality and performance remain manual acceptance items. Collision generation requires the matching source PLY; RAD is not a supported splat-transform input.

## v1.3 glass UI, image inputs, billboard orientation and LAN sharing (2026-09-28)

- 18 automated tests pass, including HTTPS byte ranges, host/method restrictions, private-file exclusion, occupied-port fallback and certificate reuse.
- Native image file selection, real-file drag/drop through Electron webUtils, URL editing, save and portable image export pass.
- Small cool content markers and warm viewpoint markers were inspected in editor/viewer screenshots. The browser UI now uses pale translucent glass panels and compact floating controls.
- XR camera handling now reads the regular camera under its rig after XR updates. It avoids world-pose getters on the parentless XR array camera, which can discard rig transforms. Marker and menu front normals face the viewer in simulated yaw tests at 0, 90, 180 and -90 degrees. Real headset confirmation remains required.
- The actual SEA launcher EXE generates its local certificate, serves HTTPS on the selected LAN interface, renders a QR code, streams range requests, stops sharing, and exits via its protected local control page with Node absent from PATH. Certificate cache is outside the exported site; no trust-store or firewall changes are automatic.
- Meta's local HTTPS/certificate workflow reference: https://developers.meta.com/horizon/documentation/web/webxr-first-steps/. Quest hardware and access from a physically separate network device are still manual acceptance items.

Packaged v1.3 image/orientation evidence: test-output/glass-1790645238868. Launcher sharing screenshot: test-output/launcher with spaces/sharing.png. Actual RAD rendering, walking grounding, rapid scene replacement and missing-chunk reporting also pass.

## v1.4 viewpoint flights, audio, VR controls and collision preparation (2026-09-29)

- Production build and 20 automated tests pass, including audio schema/reference discovery, swapped controller sticks, and stopping a GPU failure while preserving its first error.
- Editor/browser integration verifies X-button Cancel and Save and close, clean closing, saved description round trip, exported audio bytes, camera interpolation and arrival, no viewpoint markers, separate looping scene/non-looping viewpoint playback, audio cleanup at scene changes, and constant-size captions at 3 and 30 meters.
- Image file chooser/drop/URL regression passes. Content bubbles and menus face the user at four simulated XR headings; viewpoint bubbles are absent. Screenshots were inspected for the viewer description and editor audio/description controls.
- The supplied collision logs begin with a 2,239,982,336-byte buffer exceeding a 2,147,483,648-byte maximum. The new preparation stage caps collision input at 2 million splats by default (8 million optional), keeps the original untouched, and stops GPU error cascades promptly.
- The packaged standalone collision tool passes real GPU generation after reducing a synthetic 128-splat input to a 64-splat budget, validates the resulting GLB, preserves the original and removes temporary preparation files. Evidence: test-output/collision-budget-1790683518798.

The user's full 35-million-splat PLY has not been processed by this release's checks. Real Quest controller comfort, audio behavior, XR tracking and large-capture collision quality remain manual acceptance tests. Builds remain unsigned.

Packaged v1.4 integration also passes: test-output/view-audio-1790683520326. Packaged collision UI/alignment, scene deletion/undo, captured thumbnails, offline walk routes, silent unreachable clicks, trigger teleport and guarded XR exit pass: test-output/polish-1790683550792. XR menu screenshots confirm the light translucent panels; headset ergonomics remain unverified.

## v1.4.1 right-button look navigation (2026-09-29)

Production build passes. Real Edge pointer-input checks confirm right-button dragging rotates the camera, suppresses the canvas context menu, never triggers scene clicks, and stops on release or window blur. Existing left-click actions and left-button look dragging still work. Editor and viewer use the same navigation handler. Controls help now lists both mouse buttons.


## v1.4.2 corrected movement and right-drag pan (2026-09-29)

The 1.4.1 interpretation of right-drag as look was incorrect and is replaced with camera-plane panning. Rig rotation now uses YXZ and movement uses actual camera orientation, avoiding folded Euler yaw after viewpoint selection. Arrow keys alias WASD without doubling speed when both aliases are held. Wheel movement is supported. Walk remains level and collision-constrained.

Production build and all 20 automated tests pass. `node scripts/navigation-controls-check.mjs` exercises real keyboard/mouse input: correct WASD directions and arrow equivalence at five headings (including a quaternion-set 180-degree view), pitched flight, pan without rotation or click activation, left-drag look, wheel movement and grounded Walk panning. Real Quest acceptance is still manual.
Packaged viewer verification also passes with `SPARK_PACKAGED=1 node scripts/navigation-controls-check.mjs`.

## v1.5 Spark 2.3.0 and performance presets (2026-09-30)

- npm latest and upstream release verified as Spark 2.3.0; renderer dependency and lockfile pinned exactly. Bundled Rust converter rebuilt from v2.3.0, with archive/executable checksums recorded in converter/build-info.json.
- Production build and 22 automated tests pass, including malformed/versioned preset rejection, library/default validation, backward compatibility, project round trip and converter checks.
- Real RAD rendering, GLB grounding, rapid scene switching and failed-chunk reporting pass under Spark 2.3.0. Corrected WASD/arrows, right-drag pan, wheel movement and walking checks pass.
- Editor integration passes preset naming, setting a tour default, native JSON import/export, undo/redo, project reopening, and portable export of presets/schema/specification. Exported viewer applies the default, supports live advanced changes, retains tuning across scene changes, and makes no external runtime requests in the offline check. Evidence: test-output/performance-1790785366562. Editor and viewer screenshots inspected.
- SH changes explicitly invalidate the Spark mesh generator to update the rendering program. XR compositor foveation applies live; desktop pixel ratio changes defer until XR exit, preserving the renderer/session.

Tests use synthetic captures, not performance benchmarks. Large real-capture visual quality, target hardware FPS and real Quest session behavior still require manual acceptance. Executables remain unsigned.
Final integration including live SH generator invalidation and explicit version refresh for stationary sorting passes: test-output/performance-1790785631075. Packaged editor import/export/persistence integration also passed: test-output/performance-1790785502520.

## v1.5.1 Spark 2.3.1 update (2026-10-05)

- Renderer dependency and lockfile pinned to Spark 2.3.1. Upstream release notes describe a build fix.
- Bundled Rust PLY converter rebuilt from tagged v2.3.1 source; source archive and executable hashes recorded in converter/build-info.json. Documentation updated to the tested Spark patch version.
- Production build and all 22 automated tests pass. Browser rendering checks pass for RAD pixels, collider grounding, rapid scene replacement and failed chunks. Keyboard/arrow navigation, panning and wheel checks pass.
- Editor and exported viewer performance-preset integration passes: native JSON import/export, save/reopen, undo/redo, tour defaults, live tuning, scene-change persistence, SH/sorting refresh and blocked external networking. Evidence: test-output/performance-1791222581953.
- Patched the reported http-cache-semantics build-tool dependency; npm reports zero vulnerabilities.

Tests use synthetic captures. Existing real-Quest/large-capture acceptance limits continue to apply.

## v1.6.0 Scene import queue (2026-10-05)

- Multiple RAD/PLY selections enqueue serial background imports. Per-batch PLY settings are captured; RAD companion chunks are checked before scene creation. Cancellation, explicit retry, pause-after-current and finished-history clearing are supported. Failed jobs do not halt subsequent jobs.
- Production build and all 26 automated tests pass. Queue tests verify serial execution, enqueue during active work, immutable settings, acknowledgement, pause/resume, pending/active cancellation, failure continuation and reset.
- Electron integration with the real bundled Rust converter passes multi-file selection, queued cancellation/retry, missing companion recovery, Save during pending work, exactly-once scene additions, originals preservation, portable export and reopening all four scenes. Evidence: test-output/import-queue-1791223658836. Queue screenshot inspected.
- Editing and Save remain available; project switching, Save as, export and collision generation are guarded while imports are pending. Completed scenes retain normal autosave/undo behavior. Pending queue is session-only and cancelled on editor exit.

Synthetic captures were used; long-running large captures remain a manual acceptance check. Spark stays pinned to 2.3.1.

Packaged Windows editor queue/converter/persistence/export integration also passed: test-output/import-queue-1791223759099.
Packaged native-close check passes: Cancel retains pending queue work; Save and close saves authoring changes and cancels pending imports. Evidence: test-output/queue-close-1791223868595.

## v1.7.0 Walk and mobile controls (2026-10-06)

- Shift crouches with a 60 cm desktop eye drop and shorter capsule. Clearance checks prevent standing beneath a ceiling; grounded Space jumps do not repeat or allow midair jumping. Step probing uses the current capsule dimensions.
- Walking paths render as a 46 cm wide, translucent white flat spline ribbon. Cancellation/arrival dispose the geometry and material.
- Free Fly bypasses character collisions and XR head-crossing fade; collision validation of XR teleport destinations is limited to Walk.
- Persistent Automatic/Always show/Hide mobile-control preference is available in viewer settings and editor Preview. Walk touch controls include movement/crouch/jump; flight includes movement/up/down.
- Production build and all 26 unit tests pass. Browser integration checks verify eye lowering, capsule size, low-ceiling stand rejection, jumping/landing/no midair jump, ribbon geometry/material, flight through the collider, simulated XR fade suppression, mobile preference persistence, and automatic touch detection. Evidence: test-output/walk-controls-1791318020147. Desktop and mobile screenshots inspected. Existing WASD/arrow, look/pan/wheel and grounded movement regressions also pass.

XR collision-fade check uses a simulated renderer state; real Quest and complex real-capture geometry still require manual acceptance.

Bundled Windows viewer resources pass the walking/path/mobile integration: test-output/walk-controls-1791318139245.
Packaged editor Preview also passes mobile-control override and flight touch-control visibility checks.

## v1.8.0 Typed viewpoints and automatic thumbnails (2026-10-06)

- Added backward-compatible photosphere/orbit/slider data with optional orbit angle limits, oriented rectangular slider bounds, and adjustable idle animation. View transitions use the existing eased camera flight; user input stops automatic motion.
- Editor offers 3D geometry diagrams and selectable transform handles, Frame geometry, slider movement/rotation tools, numeric fields and Preview.
- Scene thumbnails derive from starting-view screenshots by default, with custom-image override. Missing starting screenshots are generated while the scene is loaded; screenshots exclude authoring geometry/wireframes and persist in project JSON. Generation does not create undo entries.
- Production build and all 30 automated tests pass, including schema compatibility, radius/plane/bounds constraints, idle-motion continuity, animation interruption and thumbnail resolution. Standard WASD/arrows/look/pan/wheel and grounded movement checks pass.
- Native editor/exported viewer integration passes automatic screenshots, selecting a 3D handle and committing its geometry change, slider Preview, save/reopen/portable export, fixed photosphere position, smooth transitions, orbital radius and idle-animation interruption. Evidence: test-output/viewpoints-1791319515774; framed geometry screenshot inspected.

Tests use synthetic captures. Real Quest behavior and touch geometry navigation remain manual acceptance items. Spark remains pinned to 2.3.1.

Final packaged-editor/export/viewer checks pass with bounded geometry preserved, drag steering during camera flights, persistent snap turning and simulated physical head translation: test-output/viewpoints-1791320343533. Geometry handles retain usable screen size across scene scales. Physical XR anchoring is captured once per viewpoint, preserving later tracked movement. Real headset acceptance remains manual.

## v1.8.1 movement repairs (2026-10-06)

- Reproduced click-to-walk rejection using the user’s Tourv2 and southeast-collision.glb, without modifying their project. The 15 cm grid disconnected the start from visible ground; a 10 cm grid retains the passage. Real pointer clicks now create routes and arrive within 20 cm (test-output/real-walk-1791321375192). Simulation advances movement deterministically; software rendering is slower than real time.
- Collider-first picking avoids costly splat raycasts when collision geometry is available. Wall hits project onto nearby floors. Pending clicks survive navigation construction; cancellation invalidates pending/old requests.
- Free Fly now sweeps a 20 cm camera sphere, respects imported colliders and slides in 3D without gravity. XR head penetration fade applies in Fly too. No collider means unrestricted flight.
- Locally persisted walking view height (1–2.4 m) in viewing settings and editor Preview; body placement stays unchanged, crouch still lowers the eye by 60 cm, XR retains physical tracking.
- Build and 31 unit tests pass. Browser checks cover actual clicks before map readiness, route completion, view-height changes/persistence, crouch, jump, mobile controls, fly floor collision and simulated XR fade (test-output/walk-controls-1791321356582). Real headset acceptance remains manual.

Final packaged movement checks pass, including bubble-over-floor priority, route cancellation by content bubbles and saved height applied at startup (test-output/walk-controls-1791321726886). Real collider Free Fly descent stops above the ground (test-output/real-walk-1791321596534). Native packaged editor save/reopen/export and viewpoint interactions pass (test-output/viewpoints-1791321560440). Drone sweep tests also cover escape from initial penetration without allowing deeper movement into geometry.

Final portable EXE startup verified through its own local browser debug connection: editor window present, version 1.8.1 in the runtime user agent, and final editor-DWgwUgKB.js bundle loaded. Portable wrappers do not forward the inspector output expected by Playwright’s Electron launch helper, so verification used the child’s local debug port. Test instance closed separately; the existing 1.8.0 user instance was untouched. EXE size: 157,887,228 bytes. SHA-256: 7317635A8B714725EFCBD5A78723E49A7A05E2DAF0D5B281F21E87CD8A9099FF.

## v1.8.2 authoring corrections (2026-10-06)

- Removed the floating Preview height panel and visitor height setting. Walking eye height is an optional validated scene property, saved/exported with the tour; existing scenes use 1.7 m. Preview updates immediately; headset height stays physically tracked.
- Removed Pages tab and sidebar content library. Content is a bubble type edited in place, retaining blocks, local images/drop/file chooser, URL media, preview and custom HTML. New bubbles get independent content; older content is preserved and can be copied. Export still produces individual content pages for runtime compatibility.
- Build and 33 tests pass, including height persistence/default compatibility and independent/legacy content-copy and deletion cases. Packaged movement/browser tests pass (test-output/walk-controls-1791323063517), including authored height after viewer reload and no visitor height slider.

Packaged native/editor/exported-viewer integration passes scene-height authoring, clear Preview, inline text/image content, image file import, save/reopen/export, generated content HTML and viewer bubble activation (test-output/bubble-editor-1791323257201). Preview layout inspected visually.

Windows portable package: release/Spark Tour Studio 1.8.2.exe; 157,883,175 bytes; SHA-256 E18613CFCCD2F87BE34B7709311AD8C2F2D6CB2031179722FF469C9214EC79B2. Packaged editor and exported viewer integration verified before compression.

## v1.8.3 content and glass styling (2026-10-06)

- One bubble label supplies the popup title. Renaming legacy shared content makes an independent copy when necessary, preserving other bubbles.
- Generated popup blocks render directly in the editor and viewer: text, images and captions are visible, local media resolves against the project/export URL, and the compact 520px dialog sizes to its content. Custom HTML retains sandboxed rendering and validated frame actions.
- Tinted translucent glass covers editor chrome, numerical inputs, sliders, visitor controls, popups, mobile controls and XR textures. Desktop popup screenshots inspected; real Quest styling remains a manual check.
- Build and all 34 tests pass. Packaged editor save/reopen/export and exported browser integration pass with text/image/caption visibility, compact dimensions, custom HTML and its close-message action (test-output/bubble-editor-1791325515586). Custom action was invoked in its frame directly; native hidden-window pointer dispatch is not an acceptance result. Test profiles are isolated from the running editor.
- Added local-only Electron crash dumps and renderer/GPU/main-error event logs. The reported 1.8.2 breakpoint crash during editing and after close remains undiagnosed; Windows yielded no usable event report. Crash logging is diagnostic, not a claimed fix.

Clean native-window shutdown smoke check passes with exit code 0 and no crash dump (test-output/close-1791325621775). This does not reproduce the older-build crash after editing a large scene.

Final Windows portable package: release/Spark Tour Studio 1.8.3.exe; 157,887,476 bytes; SHA-256 0B75026EDF6D8CD0C0FA0D0DA6E8E9D77107F1CE2B22E4FD43B55E411B99B5BD.

## v1.8.4 clear glass (2026-10-06)

- Replaced tinted glass with neutral transparent fills, backdrop blur and restrained white edge highlights. The editor canvas now extends beneath the header, scene list, inspector and workspace toolbar, allowing actual scene colors to bleed through instead of exposing a solid application background. Light text uses neutral shadow contrast. XR panels use neutral translucent textures; real Quest inspection remains manual.
- Build passes. Packaged editor and exported viewer content authoring/visibility/save/reopen checks pass (test-output/bubble-editor-1791326005102). Native editor screenshot confirms full-scene canvas behind the panes and visible scene color through the popup. Separate red/blue viewer backgrounds verify transmission through the popup (scripts/glass-check.mjs).
- Initialized local Git source history on main. Generated runtime bundles, portable executables, test artifacts and external Splatshop distribution are excluded.

Popup photos fill the available width with an 18px inset, rounded corners and natural aspect ratio; tall images scroll. Browser visual check passes photo width and backdrop transmission assertions (test-output/glass-1791326341300): red-backed panel pixel [200,98,85], blue-backed panel pixel [86,115,202].

## v1.9.0 backgrounds (2026-10-06)

- Added per-scene Solid color / Equirectangular panorama / Gaussian splat selection, local files and URL references, panorama yaw and independent RAD alignment. Same renderer/XR session; background splats share the Spark performance budget. Existing scenes retain the dark backdrop.
- Background edits preserve the foreground mesh; panorama rotation and splat alignment preserve loaded background resources. Generation checks dispose stale textures, abort streaming meshes and protect replacement resources from late results. Scene changes release the previous background.
- Save/reopen schema, asset discovery and validation include backgrounds. Portable export downloads panorama media and background RAD chunks; referenced export preserves CDN paths and omit-splats behavior.
- Build and all 36 tests pass. Packaged editor authoring, texture reuse/disposal, mesh alignment/reuse, save/reopen and export pass. Exported viewer checks pass for scene switching, splat cleanup, cancellation, failed loads and retry (test-output/background-1791326749209). Panorama/editor screenshot inspected. Real Quest acceptance remains manual.
- Self-contained glass/photo check passes with new solid backgrounds (test-output/glass-1791326781194): foreground scene colors transmit through the popup, and photos nearly fill the width with the small inset.

Final background checks pass after strengthening the stale-alignment generation guard (test-output/background-1791326907000).

Final portable package: release/Spark Tour Studio 1.9.0.exe; 157,877,666 bytes; SHA-256 26409CAB3363E7AC66E65A50DAE7B0021DEBC3237910804CE4ED4967CC9EB9C3.

## v1.9.1 mode continuity and contrast (2026-10-06)

- Mode switches retain eye position/facing for Drone when clear and search locally for camera clearance when necessary. Walk queries a floor/full standing-capsule clearance locally, then within 3m, then falls back to the walking start. Invalid placements retain the previous mode. Slopes receive enough body clearance; low ceilings are rejected. Initial Walk-only scenes and fall recovery still use the authored start.
- Viewpoints remembers the last visited view per scene for this session, falling back to entry/first valid view. Preview/Edit no longer jumps to the selected viewpoint or invokes an automatic thumbnail-driven camera reset. Moved preview cameras keep their pose; existing authored geometry remains active when the pose still matches it.
- Bubble types have distinct info, photograph (sun/mountains) and camera icons. Glass panels/captions/XR textures use slightly darker neutral transparency, preserving scene color transmission.
- Build and the 37-test suite pass; the additional slope/low-ceiling test also passes (physics subset now 4 tests, 38 tests in total). Browser integration passes current/nearby placement, heading, crouched eye preservation, last-viewpoint return, invalid-position fallback, failed-placement continuation and distinct texture icons. Actual native Preview/Edit buttons preserve pose (test-output/mode-switch-1791328429751). Screenshot inspected.
- Darker-glass visual check passes: red background yields panel pixel [153,45,32], blue background [33,64,155]; popup photo sizing is preserved (test-output/glass-1791328466336). Real Quest acceptance remains manual.

Final portable package: release/Spark Tour Studio 1.9.1.exe; 157884786 bytes; SHA-256 26E8755CB22B121C4E5B3C15613A429BA422422FEF1DA8B743BDDD13EB9C1C73.


## v1.9.2 scene modes and listed views (2026-10-06)

- Scene loading retains the previous mode through asset loading, failure and retry. On success it reinitializes movement in the new world, choosing an enabled usable fallback where necessary. Walk uses walking start for ordinary arrivals and grounds near explicit scene-link entry points. No renderer or XR session replacement was added.
- Optional viewpoint `listed` persists through project parsing, editor save/reopen and export. Missing fields retain legacy listed behavior; `false` hides visitor strip and XR menu items without removing valid entry/link targets. The editor exposes a checkbox and marks unlisted view cards.
- Build and all 39 tests pass. Packaged native editor checkbox/save/reopen/export and exported browser mode switches pass for all three modes, rapid selections, failed loads/retry, disabled-mode fallback, explicit Walk entry and unlisted bubble links. XR menu filtering verified with a simulated presenting flag; real Quest session/controls acceptance remains manual (test-output/scene-navigation-1791338323488).

Extended packaged integration passes all-unlisted ordinary scene entry, missing-collider fallback and invalid-walking-start fallback from active Walk (test-output/scene-navigation-1791338461167).

Final portable package: release/Spark Tour Studio 1.9.2.exe; 157880592 bytes; SHA-256 7E1932C3D7DC7CA998F06338196100AE28092112C5699DD51095CF521036F6B2.

## v1.9.3 local build and ZIP delivery (2026-10-07)

- Local build and all 39 tests pass. Packaged editor version and MIT license verified; startup/window-close smoke test exits with code 0 (test-output/close-1791381083867). Standalone launcher passes paths-with-spaces, no-Node-in-PATH, ranges, HTTPS sharing, QR and shutdown checks.
- Local portable editor: release/Spark Tour Studio 1.9.3.exe; 157883033 bytes; SHA-256 5D10F2A2B87743C5425B112B924B111662C65725F996FBE0FF4C9A7C55D4C281.
- Complete Windows ZIP: artifacts/Spark-Tour-Studio-1.9.3-windows-x64.zip; 255830039 bytes; SHA-256 25B43B6C10936EE0596B7D570C6D4751F3905B657B93457A687E421A53055448. ZIP contents and internal checksums verified. Includes editor, launcher, web runtime archive, licenses and a short readme; application structure is unchanged.
- GitHub workflows now deliver a single Windows ZIP. Version changes are built locally and pushed with matching new tags; GitHub release results are checked by the user. No GitHub result is claimed for this packaging update.

## v1.9.4 bubble appearance, movement and export compatibility (2026-10-07)

- Global glass translucency, base bubble size and distance translucency persist through save/reopen/export. Per-bubble Size 0 follows the global setting; increases multiply it. Distance fading affects the glass separately from its locally rendered icon/border. Supplied Google Material Symbols paths replace the info, viewpoint-link and scene-link icons; Apache-2.0 text and Google attribution accompany the MIT application and all exported sites.
- Desktop/phone walking routes smoothly turn yaw toward travel, retaining pitch. Simulated XR walking leaves facing unchanged. Desktop visitor Drone/Walk captures the cursor on a scene click, uses a center aiming dot and button-free look, preserves right-drag pan, and releases on Escape/content/settings/editor/XR. Actual Quest acceptance remains manual.
- Legacy content references are repaired during project parsing/open/recovery/save/export without modifying the input object. Stable content IDs or a unique unclaimed title reconnect existing content; blank bubbles get empty content automatically. Explicit missing destinations/content remain validated. The reported Tourv2 bubble reconnects to its existing image page.
- Export omits unused content, skips inactive custom thumbnails/block assets, copies local links/embeds and HTML assets, preserves URL fragments, and resolves local asset bases/scene overrides consistently with the viewer. Asset validation uses the same active references and hosting settings. Original working projects retain unused content.
- All 45 unit/integration tests pass, including actual Spark/RAD chunk reads, colliders, performance/audio/background data, and legacy-content/portable/referenced export regressions. Remote RAD companion chunks and background exports also pass after final URL-path normalization. Existing keyboard/arrow mappings at five headings, pitched flight, right-pan, wheel movement and grounded walking checks pass.
- Packaged native editor and exported browser checks pass for slider authoring, legacy content reconnection, save/reopen/export, bundled Google license, distinct icons, glass distance fading, bubble-size overrides, local-only runtime requests, pointer lock/Escape, path steering and simulated XR facing preservation. Native window shutdown exits with code 0.
- Actual Tourv2 portable export passes in an ignored workspace test folder (`test-output/real-tour-export-1791383217096`): original image content preserved, every referenced asset present, source project bytes unchanged. Real scans/media stay excluded from Git.

Final packaged authoring/export/captured-movement checks: `test-output/bubble-settings-1791383487416`, including native asset validation of local HTML fragments and omission of missing unused content. Packaged ASAR reports version 1.9.4 and license MIT. The GitHub workflow includes this native/exported-viewer check. GitHub release results are left for the user to check.

Final local portable EXE: `release/Spark Tour Studio 1.9.4.exe`, 157,887,053 bytes; SHA-256 `134BF48190D19E1DDC32E37F87A4FF9141B420CFE4A9ABBE31A0AD23B78C03B9`.
Final Windows ZIP: `artifacts/Spark-Tour-Studio-1.9.4-windows-x64.zip`, 255,839,229 bytes; SHA-256 `44FD111239CB065FEAC6CE993D778BE85DB75BD56984AD383A9B33D50C36CECC`. Release ZIP contents and embedded checksums verified. Final packaged source confirms legacy-content normalization and effective-hosting/local-fragment asset validation are included.

## v1.10.0 editor workflow, rich content and streaming precision (2026-10-07)

- Consolidated File/Edit/Add/View/Tools/Help menus and a searchable Scenes/Views/Bubbles browser. Objects sort by numeric name, creation order or world distance, with type filters; distance sorting pauses during list interaction. Selecting an object preserves the camera, with a separate Frame action. Panels resize by pointer or keyboard, hide/show, and retain local preferences. Scene/view/bubble duplication remaps IDs and isolates copied content.
- Locally bundled Google Material Symbols cover editor, viewer and XR actions; the supplied panorama and stacked-location viewpoint vectors are included. Icon controls have accessible names and hover/focus descriptions. Neutral, slightly dark glass shares a consolidated theme across menus, fields, sliders, panels and compact content popups.
- Distance fading affects the entire bubble, including icon, border and label, and removes almost invisible bubbles from mouse/touch/XR hit targets. Zero base translucency produces opaque glass. Scene/view link labels derive from current destination names. Incremental updates retain existing bubble objects while typing.
- Optional `bubbles.occlusion` persists through project save/reopen/export. The Tour settings checkbox disables checks immediately; selected authoring bubbles remain visible. Occlusion uses colliders and Spark's available streamed LoD raycast set, with bounded round-robin checks, movement-aware caching and a surface-placement tolerance. It does not load extra scene data. Streamed geometry and coarse LoD can limit accuracy; real Quest visibility/performance acceptance remains manual.
- Tiptap OSS 3.31.4 and ProseMirror code/licenses are bundled locally. Versioned rich text supports formatting, headings, lists, quotes, links and images by URL/file/drop. Safe shared rendering covers browser popups and generated pages; XR receives predictable structured content. Legacy blocks remain compatible, and nested local images/links are rewritten during export.
- All 72 unit/integration tests pass. Source and packaged TypeScript/Vite builds pass. Read-only validation of the user's Tourv2 preserves four scenes, 47 bubbles and 48 pages through schema roundtrip, with no validation errors and unchanged source bytes.
- Packaged startup/menu/icon smoke check passes (`test-output/package-1791387873921`). Final packaged scene navigation, save/reopen/export, rapid/failed scene loads, retries, mode continuity, fallbacks and unlisted links/entries pass (`test-output/scene-navigation-1791389762219`); XR menu filtering is simulated, not a headset test.
- Packaged bubble settings, local notices, save/reopen/export, full distance hiding, cursor capture/Escape and desktop path steering pass (`test-output/bubble-settings-1791387971158`). Source real paged RAD occlusion, caching, opacity, world scaling, incremental changes, selection reveal and pointer/XR hit cutoff pass (`test-output/bubble-runtime-1791389642978`).
- Final packaged editor panels, a 120-bubble browser, sorting/filtering, automatic labels, rich text/images, duplication, persistence and portable export pass (`test-output/ui-polish-1791389763744`). The exported rich-content viewer passes with external networking blocked. Late progress events cannot replace the successful export status.
- Optional `pagedExtSplats` is stored in performance presets and applies to foreground and background streaming. Precision changes recreate the Spark streaming pool, preserving the renderer, canvas, camera, rig, navigation and XR manager/session. Retirement drains pending sort/LoD work before disposal. Source checks cover real float32 positions, rapid toggles, pending entries, failure/retry, cancellation and simulated physical XR head tracking (`test-output/extended-precision-1791389617931`).
- PLY replacement jobs use the existing import queue and unique staged conversion folders. Successful results update only the current scene source, preserving annotation edits made while conversion runs; cancellation, conversion failure and stale/deleted destinations retain the old scene. Project and hosting overrides undo/redo together. Recovery saves project and hosting in a versioned envelope, remains compatible with old autosaves and keeps recovery/source metadata private on the local server. Actual Rust conversion and recovery/privacy tests pass.
- Explicit RAD edits/relinks update existing per-scene overrides, and native local relinks remain local even with a CDN asset base. Private recovery/source files are omitted when exporting an imported HTML asset directory. Regression tests verify both behaviors without changing annotations or unrelated hosting settings.
- Final packaged precision/re-import check passes (`test-output/advanced-import-1791390267001`): actual float32 foreground/background pool positions, renderer/canvas/camera/rig/mode/XR-manager continuity, cancelled picker, real queued PLY conversion, annotation edits while queued, subsequent RAD relink/typed edits and paired undo, save/reopen/export. The exported viewer streams both extended-precision scenes with external networking blocked.
- Rebuilt standalone launcher passes no-Node-in-PATH, paths with spaces, range streaming, HTTPS LAN sharing, QR display and token-protected shutdown. Release ZIP contents and internal checksums are verified. Tracked/nonignored source audit found no scan data, generated binaries, oversized files or credential patterns.
- Inspected the failed v1.9.4 GitHub run (37638177557): its Windows build/checks passed, but release publication failed because PowerShell splatted a scalar ZIP filename into individual characters. The workflow now wraps paths in an array and requires exactly one Windows ZIP; local native-argument verification passes.

Local portable EXE: `release/Spark Tour Studio 1.10.0.exe`, 158,881,055 bytes; SHA-256 `9C07B480B987F7D03E1CC46F2B037021527717A823D908637106AA1309F59600`.
Windows ZIP: `artifacts/Spark-Tour-Studio-1.10.0-windows-x64.zip`, 257,024,732 bytes; SHA-256 `3910623F3ABE6F71242AAEBF0CD86F7C13DC98918A55ECEEF086433034B92123`.

## v1.10.1 performance draft retention and walking look takeover (2026-10-07)

- Reproduced the performance-panel regression in the old packaged v1.10.0: ExtSplats reverted on reopening. Performance editing state now belongs to the project session and survives tab/dialog changes without reapplying stored settings or replacing the streaming pool. Explicit preset selection, saved/default changes, undo/redo and opening another project still apply stored values.
- Walking releases automatic heading after 12 accumulated pixels of mouse/touch look, while continuing the route. Small individual drag events count cumulatively and do not create a new walking click on release. A new destination restores automatic turning; XR heading stays independent.
- Production TypeScript/Vite build and all 72 automated tests pass. Source native regression verifies ExtSplats, numeric/name drafts, nondefault selection, unchanged Spark instance, explicit selection, save/reopen, default undo/redo and project reset (`test-output/performance-state-1791398195553`). Exported-viewer regression passes real mouse drag, actual pointer lock, touch events, continued movement, new-route reset and simulated XR heading preservation (`test-output/bubble-settings-1791398082133`).
- The final packaged editor passes the same performance retention/default/undo/save/reopen/project-reset checks (`test-output/performance-state-1791398549132`). Packaged authoring/export and its exported viewer pass bubble settings, local icon licenses, pointer capture/Escape, continued route movement and mouse/touch view takeover (`test-output/bubble-settings-1791398549557`). CI includes the new native performance regression. The tracked/nonignored source audit checks 139 files and finds no credential patterns, scan data, generated executables or oversized files.
- Bubble occlusion remains unchanged as requested. Synthetic fixtures are used; actual headset navigation and large-capture visual quality remain manual acceptance items.

The actual portable EXE passes cold start, version 1.10.1, final bundled UI, isolated hidden profile and ordinary close with exit code 0 (`test-output/portable-final-cdp-1791398783276`). Windows ZIP contents and embedded checksums are verified.

Local portable EXE: `release/Spark Tour Studio 1.10.1.exe`, 158,886,831 bytes; SHA-256 `EB81ABDDD04039B5313C1EDEB63AC32EA2FC877850905D21F91D4086EECAB9ED`.
Windows ZIP: `artifacts/Spark-Tour-Studio-1.10.1-windows-x64.zip`, 257,030,814 bytes; SHA-256 `6E6F285B742859C42CDF8C89DE2A33B32F3196DDEF035744100B256639A49C2B`.

## v1.11.0 tour directory, ordering, scene loading and help (2026-10-07)

- Scenes default to saved Tour order with move-up/down controls; name sorting is a browsing choice. Native checks verify order changes preserve the mesh/camera, stable IDs and starting scene, with undo/redo, save/reopen and export.
- The splash directory searches scenes, listed views, descriptions and generated bubble text. Scoped scene/object destinations visit viewpoints or clear positions near bubbles; info content opens, while link-bubble visits wait for marker selection to follow the link. Walking and simulated XR visits ground against the fixture floor while preserving local head tracking. Unlisted views are absent as direct view results.
- Optional occlusion tolerates surface burial and visible upper/side rims, requires consecutive obstruction observations and retains bounded/cached ray work. The actual paged RAD regression verifies splat/collider occlusion and mouse/XR picking priority (test-output/bubble-runtime-1791405411410).
- Rich text paragraphs/headings retain left/center/right/justified alignment in project data, popups and exported pages. Tiptap TextAlign 3.31.4 is pinned and bundled locally with its MIT notice. New bubble text is empty; existing authored content is preserved.
- Scene loading uses a scene thumbnail with tour-cover fallback and a preparation-stage progress bar in shared preview/viewer, plus an in-world XR panel. Deferred RAD metadata and collision responses exercise cover display, progress milestones, broken-cover fallback, success/failure cleanup and retry. The bar does not claim to measure all streamed LoD bytes.
- Help displays the built package version and distribution instructions for HTTPS websites, CDN RAD/RADC hosting/configuration, offline launcher use and local-network Quest sharing.
- All 75 unit/integration tests pass and the production build passes. Final packaged native/exported-browser checks cover the new features, rapid requests, renderer/canvas/session identity, preserved mocked XR head position/orientation, phone layout and blocked external networking (test-output/tour-directory-1791405411292). Packaged 120-bubble browser, panels, rich-media editing, duplication, save and portable export also pass (test-output/ui-polish-1791405409921). Loading/splash/help screenshots were visually inspected.
- Tracked/nonignored source audit checks 147 files and finds no credential patterns, scan data, generated executables or oversized files. A compatible source-map-js patch removes the reported high development dependency advisory; eight moderate development-toolchain advisories remain.

These checks use synthetic assets and a mocked XR session; actual Quest optics/controllers, rough real scans and large-tour performance remain manual acceptance items. GitHub now includes the new packaged regression; release results are left for the user to check.

Local build: `release/Spark Tour Studio 1.11.0.exe`, 158,888,000 bytes; SHA-256 `A992E7C6FA3A961837F9D391332EA50EF5E74A9862FDCC3D961DC4BFBFE7F20B`.
Local build: `artifacts/Spark-Tour-Studio-1.11.0-windows-x64.zip`, 257,039,143 bytes; SHA-256 `19CDB57DD48F7FC79370DB9546685AC026F779B902D3634F478A45DD39D63576`.

Actual portable wrapper cold start verifies version 1.11.0, the final bundled editor, hidden isolated profile and normal close with exit code 0 (test-output/portable-final-cdp-1791406083531). Windows ZIP entries and checksums are verified.
