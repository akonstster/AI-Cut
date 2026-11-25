# Active Context — AI-Cut

> Snapshot of what is happening right now. Update this file at the start/end of a work session.

## Current focus: AI-Cut 2.2.0 released, installers being built

- **Version:** 2.2.0 (bumped in `Cargo.toml`, `desktop/src-tauri/Cargo.toml`, `desktop/src-tauri/tauri.conf.json`).
- **Git state**
  - `aicut` = full fork history (dev branch). Latest: `4965f840 test(editor): account for new color layout fields in
    workspace persistence`.
  - `main` = published **source-release** branch: `b95f2f35 "AI-Cut 2.2.0 source release"`, parent
    `e5824616 "Publish bilingual AI-Cut website"` → `90d1a6d2 "Initial AI-Cut 2.1.0 source release"`.
    Tags `v2.1.0`, `v2.2.0`.
  - `origin` = `https://github.com/akonstster/AI-Cut`; `git ls-remote origin` shows **only** `main` + the two tags.
  - Local remote-tracking refs were pruned (old `legacy-v1`, `claude/*`, `devin/*`, `videosos-2-1` from the previous
    upstream remote are gone).
- **Release notes:** `release/2.2.0/RELEASE_NOTES.md` (GitHub release body, ready to paste).

## How the release is published here

Local branches: **only `aicut`** (dev, full fork history). There is no local `main`; `main` exists on GitHub as
clean squashed "source release" commits. Publishing is one command from a clean `aicut` tree:

```powershell
powershell -File scripts/publish-release.ps1 -DryRun   # parent, commit, tag
powershell -File scripts/publish-release.ps1           # push main + move tag
```

The script does `git commit-tree <tree> -p origin/main`, pushes `${new}:refs/heads/main` with `--force-with-lease`,
then force-moves `v<version>`. It refuses a dirty tree and refuses to run on a local `main`.

**Never publish by hand with `git update-ref`:** it moves the ref but leaves the index/working tree stale, so the
gate tests old files (this failed two builds). `git push --force --mirror` is also forbidden — the local `aicut`
history contains the old token commits and would re-publish them.

## In-flight

- `scripts/build-release.ps1` was started detached (`Start-Process … -RedirectStandardOutput release/2.2.0/build.out.log`).
  Status check: `Get-Process powershell | ? StartTime -gt (Get-Date).AddHours(-1)` and the tail of
  `release/2.2.0/build.out.log`. Artifacts land in `release/2.2.0/`:
  `AI-Cut_2.2.0_x64-setup.exe`, `AI-Cut_2.2.0_x64_en-US.msi`, `AI-Cut-2.2.0-portable-windows-x64.zip`.
- **Gate flakiness:** two runs failed on *different* heavy test files (13–182 s durations) — timeouts at 8 workers,
  all pass in isolation. The current run uses `"test:run": "vp test run --maxWorkers=4"`, patched into
  `frontend/package.json` with a backup at `frontend/package.json.bak`; revert it after the build so the released
  tree stays identical to `b95f2f35`.
- **Upload is manual:** no `gh` CLI and no GitHub token in this environment. The GitHub Release must be created in
  the web UI with tag `v2.2.0`, the body from `RELEASE_NOTES.md`, and the three files attached.

## Open issue: inherited PAT in old history

`upload-release.sh` (line 6, `GITHUB_TOKEN="ghp_…"`) and `RELEASE-INSTRUCTIONS.md` were added in `d6c5d1e` and
removed in `99be4fb`. They are **not** in any live branch or tag; the commit objects survive in GitHub's object
store, which is why GitGuardian keeps flagging `akonstster/AI-Cut` commits
`d6c5d1e3442ae7f64abf2aed41ddeaa0878e1795` and `99be4fb6d83eb226f9afb9b6cec5aff14915187f`.
The token belongs to the upstream author, so revocation is not possible here. A GitHub Support ticket is prepared
(category **Deletions**) asking to purge those unreachable commits. Local history is intentionally left untouched.

## Next steps (planned, not started)

1. Finish the installer build and verify the three artifacts.
2. Create the GitHub Release `v2.2.0` in the web UI and attach the artifacts.
3. Optional: rebuild the `docs/` site copy if its text should mention 2.2.0.
4. Optional follow-ups from earlier reviews: per-destination export for the render queue (queue still writes to
   `projects/<id>/exports`), unify the pair/group lane-assignment code paths, and an integration test for a full
   three-clip drag (lane assignment + group time shift together).
