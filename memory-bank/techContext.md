# Tech Context — AI-Cut

## Stack

- **Shell:** Tauri v2 (`desktop/src-tauri`), WebView2 (Chromium). Single-instance in release; the window opens
  `/projects?v=<mtime of frontend/dist/index.html>` so a rebuilt bundle is never served from the WebView cache.
- **Server:** Rust + axum (`crates/vs-server`), tokio, rusqlite (`data/AI-Cut.db`), rustls reqwest.
- **Providers:** `crates/vs-providers` — OpenRouter (catalogue, chat, jobs), fal (queue API), Runware.
- **Frontend:** React 19, TypeScript, TanStack Router 1.x (file-based, `*.lazy.tsx`), Zustand 5, Tailwind CSS 4 +
  Radix UI, i18next (en, ru + 8 partial editor locales), `motion`, `three`, `@xyflow/react`, `mediabunny`
  (decode/encode), `onnxruntime-web` + `@huggingface/transformers` (local whisper, embeddings, LFM captions).
- **Toolchain:** `vite-plus` (`vp`) — `vp dev`, `vp build`, `vp test run`, `vp check`, `vp fmt`; `tsc` via `vp check`.

## Commands

```powershell
# frontend
cd frontend
npm run build            # vp build → dist/
npm run check            # vp check --no-fmt src headless vite.config.ts
npm run test:run         # vp test run  (full suite ~13 min, 5200+ tests)
npx vp test run <path>   # a single file/folder
npx vp fmt               # format

# desktop (release binary)
cargo build --release --manifest-path desktop/src-tauri/Cargo.toml
# → desktop/src-tauri/target/release/aicut-desktop.exe

# install locally (what "release" means on this machine)
Copy-Item frontend/dist/* "$env:LOCALAPPDATA\AI-Cut\frontend\dist" -Recurse -Force
Copy-Item desktop/src-tauri/target/release/aicut-desktop.exe "$env:LOCALAPPDATA\AI-Cut\AICut.exe" -Force

# full release (test gate + tauri bundle: NSIS + MSI + portable zip)
powershell -File scripts/build-release.ps1     # artifacts in release/<version>/
```

The release script verifies that `desktop/src-tauri/Cargo.toml` and `tauri.conf.json` versions match, runs
`npm run test:run`, `cargo test --workspace`, `cargo test` for the shell, stages LICENSE/NOTICE/frontend into
`desktop/src-tauri/staging`, then `tauri build`. **It tests the working tree**, not the git index — an uncommitted
or reverted file will fail the gate even if the commit is correct.

## How a release is published (no local `main`)

The fork's history **stays local** (it carries an upstream token in old commits); only clean squashed snapshots go
to GitHub. Local branches: **`aicut`** only — `main` exists solely as `origin/main`. Never check `main` out.

```powershell
# from a clean aicut working tree, version already bumped and committed
powershell -File scripts/publish-release.ps1 -DryRun   # prints parent/commit/tag
powershell -File scripts/publish-release.ps1           # pushes refs/heads/main + moves vX.Y.Z
```

The script builds `git commit-tree <HEAD tree> -p origin/main`, pushes it straight to `refs/heads/main`
(`--force-with-lease`), then force-moves the `vX.Y.Z` tag. It refuses a dirty tree and refuses to run on `main`.

**Why not by hand:** `git update-ref` moves the ref but not the index/working tree, so a hand-made snapshot leaves
stale files behind and the release gate tests the wrong code (this failed two builds). The script never touches the
working tree.

**Binaries** are built separately (`build-release.ps1` → `release/<version>/`) and attached to the GitHub release in
the web UI — there is no `gh` CLI or token in this environment.

## Version bump (three files, all must match)

- `Cargo.toml` → `[workspace.package] version` (drives `vs-server`/`vs-providers` via `version.workspace = true`)
- `desktop/src-tauri/Cargo.toml` → `[package] version`
- `desktop/src-tauri/tauri.conf.json` → `"version"`

## Runtime layout on disk

```
%LOCALAPPDATA%\AI-Cut\
  AICut.exe
  frontend\dist\            # SPA served by vs-server
  data\
    workspace\media\<id>\   # source media, metadata.json, cache\{waveform,filmstrip,ai}
    workspace\projects\<id>\# project.json, node-canvas.json, exports\
    generations\            # downloaded provider results
    catalog\                # cached model catalogues
    AI-Cut.db               # jobs, spend
    settings.json           # server port, agent budget
  webview-data\             # WebView2 profile
```

## Conventions

- No cross-feature imports; use `features/<x>/deps/*-contract.ts`.
- Zustand: `use<X>Store((s) => …)` selectors; actions live in `stores/actions/*` and are undoable where they edit
  the timeline.
- Every user-visible string goes through i18n; `en` is the source of truth, `ru` must be filled.
- Tests: co-located `*.test.ts(x)`; jsdom for DOM, `// @vitest-environment node` for pure logic; pure resolvers get
  dedicated tests (see `group-drop-placement.test.ts`, `linked-drag-targeting.test.ts`).
- Live verification is done with Playwright against the running app on `http://127.0.0.1:8797` (or 8796).
- Do not commit `release/`, `target/`, `frontend/dist/`, `desktop/src-tauri/staging/`.
