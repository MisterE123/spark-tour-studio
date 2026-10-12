# Third-party licenses

The MIT license in `LICENSE` covers Spark Tour Studio's original code.
Dependencies retain their own copyright and license terms; they are not
relicensed by this project.

- Spark, Three.js, React, Zod, Recast Navigation, Electron, Tiptap OSS,
  ProseMirror:
  MIT (with their included notices).
- Google Material Symbols: Copyright Google LLC, Apache-2.0. The locally bundled
  info, viewpoint and scene vector paths are supplied Material Symbols, resized
  and recolored for glass. Source: https://github.com/google/material-design-icons
  and https://developers.google.com/fonts/docs/material_symbols . Full license:
  `licenses/Google-Material-Symbols-LICENSE.txt` (included in every tour export).
- Rapier: Apache-2.0, distributed with its license text.
- The bundled Node.js runtime includes its own MIT license and third-party
  notices in `licenses/Node-LICENSE.txt`.
- Spark's Rust converter and its crates retain the notices in `converter/`;
  Rust's library notices are included separately.
- The editor bundles the official GitHub CLI 2.102.0 Windows x64 distribution
  under MIT. Its original notice is in `github-tools/LICENSE.txt`.
  The download is pinned and checksum-verified. Source and license:
  https://github.com/cli/cli/tree/v2.102.0 . It is not included in tour websites.

The build writes dependency license texts and version identifiers into
`dist/licenses/`. Exported tours preserve that directory. The Windows editor
includes the Node runtime notices, Rust converter notices, and the licenses
for the editor-only scientific meshing engine. Dependency licenses govern those
components independently of Spark Tour Studio's MIT license.

Scan files, images, audio and authored tour content are supplied by authors and
are not licensed by this repository.

The editor-only collision engine bundles unmodified Pyodide 314.0.7 under
MPL-2.0, with source available at https://github.com/pyodide/pyodide/tree/314.0.7 .
NumPy 2.4.6, SciPy 1.18.0 and scikit-image 0.26.0 retain their BSD licenses and
component notices. Their complete dependency closure, versions, SHA-256 hashes,
and wheel license files are included in `editor-engine/dependencies.json` and
`editor-engine/licenses/` in the Windows editor. Python retains its PSF license.
These packages are not copied into exported viewer websites.

Spark Tour's ball/box selection, voxel enclosure, merged-face surface builder
and GLB writer were authored independently under MIT. No GPL-marked Lichtfeld
plugin source has been incorporated or relicensed.
