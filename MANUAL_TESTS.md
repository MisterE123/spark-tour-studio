# Manual acceptance

## Paged collision upgrade

- Open an older tour with a GLB collider. Confirm ordinary viewing, Walk/Drone, alignment, wireframe, save/reopen and export still work. Generate another collider with **Legacy GLB mesh**, checking smooth/blocky output and cancellation independently of the paged path.
- In **Selected areas**, author overlapping add/remove balls and rotated boxes around intended navigable volume. Include enough height for a visitor. Check ordered overrides, one-wall box resizing, live selection response, undo/redo and retained shapes after switching to **Entire scene** and back.
- In **Entire scene**, confirm generation waits for an estimated box. Estimate a representative capture containing distant outliers; review and adjust the box in 3D and numerically before generation. Test re-estimation, scene scale/rotation, and retained bounds after save/reopen, undo/redo and portable export.
- Compare exact domains with **Extend areas upward** off/on. Check the additional headroom slider/field, model solidity inside the region, blocked removed regions and blocked space outside the domain. Try low ceilings, thin regions and disjoint volumes; a standing visitor must still fit.
- Adjust Page edge length at several detail levels. Check the displayed cell dimensions, 4-cell alignment, 256-cell limit and automatic clamping when detail changes. Save/reopen and export a non-default size, then throttle downloads to compare time until nearby space becomes available and the number of requests.
- Generate a large real RAD at several detail levels, including companion files and a transformed scene. Record authoring duration, peak memory and temporary disk use. Cancel while reading pages, writing collision tiles and preparing walking tiles; the original collider must remain usable, partial outputs must not replace it, and another generation must succeed.
- Cold-load a generated tour and verify nearby collision/walking tiles arrive without rasterizing the whole scene. Walk/Drone across tile seams, slopes, stairs, doors and narrow passages. Click paths across multiple tiles and toward disconnected destinations. Check continuous sliding, jump/crouch, capsule clearance and safe starting positions.
- Regenerate a collider with a large completely empty navigable volume. Confirm its manifest contains compact `airNodes`, omitted all-air leaves produce no HTTP requests, and cold loading/movement through the region stay fast with bounded nearby physics. Compare several page sizes. Check the domain edges, transitions into mixed obstacle pages and navigation across those transitions. An air parent must never conceal a thin wall, removed area or partly occupied child; those regions must retain full-detail collision. Re-export and test portable/local-network/remote hosting separately. Existing colliders without summaries must still work.
- Throttle tile downloads and physics preparation; remove or corrupt one collision tile and one walking tile separately. Movement must wait until full-detail data is verified and its physics is installed. Try a large right-drag pan across an evicted page while adjacent seams are rebuilding; it must not skip blocked space. Check retry, rapid scene changes, cancellation, bounded residency and eventual resource cleanup.
- Change scene and collider alignment with the wireframe enabled. Check preserved camera/streaming and matching paged movement, wireframe, bubble picking/occlusion and click-to-walk coordinates. Scene changes must retain movement mode when usable.
- Save a local Git tour version containing paged collision, reopen it, restore an earlier version and export. Verify every reachable manifest, collision tile and navigation tile is included; missing, malformed, unsafe-path or checksum-invalid companions must block a complete export.
- Export a portable folder, block external networking and cold-start it. Host another export under a subdirectory. Move the collision folder to another CORS-enabled origin using only `collisionBaseUrl`; leave `assetBaseUrl` unchanged and check application resources still load locally.
- On Quest 3/3S, test smooth movement, trigger teleport, physical head collision, routes and scene switching around streamed boundaries. Check frame rate and memory on a representative capture, safe behavior during failures, and unchanged XR session identity. Desktop/phone fixture checks do not replace physical headset acceptance.

## v1.18 web viewer polish

- On a cold desktop visit, try the optional guided introduction, skip it, replay it from Help, and revisit the site. Test each mode and touch override. Check that the invitation is noticeable without blocking entry or the scene directory and that guidance can be dismissed. Ask a visitor unfamiliar with 3D controls to navigate between views and open content.
- Click scenery and bubbles with the cursor free: ordinary clicks must never capture it. Free drag should grab the scene, right drag should pan. Choose Mouse look deliberately, check its indicator and center dot, then Escape. Open settings/content or switch scenes/modes while captured; the cursor must release.
- In Drone, compare Space with E and Shift with Q, including pitched camera movement. In Walk compare Space/E jumps and Shift/Q crouches, low ceilings, landing, arrow/WASD equivalence and held keys. Test keyboard focus on inputs and menus.
- Adjust Glass shade, save/reopen/export, and compare light and dark captures, title/search surfaces and numerical inputs. Check local theme settings also reach Quest popup panels.
- On Quest 3/3S, read a long multi-block popup. Scroll continuously with the left stick and held Up/Down buttons, select wide/tall photos to enlarge, return to the same position, and close. Check clipping, both eyes, captions, missing/slow images, content replacement, repeated scene switches and stable XR session identity. Inspect text size and panel distance on hardware.
- Move/rotate/resize many add/remove collision shapes on a large streamed capture. Compare dragging responsiveness and check tint accuracy after selecting, reordering, removing, undoing and switching scenes. Mesh generation must still obey the authored regions. Legacy exports retain GLB physics; test the optional streamed collision format separately using the checks above.

## v1.14 publishing destinations and large uploads

- In Tools → Publish tour, test untracked export with Git unavailable; verify the folder includes its launcher and has no `.git`. Test local Git publishing while signed out and offline, then update the same folder. Confirm normal history, removed obsolete runtime files, and preserved unrelated files.
- Publish that local website to GitHub and confirm its local and remote commits match. Reopen the original project and confirm the destination/asset choices persist. The authoring branch must remain unchanged. Commit or undo manual published-folder edits before another publication.
- Try a multi-gigabyte first project backup whose individual files are all below 100 MiB. Interrupt after a completed upload batch, retry, and verify the final original commit matches GitHub. The temporary upload branch should disappear after success. Verify historical private files and oversized individual files fail before any upload.
- Revisit a large collider, including after a browser restart on the same site origin, and compare route readiness with the first visit. Changing geometry/alignment must rebuild routes. Verify normal manual walking and pathfinding when browser storage is unavailable. First physics setup and route generation still require computation.
- On Quest, repeat scene switching, collision, cached route loading, controller selection and session exit/re-entry. Check the glass sharing header at narrow window widths and when its body is scrolled.

## v1.13 GitHub connection and Pages publishing

- Use a fresh editor profile and complete browser sign-in with the one-time code. Test copying/reopening the sign-in page, cancellation, expired codes, offline startup, sign-out and an existing GitHub CLI login. Verify that no token enters the project, export, renderer state or diagnostic logs.
- Create a public or private test repository. Push saved tour versions, make an annotation change, save another version and push again. Verify the remote branch matches the saved commit. Test missing permissions, SSH/GitLab credentials, a newer remote branch, historical private files and large initial uploads.
- Prepare and review a small multi-scene website, publish to Pages and check its status and HTTPS URL. Test desktop, mobile and Quest WebXR on the real site, including RAD companion requests and ranges. Update content and republish; earlier website commits and unrelated branch files must remain.
- Publish without enabling local history. Check the ordinary project files are unchanged, preferences are ignored/private, staging is cleaned up, and no launcher/editor/recovery/authentication files are uploaded. Verify Save As and project reopening retain the chosen destination.
- Reject another website already on the destination branch or Pages configured for another source. Simulate a change between review and publication and confirm no forced overwrite. Check a successful upload followed by a Pages plan/permission error is reported as setup-needed.
- Test the 1 GB Pages and 100 MiB Git limits, missing assets and omitted splats without remote URLs. Publish a small viewer with separately hosted HTTPS splats, including backgrounds; verify CORS, range streaming and URLs. Keep CDN uploading manual for this release.

## v1.12 optional Git history

- Enable history for a tour with external RAD/chunk, image, collider and custom HTML references. Save a named version and confirm the local copy includes required files while the original assets remain intact. On a machine without Git, ordinary editing/export must remain available; install or choose Git to enable history.
- Edit annotations, add a scene and save another version. Compare and restore the earlier version with additional unsaved changes. Confirm a checkpoint and restore commit are appended, later history remains recoverable, and historical scene bytes render after restore. Repeat after moving/cloning the project and deleting the original external asset locations.
- Use an external Git client to stage an unrelated file, then save a tour version in the editor. Confirm that file remains staged and outside the tour commit. Set up GitHub/GitLab remotes, including SSH and subgroup URLs, and push manually with your own client. Existing remotes must not be silently replaced.
- On a large real tour, inspect the GitHub Pages warning in Export and Hosting & delivery. Compare local portable, CDN-hosted and omitted-splat choices. Confirm missing/remote assets are marked unmeasured, the EXE is excluded from website size, and the warning does not block Windows/offline export.

## v1.11.4 shared performance settings

- Save a tour with ExtSplats enabled as a custom adjustment while its named Balanced preset has ExtSplats disabled. Export, launch and share over HTTPS. On Quest 3, open Settings immediately on a cold visit: performance controls should wait for configuration, then show ExtSplats enabled. Change Resolution cap or Detail multiplier and verify precision stays enabled. Repeat after a scene change and reload.
- In VR, change quality through the controller menu, then inspect browser performance settings after exiting VR. The controls should reflect the current quality without reverting precision. Compare coordinate banding against compact storage on the actual large capture.

## v1.11.2 live edits and XR polish

- With the collision wireframe enabled, edit scene/collider position, rotation and scale, relink the GLB and undo. Confirm the overlay remains visible, the RAD does not reload, camera stays in place, and Walk physics follows the new geometry.
- On Quest, enter directly into the tour, open the compact menu with grip/wrist, and confirm ray targets and text are comfortable. Select viewpoints across walls in Drone and Walk; a temporary transition fade must clear. Deliberately lean through geometry and confirm the physical-head fade still works.
- Open a bubble containing text, wide and tall images, rich-text images and several blocks. Scroll through every block with the left stick or held scroll controls, check correct aspect ratios/captions and photo enlargement, and verify usable controls after a failed image request. Rapidly close or scroll while images load.
- Search-jump to information bubbles in another scene on desktop, phone and Quest. Confirm a nearby valid position facing the bubble, with physical headset pitch/roll unchanged. Check the full-screen cover behind the glass title/search panels on short/tall windows and mobile. The directory should initially show Scenes in tour order; select Views/Bubbles/All to search other content.

## v1.11.1 hemisphere backgrounds

- Open an existing solid-color scene and confirm both hemisphere pickers initially show its old color. Set distinct upper/lower colors and look above, below and across the horizon; check a soft transition, phone layout and both Quest eyes.
- Move far from the origin, fly up/down and turn the headset. The horizon should stay world-up without parallax or a sharp boundary. Match both colors for a uniform background.
- Adjust colors while streaming a scene, undo/redo, save/reopen and export. Check foreground annotations/camera/streaming are retained and that exported viewing works offline. Switch between hemispheres, panorama, splat and old single-color scenes; verify cleanup and rapid changes.


## v1.11 tour directory, ordering and help

- Select scenes in Tour order and move them up/down. Check boundary controls, undo/redo, name browsing, save/reopen and export. Splash scenes, visitor scene chooser and Quest scene menu should follow the saved order; stable links and the chosen starting scene should stay intact.
- Search the splash directory by scene, view name, description and bubble content words. Check duplicated names across scenes, empty results, a large tour and phone scrolling. Unlisted viewpoints should stay absent. Select results in other scenes and during failures; retry should complete the original destination visit.
- Visit information and link bubbles in Viewpoints, Drone and Walk. Information opens its popup; a link-bubble result should go to the marker before its link is selected. Check nearby clearance, floors, walls and rough terrain. In Quest, verify preserved physical tracking and XR session identity through destination visits.
- Place bubbles partly in rough ground or at mesh edges. With occlusion enabled, slight surface burial or a visible rim should remain visible; broad obstructions should hide them after repeated checks. Try sparse LoD updates, movement and the occlusion checkbox separately.
- Justify paragraphs/headings, mix alignment with links/lists/images, undo/redo, reopen and export. Verify popup and page alignment in desktop/mobile browsers, including Firefox. XR continues to use structured text panels.
- Open Help → Distribution instructions and About & licenses. Verify the version matches the EXE; follow the website, CDN and Launch Tour.exe steps using a fresh export and another network device.

- Throttle a scene load: its thumbnail/cover and progress bar should appear until scene preparation finishes; repeat with a missing thumbnail, failed scene, rapid scene changes and VR. The preparation bar must clear on failure or success. New bubbles should have empty text.

## v1.10 interface and bubble visibility

- Resize and hide/restore each editor panel. Restart and confirm the layout returns. Reset layout and use divider arrow keys.
- Search a scene with hundreds of bubbles; sort by name, camera distance and created order. Select duplicate names, filter types and create a bubble while a restrictive filter is active. Confirm selection does not move the camera; Frame does.
- Rename destination scenes/views and verify automatic link bubble labels in the editor, exported viewer and XR.
- Verify 0% bubble translucency over bright and dark surfaces. Increase distance fade, check the displayed cutoff distance, and confirm faded bubbles let walking clicks and XR rays through.
- Toggle Hide obscured bubbles on/off. Test inside/outside walls, surface-attached bubbles, transformed scenes, sparse captures and newly streamed details. Check that the selected editor bubble remains visible and that disabled culling restores ordinary distance visibility.
- Type formatted content with headings, lists, quotes, links and local images. Undo, reopen and export; confirm formatting/media survive in the popup and individual page. Check long content, image width, scrolling and links on mobile/Quest.
- On Quest 3/3S inspect the new dark glass menu, icon faces, navigation controls, distance/occlusion picking and rich-content panel scrolling on a representative capture.

The user's LichtFeld export will be tested manually. No matching collision GLB was available during implementation. The following checks remain necessary before production use.

## LichtFeld scene

- Create a project and import the known-working `.rad`. Verify orientation, scale, colors and detail while moving.
- For chunked RAD, verify companion requests and missing-chunk Retry behavior. Test a monolithic file on a range-capable CDN.
- Add two more scenes; switch rapidly and repeatedly. Inspect memory after stabilization and verify old scenes stop streaming.
- Place a bubble on the scene, move it with the gizmo, save/reopen, and verify its location.
- Exercise a scene with large coordinates. Compare compact storage with Extended splat precision in performance settings; check whether coordinate banding disappears without moving the authored annotations.

## Collision

- Use Tools → Generate collider with an imported RAD, or import an existing GLB. Test paged and legacy formats independently, several detail levels, cancellation and a large capture; check wireframe alignment and memory use.
- Import and align it; confirm wireframe positions and capture a walking start above the floor.
- Walk against walls, through doors, up/down stairs and slopes. Check narrow passages, holes and weak scan geometry.
- Verify invalid starts report an error. Walk is unavailable until a collider loads; the other two modes still function.

## Quest 3 / 3S WebXR

- Run the exported launcher, enable Share on this network, and enter its HTTPS address in Quest Browser on the same Wi-Fi. Verify the local certificate warning, scene loading and Enter VR. Also scan the QR from another device.
- Check all billboards are readable from the front after snap turns, scene changes and physically moving around the menu.
- Enter immersive VR; select bubbles and viewpoints with both controllers. Squeeze to reposition the world menu.
- Select scenes repeatedly and while loading. Confirm no new Enter VR prompt or application-driven session end.
- Confirm Viewpoints preserve tracking, trigger-hold/release teleports, and Drone maps left stick to translation and right stick to lift/turn. Test snap turns and Walk.
- Check that menu buttons are opaque and readable, grip closes/reopens the menu, and Exit VR requires confirmation.
- Click-to-walk should detour around walls. Unreachable clicks stay silent; movement or Escape cancels a route.
- Check physical head movement near collider surfaces, panel readability, long-text scrolling and image rendering.
- Confirm custom HTML and external embeds show the expected browser fallback.
- Exit/re-enter XR, try reference-space recentering, and assess frame rate with a representative large scene. Reduce quality as needed.

## Export and other devices

- Open the portable export on Windows without Node.js installed, with networking disabled. View scenes and local pages; stop through the launcher control tab.
- Reopen the exported project in the Windows editor on another machine.
- Host beneath a URL subdirectory. Change only hosting JSON to serve splats from a separate CORS-enabled origin.
- Try mobile touch controls and responsive panels in Android Chrome and iOS Safari; WebXR availability is browser-dependent.
- Validate custom-page relative assets and scripting under the iframe sandbox. Check imported pages for dynamically constructed external requests before claiming offline operation.

## v1.4 acceptance
- Use the user's 35-million-splat PLY with Standard collision detail. Confirm preparation completes, the original remains unchanged, and the generated wireframe and walking floor are usable. Test Detailed separately; fixture checks do not establish large-capture performance.
- Select viewpoints during desktop and Quest viewing. Confirm smooth arrival, tracking preservation, flight cancellation with manual movement, and the optional fade setting.
- Confirm no viewpoint bubbles appear; content bubble captions remain readable near and far.
- Import scene and viewpoint audio. Check looping, volumes, mute, selection changes, scene cleanup, save/reopen and a portable export offline.
- Check VR ray tips, both controllers, menu Options, swapped sticks, vertical motion and all turning settings on Quest 3/3S.
- Close the editor using X with saved changes, unsaved changes and an active conversion. Exercise save, discard and cancel.

## v1.5 performance tuning
- Test Balanced, Lightweight, High detail and a saved custom preset against a real large LichtFeld capture on desktop and Quest. Compare frame rate, streamed detail, visual artifacts and memory use.
- Check SH changes on a capture containing view-dependent color, sorting lag with a larger interval, and splat culling near/far from surfaces.
- Apply different XR foveation values while a headset session is active and verify that tracking/session identity persists. Confirm desktop resolution cap is restored after leaving XR.
- Transfer a named preset file between two project folders; set it as default, save, reopen and export. Test the export under a subdirectory and offline.

## Scene import queue

- Select multiple large real RAD/PLY files, add another batch during a running conversion, and confirm only one converter runs at a time. Check progress, responsive authoring and Save.
- Pause during a conversion, cancel a waiting item and an active item, retry, and confirm cancelled files never add scenes. Retry a failed file after repairing its chunks.
- Save/reopen completed scenes and export their chunks. Close with work pending: Cancel keeps the queue running; Save and close cancels unfinished imports and retains completed scenes. Pending jobs do not resume after restart.

## Walk, path ribbon and touch controls

- Walk with Shift held: verify the desktop eye lowers 60 cm, low passages remain traversable, releasing below a ceiling keeps the view low, and emerging allows standing. Check slopes/steps while crouched.
- Jump with Space: check floors, stairs, ceilings, landing and no repeat/midair jumps. Holding Space should jump once.
- Click destinations and check the white translucent flat ribbon on curved paths, stairs and transformed scenes; route arrival/cancellation removes it.
- Free Fly should stop and slide at collider walls/floors in desktop and real Quest WebXR. Head-crossing fade applies in Walk and Free Fly.
- On phones/tablets use touch look, pad movement, hold Crouch, Jump and flight Up/Down. Verify pointer cancellation releases movement. Test Automatic/Always show/Hide and saved preference.

## Typed viewpoints and thumbnails

- Open an older tour: existing viewpoints should be photospheres. Verify default scene thumbnails are captured at the starting camera pose; changing the start uses that view’s screenshot. Test refresh and custom-image override, save/reopen and export.
- Author each camera type in a transformed scene. Frame geometry; drag position/center/radius, orbit-angle endpoints and slider plane-size handles. Move/rotate the slider plane, undo/redo, save/reopen/export and inspect numeric values.
- Preview on desktop and touch: photosphere position stays fixed; orbit radius and angle limits hold; slider stays on its plane and optional rectangle. Verify smooth transitions and interruption.
- Enable idle animation for each type, including a starting pose near a bound. Motion should start continuously, remain bounded and stop on visitor input; reselecting resumes it.
- On real Quest, verify persistent session identity, physical head tracking, controller interaction, menu pause, transitions and idle movement comfort.

## 1.8.1 movement checks

- In Tourv2, choose Walk and click clear ground near the starting view, including while the walking map builds. Verify route arrival, replacement, Escape cancellation and silent disconnected destinations.
- Adjust Walking view height in Scene → Navigation, save/reopen and export. Verify immediate camera-height changes, unchanged feet/collision placement, crouch lowering relative to that height and reload persistence. VR must retain physical headset height.
- In Free Fly, move toward floors, walls and ceilings. Verify collision and sliding, vertical movement without gravity, and unrestricted movement in scenes without a collider. Check physical head penetration fade in Quest.

## 1.8.2 bubble authoring

- Verify no Pages tab or content-library navigation remains. Create content bubbles, edit their blocks directly, import/drop images and import custom HTML in the Bubble inspector.
- Verify each new content bubble is independent. Copy older content, remove a bubble without damaging another bubble referencing that content, undo/redo, save/reopen/export and open its content in the viewer.
- Verify height control occupies only the normal scene inspector and no floating Preview panel remains. Viewer uses the saved scene height with no visitor height slider.

## 1.8.3 content and glass

- Rename a content bubble: its popup uses that label with no second title field. Check old bubbles sharing content remain independent after rename.
- Preview and export paragraphs, local/remote images, captions, links, embeds and custom HTML. Verify compact popup sizing, scrolling and custom-page scene/viewpoint/close messages.
- Check tinted glass contrast over bright and dark splats, numerical inputs/sliders, mobile controls and real Quest panels.
- Close the editor after content editing and verify save/cancel/discard behavior. If a breakpoint crash recurs, retain `%APPDATA%\spark-tour-studio\diagnostics` and record the action/version.

## 1.8.4 clear glass

- Move through bright and dark areas: editor panes and visitor controls should show neutral blurred scene colors without a fixed blue/green fill. Inspect text readability and pointer selection with the full canvas under the editor panels.
- Check neutral panel translucency and legibility on Quest. Reduced-transparency preference intentionally uses solid neutral panels.

- Check portrait and landscape popup photos: each nearly fills the popup width, retains proportions and scrolls when tall.

## 1.9.0 backgrounds

- Under Scene → Background, choose each type, save/reopen and export. Select panorama images via drop/file/URL; rotate them. Select a streamable RAD and align its world-space position/rotation/scale separately from the foreground.
- Walk/fly through a scene with a splat background: confirm background positioning/parallax, foreground collision and shared performance tuning. Switch scenes during loading and after failures; check retry and no old background remaining.
- Verify backgrounds and glass on Quest without an XR session restart. Check pano orientation, splat alignment, memory pressure and contrast over bright/dark backgrounds.
- Host under a subdirectory and move foreground/background RAD assets to a CDN through hosting configuration; panorama/media paths remain independent. Test a portable export with external networking blocked.

## 1.9.1 mode switches

- Move away from the entry: switch Viewpoints → Drone/Walk and Drone ↔ Walk. Verify position/facing retention where valid, nearby grounded placement, walking-start fallback when no local floor exists, and remaining in the previous mode when neither placement works. Check slopes, walls, transformed colliders and low ceilings.
- Visit another viewpoint, move away, then return to Viewpoints: it should return to that view. Verify deleting that view falls back to an existing entry/first viewpoint.
- Move/look in the editor, enter Preview and return to Edit. Camera should stay put, including before the starting thumbnail finishes. Selecting a saved viewpoint explicitly should still use photosphere/orbit/slider controls.
- Confirm distinct info / outgoing photograph / stacked-location bubble icons on mouse, touch and Quest. Check slightly darker glass over bright and dark scenes and preserved physical head tracking when switching modes in XR.


## Scene modes and unlisted entry points

- Select Drone, Walk or Viewpoints; change scenes from the scene picker and scene bubbles. The destination retains that mode when enabled; unsupported or invalid Walk destinations fall back to an enabled usable mode. In Walk, ordinary scene arrivals use walking start; an explicit bubble destination grounds near that entry.
- Uncheck Listed in visitor views on a scene entry. Save/reopen/export; verify it is absent from the browser view strip and Quest Views menu but scene entry and direct bubble links still reach it. Unlist every view and verify scene entry continues to work without visitor list buttons.
- In Quest, switch scenes repeatedly and rapidly in each mode, retry a failed destination, and verify the XR session remains active and movement works in the new scene.

## ExtSplats and PLY re-import (v1.10)

- Enable ExtSplats, change numeric controls and rename the draft; close/reopen settings and switch Tour/Delivery/Performance tabs. Confirm the draft and live scene precision remain unchanged. Save a new preset, set it as default, undo/redo, save/reopen and open another project; verify stored/default values apply intentionally.
- Compare a large-coordinate capture with Extended splat precision off/on, using the same view and detail budget. Check banding, foreground/background alignment, memory use and Quest frame rate. Change presets repeatedly during loading and VR, and verify the canvas/XR session and camera pose remain continuous.
- Re-import an annotated scene from an updated PLY in the same coordinates. Confirm bubbles, content, views, transforms, collider and navigation settings survive save/reopen/export. Edit annotations while conversion is queued/running; those edits should remain. Cancel or fail a conversion and confirm the previous RAD still works. Changing/deleting the target before completion must not recreate it or replace a newer source.

## Walking look takeover (v1.10.1)

- Follow a route on desktop and phone. Tiny look jitter should retain automatic turning; after 12 accumulated pixels of deliberate look, walking continues without pulling the view direction back. Check left drag, captured mouse movement and touch drag, including several small events and input while the path is loading.
- Select another destination and confirm automatic turning returns. Manual movement or Escape still cancels walking. Verify real Quest head tracking remains independent of route direction.
