# Progress — AI-Cut

## Release history

| Version | Date | Highlights |
|---|---|---|
| 2.0.0 | 2026-11-17 | Fork to AI-Cut: telemetry/auto-updater removed, own icon and data folder, portable build, server port setting, copy-path actions. |
| 2.1.0 | 2026-11-19 | Storyboard, Workflow, reusable elements, local 3D previs, project-scoped drafts and archives, multilingual scene search, local model management, OpenRouter checks, expanded MCP, SRT/FCPXML export, loudness normalisation, captions by word/karaoke, compact layout. |
| 2.2.0 | 2026-11-24 | Timeline, Color, audio skimming, subtitles and export overhaul (details below). |

## What 2.2.0 changed

**Timeline & editing**
- Group drags: lanes resolved per item (anchor follows the pointer, same-kind items follow the lane delta, sound and
  subtitles keep their own lanes), then one verified time shift for the whole group; a drop that cannot be placed
  without overlap is refused. `linked-drag-targeting.ts`, `group-drop-placement.ts`.
- Linked-pair sync badge + **Restore sync** context action (`getLinkedSyncRestoreUpdates`, `restoreLinkedSync`).
- `Shift+J` join works for linked pairs; slip/slide live in the Trim tool; nudge fixed for clips without a
  `transform` (`canHoldTransform`).
- Source Monitor insert/overwrite carries the linked partner; `I`/`O`/`Alt+X` follow panel focus.
- `Ctrl+wheel` zoom anchors on the playhead when it is on screen.

**Color**
- One navigator instance (filmstrip + viewer + mini timeline), Lumetri/Resolve-style dock: Primary/Curves/LUT tabs,
  effects column, keyframe lane toggle, icon rail for compare/presets, square curves, wheels fit, compact scope
  header, scopes toggle in preview controls, layout persisted per workspace.

**Audio**
- Skimming rewritten: shared source cache, memoised directory handles, waveform-only meter, adaptive cross-faded
  grains, media element that keeps playing (no pause/seek/play per frame), tape mode with 12 kHz mono proxy.
  Hovering the timeline: ~240 → ~16 workspace requests. `J`/`K`/`L` documented as the jog wheel.

**Subtitles**
- Promote clip captions to a subtitle track, add/delete a cue, word re-timing on text edits (karaoke survives),
  ownership/dedup so a pair shows one strip.

**Export**
- Folder + file name chosen before the render (Documents default, remembered per project), fallback when the folder
  is gone, **Open folder / Open** instead of Download in the dialog, the queue and the saved-exports list.

**Generation**
- Review mode (`generationReviewMode`) fills the panel instead of sending; the result returns to the canvas node or
  the shot; clicking a picture result opens it large.

**Interface**
- Caret no longer jumps in text fields (`use-synced-text`), tooltips clamp to the window, projects screen tooltips
  and "open last project", `Alt+4` Canvas, `Ctrl+`` fullscreen preview, hotkey editor scrolls to the end.

## Known issues / debt

- **Leaked PAT in old history** (`d6c5d1e`, `99be4fb`) — not in any live branch; GitHub Support ticket pending to
  purge the unreachable commits (see `activeContext.md`).
- Render-queue exports ignore the per-destination folder and still write to `projects/<id>/exports`.
- Two parallel lane-assignment paths remain: the special pair resolver and the general group resolver (both work;
  unifying them would remove duplication).
- No integration test covers "lane assignment + group time shift" end to end.
- The full test suite is ~13 minutes at full parallelism, and the release gate is **flaky under load**: on an 8-core
  machine with 8 vitest workers, heavy jsdom/WebAudio files (`gpu-power-window-panel`, `gpu-effect-panel`,
  `loudness`, `compositing-timeline`) exceed the 5 s default timeout and abort the build. They pass in isolation.
  Workaround used for the 2.2.0 artifacts: `vp test run --maxWorkers=4` (patched into `test:run` temporarily, then
  reverted). A real fix would be `maxWorkers`/`testTimeout` in the vitest config.
- `git update-ref` (used to publish the squashed source release) moves the ref but not the index/working tree — after
  moving `main`, run `git restore --source=HEAD --staged --worktree <path>`, or the gate tests stale files.
- Proxies are never generated automatically; without them scrubbing and export use full-resolution originals.

## Working today (verified by tests / live runs)

- Full timeline editing with linked pairs, transitions, keyframes, masks, text, captions.
- Color grading with scopes and presets; keyframe editing.
- Audio skimming in both modes, on Edit and on the Color mini timeline.
- Generation with live catalogues, price preflight, restart-safe jobs, MCP tools.
- Export to MP4/WebM/MOV/MKV with loudness normalisation, SRT sidecar/embedded/burn, FCPXML.
- Docs site (`docs/`) and in-app docs (`features/docs/pages/*.ts`, 29 pages).
