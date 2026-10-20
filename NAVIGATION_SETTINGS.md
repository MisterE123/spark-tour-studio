# Authored navigation and viewpoint history — v1

These optional fields live in `config/tour.json` (project format version 1). Old projects default to a 2 m/s base and 1× factors.

| Field | Default | Meaning |
|---|---:|---|
| `navigation.baseSpeed` | 2 | Global Walk/Drone speed in tour meters per second; editor presets are Slow 1, Normal 2, Brisk 4, Fast 8, or a custom 0.1–100 value. |
| `scenes[].speedMultiplier` | 1 | Authored scene speed factor, 0.05–20. |
| Visitor speed choice | 1 | Browser/VR session preference; exported viewer offers 0.25–4×. It does not overwrite authored settings. |
| `scenes[].vrScale` | 1 | Scene VR world-size factor, 0.01–100. |
| `scenes[].viewpoints[].vrScale` | 1 | Additional VR world-size factor while that viewpoint is selected, 0.01–100. |

Movement speed = base speed × scene factor × visitor choice. It affects walking, flight, click-to-walk and mouse panning; authored Orbit/Slider animation speed is independent.

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

Desktop and mobile viewers open a collapsible, scrollable glass side panel when the view is selected. The panel fits short content and allows scene interaction alongside it. The X collapses it to a persistent About this view button in the same area, which restores the description and scene buttons. Editor Preview uses the same panel. The short description remains below the view. In WebXR, About this view opens the existing native scrolling content panel, including controller-selectable related-scene buttons at the end.

Scene buttons have unique stable IDs within their description, a nonempty label, a destination scene ID and an optional destination viewpoint ID. Omitting the viewpoint uses the scene's entry view. Listed and unlisted viewpoints are both valid destinations. Broken destinations fail validation; deleting a scene removes inbound buttons, and deleting a viewpoint falls back to that scene's entry view. Buttons dispatch internal scene actions, never browser navigation. At most 20 buttons may be authored per description.
