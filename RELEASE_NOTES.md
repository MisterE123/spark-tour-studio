# 1.23.0

- Improve VR teleport responsiveness, cancellation and tracked-controller recovery. Fix the cached-query loop that could freeze walking teleports, and validate Drone destinations using the tracked head's actual clearance.
- Show the authored entry camera before streaming, retain a scene cover until the first usable view, warm the renderer after the title paints, and defer physics until navigation needs it. Optional automatic detail adjustment preserves the author's saved performance target.
- Protect authoring during imports, Save As and closing. Media imports retain their original destination, canceled saves preserve edits, and rich-text Undo stays within its own story.
- Improve portable exports, HTML dependencies, RAD companions and filenames containing spaces, Unicode, hashes or percent signs. Keep the complete viewer, workers and physics resources local.
- Improve content focus, keyboard handling, scene audio, local HTTP compression and response validation.

The experimental source completed the full Windows CI suite before merge. The
VR walking fix was confirmed on Quest after identifying an older tour launcher
still serving the previous viewer. The additional Drone clearance behavior has
automated stereo/physics coverage and can be refined with subsequent hardware
feedback. See `EXPERIMENTAL_IMPROVEMENTS.md` for detailed verification evidence.
