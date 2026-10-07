$ErrorActionPreference = 'Stop'
$tag = $env:RELEASE_TAG
$runId = $env:BUILD_RUN_ID
$repo = $env:GITHUB_REPOSITORY
if ($tag -notmatch '^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$' -or $runId -notmatch '^\d+$') { throw 'Invalid tag or build run ID' }
$runText = gh run view $runId --repo $repo --json headSha,jobs,workflowName
if ($LASTEXITCODE -ne 0) { throw 'Cannot read build run' }
$run = $runText | ConvertFrom-Json
if ($run.workflowName -ne 'Build Spark Tour Studio' -or -not ($run.jobs | Where-Object { $_.name -eq 'Windows x64 checks and package' -and $_.conclusion -eq 'success' })) { throw 'Windows build must have passed' }
$tagSha = gh api "repos/$repo/commits/$tag" --jq '.sha'
if ($LASTEXITCODE -ne 0 -or $tagSha -ne $run.headSha) { throw 'Build commit does not match the release tag' }
$artifactName = "spark-tour-studio-windows-x64-$($run.headSha)"
gh run download $runId --repo $repo --name $artifactName --dir artifacts
if ($LASTEXITCODE -ne 0) { throw 'Cannot download tested build assets' }
$version = $tag.Substring(1)
$zipName = "Spark-Tour-Studio-$version-windows-x64.zip"
$zipPath = Join-Path artifacts $zipName
if (-not (Test-Path -LiteralPath $zipPath)) {
  $expected = @("Spark-Tour-Studio-$($tag.Substring(1)).exe", 'Launch-Tour.exe', "Spark-Tour-Web-Runtime-$($tag.Substring(1)).zip")
  # Older artifacts used spaces; normalize them for GitHub's download filenames.
  $legacy = @{ "Spark Tour Studio $($tag.Substring(1)).exe" = $expected[0]; 'Launch Tour.exe' = $expected[1] }
  $entries = Get-Content -LiteralPath artifacts/SHA256SUMS.txt
  if ($entries.Count -ne $expected.Count) { throw 'Unexpected checksum manifest' }
  foreach ($line in $entries) {
    if ($line -notmatch '^([a-f0-9]{64})  (.+)$') { throw 'Malformed checksum manifest' }
    $hash = $Matches[1]; $name = $Matches[2]
    if ($name -notin $expected -and -not $legacy.ContainsKey($name)) { throw 'Unexpected artifact filename' }
    $actual = (Get-FileHash -LiteralPath (Join-Path artifacts $name) -Algorithm SHA256).Hash
    if ($actual.ToLowerInvariant() -ne $hash) { throw "Checksum mismatch: $name" }
  }
  foreach ($name in $legacy.Keys) {
    $source = Join-Path artifacts $name
    if (Test-Path -LiteralPath $source) { Move-Item -LiteralPath $source -Destination (Join-Path artifacts $legacy[$name]) }
  }
  $entries = @($expected | ForEach-Object { (Get-FileHash -LiteralPath (Join-Path artifacts $_) -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $_ })
  [IO.File]::WriteAllText((Join-Path $PWD 'artifacts/SHA256SUMS.txt'), ($entries -join "`n") + "`n", [Text.UTF8Encoding]::new($false))
  node scripts/release-zip.mjs pack artifacts $version
  if ($LASTEXITCODE -ne 0) { throw 'Cannot package legacy build assets' }
}
node scripts/release-zip.mjs verify $zipPath $version
if ($LASTEXITCODE -ne 0) { throw 'Release ZIP verification failed' }
$files = @((Resolve-Path -LiteralPath $zipPath).Path)
gh release view $tag --repo $repo --json tagName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  gh release upload $tag @files --repo $repo --clobber
} else {
  gh release create $tag @files --repo $repo --verify-tag --generate-notes --title "Spark Tour Studio $tag"
}
if ($LASTEXITCODE -ne 0) { throw 'Release publishing failed' }

# Remove only the individual downloads now preserved inside the verified ZIP.
$obsolete = @("Spark-Tour-Studio-$version.exe", 'Launch-Tour.exe', "Spark-Tour-Web-Runtime-$version.zip", "Spark Tour Studio $version.exe", 'Launch Tour.exe', "Spark.Tour.Studio.$version.exe", 'Launch.Tour.exe', 'LICENSE', 'THIRD_PARTY.md', 'SHA256SUMS.txt')
$releaseText = gh release view $tag --repo $repo --json assets
if ($LASTEXITCODE -ne 0) { throw 'Cannot verify release downloads' }
$release = $releaseText | ConvertFrom-Json
foreach ($asset in $release.assets) {
  if ($asset.name -in $obsolete) {
    gh release delete-asset $tag $asset.name --repo $repo --yes
    if ($LASTEXITCODE -ne 0) { throw 'Cannot remove the bundled individual download' }
  }
}
