# Manual acceptance

The user's LichtFeld export will be tested manually. No matching collision GLB was available during implementation. The following checks remain necessary before production use.

## LichtFeld scene

- Create a project and import the known-working `.rad`. Verify orientation, scale, colors and detail while moving.
- For chunked RAD, verify companion requests and missing-chunk Retry behavior. Test a monolithic file on a range-capable CDN.
- Add two more scenes; switch rapidly and repeatedly. Inspect memory after stabilization and verify old scenes stop streaming.
- Place a bubble on the scene, move it with the gizmo, save/reopen, and verify its location.
- Exercise a scene with large coordinates. The v1 runtime uses Spark's default compact encoding; rebase the capture if precision artifacts appear.

## Collision

- Use Generate collision mesh with a matching source PLY. Try all three resolutions, cancellation, and a large scan; check the wireframe and memory use.
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
- Check physical head movement near collider surfaces, panel readability, long-text pagination and image rendering.
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
- Confirm info / sun-and-mountain photograph / camera bubble icons on mouse, touch and Quest. Check slightly darker glass over bright and dark scenes and preserved physical head tracking when switching modes in XR.


## Scene modes and unlisted entry points

- Select Drone, Walk or Viewpoints; change scenes from the scene picker and scene bubbles. The destination retains that mode when enabled; unsupported or invalid Walk destinations fall back to an enabled usable mode. In Walk, ordinary scene arrivals use walking start; an explicit bubble destination grounds near that entry.
- Uncheck Listed in visitor views on a scene entry. Save/reopen/export; verify it is absent from the browser view strip and Quest Views menu but scene entry and direct bubble links still reach it. Unlist every view and verify scene entry continues to work without visitor list buttons.
- In Quest, switch scenes repeatedly and rapidly in each mode, retry a failed destination, and verify the XR session remains active and movement works in the new scene.
