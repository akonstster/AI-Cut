# NOTICE

AI-Cut is a fork of **VideoSOS 2** — <https://github.com/timoncool/videosos>, licensed under the MIT License.

Upstream copyright: **Copyright (c) 2024–2026 Ilya Timonin (timoncool) and VideoSOS contributors.**

The editor window in `frontend/` is based on **FreeCut** — <https://github.com/walterlow/freecut>,
**Copyright (c) 2025 FreeCut**, MIT License (the full text is in `frontend/LICENSE`).
VideoSOS 1 started as a fork of the **fal AI Video Starter Kit** — <https://github.com/fal-ai-community/video-starter-kit>, MIT.

These copyright notices and the MIT permission notice must be kept in every copy or substantial portion of this
software.

## Changes in this fork (2026-11-17)

- Renamed the product to **AI-Cut**: `productName`, window titles, `identifier` (`com.aicut.studio`), the binary name
  (`AICut`), the data folder (`AI-Cut`, Linux `ai-cut`), documentation and UI strings.
- Removed the Studio Hub client (`studio-hub-client`) and its UI: no telemetry, no install id, no news feed, and no
  hidden per-machine identifier. The server module `crates/vs-server/src/hub.rs` is a no-op now.
- Removed the upstream GitHub auto-updater (`tauri-plugin-updater`, its endpoint and signing key).
- Added **Copy name** and **Copy full path** to the context menus of the media library and the timeline.
- What's New and the `/changelog` page read `frontend/src/data/changelog.json`; it now holds AI-Cut entries (add
  future notes under `current` and `releases` there).
- Ported from upstream PR #208 (VideoSOS 2.1): a POST refused with 429 is sent again after 1, 2 and 4 seconds or the
  provider's `Retry-After` (`crates/vs-providers/src/http.rs`), with a unit test.
- Ported from the same PR: the `subtitles_export` agent tool (SRT/VTT/TXT/JSON), export loudness normalisation
  (EBU R128, true-peak limiter), FCPXML 1.11 export, and the parts of the compact layout that fit this base — the
  Safari `requestIdleCallback` polyfill, `h-dvh` editor height and a toolbar that scrolls and hides secondary
  buttons on narrow screens. The PR's tablet panel overlay and 2.1 toolbar slots were not taken: they depend on
  the 2.1 shell.
- Ported captions by word and karaoke from the same PR (`af5436c`): word timings in the transcript cues, the
  `revealCaption` renderer for the preview and the export, and the Reveal/highlight caption-style controls. The MCP
  `captions_add` reveal (`6e2be24`) was not taken: the 2.0.0 base has no `captions_add` tool to extend.
- Removed the upstream donation and community extras: `DONATE.md`, `.github/FUNDING.yml`, the GitHub/Telegram/Discord
  buttons in the toolbar and on the project screens, and the star-history workflow with its charts.
- The server port is a setting now (`server_port` in `data/settings.json`): change it in Settings, and the shell
  reads it before the server starts; `VIDEOSOS_PORT` still overrides it for one launch. Settings also show the
  workspace and data folders with Copy buttons.
- Rust identifiers and environment variables were kept valid and compatible: the port probe uses `Occupant::AiCut`,
  and `VIDEOSOS_ROOT` / `VIDEOSOS_PORT` keep working (they are API, not branding).
- New icon `frontend/public/aicut-icon.svg`, and `desktop/src-tauri/icons` regenerated from it with
  `npx tauri icon` (Windows PNG/ICO, macOS ICNS).

- Adapted from PR #208 for the 2.0 editor: generation takes and likes, sharing, key checks, MCP writing guides,
  searchable generation fields, portable indicators, numeric settings inputs, accessibility labels, timeline and
  project picker refinements, and Storyboard. Interrupted generation file downloads retry at the HTTP layer.

- Adapted HTML motion graphics and Node Canvas from PR #208. Graphics render locally; Canvas graphs are stored
  with the workspace project.

- Adapted 3D blocking from PR #208, including the Three.js preview, camera frame and clip export, and the
  previs_render MCP tool.

- Adapted the 2.1 graphite palette, violet primary actions, timeline colors, and top-bar layout to the fork's
  existing routes and editor controls. The top bar uses the AI-Cut brand.

- Adapted the portable workflow templates and file format, prompt reference elements, playhead pointer handling,
  provider network error causes, and the confirmation before closing a window with active generation jobs.

## Names and marks

"VideoSOS", "FreeCut" and their logos belong to their authors. The MIT License grants rights to the code, not to the
names or marks; AI-Cut does not claim them.
