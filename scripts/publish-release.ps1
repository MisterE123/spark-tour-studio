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
$expected = @("Spark Tour Studio $($tag.Substring(1)).exe", 'Launch Tour.exe', "Spark-Tour-Web-Runtime-$($tag.Substring(1)).zip")
$entries = Get-Content -LiteralPath artifacts/SHA256SUMS.txt
if ($entries.Count -ne $expected.Count) { throw 'Unexpected checksum manifest' }
foreach ($line in $entries) {
  if ($line -notmatch '^([a-f0-9]{64})  (.+)$') { throw 'Malformed checksum manifest' }
  $hash = $Matches[1]; $name = $Matches[2]
  if ($name -notin $expected) { throw 'Unexpected artifact filename' }
  $actual = (Get-FileHash -LiteralPath (Join-Path artifacts $name) -Algorithm SHA256).Hash
  if ($actual.ToLowerInvariant() -ne $hash) { throw "Checksum mismatch: $name" }
}
$files = @($expected | ForEach-Object { (Resolve-Path -LiteralPath (Join-Path artifacts $_)).Path })
$files += (Resolve-Path -LiteralPath artifacts/SHA256SUMS.txt).Path
$files += (Resolve-Path -LiteralPath artifacts/LICENSE).Path
$files += (Resolve-Path -LiteralPath artifacts/THIRD_PARTY.md).Path
gh release view $tag --repo $repo --json tagName 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) {
  gh release upload $tag @files --repo $repo --clobber
} else {
  gh release create $tag @files --repo $repo --verify-tag --generate-notes --title "Spark Tour Studio $tag"
}
if ($LASTEXITCODE -ne 0) { throw 'Release publishing failed' }
