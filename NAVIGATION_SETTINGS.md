# Authored navigation, scene defaults and viewpoint history — v1

These optional fields live in `config/tour.json` (project format version 1). Old projects default to a 2 m/s base and 1× factors.

## Defaults and scene overrides

Set shared behavior in **Tour settings**. Adjust exceptions in each scene’s properties. Changes to the tour default flow through to scenes that inherit it; an explicit scene override stays fixed. Scene and viewpoint geometry remain independent of these presentation settings. Saving and publishing retain the existing project/export workflow.

For mixed-scale tours, a typical setup is a room-scale base movement speed and bubble distance, then a larger movement factor and bubble-distance factor for aerial overviews. Each setting shows its effective value before the visitor’s own speed adjustment.

### Bubble visibility

**Tour settings → Bubble defaults** controls translucency, marker size, occlusion and distance fade. Distance is now expressed in tour meters, with a no-fade option. **Scene → Bubble overrides** independently offers the tour distance, a multiplier of it, an absolute scene distance, or no fade. Marker size uses a scene multiplier; translucency and occlusion have optional scene overrides. Reset bubble overrides restores full inheritance.

| Field | Default | Meaning |
|---|---:|---|
| `bubbles.fadeDistance` | No fade | Bubble disappearance distance, 1–1,000,000 meters; `null` disables distance fading. |
| `scenes[].bubbles.fadeDistance` | Inherited | Explicit scene disappearance distance, or `null` for no fade. |
| `scenes[].bubbles.fadeDistanceMultiplier` | 1 | Multiplies the inherited disappearance distance, 0.01–10,000. An explicit scene distance takes precedence. Multiplying a no-fade default keeps it unlimited. |
| `scenes[].bubbles.sizeMultiplier` | 1 | Multiplies the tour marker size, 0.05–20. Per-bubble size remains an additional factor. |
| `scenes[].bubbles.translucency` | Inherited | Optional scene glass translucency, 0–1. |
| `scenes[].bubbles.occlusion` | Inherited | Optional scene choice to hide obscured bubbles. |

For example, set the tour distance to 25 m and an aerial scene’s distance multiplier to 40× to obtain a 1,000 m disappearance distance. Newly authored meter distances stay fully visible through the first 20% of that range, then fade smoothly to zero. Scene transforms and VR scale do not change meter distances. Distance-hidden bubbles do not intercept navigation clicks.

The legacy `bubbles.distanceFade` strength field remains supported without changing its original fade curve. A newly specified `fadeDistance` takes precedence; changing the distance in the editor replaces the legacy strength. Existing saved projects require no migration.

## Movement and VR scale

| Field | Default | Meaning |
|---|---:|---|
| `navigation.baseSpeed` | 2 | Global Walk/Drone speed in tour meters per second; editor presets are Slow 1, Normal 2, Brisk 4, Fast 8, or a custom 0.1–100 value. |
| `navigation.walkHeight` | 1.7 | Default desktop/mobile walking eye height, 1–2.4 meters. VR uses tracked headset height. |
| `navigation.walkStepHeight` | 0.5334 | Default maximum unobstructed step height, 0–1 meters; 0 disables stepping. |
| `scenes[].walkHeight` | Inherited | Optional scene walking eye-height override. |
| `scenes[].walkStepHeight` | Inherited | Optional scene step-height override; 0 remains an explicit no-stepping choice. |
| `scenes[].speedMultiplier` | 1 | Authored scene speed factor, 0.05–20. |
| Visitor speed choice | 1 | Browser/VR session preference; exported viewer offers 0.25–4×. It does not overwrite authored settings. |
| `scenes[].vrScale` | 1 | Scene VR world-size factor, 0.01–100. |
| `scenes[].viewpoints[].vrScale` | 1 | Additional VR world-size factor while that viewpoint is selected, 0.01–100. |

Movement speed = base speed × scene factor × visitor choice. It affects walking, flight, click-to-walk and mouse panning; authored Orbit/Slider animation speed is independent.

Walking height and step height are authored meters, so they use overrides rather than scale multipliers. In Scene → Navigation & starts, check **Use tour walking height** or **Use tour step height** to restore inheritance; editing the visible value creates an override. Existing explicit scene values are preserved. Paged collision generation captures the effective step height for its walking tiles; changing an inherited default during generation prevents stale tiles being applied. Scene overrides remain independent of subsequent tour-default changes.

Effective VR size = scene VR scale × selected viewpoint VR scale. 2× makes the world feel twice as large: tracked headset/controller translation and eye separation occupy half as many tour units. Geometry, splat alignment, collision meshes, authored poses and desktop viewing retain their original scale. Physics and movement speeds remain in authored tour meters. Scale changes preserve the current head position; selecting an entry viewpoint then places its rig at that authored destination. UI panels and controller targets retain their physical reading size. Session exit restores desktop rig scale. Scene links preserve the renderer, canvas and XR session.

## Extended descriptions

Each viewpoint may keep its short `description` and additionally carry:

```json
{
  "extendedDescription": {
    "enabled": true,
    "richText": {
      "version": 1,
      "doc": {
        "type": "doc",
        "content": [
          { "type": "paragraph", "content": [{ "type": "text", "text": "The history of this place…" }] }
        ]
      }
    },
    "links": [
      { "id": "go-inside", "label": "Explore the interior", "sceneId": "inside", "viewpointId": "north-door" }
    ]
  }
}
```

The rich document uses the same bounded and sanitized schema as bubble content: formatted paragraphs, headings, lists, links and imported/URL images. Turning the panel off preserves its document and scene buttons. Local media and linked files participate in missing-asset validation, project tracking and export; portable exports copy/download required media and rewrite references without modifying source data.

Desktop viewers open a collapsible, scrollable glass side panel when the view is selected. On phones and short landscape displays, it starts as an About this view button to leave the scene clear. Opening it shows the same history and scene buttons; the X always collapses it back to that persistent button. Turning the device does not close a panel the visitor opened. Editor Preview uses the same panel. The short description remains below the view. In WebXR, About this view opens the existing native scrolling content panel, including controller-selectable related-scene buttons at the end.

Scene buttons have unique stable IDs within their description, a nonempty label, a destination scene ID and an optional destination viewpoint ID. Omitting the viewpoint uses the scene's entry view. Listed and unlisted viewpoints are both valid destinations. Broken destinations fail validation; deleting a scene removes inbound buttons, and deleting a viewpoint falls back to that scene's entry view. Buttons dispatch internal scene actions, never browser navigation. At most 20 buttons may be authored per description.
