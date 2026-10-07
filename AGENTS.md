# Release workflow

- For version changes, build and verify a local Windows x64 portable editor and
  give the user a link to the local executable.
- Commit and push the version changes and a new matching `vX.Y.Z` tag so GitHub
  can build and publish the release. Preserve existing commits and tags.
- Do not wait for or monitor GitHub release results unless the user asks. The
  user checks GitHub releases and will report failures.
- Keep local tour assets, credentials, caches and generated executables out of Git.
