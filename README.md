# 3DGS Perspectives Studio

Windows authoring application and a shared Spark 2.4.0 / Three.js web viewer. Exported tours include a website, editable JSON, locally bundled runtime code, and a Windows launcher.

## Run

Use the portable editor EXE in `release/`, or develop with Node.js 24 on Windows:

```powershell
npm ci
npm run build
npm run launcher
npm run editor
```

`npm run package` builds the web application, unsigned Node SEA launcher, and portable Electron editor. Building may download Electron and packaging tools. The resulting applications do not require Node.js on the visitor's machine. The tour launcher is approximately 94 MB because it includes its own Node runtime.

For web development, `npm run dev` serves the viewer. The desktop editor uses the production build; run `npm run build` before reopening it. `editor.html` in a regular browser explains how to launch the desktop application.

## Author a tour

1. **File → New project**: choose an empty project directory, or **File → Open project** to reopen a project/export. Save, Preview and Export remain one-click actions.
2. **Add → RAD scenes**: pick one or more LichtFeld `.rad` files, or use **Add → Hosted scene**. Local imports reference their original files during editing.
3. Adjust scene orientation/scale under **Splat transform**. Tour coordinates use meters and Y-up. Set names, thumbnails, allowed modes and entry views. **Scene → Background** offers Solid color, Equirectangular panorama and Gaussian splat.
4. Drag to look, use Drone with WASD/arrows and Space/E up or Shift/Q down to position the camera, then **Add → Capture viewpoint**. Select Views in the tour browser to choose a view. Its inspector lets you rename, reorder, duplicate, update or delete it. Thumbnails are captured with each saved camera view.
5. For Walk and constrained Drone, import a collision GLB or choose **Tools → Generate collider**. The optional **Paged collision** format generates streamable collision and walking tiles; **Legacy GLB mesh** preserves the complete-mesh workflow. Select authored areas or estimate and review an editable whole-scene box. Preview the wireframe, designate a clear walking start, and test navigation before export. See **Paged collision** below for area and headroom settings.
6. Use **Place bubble** or **Add → Information bubble**, then choose **Content** as its bubble type. The bubble label also supplies its popup title. Edit formatted text, headings, lists, quotes, images and links in the Bubble inspector. Rich text supports image URLs, file selection and drop. Separate image/link/embed blocks remain supported; custom HTML lives under Advanced content. Each new content bubble starts with its own content. Image blocks, the tour cover and scene thumbnail accept drag-and-drop, a native file chooser, or a URL/project path. Dropped images are copied into the project. Put custom pages and their dependencies in a dedicated folder: the importer includes the containing folder during export.
7. Scene and View link bubbles derive their labels automatically from their destinations (for example, “Go to Scene: North” and “Go to View: Start”). Refine positions with the gizmo or inspector. Surface picking uses the currently available splat detail. Existing content can be copied from the bubble inspector; older tours remain compatible.
8. Preview, validate under **Tools → Validate project**, save, then export to an empty folder outside the project.

The tour description on the landing page preserves line breaks and automatically makes HTTP, HTTPS and `www` addresses clickable. Links open in a separate tab, and long URLs wrap within the panel on desktop and mobile. The description remains plain text; pasted HTML is displayed literally.

**Tools → Tour settings → Branding** controls the exported tour's identity: author/organization name, website, logo, favicon and footer. Images accept a URL, file selection or drop; favicon imports also accept `.ico`. Advanced options set a separate browser title, search/link description, link-preview image, public website address and browser theme color. Leave optional fields empty to use the tour title, description and cover. Set the public address to the final tour URL (including its subdirectory) for absolute link-preview image URLs. Branding media is saved, relinked and exported with other tour assets; these application resources are independent of the splat CDN setting.

Website addresses accept bare domains such as `example.com` and use HTTPS automatically. Incomplete website/public-address drafts remain saveable and recoverable while editing; inline feedback and export validation identify addresses that need finishing. Drafts are never used as relative visitor links. The Studio application's own Chesapeake Perspectives icon is separate from the tour author's favicon.

The unobtrusive **“made with 3DGS Perspectives Studio”** credit links to [studio.chesapeakeperspectives.com](https://studio.chesapeakeperspectives.com/). Its checkbox starts checked as a request to support the studio; authors can uncheck it. There is no required studio logo or name in the visitor interface. Exported website metadata and local launcher screens use the author's branding too. Re-export existing sites to apply branding changes. Dependency licenses and notices remain included.

The studio's existing profile, saved-project identifiers and cache locations remain compatible with earlier Spark Tour Studio versions. The new application name does not move preferences or require project conversion.

Solid-color scene backgrounds have separate **Top hemisphere color** and **Bottom hemisphere color** pickers under Scene → Background. They blend softly at the world horizon and follow both WebXR eyes. Existing single-color scenes keep the same color in both halves; choose identical colors for a uniform background. The exported JSON retains `color` as the legacy fallback and optional `topColor` / `bottomColor` fields. No image asset or external dependency is required.

The tour browser has Scenes, Views and Bubbles tabs. Scenes default to **Tour order**; select a scene and use **Move scene up/down** above the list to reorder it. The saved array order is used by the splash screen, scene chooser and XR scene menu. Name sorting is an editor browsing option and never changes tour order. Reordering supports undo/redo and keeps scene IDs, links and the starting-scene choice intact.

The inspector follows **Scene → Mesh → View → Bubble**. Collision asset selection, import/relink, alignment, wireframe preview and the collision builder are together under **Mesh**. Finished canceled or failed import jobs offer both **Retry** and **Dismiss**; dismissing one keeps the other jobs intact.

Search, filter bubble types, or sort Views and Bubbles by Name, Distance or Created order. Distance uses world meters and pauses while the list is under the pointer or has keyboard focus. Selecting an object preserves the camera; Frame selected moves it explicitly. New bubbles become visible even when the previous search/filter would hide them. Opening a project resets the browser search.

The splash screen’s **Places & stories** directory searches scene names, listed viewpoints, bubble labels and generated content text. Select a result to load its scene and teleport to the view or a nearby clear position facing the bubble; information bubbles open their content. Visiting a link bubble takes you to the marker, and selecting the marker activates its link. Unlisted viewpoints stay out of direct view results while remaining valid entry points and bubble destinations. Walking visits require a nearby floor and capsule clearance. Scene switches reuse the same renderer and WebXR session. Loading displays the scene thumbnail (or tour cover) and a stage progress bar in the viewer and editor, with a matching in-world VR panel. The bar tracks scene preparation rather than all streamed LoD detail. New information bubbles start with empty text.

Scene and collider transforms apply live without restarting RAD streaming or returning the camera to the entry view. Collision wireframe visibility survives alignment edits and collider replacement. Only collision physics and walking routes rebuild when alignment changes. Search visits face the selected bubble; in XR the rig turns while preserving the physical head pose.

The splash cover fills the screen behind the glass title and search panels. The search directory opens with **Scenes** selected, showing the available scenes in authored order. Switch to All, Views or Bubbles to find other tour content. Its bounded, scrollable results area remains available over the cover on mobile. XR opens directly into the tour with its menu closed. Grip or the wrist menu opens a smaller translucent panel. Generated bubble content includes every text/image block and rich-text image, in one continuously scrolling panel. Use the left thumbstick or hold the scroll buttons. Photos fit a larger reading surface without stretching; select a photo to inspect it larger and return to the same scroll position. Captions remain with their images. Missing images leave the card controls usable. Selecting an XR viewpoint clears old head-collision history, so a jump across a wall does not leave the headset dark. Physical head penetration still fades in Drone and Walk. That check follows the actual stereo eye midpoint and physical tracked motion in the current navigation rig; controller movement cannot leave an old world-space path stuck over the view. Head clearance respects VR scale. Pending collision pages pause movement without being mistaken for head penetration.

Drag either panel divider to resize it; the dividers also accept arrow keys. Hide/restore panels through View or their corner controls. Reset panel layout restores both panels. Layout and browser preferences stay on this computer and are not exported. Tour settings, performance presets and hosting choices live under Tools; scene properties stay in the inspector.

**Help** shows the installed version and includes **Distribution instructions** for Windows viewing, website hosting, separate CDN splat storage and local network/Quest sharing. Rich text offers Left, Center, Right and Justified paragraph/heading alignment, preserved in saved content, browser popups and exported pages. The locally bundled [Tiptap TextAlign extension](https://tiptap.dev/docs/editor/extensions/functionality/textalign) matches the existing MIT editor dependency version; XR keeps the structured text presentation.

Undo/redo covers tour edits. Autosave recovery is offered when reopening a project. Original assets are not deleted when removing scenes. Relink missing assets in the scene/content inspectors. `.sources.json` records authoring-only external file locations; it is not exported.

## Paged collision

**Scene → Navigation & starts → Walking step height** sets the maximum climb in world meters, independent of the scene's scale. The default is **0.5334 m** (1.75 ft); choose **0** to disable automatic steps. Coarse voxel steps use checked rise-then-forward capsule motion while keeping the requested walking speed. Ceilings, obstructed landings and unprepared collision remain blocked.

Walking uses one motor for gravity, jumping, support, steps and landing. Rapier supplies collision/sliding without a second autostep or ground-snap controller. Ground support checks the full rounded footprint at edges, and step probes use the actual contact rather than skipping past narrow voxels. Accepted contacts drive acceleration; a step that clears an obstacle does not inherit its stale wall response.

Desktop and touch walking ease the eye height over terrain steps in both directions, independently of the collision capsule. The easing has a 2.5 m/s vertical limit and is consistent across refresh rates. Jumps, long falls, crouching, view-height changes and teleport/mode changes keep their intended direct response. Geometry and loaded collision constrain visual lag, and WebXR keeps its tracked head motion unfiltered. Existing collision files work with this update; re-export the viewer to distribute it.

Click-to-walk stays on the clicked floor level and follows the navigation surface without spline dips beneath the ground. Navigation is cached separately for each step height. Existing paged routes remain available when their baked step limit is safe for the current setting, with a bounded local fallback for newly climbable nearby steps. Reducing the limit uses nearby collision instead of unsafe baked routes. Regenerate paged collision to bake the updated limit across the whole scene.

**Tools → Generate collider → Collision format** offers **Paged collision · recommended** and **Legacy GLB mesh**. Existing GLB colliders keep working. Changing authoring settings never replaces a scene's collider until generation and saving finish successfully.

Completed generation activates the saved collider immediately, including when a previous walking start failed. Replacement keeps the camera and streamed splat scene in place, releases the old collider, and pauses visitor movement until the replacement is available. A failed replacement remains blocked until retried. Generation diagnostics are saved in the project's private `.spark-tour-diagnostics/` folder, including progress and failures; this folder is excluded from website exports, tour history and local hosting.

Collision generation and bounds estimation continue when you change inspector tabs, hide the panel, enter preview or select another scene. Return to Mesh, or click the progress message in the status bar, to see the same running job and cancel it. Only one collision job can run at a time. Cancel waits for pending writes and walking-data preparation to stop before another generation is available. Results always belong to the scene that started the job.

For paged collision, **Selected areas** uses ordered ball and box shapes to define the space visitors may enter. Green adds navigable space; coral removes it. The scanned model inside remains solid, and space outside the authored domain is blocked. Move, rotate and resize shapes with their numeric fields and 3D handles. Box face handles move one wall while leaving the opposite wall fixed. These shapes describe a navigable volume, rather than a selection of floor splats alone: include enough room for a person or drone.

**Entire scene** starts with **Estimate scene bounds**. The estimate reads original RAD leaf splats with opacity filtering, excludes distant outliers, and displays a box for review. Move/rotate/resize that box before generating, or re-estimate explicitly. Whole-scene coverage is bounded by this editable box. Switching coverage preserves both the whole-scene box and the separate authored shapes; saving, reopening, undo and export retain them.

**Extend areas upward** is optional and defaults off. With it off, generation uses the exact ball/box domain. With it on, **Additional headroom · meters** extends the navigable domain upward without removing the scanned geometry inside it. This is useful for an outdoor area whose initial volume is close to the ground. Collision detail and headroom use tour meters. Transparent-splat filtering remains available for either format.

**Page edge length · meters** controls the amount of collision data needed before a nearby area becomes available. Smaller pages reduce each download and preparation unit, with more requests; larger pages cover more space per request. The default is 8 meters. Valid sizes depend on detail: each edge contains a multiple of four cells, up to 256, with a minimum physical edge of 2 meters and a maximum of 64 meters. The control shows the cell dimensions and clamps page size when detail changes. Page size is saved with the scene authoring options and recorded in the generated manifest.

Generation streams RAD pages, stages point buckets on disk, and builds bounded sparse voxel tiles instead of allocating a whole-scene dense grid. Walking tiles are prepared in a background worker during authoring. The viewer downloads and checksum-verifies complete collision pages, then builds exact physics only in small blocks near the visitor. Blocks have at most 32 cells per edge and preserve the original voxel detail. Cached pages do not retain distant physics surfaces: the 48 MiB page cache and local physics budget have independent lifetimes. Page size controls network delivery, while local blocks bound physics preparation even for large, detailed pages.

For paged collision, **Show collision wireframe** displays guides for the whole saved generated area at any distance, with finer guide subdivisions nearby. The detailed collision mesh still appears near the visitor. The distant guides show coverage boundaries rather than reconstructed obstacle surfaces. They use the saved collider, so editing generation shapes does not change them until a new collider is generated. Existing collision files need no regeneration; older files without valid saved area shapes show their overall manifest bounds. These display guides do not download distant collision tiles or add physics.

Mixed space becomes navigable only when its complete voxel data and the local physics intersecting the visitor are ready. Missing, failed, unprepared or over-capacity regions remain blocked. Drone and walking motion check their swept volume, including large mouse pans. Pathfinding, bubble visits and XR teleport preparation temporarily pin their destinations while preserving the current head and walking support. Distant cached pages alone never unlock movement. Existing paged collision files can be reused without regeneration; re-export the website to distribute the updated viewer. Authoring large scenes still requires generation time and temporary disk space.

The collision wireframe shows the active nearby physics. Selection shapes continue to show the authored coverage of the scene.

Large empty regions use an exact **certified-air hierarchy**. After checking full-detail collision cells during generation, the editor combines neighboring completely free pages into larger all-air tree nodes in the manifest. The viewer can accept that proof without downloading every child page, and creates only the nearby physics needed for domain boundaries. This also avoids scanning millions of empty leaves for a long Drone movement. A certificate guarantees that its entire cube is navigable air at the generated detail: it is never inferred from an unloaded page, a coarse rendering LoD, or missing geometry. Pages containing any obstacle keep their ordinary full-detail loading gate. Regenerate the collision and export again to add this optimization to an existing tour; existing collision files remain compatible.

The scene's `collider` reference points to `colliders/<id>/scene.collision.json`. Keep its `tiles/` and `nav/` folders together. A manifest records checksums, bounds, generation alignment, optional certified-air nodes and reachable files. Certified air needs no separate leaf payloads. Portable export copies or downloads the reachable companions and verifies them; referenced export preserves remote references. Local Git tour versions include reachable local manifests and tile files. Incomplete or cancelled generation leaves the previous collider intact; temporary staging files are excluded from serving and history.

To host collision on a separate origin, set optional `collisionBaseUrl` in `config/hosting.json` to a relative folder or HTTPS base ending in `/`. It is independent of the splat `assetBaseUrl` and bundled application code. Absolute scene collider URLs override the collision base. Preserve each collider's internal paths and configure CORS on the asset host. Normal subdirectory hosting and portable offline exports remain supported.

**Legacy GLB mesh** retains surface selection, smooth/blocky extraction, smoothing, enclosure walls and ceiling. It uses the existing local scientific engine and loads one complete collider at a time. New paged settings do not alter already-exported legacy tours.

## Optional tour Git history (v1.12)

Open **Tools → Tour version history** to enable local Git for a project. The editor detects installed Git 2.30 or newer; use **Choose git.exe…** if necessary. Git is optional and is not required by exported viewers. This release uses your installed Git rather than redistributing a Git runtime.

**Save version** saves current editor changes and creates a named commit. Ordinary Save and autosave remain independent. Local RADs and companion chunks, colliders, media and imported custom-page assets are copied into the project on the first version that uses them. Their project references stay stable; original source files are preserved. Remote assets remain URLs and their remote contents are not backed up. Git ignores machine-specific source mappings, recovery copies, logs, raw PLY/training inputs and executable/archive outputs.

Select a version to compare its tour data with the current working tour. **Restore selected version** saves current edits as a checkpoint, restores the chosen files, and creates a new restore commit without rewriting later history. Unrelated staged files are not included in editor-created tour commits. Refresh the panel after using an external Git client. Disable history to hide the operations while retaining `.git` and existing commits on disk. Save As copies a regular project repository; copies of externally linked Git worktrees omit the `.git` pointer rather than linking the new folder back to the old checkout.

Under **Repository & remote setup**, enter a GitHub/GitLab HTTPS or SSH repository URL. Existing remotes are preserved unless explicitly edited. **Publish & sync** adds GitHub browser sign-in, repository creation and **Push saved versions**. GitHub CLI 2.102.0 is bundled; Git itself remains an optional installed dependency. An existing CLI sign-in is recognized. Authentication uses the CLI's credential storage outside the project, never browser storage or tour configuration. GitHub HTTPS pushes use a per-command helper without changing global Git settings. SSH and GitLab pushes use the installed Git client's existing credentials. Each tour's repository is separate from the application source repository.

**Tools → Publish tour** offers three delivery choices:

| Option | Result |
| --- | --- |
| Export an untracked folder | An independent folder with the viewer, editable tour data, assets and Windows launcher; no Git repository is created. |
| Publish to a local Git folder | A persistent website repository outside the authoring project. Optionally enable **Push published versions to GitHub** for versioning and server updates, independently of Pages. |
| Publish locally and push to GitHub Pages | The same persistent local website repository, pushed to a dedicated GitHub branch (default `gh-pages`) and published through GitHub Pages. |

For tracked publishing, choose an empty folder or an existing published tour website. Select asset delivery, then **Prepare website** and review the folder, branch, files and source version before publishing. The local folder includes `Launch Tour.exe`, ignored by Git. GitHub receives the visitor runtime and tour data without editor, launcher, recovery or authentication files. The Pages option provides **Check publication** for build status and the HTTPS link. Public repositories support free Pages; private eligibility depends on the GitHub plan. Pages websites and included assets are public.

Local Git publishing defaults to `main` for a new folder and detects the current branch of an existing website, including renamed branches. Select an existing branch or enter a new name. Preparation leaves the checkout alone; publication selects the requested branch. New branches inherit the current website history, and existing branches retain their own history. The review identifies branch creation or switching. Local edits and unrelated files remain protected.

For tours too large for Pages, choose local Git publishing and enable **Push published versions to GitHub**. Sign in, create a repository or enter its GitHub URL, and publish. This does not configure Pages or apply its 1 GB hosting limit; GitHub's ordinary Git file limits still apply. Matching website remotes are reused, and other remotes are preserved. Repository creation here does not add a remote to the authoring project. Settings persist when reopening the editor. A remote server can clone the published branch and use `git pull --ff-only` for updates, then serve the checkout through its own HTTPS web server. The Windows launcher stays local and is excluded from Git.

Tracked publishing works without enabling authoring-project history, but requires installed Git. Preparation uses a disposable staging folder; publishing leaves a complete local website checkout and history in the chosen destination. Updates remove obsolete managed website files and preserve unrelated files. Local edits must be committed or undone first. Foreign repositories, conflicting remote changes and Pages configured for another source are preserved. Source history is unchanged; the public publication manifest records its source commit, whether current edits were included, a snapshot hash and the editor version. Publishing current edits does not automatically save an authoring version. No force push runs. Destination preferences stay private and ignored.

Retain remote asset URLs for larger tours. Tracked publishing can omit local splats only when every splat has a configured HTTPS asset URL. GitHub Pages sites above 1 GB are blocked only for the Pages option. Individual Git files above 100 MiB are blocked for both GitHub upload options; publishing solely to local Git has neither limit. Version pushes audit reachable history for private files and credentials before any upload. Large pending uploads are split into approximately 256 MiB asset batches on a temporary upload branch. Retry resumes completed batches for both website and authoring uploads. After the assets arrive, Git builds an object bitmap and uploads the exact original saved commit, then removes the temporary branch. Existing authoring commits, working edits, staging and remote branches are preserved. The indexing step needs temporary disk space for a Git pack and may take time on large histories. Unsaved editor changes need a named project version before **Push saved versions** includes them. [GitHub push and file limits](https://docs.github.com/en/repositories/creating-and-managing-repositories/repository-limits).

Legacy GLB walking routes build in a worker and cache completed meshes in browser storage (up to four entries, 32 MiB total). Geometry, alignment and a generation-version key determine cache identity. Revisiting unchanged colliders reuses the routes; edits rebuild them. Unavailable browser storage falls back to normal generation. Collision geometry is transformed without allocating a vector and array per vertex; loading now distinguishes collider download from physics preparation. The first visit to a legacy GLB still generates routes, and its physics is rebuilt for each scene. Paged collision instead loads author-prepared collision and walking tiles near the visitor.

See [GitHub CLI authentication](https://cli.github.com/manual/gh_auth_login) and [Pages branch publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). A Pages permission or plan failure after upload is reported separately from upload success, with a settings link. Automatic CDN uploading is outside this release.

Export, Hosting & delivery, and the history panel's Hosting size section estimate the published website's size, including local RAD companions, media, colliders, generated pages and bundled runtime files. Above 1 GB, the editor warns that GitHub Pages needs an alternative website host or separately hosted splats. Missing/remote assets are identified as unmeasured, so the estimate is a lower bound in those cases. Files above GitHub's 100 MiB ordinary Git limit are noted without preventing local history or export. Git metadata and history preferences are excluded from exported sites and HTTP serving.

## Visitor introduction and glass appearance

New visitors see an optional guided introduction on the title screen. They can skip it, dismiss contextual movement hints, or reopen the tutorial and pictogram controls through Help. Guidance adapts to Viewpoints, Drone, Walk and touch controls; ordinary exploration does not require completing a tutorial. The viewer remembers its introduction preference locally for each tour.

Tour settings include **Glass shade**, saved as optional `appearance.glassShade` (0–1). It adjusts neutral glass darkness in the editor, exported viewer and XR panels while preserving background bleed-through. Bubble translucency remains a separate setting.

## Navigation

- **Viewpoints:** saved photosphere, orbit or slider views, with smooth camera transitions.
- **Drone:** WASD or arrow keys move; Space/E rises and Shift/Q descends. Free-cursor dragging grabs the scene. Choose **Mouse look** for captured game-style aiming; Escape releases it. Touch devices have a movement pad and height buttons.
- **Walk:** capsule movement against a static triangle collision mesh or authored paged free space. Walls, ground, slopes and low steps are handled independently of splat LoD. Starts without a nearby floor or inside collision geometry are rejected. Click a splat surface to follow a route over the collider; a guide line shows the route. Desktop and touch views turn along the path until deliberate look movement takes control, then continue walking with your chosen view direction. Clicking a new destination restores automatic turning. XR never turns the tracked head automatically. Unreachable clicks do nothing. Manual movement or Escape cancels the route. For GLBs, the bundled Recast worker builds the walkable mesh locally. Paged collision loads prebuilt walking tiles.

On Quest, hold a trigger to aim and release to teleport. Point at a bubble or menu button and click the trigger to select it. Grip opens/closes the translucent tour menu. **Drone flight:** left stick moves forward/back/sideways, right stick lifts/turns. The Options tab can swap the sticks, change speed and turning, mute audio, and choose flying or fading between viewpoints. **Walk:** left stick moves, right stick turns. Snap turning defaults to 30 degrees. Scene entry retains the current mode when enabled and usable; initial entry defaults to Viewpoints when enabled. The menu has a separate confirmation before ending VR.

Walking teleport corrects rough floor and step-edge hits to supported ground within 0.6 meters, with standing capsule, slope and tracked-head clearance. Corrections remain on the selected storey and side of walls. A neutral marker means destination collision is preparing, green means a verified landing, and red means no valid landing was found. Small release tremor retains a landing only while the new ray remains clear; deliberate retargeting and late collision replies cannot activate an old destination.

Scene changes keep the same renderer and XRSession. The viewer never navigates the top-level page to switch scenes. One active splat scene is retained; new scene requests invalidate older load results and dispose old buffers/physics resources.

## Export and hosting

**Portable:** includes local assets and downloads referenced remote assets. RAD metadata is read to collect `.radc` companions. Known external iframe embeds and custom-page resource references fail portable export. External hyperlinks are allowed but need Internet when opened. Review custom JavaScript that constructs network URLs dynamically; static inspection cannot establish its offline behavior.

**Referenced:** keeps remote URLs. The optional omit-local-splats setting leaves those files for separate upload. Application scripts, workers, WASM, styles and required notices remain bundled; editor-only chunks are excluded.

On Windows, run `Launch Tour.exe`. It opens the default browser and a server-control tab. Use that tab's **Stop tour server** button or close the launcher console to shut down. The default viewer binds to loopback. To use a standalone Quest or another device, open the launcher control tab and choose **Share on this network**. Select the Wi-Fi/Ethernet address, then scan the QR code or enter the displayed HTTPS address. Sharing serves read-only tour assets on that interface, supports HTTP ranges, and can be stopped separately. No Internet service, Node installation or developer mode is needed for the network server. Windows Firewall may need to allow the launcher on your private network.

Local HTTPS sharing includes `.scv` paged collision data and `.bin` walking tiles. Exports made before v1.21.3 need an updated launcher for paged collision on shared devices: re-export, or stop the old server, replace only `Launch Tour.exe` with the current version, then restart sharing and reload the visitor page. The tour data does not need rebuilding.

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

Generated pages are exported individually under `pages/`. Browser panels are sandboxed. Generated text and image blocks have a native in-world presentation in a continuously scrolling panel; long text is divided into contiguous bounded textures without changing its reading order. Links and unsupported custom/iframe content explain that they are available in browser view.

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

Choose **Add → PLY scenes** after creating/opening a project. Select Quality (Bhattacharyya) or Quick (Tiny LoD), choose the maximum spherical-harmonics degree, and click **Choose PLY & queue**. Degree 3 preserves all available SH coefficients; lower limits reduce output size. The converter expects supported Gaussian splat PLY data; the bundled Spark 2.4.0 converter’s PLY decoder uses binary little-endian PLY.

The viewer runtime is pinned to Spark 2.4.0. It is bundled locally in editor previews and exported websites, including its decoder code, workers and WASM. The bundled CPU PLY converter is also pinned to Spark 2.4.0, with its source checksum and executable provenance recorded separately. Upgrading the application does not rewrite existing scene assets.

The editor bundles Spark 2.4.0's unmodified Rust `build-lod` tool, compiled in release mode with CPU features. End users need neither Rust nor Node.js. Conversion runs outside the renderer, with live stage messages and a Cancel button. It uses `--gsplat --rad-chunked`, validates the resulting LoD metadata and every companion chunk, then adds the scene. The original PLY is unchanged. A temporary hard link avoids copying on compatible local volumes; otherwise the PLY is copied with streaming I/O. Failed/cancelled output is removed, with available diagnostics kept in `conversion-logs/`.

Converted assets are stored in `assets/converted/<id>/` inside the project and travel through Save As/export like imported RAD assets. Save the project after importing. Large PLY files can require substantial RAM and conversion time; the converter reads the splats into memory. This release does not provide an out-of-core conversion algorithm. It does not generate collision geometry.

To update an existing scan, select its scene and choose **Source asset → Re-import PLY** (also under Tools). Choose the updated PLY in the same coordinate system, then queue it with the desired LoD/SH settings. Successful conversion replaces only the scene's source: IDs, bubbles, content, viewpoints, alignment, colliders and navigation settings remain intact, including annotations edited during conversion. Failure/cancellation leaves the current source unchanged. If the target was deleted or its source changed, the result is not applied. Previous generated files remain available for undo. A relative per-scene hosting override points to the new local RAD, and save/recovery/undo retain that override together with the source.

Developer rebuild: install Rust 1.98.1 (Windows x64 GNU or MSVC toolchain) into `.build/cargo` and `.build/rustup`, without changing PATH, or supply `CARGO_HOME` and `RUSTUP_HOME`. Run `npm run build:converter` before packaging. The script verifies the pinned Spark v2.4.0 archive checksum, uses Cargo.lock and release optimizations, and records executable provenance and license notices in `converter/`. It downloads the source archive if needed. No Rust source modifications are applied.

Importer verification: `node --test tests/converter.test.mjs`, `node scripts/ply-import-check.mjs`, and `node scripts/render-import-check.mjs <export-folder>`. Set `SPARK_PACKAGED=1` to run the import UI check against `release/win-unpacked/3DGS Perspectives Studio.exe`.

## Viewpoints and audio (v1.4)

Viewpoints are selected from the view list, without bubbles in the scene. Selection flies smoothly to the saved camera position. An optional description appears below the view; in VR, select a long description to read it in a scrolling panel. Physical head tracking remains active. VR Options also offers a fade transition.

Scene audio continues across viewpoint changes. A viewpoint can play its own separate audio track when selected. Both offer a file chooser or URL, loop switch and volume control. Local audio travels with the exported tour. Playback starts after entering the tour; Mute audio affects both tracks. Changing scenes stops the previous scene and viewpoint audio.

Bubble captions keep a consistent screen size. The editor's X button offers Save and close, Close without saving, or Cancel when changes are pending.

Desktop navigation: left-drag looks around; right-drag pans in the camera plane; the wheel moves forward/back. WASD and arrow keys move relative to the actual view, including after selecting a rotated viewpoint. Desktop Free Fly follows the camera pitch; Space/E moves up and Shift/Q moves down. Walk stays level and obeys collision geometry. Editor placement allows free translation even when preview navigation is Viewpoints; the visitor Viewpoints mode retains its fixed-position behavior. Right-click never opens the canvas browser menu or activates a bubble or walking destination.


## Performance presets (v1.5)

Open **Tools → Performance presets**. Every adjustment becomes part of the tour immediately and is included in export; use the normal project **Save** to retain it after reopening. Selecting or importing a preset sets the tour's starting profile. Controls participate in undo/redo and recoverable autosave. Name the result and choose **Save preset** or **Save as new preset** to keep a reusable snapshot. Import/export buttons exchange standalone JSON preset files between projects.

The selected preset, unfinished name and adjustments (including ExtSplats) survive closing settings and switching tabs. Custom adjustments are saved independently of named presets, so checking ExtSplats does not require a separate preset-save or default-setting step. Selecting a stored preset replaces custom adjustments with its stored values. Project Save, Save As, and autosave recovery retain all performance controls.

Viewer Settings includes all saved presets and Advanced performance controls. Visitor changes last across scene transitions without rewriting the project. Resolution cap applies to desktop rendering; XR foveation is a headset/browser hint. The preset controls do not change source splats, and rendered splat targets are not hard memory limits.

Performance controls wait for the tour configuration and follow the active renderer settings, including changes made through VR controls. Opening Settings during a slow network load preserves the saved precision profile when tuning another control. Loopback viewing and local HTTPS sharing use the same authored settings.

**Precision & storage → Extended splat precision (ExtSplats)** enables Spark's 32-byte streamed storage with float32 centers for foreground and background RAD. It can avoid coordinate banding introduced by the compact 16-byte runtime representation, at higher GPU memory/bandwidth cost. It is saved as `pagedExtSplats` in performance presets and defaults off. Changing it reloads the streamed resources while keeping the camera, canvas, movement mode and WebXR session. It cannot recover precision already discarded when creating the source file. Spark documents the distinction between loaded and paged precision in [Handling huge coordinates](https://sparkjs.dev/docs/lod-getting-started/#handling-huge-coordinates).

See [the versioned preset specification](specs/performance/README.md), [JSON Schema](specs/performance/preset.schema.json), and [complete example](specs/performance/balanced.performance.json). Export includes copies of each named preset, the active tour settings at `performance/active/preset.performance.json`, and the specification. The viewer uses the settings saved in `config/tour.json`. Runtime code, WASM and workers remain bundled locally.

## Scene import queue

**Add → RAD scenes** and **Add → PLY scenes** both accept multiple files. Choose the PLY conversion method and SH degree for each batch; those settings stay attached to the queued files. Imports run serially to avoid concurrent converter memory use, and each successful import adds a scene named after its source file. RAD imports validate the paged header and companion chunks, then reference the source folder; PLY imports write converted chunks inside the project. Originals are preserved.

Open **Import queue** in the sidebar to see progress, cancel individual jobs, retry failures or clear finished jobs. **Pause after current** lets the active import finish before stopping; you can add more files while paused or running. Failed jobs do not block later imports. Editing and Save remain available during imports; switching projects, Save as, export and collision generation wait until pending imports finish or are cancelled. Completed scenes use the normal project save and autosave workflow. The pending queue is session-only and is cancelled when the editor closes; it does not resume after restart.

## Walk and mobile navigation

In Walk, hold Shift or Q to crouch: the desktop view lowers by 60 cm and the capsule shrinks. Releasing both crouch keys stands up only when the ceiling is clear. Space or E jumps from the ground; holding a jump key does not repeat jumps. Crouched movement is slower. Click-to-walk displays a flat translucent white spline ribbon; manual movement, jumping or Escape cancels the route. Free Fly sweeps a small camera volume against an available collider and slides along walls, floors and ceilings without gravity. With no collider it remains unrestricted. XR physical head penetration fades the view in both Walk and Free Fly.

The editor’s Scene → Navigation settings include **Walking view height**, a 1–2.4 m eye-height slider saved per scene in the tour. Preview and the exported viewer use that authored height. Existing scenes default to 1.7 m. Crouch lowers it by 60 cm; headset height remains physically tracked in VR. There is no height control over the viewport or in visitor settings.

Click-to-walk uses a 10 cm navigation grid to preserve narrow passages in reconstructed colliders. Clicks while the map builds are queued; newer clicks replace older destinations, and manual movement cancels pending routes. Ground picking prioritizes the collider and projects wall clicks onto nearby ground. Destinations snap to nearby navigable ground; disconnected routes remain silent.

Viewing settings include **Mobile controls**: Automatic detects touch-capable devices, Always show forces controls on, and Hide turns them off. This preference is stored locally on the device. Walk provides a movement pad, hold-to-crouch and jump buttons; Free Fly adds hold-to-rise/lower buttons. Drag the scene to look. Desktop-editor Preview offers the same override in its toolbar.

## Viewpoint camera styles

Viewpoints can be Photosphere, Orbit or Slider. Existing tours retain photosphere behavior. Selecting a viewpoint flies the shared camera smoothly to its entry pose. Dragging during a flight steers its destination while retaining the chosen geometry.

- **Photosphere:** drag to look around from a fixed point.
- **Orbit:** drag around a center at a fixed radius. Both mouse buttons and touch follow the same orbit. Its axis follows the tour’s vertical direction, independent of the splat’s source rotation. Optional horizontal/vertical angle limits are in degrees; positive elevation stays above the orbit center. Animation and editor handles use the same axis and limits.
- **Slider:** drag across an oriented plane while retaining the authored look direction. Optional width/height limit the plane; without limits, visitor dragging is unbounded.

In the editor’s Views panel, the selected view has a movement gizmo. **Move geometry** selects its position, orbit center or slider origin; **Frame geometry** brings the handles into view. Drag the axes to move the whole geometry, or select a blue handle to adjust orbit radius, angle limits or slider size. **Place geometry on scene** places the viewpoint position, orbit center or slider origin on the clicked splat surface. Moving an orbit or slider also moves its saved starting camera by the same amount. **Move plane / Rotate plane** selects the slider’s origin handle and transform tool. **Update from camera** updates both the camera pose and its controlling geometry, keeping the existing type and options. Use Preview to try the visitor controls. Geometry positions belong to the scene coordinate system and follow scene transforms; the orbit’s vertical axis stays aligned with the tour. Placement and gizmo edits support undo/redo.

In the collision Mesh inspector, selected boxes show six square face handles in **Move**, **Rotate** and **Scale**. Select a face handle and drag its single axis to move that wall while the opposite wall stays fixed. This also works for rotated boxes. The ordinary scale gizmo remains available for resizing the whole shape.

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

Editor Preview/Edit keeps the camera pose. If the author has moved away from a viewpoint’s geometry, entering Preview keeps the new vantage point; select a saved viewpoint explicitly to use its authored navigation geometry. Initial scene loads still position the camera at the scene’s starting view. Thumbnail refresh is an explicit action and may move the camera to that starting view. Content bubbles use an info icon, scene links use an outgoing photograph icon, and viewpoint links use stacked location frames. Glass uses a subtle neutral dark shade while keeping background colors visible.


### Scene navigation and unlisted views

Changing scenes retains the current movement mode when it is enabled and usable in the destination. Otherwise it uses Viewpoints when enabled, then another usable mode. Walk arrivals use the designated walking start; a scene bubble with an explicit destination viewpoint instead finds standing clearance near that viewpoint. Failed loads and retries retain the selected mode. Scene changes retain the existing renderer and XR session.

In Views, uncheck **Listed in visitor views** to hide a viewpoint from the visitor's numbered view strip and VR Views menu. Unlisted views remain editable, usable as scene/walking starts, and reachable through viewpoint or scene bubbles. All views in older projects remain listed. Project JSON stores the optional boolean `listed`; only `false` hides a view. Listing does not restrict access to a view or its content.


## License and automatic builds

3DGS Perspectives Studio's original code is MIT-licensed; see [LICENSE](LICENSE). Bundled dependencies retain their respective terms and notices in [THIRD_PARTY.md](THIRD_PARTY.md) and the exported `licenses/` directory. Tour authors retain responsibility for their own scan and media rights.

GitHub Actions builds and tests Windows x64 on pushes to `main`, pull requests, version tags and manual runs. It installs pinned Node 24.21.0 and Rust 1.98.1, builds the Spark converter from checksum-verified source, runs the tests, builds the site and launcher, bundles the editor mesh engine, and checks the packaged editor plus exported viewer. Branch and manual builds provide one Windows ZIP containing the portable editor, standalone tour launcher, web runtime template, licenses and SHA-256 checksums. GitHub Releases publish that same ZIP; local builds still produce the portable EXE. The web runtime template contains no authored scene assets; use the editor to export an actual tour.

Pushing a new `vX.Y.Z` tag publishes a GitHub Release after the build passes. The tag must match `package.json`; existing release tags must not be moved. Update the package and lockfile version first with `npm version X.Y.Z --no-git-tag-version`, commit the change, then create and push the matching tag. The executables are unsigned. Quest hardware acceptance remains a manual check.

Local packaging requires `npm run build:converter` once before `npm run package`. Supply `CARGO_HOME` and `RUSTUP_HOME` for the pinned Rust installation; Windows GNU and MSVC toolchains are supported. GitHub's hosted Windows runner uses MSVC. Build outputs, private configuration, local scan data and caches are excluded from Git.


A failed publishing step can be recovered through Actions → **Publish tested release** → **Run workflow**. Supply the existing version tag and the original build run ID. Publishing verifies that the tag matches the tested build commit, that the Windows packaging job passed, and that every downloadable file matches its SHA-256 manifest. It does not move tags or rebuild the application.

## Bubble appearance and mouse capture

Tour settings include Bubble translucency (0% opaque to 100% clear), Global bubble size (0.5–3× the default footprint), and Bubble fade distance in meters. Disable Fade distant bubbles to keep them visible at any distance. Each scene can inherit these defaults or override them. Settings apply to content, scene-link and viewpoint-link bubbles in desktop, mobile and WebXR viewing.

Each bubble has a Size slider. 0 uses the global size; 1 doubles it; 2 triples it, up to 4 (five times global). Existing projects retain their original appearance. These optional preferences are saved in `bubbles: {translucency, size, distanceFade}` on the project and `size` on each hotspot; they survive save, reopening and export.

Walking builds up speed gradually, brakes when input stops, and slows before path destinations. Click-to-walk makes a finer local route check for narrow passages when the ordinary route fails; the space must still fit the standing walking capsule. Keyboard, touch, controller and path movement share this behavior; jumping and gravity retain their physical movement. Walk paths smoothly steer the desktop/phone view toward travel while retaining the current pitch. WebXR paths leave headset facing under the visitor's control. In Drone and Walk visitor modes, choose **Mouse look** to capture the mouse, then move it to look without holding a button. Ordinary scene clicks never capture the cursor. A small center dot aims bubble selection and walking clicks; a visible state explains how to release the mouse. Escape releases it and stops a path; opening content or settings releases capture. Right-drag still pans. Editor placement/gizmos and touch gestures keep their ordinary pointer controls.

The supplied Google Material Symbols SVG paths are bundled locally (no font-service requests), with Apache-2.0 license and attribution in `licenses/` and `THIRD_PARTY.md`. The info, viewpoint and scene-link symbols have distinct shapes.

Legacy content bubbles with empty references reconnect to their stable content ID or a unique unused content title when opened, recovered or exported. An empty bubble gets its own empty content page automatically; authors do not need to manage page links. Explicit broken scene/viewpoint destinations still need correction. Export includes only content used by bubbles, so unused legacy content does not block delivery; the working project retains it for the existing-content copy tool. Local link/embed files and imported HTML assets are included. Starting-view thumbnails ignore unused custom-image references, and validation/export resolve splat delivery settings consistently with the viewer.

## Bubble visibility and rich content (v1.10)

Tour settings separate glass translucency, whole-bubble distance fade, size and optional occlusion culling. At 0% translucency the bubble interior is opaque. Distance fade affects the icon, rim, glass and label together. Tour defaults specify the disappearance distance in meters or disable fading; each scene can inherit it, multiply it, set its own distance, or disable fading. Existing strength-based settings keep their original behavior until edited. Below 5% visibility a bubble no longer intercepts mouse, touch or XR rays. Selected editor bubbles remain visible for placement.

**Hide obscured bubbles** is optional and defaults on. It uses a loaded collider and Spark's currently available streamed splats to check line of sight, with bounded work per frame and a surface tolerance. No extra splat scenes or files are loaded. Visibility can lag by a fraction of a second and reflects available LoD; thin surfaces or incomplete scans can affect results. Disable it in Tour settings independently of distance fade.

Formatted text is stored as versioned rich JSON on text blocks; the plain text is retained for compatibility. Existing plain text, image/link/embed blocks and HTML pages remain readable. Popups and individual exported pages share the same safe renderer. Generated XR panels preserve readable headings/list text, images and links through native panels. The editor's rich-text libraries are bundled locally and excluded from the exported visitor runtime. Google icons are bundled SVG paths, including the chosen viewpoint and equirectangular panorama icons; no icon font is fetched.

The legacy GLB collision builder bundles Pyodide, NumPy, SciPy and scikit-image locally; it needs neither Python nor a GPU meshing executable. These editor-only libraries are omitted from tour websites. The first development build downloads pinned, checksum-verified wheels; subsequent builds reuse the local cache. Selection and enclosure code was written independently for 3DGS Perspectives Studio. GPL-marked Lichtfeld plugin source is not part of this repository. Smooth surface extraction uses SciPy Gaussian filtering and scikit-image Lewiner marching cubes under their own included licenses.


## Walk destination picking and box faces (v1.19.7)

Walk clicks on paged collision trace the authoritative collision grid, fetching only crossed pages within the existing cache limits. They do not depend on splat picking or mistake temporary physics seams at unloaded pages for scene geometry. Legacy GLB scenes continue to pick their physics mesh. A landing may adjust by up to 60 cm to fit the standing capsule beside a voxel edge; the clicked floor height, verified coverage and physical clearance still constrain it. Bubbles retain first click priority. New clicks, manual movement and scene/mode changes invalidate pending picks, while a local physics/navigation refresh preserves the visitor's intent.

A selected collision box exposes six square face handles in Move, Rotate and Scale. Drag a face directly to resize that side with the opposite side fixed, including rotated boxes and whole-scene bounds. The handles retain approximately 12 pixels of size with camera distance. Move/Rotate/Scale still operate on the complete shape; switching those tools returns to the shape control. Balls retain their normal scale controls.


## Automatic stepping and route detours (v1.19.8)

Step height is the maximum normal automatic walking step, not a jump height. Click-to-walk does not plan jumps. When a nearby route (up to 16 m between endpoints) is substantially longer than the direct distance, the planner also checks a bounded local route using the current step limit and finer geometry. Paged scenes prepare a narrow collision corridor under the existing physics/cache budgets, rather than rebuilding the whole scene. The same walking motor and standing capsule test candidate shortcuts in an isolated worker world, with gravity, ceilings, walls and the automatic step limit; excessive drops are rejected. Only a shorter valid route replaces the original. If preparation or shortcut validation fails, the original route is retained. Manual movement/new clicks/scene changes cancel pending refinement. Longer routes retain the existing paged search and fallback behavior.

## Authored speeds, VR size and viewpoint history

In **Tour settings → Movement defaults**, choose the global base speed. **Scene → Navigation & starts** adds the scene speed factor and VR scale. **View → VR scale** adds the viewpoint's VR factor. Movement is base × scene × visitor multiplier; the exported viewing settings and VR Options show a visitor multiplier. VR size combines scene × viewpoint factors and applies only in WebXR, without changing scene/collider transforms.

In **View → Extended description**, enable the history side panel and use the bubble-style rich-text editor, including imported or URL images. Add related-scene buttons below it, optionally choosing an unlisted entry viewpoint. Preview and exported tours show the same closable glass side panel; VR uses native scrolling content and controller-selectable scene buttons. The existing short description remains available below the view. See [navigation settings format](NAVIGATION_SETTINGS.md) for defaults and JSON fields.

### Mixed-scale tours and compact viewing

Set common values in Tour settings → Movement defaults and Bubble defaults. Scenes inherit walking height/step height unless explicitly overridden; scene speed remains a multiplier. In Scene → Bubble overrides, choose tour distance, a multiplier (for example 40× for an aerial overview), a scene distance in meters, or no distance fade. Size, translucency and occlusion can also vary per scene. Effective values appear beside the controls; old settings retain their behavior until edited.

Phones use a compact scene selector and Tour controls sheet in portrait and landscape. Viewpoint details begin collapsed to About this view, with controls remaining recoverable. Immersive VR never auto-animates authored viewpoints: the left stick moves along the authored geometry and the right stick turns around the tracked head. Walk/Drone retain trigger teleportation; viewpoint triggers select content without starting ground navigation.

Viewpoints do not request collision data. Movement modes load it when needed; missing tiles remain blocked while healthy areas and content continue working, and repaired tiles can recover without refreshing the tour. Re-export existing tours to receive the updated viewer.
