# Verification results

## v1.22.2 collision coverage overview and traced WebXR head fade (2026-10-27)

- Paged collision visualization previously displayed only the exact local physics window. The editor now overlays the complete saved generation area with three screen-size detail levels and hysteresis. Box/ball transforms, removal volumes and upward extrusion follow saved generation metadata; legacy files fall back to manifest bounds. Distant lines describe generated coverage, not reconstructed distant obstacle surfaces. Exact obstacle meshes remain local. Existing collision files need no regeneration.
- Visualization uses one merged draw call, at most 65,536 line segments and no tile downloads or added physics. Packaged synthetic checks retain unchanged page/chunk/triangle/collider counts across show/hide and distance refinement (140 to 384 segments); explicit movement still prepares only two of 24 pages. Saved-data provenance, transformed alignment, replacement and disposal pass. A read-only Tourv2 East Inside Graveyard manifest check shows the complete coverage with zero loaded pages or physics (`test-output/collision overview 1793116350620`). Screenshot inspected. The same regression caught and now covers a manual source matrix that was not applied before the first render.
- Reviewed the supplied 21.51-second Quest recording. It shows the scene continuing to move beneath a near-opaque full-view layer, with later recovery. The recording contains no predicate telemetry, so it does not uniquely identify the first trigger. Independent runtime reproductions establish two matching causes: a frozen world-space head anchor and inconsistent scaled navigation/head volumes.
- Pre-fix actual-runtime/Rapier reproduction: after a brief physical wall crossing and valid Drone travel around its end, the current head at `[0.4,1.7,2.5]` was clear, but opacity stayed at 0.95 because the ray still began at frozen `[-0.6,1.7,0]` and struck the obsolete diagonal. Further travel finally cleared that line. A separate real collision-stream proof showed that evicting an old page invalidated that historical segment even while current position and recent movement were valid (`test-output/vr-veil-old-trace-1793114522207/trace.json`).
- The safety anchor now stores physical tracked coordinates in the rig, reprojected through the current rig each frame. Actual physical thin-wall crossings remain veiled until retreat or moving the current rig beyond the wall; controller translation/turning cannot bypass the physical sweep. Explicit relocations, tracking loss, reference-space resets and visibility/session changes reset discontinuous history. Missing or failed listed collision pages are unknown evidence, not penetration. Read-only resident-voxel probes distinguish that state from known blocked geometry, while movement still requires verified prepared coverage and remains fail-closed.
- Real Three WebXRManager reproduction with the actual Tourv2 aerial scale (scene VR scale 0.25): Drone swept a fixed 0.2 m sphere while head fade used 0.4 m, causing 109 of 360 forward-motion frames to darken. The regular camera was also a union-frustum proxy behind the true stereo midpoint, and eye matrices lagged rig movement by one frame. Navigation/head queries now use the true stereo midpoint, Drone clearance includes the scaled head, and stereo matrices refresh after locomotion before render. Turning, scale changes and placement use the same head center. Walk validates the tracked head along motor steps and at placement; viewpoint-to-scene scale changes validate the destination volume before clearing the view.
- The packaged real-manager regression emulates only platform XR sessions, layers and tracked poses, retaining Three's stereo, union-frustum, projection and rendering code. Scales 1, 0.25 and 2 have zero unintended veiled frames across 360 forward steps each; eye/rig errors are effectively zero and matrices remain rigid. Checks cover true physical crossings/retreat, three held concurrent translation/turn frames, rendered fade pixels beyond the scaled near plane, tracking loss/reset/reacquisition, rebaked and cold delayed collision data, blocked unknown motion/recovery, a tall tracked head beneath a low beam, invalid giant Walk entry, and differing viewpoint/scene scale exits (`test-output/xr head collision 1793116994172`). Physical Quest comfort and hardware acceptance remain manual.
- Real-manager OS-menu trace also proved that held gamepad axes moved the rig 0.1300813 m over 12 frames in both `visible-blurred` and `invisible` states. The viewer now suspends navigation, trigger/menu actions, routes/flights and pending teleport state while the system owns focus, continues tracked rendering, and resumes ordinary movement when visible. The final packaged regression verifies stationary rig positions in both states and movement after focus returns.
- Production TypeScript/Vite build and all 336 unit/integration tests pass (`test-output/v1.22.2-final-tests.log`). Existing local collision readiness/bounded-cache/physics checks pass (`test-output/local collision runtime 1793115926722`), as does authored XR comfort/mode/collision recovery (`test-output/viewpoint comfort 1793115926674`). Packaged native alignment, undo, Preview continuity, save/export and existing XR content/ray/scroll/session regressions pass (`test-output/xr-polish-1793116350289`). Both new browser regressions are included in GitHub CI.
- Packaged audit verifies all 60 desktop/shared sources, all 170 viewer resources, three Studio icon assets, dependency pins and license notices against source (`test-output/packaged-source-audit-1.22.2.json`). Profile/internal identity paths remain compatible. The unchanged 94,632,960-byte launcher is byte-identical to the previous verified SEA executable: SHA-256 `cc0512f747d075b870926d4da59ec371fb77517ea4e5fa1ed719010e0069a673`. Original Tourv2 project/assets and the supplied video remain unchanged.
- WebGL startup failure now has a visible landing-page explanation beside Enter tour, with a device/browser supporting WebGL 2 suggested and an accessible description on the disabled button. Scene selection and Settings remain usable. Packaged browser checks simulate missing WebGL only in the test, verify healthy-context startup, block external requests and inspect desktop/landscape/portrait layout after stylesheet readiness (`test-output/viewer webgl 1793117345484`). The new check is in CI.
- Final portable EXE cold-start, version/About and normal close pass (`test-output/portable smoke 1793117485409`). Release ZIP contents and SHA-256 checksums verify. Final executable: `release/3DGS Perspectives Studio 1.22.2.exe`, 185,066,663 bytes; SHA-256 `d9ecc9f2daa754e0f7ac3d522ca92fe790f3560e6018d32e78bbcb1f033ef2f7`.

## v1.22.1 branding draft autosave and Studio application icon (2026-10-27)

- The autosave failure came from applying completed-URL validation to every website/public-address edit. Project save, open and recovery now preserve bounded text drafts, including unfinished addresses. Finished bare domains resolve to HTTPS; incomplete or unsafe drafts never become visitor links. Field-specific inline and export validation remains separate from draft persistence.
- All 325 unit/integration tests pass (`test-output/v1.22.1-final-tests.log`), including interrupted URL entry, bare-domain/IDN/local-network normalization, unsafe destination filtering, actual export rejection before output creation, recovery round trips and unchanged existing branding behavior. The production TypeScript/Vite build passes. A read-only check of Tourv2's actual project data successfully creates and parses recovery snapshots with both a bare domain and unfinished website text; the original project file is unchanged.
- The supplied Studio SVG is preserved unchanged, with vector-rendered PNG and seven-resolution Windows ICO assets. The unpacked executable's embedded 32px icon matches the supplied ICO pixel for pixel (`test-output/studio-native-icon.png`). Native resource editing is enabled while code signing remains disabled. The Studio favicon is referenced only by the editor; the viewer retains author-controlled branding.
- The actual rebuilt SEA launcher passes desktop HTTP, Quest-style HTTPS and mobile landscape HTTPS with external requests blocked, cold paged collision loading, grounded keyboard/touch walking, no Node on PATH and clean shutdown (`test-output/network performance 1793108233206`). Physical Quest acceptance remains manual.
- Final unpacked audit verifies all 59 desktop/shared files, all 170 viewer resources, all three icon assets, dependency pins, notices and retained application profile/browser storage paths against the source (`test-output/packaged-source-audit-1.22.1.json`). Packaged launcher is byte-identical to the rebuilt 94,632,960-byte SEA executable: SHA-256 `cc0512f747d075b870926d4da59ec371fb77517ea4e5fa1ed719010e0069a673`.
- The packaged draft regression passes actual debounced autosave while an unfinished address stays focused, accessible blur feedback, unsafe draft Save/reopen, readable validation/export rejection and repaired bare-domain export (`test-output/branding-drafts 1793108380429`). The exported viewer uses normalized HTTPS destinations with external requests blocked. Its website does not include Studio icon assets. Original user tour files were not modified.
- The original packaged branding regression also passes author/media editing, Save/reopen, credit-on/off exports, static and runtime favicon/metadata, literal text safety and responsive desktop/mobile layouts (`test-output/branding 1793108470836`).
- The actual portable EXE launches, reports version 1.22.1, opens About and closes normally (`test-output/portable smoke 1793108775895`). Its embedded Windows icon also matches the supplied artwork pixel for pixel (`test-output/studio-portable-icon.png`). Release archive contents and checksums pass. Final EXE: `release/3DGS Perspectives Studio 1.22.1.exe`, 185,066,486 bytes; SHA-256 `8f2a935e5663903859fd839f44d3cc02bf9d73bc3aa61493568aaeac95cf6d8e`.
- GitHub's October 24 main run `40108718836` and tag run `40108719176` both stopped at the legacy publishing test (315/316 passed). Reproduced the same assertion locally with lowercase-drive `TEMP`: PowerShell canonicalizes the drive letter while the test compared literal strings. The test now compares canonical filesystem paths, retains exact-one-ZIP and checksum/integrity assertions, and permanently exercises the distinct drive spellings. All six focused release tests pass with normal and lowercase-drive temporary directories. Product and publisher behavior are unchanged by this test repair.

## v1.22.0 3DGS Perspectives Studio and author-controlled tour branding (2026-10-24)

- All 316 unit/integration tests pass (`test-output/v1.22.0-final-tests.log`); the production TypeScript/Vite build passes. New tests cover optional backward-compatible branding, explicit credit opt-out, project/recovery round trips, safe field validation, branding asset tracking, portable/referenced image export and escaped static metadata. Release archive tests retain both new and legacy artifact recovery/checksum behavior.
- Studio display names and release artifacts use 3DGS Perspectives Studio. The existing application profile, project schemas, protocol identifiers and cache locations remain compatible. The optional credit uses the exact text `made with 3DGS Perspectives Studio` and corrected `https://studio.chesapeakeperspectives.com/` address.
- The actual rebuilt SEA launcher passes desktop HTTP, Quest-style HTTPS and mobile landscape HTTPS with external requests blocked, no Node on PATH, cold paged collision loading, keyboard/touch walking and clean shutdown (`test-output/network performance 1792856461511`). Portrait/landscape/small-phone controls, scrollable menus, recoverable descriptions, orientation changes and disabled-viewpoint scenes pass (`test-output/mobile-viewer-1792856608851`). Physical Quest acceptance remains manual.
- The packaged source audit verifies all 58 desktop/shared files, all 169 viewer resources, dependency pins, retained internal app ID/name and current license notices (`test-output/packaged-source-audit-1.22.0.json`). Packaged launcher matches the rebuilt 94,631,424-byte SEA executable: SHA-256 `52beb125da1370079c76dcf59c7c36c72ec9ad147e35dcc6396f6c3d8b4c5c80`.
- Packaged native branding authoring, file-based logo/favicon/share-image import, theme color, Save/reopen and credit-on/off folder exports pass (`test-output/branding 1792856586191`). JavaScript-disabled pages verify escaped static browser/link-preview metadata; the live viewer verifies matching metadata, loaded logo/favicon, literal authored prose and correct credit-link behavior. No external requests occur during viewing. Desktop, 915px landscape, 390px and 320px portrait screenshots were inspected; author branding fits, controls remain accessible and disabled credit leaves no visible Studio product name.
- The actual portable EXE reports version 1.22.0, opens the renamed About window and closes normally (`test-output/portable smoke 1792856903005`). Release archive contents and SHA-256 checksums pass verification. Final EXE: `release/3DGS Perspectives Studio 1.22.0.exe`, 184,938,515 bytes; SHA-256 `bc7b28685f17fa35f780c9a0629624a035f0861148957752810f0ef998427976`.

## v1.21.3 shared mobile collision and landing description links (2026-10-20)

- Confirmed the reported live HTTPS sharing endpoint served North Graveyard's collision manifest (200) and walking tile (200), but rejected its `.scv` collision page (404). The launcher asset allowlist now includes `.scv`; read-only sharing, private-file exclusions, containment, HEAD and byte ranges remain enforced.
- All 300 unit/integration tests pass (`test-output/v1.21.3-final-tests.log`), including real encoded `.scv` GET/HEAD/ranges, private-page protection and description-link parsing. The production TypeScript/Vite build passes.
- The strengthened network check fails against the old compiled launcher with the same collision-page 404, then passes against the rebuilt SEA executable (`test-output/network performance 1792544622331`). Desktop HTTP, Quest-style HTTPS and phone landscape HTTPS all cold-load a paged collision scene, wait for a deliberately delayed page, enter Walk and move through actual keyboard/touch input while grounded. Precision, external-network blocking, no Node on PATH and server shutdown checks also pass.
- Landing descriptions now link HTTP(S)/www addresses without interpreting HTML, retain line breaks and wrap long URLs. Six parser tests cover source-text preservation, safe schemes, punctuation and balanced brackets. The network check verifies a real new-tab link click with no opener and unchanged tour document, literal HTML, and contained layout on desktop, Quest-style, 915px landscape, 390px portrait and 320px phones. Portrait and landscape screenshots were inspected.
- Final package audit verifies editor v1.21.3, all 56 desktop/shared source files and 169 viewer resources, unchanged Spark/converter v2.4.0, and current license notices. The packaged launcher matches the rebuilt SEA executable (SHA-256 `a4d088867055af3ceb023448e31ae54583a8e708d5d137adf7bbf8ec59a4c2d8`) and embeds the corrected sharing code.
- Read-only North Graveyard verification uses its real 40 collision pages, 18 walking tiles, transforms and walking settings, with a placeholder splat to isolate collision behavior (`test-output/north-sharing-audit/1792543882394/results.json`). Cold desktop and mobile landscape with 4x CPU throttling and delayed collision downloads both load six nearby pages, enter Walk, move 1.33 m and remain grounded in verified space. Original project data is unchanged.
- Actual portable EXE launch, version, About and normal close pass (`test-output/portable smoke 1792544969631`). Its served landing HTML and all five visitor entry assets match the final build by SHA-256. The release ZIP contents and checksums pass verification. Final EXE: `release/Spark Tour Studio 1.21.3.exe`, 185,059,229 bytes; SHA-256 `faa1582f019c1c7016f7cd1b7938647e6b2b12dcb539edf7ba06d52be5fe3a55`.

## v1.21.2 release verification repairs (2026-10-20)

- Retains the Spark 2.4.0 runtime, native converter and collision corner fix verified for v1.21.1 below. Production TypeScript/Vite build passes; the application runtime is unchanged by this patch.
- GitHub monitoring exposed two obsolete test assumptions. The collider replacement check now waits for Spark's initial root page after its metadata request before counting reload requests; mesh, pager, fetch-source and scene-generation identity checks remain strict. Its local evidence records exactly two initial byte ranges and no later RAD requests (`test-output/collider replacement 1792506709465`); the corrected check also passed on GitHub run 39440337676.
- The rich-content check now exercises the current bubble fade checkbox and distances, project defaults, per-scene factors and per-bubble sizing. Native editing, duplication, save/export round trips and offline image/rich-text rendering pass (`test-output/ui-polish-1792507389210`).
- Packaged history, mocked GitHub publishing, navigation caching and advanced import checks pass (`test-output/git editor 1792506933673`, `github editor 1792507205626`, `navigation cache 1792507269203`, `advanced-import-1792507284853`). Earlier successful performance, directory, background and XR exports contain assets byte-identical to the current packaged runtime; every packaged desktop/shared source file was also checked against current source.
- Final v1.21.2 package audit verifies all 55 desktop/shared files, all 169 runtime files, editor/runtime/converter versions, actual converter executable hash, launcher and 100 dependency license entries against the current source/build.

## v1.21.1 Spark 2.4.0 runtime and converter (2026-10-20)

- Pinned the renderer to exact `@sparkjsdev/spark` 2.4.0 and rebuilt the CPU-only native converter from the official v2.4.0 archive (SHA-256 `1d9371ce10ac37ad5082839c362e29307d9545f338a7592c6972f9ca1ee326aa`). Both converter methods, malformed-input handling and cancellation pass with the new binary. Main/shared source, runtime/converter versions, executable hash and packaged license metadata were checked.
- All 293 unit/integration tests pass (`test-output/v1.21.1-final-tests.log`); TypeScript/Vite production build passes. The exact-voxel-corner regression now keeps floor normals upward rather than treating a clear grid seam as a wall; unknown collision cells remain blocked.
- Real streamed rendering/picking and collision checks pass: `test-output/paged runtime 1792504973065`, `collision recovery 1792504972475`, `bubble-runtime-1792504767445`, `collision engine 1792505257077`, and `paged collision engine 1792505265742`. Tests cover actual cold-page trigger targeting,404/retry/repair, same-session recovery and source leaf decoding.
- XR comfort/precision and mobile checks pass (`test-output/viewpoint comfort 1792504779936`, `extended-precision-1792504812858`, `mobile-viewer-1792504852898`). Physical Quest hardware remains a manual acceptance target.
- The main/tag v1.21.0 GitHub failures were traced to obsolete fatal-error assertions and eager-collider assumptions. Updated browser checks wait for explicit movement initialization, verify nonfatal errors without moving the visitor, and use the compact mobile menu. Assertions for collision safety, original assets, export, networking and session identity remain intact. Packaged paged authoring, collider replacement, mobile/key controls and onboarding pass; additional narrow/legacy/coarse/air physics checks pass with 2.4.0.
- Native imports, saved performance settings, scene directory, backgrounds and XR content checks pass with the new runtime/converter (`test-output/advanced-import-1792505144961`, `performance-persistence-1792505221899`, `tour-directory-1792505290833`, `hemisphere-background-1792505234339`, `xr-polish-1792505317292`). Portable exports retain actual float32 foreground/background data with external requests blocked.
- Desktop-local and Quest-style HTTPS/offline checks pass (`test-output/network performance 1792505594562`), including real local launcher, unchanged hosting config, scene changes, no Node on PATH and clean server shutdown.

- Final local portable EXE launch, version 1.21.1 and normal close pass (`test-output/portable smoke 1792505746375`). EXE: `release/Spark Tour Studio 1.21.1.exe`, 185,064,306 bytes; SHA-256 `9B9F69AA838C5DF6A11FE92D45E0E28D4EE8E15278903AF583FA10897B5B13E5`.

## v1.21.0 mixed-scale defaults, compact mobile and paged collision recovery (2026-10-20)

- All 292 unit/integration tests pass (`test-output/v1.21.0-tests.log`). New coverage preserves old fade curves, verifies project/scene bubble distance and walking defaults, validates explicit zero-step overrides, and prevents stale collision generation after inherited-default changes.
- Native authoring/save/reopen/portable export checks pass (`test-output/bubble settings 1792502466363`): tour walking height/step, scene override/reset without forced override fields, room 20m vs aerial 1000m fading, and actual exported runtime visibility at 200m.
- Compact viewer checks pass at 390×844, 844×390 and 320×568 (`test-output/mobile-viewer-1792502971095`), including emulated touch movement, Walk controls, unobstructed center, scrollable menu, scene changes, focus recovery and recoverable descriptions across orientation changes. Menu SVG centering is within 0.5px; the plain joystick thumb tracks actual emulated touch and resets movement on release. Screenshots were inspected; physical mobile browsers remain manual acceptance.
- Actual runtime checks verify no collision requests in Viewpoints, no authored animation in immersive VR, head-centered snap turning without moving around the orbit, continuous constrained left-stick motion without forced heading, disabled-view entry placement and a nonfatal missing collider (`test-output/viewpoint comfort 1792502905082`).
- Partial tile 404 checks preserve healthy floor support, keep unknown destinations blocked, throttle retries and recover in the same scene/renderer/simulated XR session (`test-output/collision recovery 1792502756472`). Paged runtime physics/navigation/transform checks pass (`test-output/paged runtime1792502754979`), as do precision/session continuity and XR content regressions (`test-output/extended-precision-1792502217127`, `test-output/xr-polish-1792502181254`).
- Actual trigger tests cover cold-floor targeting across a temporary physics seam, failed tile request/retry/repair/teleport, normal hand tremor, deliberate re-aiming and release before a late response. Scene-navigation/fallback/save/export checks pass (`test-output/scene-navigation-1792502557222`).
- Final packaged editor authoring/save/reopen/export passes (`test-output/bubble settings 1792502990033`). Production build and embedded main/shared source verification pass. The actual portable EXE launches, reports 1.21.0 and closes normally (`test-output/portable smoke 1792503189000`). EXE: `release/Spark Tour Studio 1.21.0.exe`, 184,999,271 bytes; SHA-256 `C160136F3B86CDA7D3175199448CC4A6F88CFD2F0303B52FFCE30DA023F00EAF`.
- A read-only audit of Tourv2 North Graveyard verified all 40 collision tiles and 18 walking tiles against their manifests. This does not reproduce the reported hosted 404; the changes isolate and recover from request failures rather than claiming a particular hosting fault. No user tour assets were modified. Physical Quest 3/3S comfort and controller acceptance remains manual.

## v1.20.2 precision-check timing repair (2026-10-20)

- Precision reload checks now hold a real crouch input and compare the restored rig/capsule immediately after the reload promise resolves, before advancing walking simulation. This preserves strict pose assertions without treating normal eye-height settling as a reload discontinuity. The complete precision/XR scenario passes (`test-output/extended-precision-1792471551920`). Runtime behavior is unchanged by this patch.
- Additional local checks pass private-interface HTTPS/offline precision (`test-output/network performance 1792471595082`), native project history (`test-output/git editor 1792471612147`), rich content/export (`test-output/ui-polish-1792471578078`) and all 17 performance controls/persistence/cold exports (`test-output/performance-persistence-1792471662888`).
- TypeScript/Vite production build passes. Actual portable version/About/launch/clean-close check passes (`test-output/portable smoke 1792471901454`). EXE: `release/Spark Tour Studio 1.20.2.exe`, 184,984,540 bytes; SHA-256 `D6CE4BBFA12BF54A234742C66B79E4D538B49C0150A8B7C51E7F03736C81781A`.

## v1.20.1 release-check repair (2026-10-20)

- Corrected two collision authoring checks to use the current Scale button name. The rotated-face drag fixture now establishes a clear camera angle before selecting its X face, avoiding overlap with a nearer Z face while retaining opposite-wall, direct-drag and undo/redo assertions.
- Packaged collision generation/save/reopen/export passes (`test-output/paged collision editor 1792469954114`). Packaged view geometry, camera updates, rotated-face resizing, direct dragging, history and walking acceleration pass (`test-output/authoring movement 1792470168544`). TypeScript/Vite build passes.
- Actual portable 1.20.1 launch, About version and clean shutdown pass (`test-output/portable smoke 1792470187811`). EXE: `release/Spark Tour Studio 1.20.1.exe`, 184,985,734 bytes; SHA-256 `34914AB5DD6D1D63A042ADC0A712696C855B4FDAFCD14EA9A8AED27ABA4D8979`.

## v1.20.0 authored movement, VR scale and viewpoint history (2026-10-20)

- All 281 unit/integration tests pass (`test-output/v1.20.0-final-tests.log`); TypeScript/Vite production build passes. New tests cover backward-compatible speed/scale settings, rich history media export, stable scene links and deletion cleanup, head-pinned VR scaling and normalized stereo view matrices.
- Packaged editor and exported-viewer checks pass (`test-output/view options 1792469583903`): author/save/reopen, base and scene speed factors, scene/view VR factors, rich description formatting, unlisted scene entry buttons and retained visitor speed multiplier. In both Preview and the exported viewer, X collapses the details to a visible About this view button; reopening restores rich text and scene buttons.
- Simulated XR checks verify combined scale, scaled native panels, controller-ray scene buttons, unchanged session identity across scene changes, precision-retune scale/near-plane restoration and desktop reset. Existing packaged transform/collision and XR content regression passes (`test-output/xr-polish-1792469306605`). Physical Quest 3/3S acceptance remains manual.
- Runtime and generated tour resources remain locally bundled; test projects, profiles, media and executables remain ignored.
- Actual portable EXE launch, version/About and normal shutdown pass (`test-output/portable smoke 1792469819636`). Local EXE: `release/Spark Tour Studio 1.20.0.exe`, 184,984,541 bytes; SHA-256 `7654CEBE69AE629A3AD8B39C55C5C6A825A6316765F1C16C3C2431094F87FD46`.

## v1.14 local website repositories, resumable uploads and walking cache (2026-10-12)

- All 99 unit/integration checks pass (98 in the full suite plus the added collision-transform test). TypeScript/Vite production build passes. Real disposable Git tests cover a persistent offline website checkout, idempotent updates, source-commit metadata, obsolete runtime cleanup, preserved unrelated files, ignored local launcher, foreign destinations, local edits and changes after review.
- A bare receiver capped at 20 KB rejects a normal initial snapshot. The same original snapshot succeeds via eight smaller uploads, including a simulated interruption after two completed batches and a resumed upload. The remote receives the exact original commit with its original one-commit history; working changes remain untouched and the temporary upload branch is removed. Bitmap packing prevents the final unrelated root commit from resending uploaded assets. No force push runs.
- Packaged three-option publishing/sign-in/repository creation/project backup/Pages review/status/reopen and local-only subdirectory viewer check passes (`test-output/github editor 1791841373989`). All account and Pages responses are simulated and Git transports use a local bare repository; no actual user tour was uploaded. Screenshots confirm the sharing header has no offset dark rectangle. Both untracked export and offline local Git publication are exercised before the GitHub flow.
- Existing packaged authoring history/checkpoint/restore/Save As/export/size warning and normal close checks pass (`test-output/git editor 1791841403533`). Packaged live transform/collision and simulated XR content/controller/session tests pass (`test-output/xr-polish-1791841415088`). Quest hardware acceptance remains manual.
- The packaged production walking worker reuses persistent cached routes, preserves path results, invalidates after geometry changes and builds normally when storage is blocked (`test-output/navigation cache 1791841374030`). The largest Tourv2 collider contains 1,516,326 triangles: local read/parse about 38 ms, physics about 1.08 s, cold routes about 5.22 s, cached navigation import about 0.36 ms (worker initialization/hash/storage costs are additional). Serialized routes occupy 87,132 bytes. Initial route generation and per-scene physics rebuild remain necessary.
- The actual `Spark Tour Studio 1.14.0.exe` portable wrapper opens the new editor, reports version 1.14.0, exposes the new publishing bridge, displays About and closes normally with exit code 0 (`test-output/portable smoke 1791841640655`). Windows release ZIP contents and internal checksums verify. Build outputs, test assets and private profiles remain ignored.

## v1.13 GitHub connection, push and Pages publishing (2026-10-12)

- All 95 unit/integration tests and the TypeScript/Vite production build pass. New checks use real disposable Git repositories and simulated GitHub responses for device-code parsing/cancellation, repository visibility, branch Pages setup/status, audited commit pushes, preserved drafts/upstream, historical credentials, file/size limits, private preferences, existing sites, project changes and conflicting remote updates. Unit publishing fixtures include their own tiny runtime and do not depend on a preceding web build.
- The bundled official GitHub CLI 2.102.0 archive is pinned and SHA-256 verified; its original MIT notice is included. A read-only check of the actual bundled executable recognized the existing MisterE123 login. Browser OAuth approval and live Pages provisioning are manual acceptance items; automated publishing uses isolated local transport and a fake account without changing real credentials or uploading user tours.
- Source and final packaged editor checks pass sign-in/cancellation/device controls, repository creation, push, website preparation/review/publication/status, private preference retention, reopening, a dedicated menu, untouched authoring history, and a published viewer loaded beneath a subdirectory with external requests blocked. Final evidence: `test-output/github editor 1791833502313`; review screenshots were inspected. The review scrolls into view and Close remains available while scrolling.
- Existing packaged local history, asset capture, checkpoint/restore, concurrent edits, Save As/export and waiting for restore before normal window close still pass (`test-output/git editor 1791833167389`). Publication uses normal commits in a disposable staging repository and preserves unrelated website-branch files; existing foreign sites and non-fast-forward updates are rejected without forced changes.
- Prepared websites contain the locally bundled visitor runtime and public project data, with no editor, launcher, recovery or authentication files. Existing HTTPS asset URLs can remain remote. Missing assets, invalid omitted-splat URLs, the 1 GB Pages limit, 100 MiB Git files and detected private history stop publication/upload. Corrupt private preferences cannot inject unsafe links or crash the sharing screen. Local preferences remain ignored and unavailable over HTTP. R2 uploading is outside this release as requested.
- Final portable EXE cold start verifies version 1.13.0, the expected UI bundle, matching hashes for the main/preload/export/GitHub/network/publisher modules and bundled GitHub executable, a hidden isolated profile, and ordinary close with exit code 0 (`test-output/portable-final-cdp-1791834200769`). The Windows ZIP's contents and embedded checksums pass. The 169-file source audit finds no private state, credential patterns, large assets or generated binaries.
- Local EXE: `release/Spark Tour Studio 1.13.0.exe`, 183,320,210 bytes; SHA-256 `44EA61896EFC1920FD89D89316C43B966A8980A440644F8792E9A2536D227292`. Windows ZIP: `artifacts/Spark-Tour-Studio-1.13.0-windows-x64.zip`, 281,480,938 bytes; SHA-256 `6B67763E71651C455DF5B410FDE628CF0377713C167A58B3CDFD0ADE1FBC6EEB`.

## v1.12.1 Windows Git folder recognition (2026-10-12)

- Inspected the failed v1.12.0 tagged GitHub run (38265761227). Its two new Git integration tests stopped while enabling history, before editor packaging or release publication. Windows short path aliases reproduce the same `Enable Git history for this project first` error locally after a successful repository initialization.
- Git repository detection now resolves both Git's reported root and the selected project folder to their actual filesystem paths. Short names and junctions recognize the same project; a nested folder still cannot operate on its parent's history.
- Both new regression tests failed with the old implementation and pass with the fix. They exercise real initialization, named versions, annotations, remote configuration and restoration through Windows short paths and a junction, without contacting a remote server. All 86 unit/integration tests and the TypeScript/Vite production build pass.
- The final packaged editor passed the full Git authoring/export regression, including checkpoint restoration, unrelated changes, concurrent editing, Save As, Pages warnings and waiting for restore before ordinary window close (`test-output/git editor 1791818021174`). The final portable wrapper cold-started in a hidden isolated profile with version 1.12.1 and a Git-helper hash matching the tested source, then closed with exit code 0 (`test-output/portable-final-cdp-1791818182143`).
- The Windows ZIP contents and embedded checksums passed verification. The 159-file source audit found no private state, credential patterns, large tour assets or generated binaries for upload.
- Local EXE: `release/Spark Tour Studio 1.12.1.exe`, 172,803,468 bytes; SHA-256 `8A7EBF3AF4714B3F24E93830DD6710D03672401034AC3A43CCFDF26B05326E0F`. Windows ZIP: `artifacts/Spark-Tour-Studio-1.12.1-windows-x64.zip`, 270,959,758 bytes; SHA-256 `9F13C3D4BD06D690FFF26D30F3A0C5DF49EFC52DEDEF43E0D4C8B02D059977F7`.

## v1.12 optional local tour Git history (2026-10-12)

- All 84 unit/integration tests and the TypeScript production build passed. Real disposable Git repositories verified external RAD/chunk/media capture, reopening a clone after removing original asset locations, annotation changes, added-scene restoration with literal space/bracket filenames, checkpoint/restore commits, disabled history and preservation of unrelated staged changes.
- GitHub/GitLab HTTPS and SSH remote setup preserves existing remotes unless explicitly updated. Invalid credential-bearing URLs and unsafe manifests are rejected. No remote Git commands or authentication ran in these checks.
- Website estimates include RAD companions and generated content. Virtual large-chunk sizes exercised the 1 GB Pages warning, 100 MiB ordinary-Git file notice, remote-asset lower-bound reporting and omitted-splat choices without allocating GB files. Git metadata and history preferences were denied by HTTP serving; custom-page capture excluded private Git state.
- The isolated source editor passed enable/disable, named versions, comparison, unsaved checkpoint/restore, installed-Git selection, provider helper URLs, manual remote setup, Save As with history, original-source removal, portable export and the Pages warning. History and warning screenshots were inspected. The packaged workflow also verified keeping edits made during an active Git save and waiting for restore to finish before closing, without overwriting the restored project. Cloned tours can save versions before a new machine configures its Git author; the fallback is local to that project.
- The real rebuilt SEA launcher passed cold HTTP/private-interface HTTPS viewing and actual extended-precision foreground/background streaming with external requests blocked. This remains a desktop Quest-style profile, not real headset acceptance.
- This release uses installed Git 2.30 or newer, with automatic detection and an executable picker. Ordinary editing and exported viewing do not depend on Git. Large real-capture history performance and user-authenticated pushes remain manual acceptance checks.
- Final packaged editor repeated the full Git workflow, including concurrent edits and closing during restore. Final portable EXE cold-started with version 1.12.0, the expected UI bundle and a Git-helper source hash matching the tested source, then exited with code 0 on ordinary close. The Windows ZIP contents and embedded checksums passed verification. Source audit found no private state, credentials, large assets or generated binaries among 159 source files.
- Local EXE: 172,793,288 bytes; SHA-256 `39AEDF5187C71B35FAA41F392DD4FD733BD3805261F3541FA047335269B2086B`. Local Windows ZIP: 270,949,577 bytes; SHA-256 `FE3723970E1DBCA76C656B44DC7C112A948413BA317EDC8AC3C253519DBA30BC`.

## v1.11.4 network performance synchronization (2026-10-08)

- Reproduced a cold-load timing bug: Settings opened before tour configuration retained constructor defaults while the renderer applied the saved ExtSplats profile. Editing an unrelated control then disabled precision. Viewer controls now wait for configuration and subscribe to live runtime changes.
- Read the supplied WIP tour export without changing its project or assets: its custom profile enables ExtSplats while the named Balanced snapshot disables it. The synthetic network regression uses this same profile relationship without copying private capture or media.
- All 78 unit/integration tests and the TypeScript production build passed. Existing precision checks passed actual float32 foreground/background streaming, rapid changes, failed/delayed destinations, camera/mode/physics continuity and unchanged renderer/canvas/simulated XR session identity.
- The real standalone launcher served unchanged configuration over loopback HTTP and HTTPS on a private interface, with Node absent from PATH. Cold desktop and Quest-style touch/UA browser checks passed delayed configuration, unrelated tuning, externally applied runtime changes, preset selection, scene changes and reload. Both streamed splat layers retained their `1024.125` float32 center and shared their precision pool. External requests were blocked, and launcher shutdown exited cleanly.
- The final packaged editor passed all 17 fields through tabs, autosave recovery, ordinary Save/reload, Save As, named preset import/export/deletion, undo/redo and both folder exports. Cold exported viewers retained precision and settings through scene changes with external requests blocked. The check now waits for preset export completion and handles a not-yet-created Save As file; an earlier run exposed those timing assumptions.
- Refreshed only the supplied export's viewer entry and hashed runtime bundles. Its original entry page was backed up under the private `.spark-viewer-backups` folder and original hashed assets retained for rollback. Tour/hosting configuration remained byte-identical. A direct HTTPS check of the refreshed six-scene export applied its complete saved profile after delayed loading and retained ExtSplats when another control changed.
- Final portable EXE cold-started with version 1.11.4 and the final bundled UI, then exited with code 0 on ordinary close. Release ZIP contents and embedded checksums passed verification. The source audit found no private state, credentials, large capture files or generated binaries among 152 source files.
- Local EXE: 172,783,634 bytes; SHA-256 `FEC13EF1413F3F7D742130A7D0C60441630E2854ABA309722F5D6BD9DC15CE72`. Local Windows ZIP: 270,936,730 bytes; SHA-256 `A2D0E55DC1317A7D9FC50F715EA90030BB416B1BD1396EBA5C6F1F670C3B54B0`.
- The Quest-style browser check runs on desktop software WebGL. A real Quest 3 browser and physically separate network device remain manual acceptance tests.

## v1.11.3 saved performance controls (2026-10-08)

- All 78 unit/integration tests and the TypeScript production build passed. Added checks validate custom tour settings, old-project defaults, invalid settings, unmodified named snapshots and both export modes.
- The isolated editor check exercised all 17 tuning fields, including ExtSplats and radial sorting. Settings survived panel/tab navigation, recoverable autosave, ordinary Save and renderer reload, Save As, preset save/copy/import/export/deletion, undo/redo and switching to a different project. No named-preset save or separate default action was required to retain adjustments.
- Portable and referenced folder exports retained the resolved profile in tour configuration and the active preset exchange copy. Cold exported viewers with all external networking blocked retained every field through scene transitions. Actual foreground/background streaming pools preserved the synthetic RAD's `1024.125` float32 center rather than its compact `1024` representation.
- The existing precision regression passed foreground/background pooling, rapid toggles, failed/delayed scene requests, camera/mode/physics continuity, and unchanged renderer/canvas/simulated XR session identity. Real headset behavior remains a manual check.
- Repeated the full persistence/export check with the final packaged Windows editor. Visitor preset selection and advanced tuning applied live and survived scene changes without rewriting authored defaults; SH changes marked the live mesh for regeneration.
- Final portable EXE cold-started with version 1.11.3 and the final bundled runtime, then exited with code 0 on ordinary close. Release ZIP contents and embedded checksums passed verification. Source audit found no private configuration, credentials, large data or generated binaries among 151 source files.
- Local EXE: 172,790,272 bytes; SHA-256 `17AB5C5A27B32A9EC4B2DD737E0E8FF7BDF1A5AAB6F5CC1AE60B21CD7483B9DA`. Local Windows ZIP: 270,943,257 bytes; SHA-256 `8E78E5A0DD8870B375285527E43B4F6AB036EEFAE6CBCE71F3F331E8F248E4C7`.

## v1.11.2 live alignment and XR polish (2026-10-07)

- All 76 unit/integration tests and the TypeScript production build passed.
- Packaged editor checks passed for live one-degree splat rotation, collider alignment and matching physics vertices, wireframe visibility, collider replacement/undo, camera/streamed-mesh continuity, preview, save and portable folder export. The existing scene ordering, saved project, 120-bubble browser, rich content, help/version and distribution checks also passed.
- Exported viewer checks passed with external networking blocked: full-screen cover behind glass title/search panels, Scenes selected initially in authored order, desktop/mobile layouts, scene/view/bubble search jumps, failed destination retry, loading cover/progress and same renderer/session across transitions.
- Actual Three controller rays and trigger events reached all five synthetic content sections, including standalone and rich-text images. Left-thumbstick paging, page count, disabled boundary controls, retained captions and failed-image navigation passed. Wide/portrait image geometry retained natural aspect ratios; WebGL pixel sampling confirmed the photograph appeared in the card. Closing a browser popup clears the runtime selection; VR entry discards stale content and starts with its menu closed.
- A 4000×1848 JPEG from the supplied tour loaded through its saved external-source mapping and rendered with the correct aspect ratio. The original project was only read, and its media was not published.
- Simulated tracked-head checks preserved local head position/rotation and XR session identity while facing a searched bubble. Viewpoint selection and jumps across a vertical collision mesh cleared the transition/head-crossing overlay. Existing compact/extended RAD precision changes, rapid destination changes and resource/session restoration tests passed.
- Final Windows portable EXE cold-started with version 1.11.2 and the final bundled runtime, then exited with code 0 on ordinary window close. Release ZIP contents and embedded checksums passed verification.
- Local EXE: 172,780,849 bytes; SHA-256 `CB140F730CF44B6234DD3CFB0D8F7A919646CD9B54A779210C1AA3F7AEED8F1E`. Local Windows ZIP: 270,933,715 bytes; SHA-256 `E3E0D2DAF390020D24C83706663ECF6FF4438BCBB5CC3BB5D5A520E315447EC9`.
- These XR checks use a simulated session and software WebGL rendering. Real Quest 3/3S controller comfort, stereo presentation and physical head tracking still require the headset checks in MANUAL_TESTS.md.

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

## v1.11.1 blended hemisphere backgrounds (2026-10-07)

- Solid backgrounds have independently editable top/bottom hemisphere colors with a smooth, linear-color horizon blend. Matching colors use the single-color background path. Legacy projects retain their original color in both halves; optional topColor/bottomColor fields survive saved and exported JSON. No new dependency or sky asset is needed.
- The background follows camera position separately for each render eye and keeps its world-up horizon. Clearing or changing scenes disposes the hemisphere geometry/material; foreground splats and annotations are unaffected by color edits.
- Production build and all 76 unit/integration tests pass. Source native/portable-export and actual WebGL color/gradient checks pass (test-output/hemisphere-background-1791406481964).
- Final packaged checks verify legacy picker values, readable swatch size, undo/redo, unchanged foreground mesh, actual project reopening, portable export, exact upper/lower RGB, intermediate smooth horizon samples, altitude-independent horizon, both camera eye offsets, disposal, cancellation and offline phone viewing (test-output/hemisphere-background-1791406928367). Packaged tour ordering/search/loading, safe destinations, help/version, rapid replacements and mocked XR session/head-tracking regression also pass (test-output/tour-directory-1791406928367). Editor and gradient screenshots were visually inspected.
- The 149-file tracked/nonignored audit finds no scan data, binaries, oversized files or credential patterns. CI runs the new packaged background check.

Eye-offset rendering checks do not replace real Quest headset/controller acceptance. GitHub build/release results are left for the user to check.

Actual portable wrapper cold start verifies version 1.11.1, the final bundled editor, hidden isolated profile and normal close with exit code 0 (test-output/portable-final-cdp-1791407209799). Windows ZIP entries and checksums are verified.

Local build: `release/Spark Tour Studio 1.11.1.exe`, 158,897,271 bytes; SHA-256 `CE5B1E6B162D38B695E96B06788B395FC70BFC2F23EC8F9B786D1FC089043A2A`.
Local build: `artifacts/Spark-Tour-Studio-1.11.1-windows-x64.zip`, 257,048,954 bytes; SHA-256 `93E88B12925F1A136ED560A8764164817D229F725C60059C0CF95DAA5912C2F0`.


## v1.18.0 web viewer polish (2026-10-19)

- Cursor capture is deliberate through Mouse look; scene clicks remain free. Free dragging grabs the scene, captured movement aims conventionally, right-drag pans, and Escape releases. Drone uses Space/E up and Shift/Q down; Walk uses Space/E jump and Shift/Q crouch. WASD and arrows remain equivalent.
- A skippable, replayable seven-step introduction adapts to saved views, Drone, Walk and touch. It includes headset controls; compact movement help uses bundled Google symbols. Phone toolbar buttons remain labeled for assistive technology without wrapping over the guide. Neutral glass shade is saved, reopened and exported as appearance.glassShade.
- XR bubble content scrolls continuously with the left thumbstick or held controls. Images open in a larger inspection surface and return to the retained scroll position. Actual landscape/portrait pixels, viewport clipping, clipped click rejection, final content access and missing images are checked. Content image uploads cap at 1536 pixels, inspection/cover at 2048, with far image maps evicted. Menus stay compact; the document, renderer and simulated XR session remain unchanged.
- Collision selections retain meshes/handles and update a 10 KiB GPU data texture instead of compiling new shaders while dragging. Native generation, cancellation, alignment, saving/reopening and visitor-preview cleanup pass. COLLISION_RESEARCH.md records current generator limits and a proposed paged sparse-tile architecture retaining authored regions; streamed physics is not included in this release.
- The existing 119 unit/integration checks passed; the two added onboarding/appearance checks also pass (121 total). Final controls tests cover aliases, free/captured direction, intentional capture, Escape and mobile controls. Existing compact authoring movement/box-wall/history checks pass, as do bubble/export/capture checks and extended-precision reload/session preservation.
- Evidence: test-output/collision editor 1792416150062; test-output/authoring movement 1792416094601; test-output/bubble-settings-1792416328122; test-output/xr-polish-1792416310816; test-output/walk-controls-1792416249629; test-output/extended-precision-1792416476402; test-output/viewer-onboarding-1792416584211; test-output/viewer-onboarding-1792416836194 and final packaged test-output/viewer-onboarding-1792416926195 (settings/content/scene guide-step retention). Packaged XR checks include offline export and browser requests blocked outside the local server.

Quest 3/3S readability, comfort, controller behavior and real large-scene selection performance remain hardware/manual acceptance. Synthetic browser/XR checks do not replace those tests. GitHub release results are left for the user to check.

Final packaged onboarding check: test-output/viewer-onboarding-1792416926195. Actual portable EXE cold start/version/About/normal close passes with exit code 0 (test-output/portable smoke 1792417066694). Windows ZIP contents and nested checksums are verified.

Local build: `release/Spark Tour Studio 1.18.0.exe`, 184,942,500 bytes; SHA-256 `f45e0b53d944d19c453bc076592393395fbcc2b376c9ec754ae60a949f3afc0c`.

Local build: `artifacts/Spark-Tour-Studio-1.18.0-windows-x64.zip`, 282,966,293 bytes; SHA-256 `a3b17cae3148f5c2c7a11a7a1364e1c10e1bba62a62cc8b14679dbb055c4f9cb`.


## v1.19.7 collision picking and box face handles (2026-10-19)

- Reproduced the reported paged Walk click failures in the current read-only Tourv2 East Inside Graveyard. Original splat-first clicks loaded collision but stopped before routes.find; temporary physics boundaries also appeared at unloaded page seams. Direct bounded collision-grid rays now determine the actual first boundary, fetch crossed pages under existing stream budgets, and preserve scene transforms. Small same-floor landing searches fit the capsule beside voxel edges. Streaming navigation refreshes retain preflight click intent while user cancellations remain authoritative.
- Packaged synthetic corridor check selects an unloaded distant floor with no splat at that location, starts a path, and passes existing resident-budget/support/streamed-route/drone/XR-cleanup checks (test-output/paged runtime 1792458497569). Real-scene checks now start routes for the five tested reachable headings, including formerly failing 90, 135 and 180 degree directions; a formerly failing destination moves the capsule about 8.9 m. Blocked directions remain rejected. Project config/assets were not modified.
- Six selected-box face handles are available in all three transform tools, retain screen size, preserve opposite faces and rotate with their box. Actual packaged native mouse drags pass in Move, Rotate and Scale; changed dimensions save correctly (test-output/box faces 1792458551996). Screenshot inspected. Tool changes detach face editing and restore whole-shape controls.
- Unit regressions cover cold ray seams, real boundaries, exact grid edges, distance/page budgets, cancellation, failed page requests, same-storey nearby landings, selected-face visibility/size and streaming intent. Real Quest acceptance remains manual.

Final packaged real-scene report: test-output/real walking final 1792458731656. All five asserted reachable click headings start routes, and the walking capsule travels 8.8847 m on the formerly failing northbound click.

Final full regression run: all 266 tests pass (test-output/v1.19.7-tests.log).

Windows portable: release/Spark Tour Studio 1.19.7.exe; 184984360 bytes; SHA-256 8E8C9F16DDC3A7814A11929A6353ECD70EFEB95B5C1A125C6D91740FC03EA530.

Actual portable EXE cold start, 1.19.7 About/version and normal close pass (test-output/portable smoke 1792458939216).


## v1.19.8 automatic stepping and detours (2026-10-19)

- East Inside Graveyard's saved tiles already use the default 0.5334 m step height. The discovered planner gap was that successful detours bypassed finer/current-step reconsideration; only failures retried. Nearby successful detours now compare a bounded local route against the original. Paged queries prepare a narrow corridor while retaining visitor support. New proposals must be shorter and pass the actual standing-capsule WalkingMotor in an isolated worker world, without jumps or excessive drops. Existing safe routes survive unavailable geometry, failed/longer proposals and cancellation; long-distance behavior is retained.
- Initial finer geometry shortened one real route from 5.7862 m to 4.4398 m, but actual walking stopped short. This candidate was rejected after physical validation was added. The final real-project comparison retains all 28 original valid routes without increasing lengths, including the justified detour; actual arrival is within 0.109 m (test-output/real walking safe-detours 1792459861421). No Tourv2 files were changed.
- Full streamed synthetic check uses older 0.25 m navigation tiles, a 0.4 m ridge and normal automatic step height 0.5334 m. The final path is about 6.08 m instead of detouring around the ridge, climbs it without jumping, and the live capsule arrives within 0.061 m with zero remaining path points. Resident physics remains bounded (test-output/route steps 1792459909168). Lower step-height and excessive-drop tests reject the direct crossing.
- Unit coverage includes refinement of successful detours, original-corridor retention on failed/longer proposals, current step limits, stale/cancelled worker results, actual automatic stepping and lower-limit rejection. Real Quest remains hardware/manual acceptance.

Final packaged streamed-step verification: test-output/route steps 1792460308936. Final packaged offline straight/angled 65 cm doorway arrival, impassable-gap rejection and cleanup pass: test-output/narrow-walk-1792460351666. Legacy failed-query refinement remains intact; physical shortcut validation is scoped to reconsidering successful detours. Packaged shared-module bytes were compared with source.

Final complete regression suite: all 270 tests pass (test-output/v1.19.8-release-tests.log).

Windows portable: release/Spark Tour Studio 1.19.8.exe; 184987396 bytes; SHA-256 E8357EDF4D9AF4E5408D8F6CD115C1388275BE626DB56E50234979ACFBE50849.

Actual portable EXE cold start, 1.19.8 About/version and normal close pass (test-output/portable smoke 1792460539543).

## v1.19.9 selection box face visibility (2026-10-19)

Face grips render in the editor overlay after splats, with scene transforms retained for selection and direct face resizing. Removed the later frame update that overwrote screen-size sizing. Grips now target 18 screen pixels and have light outlines. The face opposite a dragged grip remains fixed in Move, Rotate and Scale.

Regression suite: 271 tests pass (test-output/v1.19.9-release-tests.log). Final focused selection and movement checks: 9 pass. Packaged interaction check confirms visible grip pixels over opaque scene geometry, direct dragging in all three modes, unchanged opposite walls, and saved box dimensions (test-output/box faces 1792462183472).

Final packaged Tourv2 read-only check: East Inside Graveyard's real RAD and authored box, including its inverted scene transform, pass visible-pixel checks over an opaque occluder, direct face drags in Move/Rotate/Scale, opposite-wall invariance and saved JSON verification (test-output/box faces 1792462447374). Original Tourv2 files remain unchanged.

Windows portable: release/Spark Tour Studio 1.19.9.exe; 184986546 bytes; SHA-256 0E9F8E98B0CF4580085ECB2AC415A074014ADFA1B9C0A981A0EF091E995F9BA2. Actual portable cold start, About/version 1.19.9 and normal close pass (test-output/portable smoke 1792462565551).

## v1.19.10 Hungars Aerial disappearing (2026-10-19)

Reproduced against Tourv2's HungarsAerial RAD: decoded LoD bounds in the first chunk contain infinite half-float positions. The first splat has float32 center approximately (9894, 85874, 635); Spark 2.3.1 stores its traversal bounds as half floats, whose finite range ends at 65504. Traversal selected one root splat and the scene was blank, with no streaming request or WebGL errors. Root decoding identified 248 overflowing traversal nodes.

Correct only non-finite decoded traversal bounds in memory before uploading chunks to Spark's LoD worker. Saturate their positions to finite half values and give affected internal nodes a conservative refinement size. Preserve topology, ordinary finite nodes, rendered float32 splats, original RAD/chunks and project settings. Apply the correction to foreground and splat backgrounds. Explicitly invalidate LoD selection and its previous pixel limit when scene transforms change.

Pinned source verification: https://github.com/sparkjsdev/spark/blob/v2.3.1/rust/spark-rs/src/lod_tree.rs (LodSplat half-float center/size and update_lod_trees node decoding).

Packaged viewer against the real scene passes six scale/rotation edits, Preview entry, twelve orbit poses at three elevations, and three reloads. Assertions check current-scene display ownership, active splat counts, nonblank rendered pixels, no RAD request failures and no WebGL errors. Repair restored up to 3.75 million active splats; screenshot visually checked. Report: test-output/aerial visibility 1792464948727. Original project is served read-only, never rewritten.

Regression tests cover unchanged valid nodes, the exact overflowing aerial root, negative overflow, invalid leaf sizes, preserved child links, and idempotence.

Complete regression suite: 274 tests pass (test-output/v1.19.10-release-tests.log). Packaged app.asar version 1.19.10 and bundled shared/lod-bounds.mjs verified against source.

Windows portable: release/Spark Tour Studio 1.19.10.exe; 184979458 bytes; SHA-256 147CE3416E81EA4D202AC9EFF42B387B2ED697AA074A77D64070C5775A8185F8. Actual portable cold start, About/version 1.19.10 and normal close pass (test-output/portable smoke 1792465121850).

## v1.19.11 Orbit axis and authored elevation limits (2026-10-19)

Reproduced wrong-axis orbiting with Tourv2's HungarsAerial source rotation (-90 degrees X). Orbit angles, animation and editor rings previously used source-local Y, which becomes horizontal after scene alignment; even positive elevation restrictions could therefore circle the camera underground. A rotated graveyard source also reversed drag direction.

Use one tour-up orbit frame derived from the scene rotation. Shared playback computes its angles and camera orientation in that frame, while retaining scene-local center, radius and stored position. Both mouse buttons, touch, animation, editor ring/bound handles, frame-geometry and Update from camera use the same frame. Photosphere and slider behavior is unchanged. Existing project data needs no migration or rewriting.

Tests sample 1000 animation poses with 50.9–64 degree bounds on identity, aerial, inverted and arbitrary scene rotations. Check fixed radius, positive world elevation, a level horizontal drag, correct facing, stopped animation on drag, editor ring and bound handle alignment, and capture round trips. Full regression suite: 276 tests pass (test-output/v1.19.11-release-tests.log).

Read-only packaged test serves the real aerial RAD with a cloned viewpoint using the screenshot's 50.9–64 degree limits. Actual left/right mouse drags and touch pass; 1000 animation steps retain the radius and positive elevation bounds; the editor's horizontal ring stays level. Screenshot visually checked. Report: test-output/orbit axes 1792465939361. Tourv2 originals remain unchanged.

Final packaged real-asset check also edits source rotation after creating the active orbit (arbitrary tilt, inversion, then original aerial alignment): world elevation remains correct in all cases. Updated report: test-output/orbit axes 1792466130720. Live source transforms update the orbit frame without changing authored center/radius/limits.

Final focused controls/authoring checks: 15 pass. Final Windows portable: release/Spark Tour Studio 1.19.11.exe; 184979429 bytes; SHA-256 91502E11C23AC4BAA326864AB361F13F9124430102E87407328249B914DD4D09. Actual portable cold start, About/version 1.19.11 and normal close pass (test-output/portable smoke 1792466364856). Final packaged viewer bundle matches dist byte-for-byte.
