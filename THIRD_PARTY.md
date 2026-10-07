# Third-party licenses

The MIT license in `LICENSE` covers Spark Tour Studio's original code.
Dependencies retain their own copyright and license terms; they are not
relicensed by this project.

- Spark, Three.js, React, Zod, Recast Navigation, Electron and splat-transform:
  MIT (with their included notices).
- Rapier: Apache-2.0, distributed with its license text.
- Adobe SPZ: ISC.
- The bundled Node.js runtime includes its own MIT license and third-party
  notices in `collision-tools/Node-LICENSE.txt`.
- Spark's Rust converter and its crates retain the notices in `converter/`;
  Rust's library notices are included separately.

The build writes dependency license texts and version identifiers into
`dist/licenses/`. Exported tours preserve that directory. The Windows editor
includes the Node runtime notices, Rust converter notices, and the licenses
within the bundled collision tool packages. Dependency licenses govern those
components independently of Spark Tour Studio's MIT license.

Scan files, images, audio and authored tour content are supplied by authors and
are not licensed by this repository.
