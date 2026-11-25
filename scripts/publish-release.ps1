[CmdletBinding()]
param(
    # Commit message for the squashed source-release commit.
    [string]$Message = '',
    # Print the plan (parent, tree, commit, tag) without pushing anything.
    [switch]$DryRun
)

# Publishes the current working tree as a squashed "source release" commit on the
# remote's main branch and moves the version tag to it.
#
# Why this exists: the full fork history stays local (it carries an upstream
# token in old commits), and only clean snapshots are published. Doing that by
# hand means checking out main, writing the tree with `git commit-tree`, then
# `git update-ref` — which moves the ref but NOT the index/working tree, so the
# release gate ends up testing stale files. This script never touches a local
# main branch: it pushes the new commit straight to `refs/heads/main`.
#
# Usage (from a clean `aicut` working tree):
#   powershell -File scripts/publish-release.ps1
#   powershell -File scripts/publish-release.ps1 -DryRun
#   powershell -File scripts/publish-release.ps1 -Message "AI-Cut 2.2.1 source release"

$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot

Push-Location $repoRoot
try {
    $tauriConf = Get-Content -Raw -Encoding UTF8 (Join-Path $repoRoot 'desktop/src-tauri/tauri.conf.json') | ConvertFrom-Json
    $version = $tauriConf.version
    if ($version -notmatch '^\d+\.\d+\.\d+') {
        throw "version in tauri.conf.json is not semver: '$version'"
    }

    $dirty = git status --porcelain
    if ($dirty) {
        throw "the working tree is not clean; commit or stash first:`n$dirty"
    }

    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($branch -eq 'main') {
        throw 'refusing to publish from a local main branch; work on aicut (main is only origin/main)'
    }

    git fetch origin --tags 2>&1 | Out-Null
    $parent = (git rev-parse origin/main).Trim()
    $tree = (git rev-parse 'HEAD^{tree}').Trim()
    if ([string]::IsNullOrWhiteSpace($Message)) {
        $Message = "AI-Cut $version source release"
    }
    $new = (git commit-tree $tree -p $parent -m $Message).Trim()
    $tag = "v$version"

    Write-Host "[INFO] branch $branch, version $version"
    Write-Host "[INFO] parent $parent"
    Write-Host "[INFO] commit $new"
    Write-Host "[INFO] tag    $tag"

    if ($DryRun) {
        Write-Host '[OK] dry run: nothing pushed'
        return
    }

    git push origin "${new}:refs/heads/main" "--force-with-lease=refs/heads/main:$parent"
    if ($LASTEXITCODE -ne 0) { throw "push of main failed with exit code $LASTEXITCODE" }

    git tag -f $tag $new | Out-Null
    git push origin $tag --force
    if ($LASTEXITCODE -ne 0) { throw "push of $tag failed with exit code $LASTEXITCODE" }

    Write-Host "[OK] published $tag -> $new"
    Write-Host '[NEXT] attach release/<version>/* to the GitHub release in the web UI (no gh CLI here)'
}
finally {
    Pop-Location
}
