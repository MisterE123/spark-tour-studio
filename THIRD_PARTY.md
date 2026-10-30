# Third-party licenses

The MIT license in `LICENSE` covers 3DGS Perspectives Studio's original code.
Dependencies retain their own copyright and license terms; they are not
relicensed by this project.

- Radix 0.0.1 (experimental viewer renderer): Copyright © 2026 WORLD LABS
  TECHNOLOGIES, INC., MIT. The separately adapted **SOGS / streamed LoD adapter**
  comes from World Labs' Radix example code at commit
  `b831cc5e98b52a83b6f0ac6ba5fc50b5ac883be1`; it is not an independently
  published SOGS API. Original files, hashes, local modifications and exact
  package/source revisions are recorded in
  `src/rendering/radix/vendor/PROVENANCE.json` and
  `src/rendering/radix/README.md`. The full upstream notice below applies to
  both the renderer and adapted example modules. Every built website and Studio
  includes `licenses/Radix-LICENSE.txt`, `Radix-PROVENANCE.json` and
  `Radix-SOGS-ADAPTER.md`. Source: https://github.com/sparkjsdev/radix .
- Spark 2.4.0 (retained legacy RAD collision decoder), Three.js, React, Zod, Recast Navigation, Electron, Tiptap OSS,
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
- This Radix branch retains the source of the legacy RAD importer and Spark
  Rust converter, but disables new RAD imports and does not package that
  converter. Its original notices remain in `converter/` when built separately.
- The editor-only PLY → LoD SOGS converter uses PlayCanvas splat-transform
  **3.10.3**, PlayCanvas engine **2.23.3** and embedded SuperSplat Viewer code
  under MIT, plus libwebp under its BSD license. A modified MIT Node filesystem
  adapter retains its original copyright header in `scripts/vendor/`.
  Complete permission notices and source provenance ship in
  `sogs-tools/licenses/`, and exact archive/generated-file hashes in
  `sogs-tools/dependencies.json`. The converter runs on bundled Node.js
  **24.21.0**, including Node's complete third-party notices. These tools are
  bundled with Studio, not visitor websites. GPU acceleration uses the pinned
  **webgpu 0.6.2** Windows x64 Dawn/Tint native runtime and matching D3D compiler
  libraries. The archive's actual Dawn/Tint **BSD-3-Clause** license is retained
  in `NodeWebGPU-Dawn.txt` (its npm metadata alone says MIT); full DXC license and
  third-party notices are retained alongside it. GPU unavailability has an
  explicit CPU fallback. Source:
  https://github.com/playcanvas/splat-transform and
  https://github.com/playcanvas/engine and https://github.com/dawn-gpu/node-webgpu .
- The editor bundles the official GitHub CLI 2.102.0 Windows x64 distribution
  under MIT. Its original notice is in `github-tools/LICENSE.txt`.
  The download is pinned and checksum-verified. Source and license:
  https://github.com/cli/cli/tree/v2.102.0 . It is not included in tour websites.

The build writes dependency license texts and version identifiers into
`dist/licenses/`. Exported tours preserve that directory. The Windows editor
includes the Node runtime notices, SOGS converter notices, and the licenses
for the editor-only scientific meshing engine. Dependency licenses govern those
components independently of 3DGS Perspectives Studio's MIT license.

Scan files, images, audio and authored tour content are supplied by authors and
are not licensed by this repository.

The editor-only collision engine bundles unmodified Pyodide 314.0.7 under
MPL-2.0, with source available at https://github.com/pyodide/pyodide/tree/314.0.7 .
NumPy 2.4.6, SciPy 1.18.0 and scikit-image 0.26.0 retain their BSD licenses and
component notices. Their complete dependency closure, versions, SHA-256 hashes,
and wheel license files are included in `editor-engine/dependencies.json` and
`editor-engine/licenses/` in the Windows editor. Python retains its PSF license.
These packages are not copied into exported viewer websites.

3DGS Perspectives Studio's ball/box selection, voxel enclosure, merged-face surface builder
and GLB writer were authored independently under MIT. No GPL-marked Lichtfeld
plugin source has been incorporated or relicensed.

## World Labs Radix renderer and adapted SOGS LoD example — full MIT notice

The MIT License

Copyright © 2026 WORLD LABS TECHNOLOGIES, INC.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.
