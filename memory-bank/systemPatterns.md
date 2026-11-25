# System Patterns — AI-Cut

## Process topology

```
AICut.exe (Tauri v2 shell, desktop/src-tauri)
  └─ runs vs-server (axum) in-process on 127.0.0.1:8796 (port configurable, stored in data/settings.json)
       ├─ /api/*        REST for the workspace fs, catalog, jobs, keys, settings, exports, assets
       ├─ /mcp          MCP server (agents edit the same project)
       └─ /*            SPA (frontend/dist), documents are `no-store`, hashed assets are cacheable
  └─ WebView2 window on http://127.0.0.1:<port>/projects?v=<index.html mtime>
```

`crates/vs-server` = API + MCP + SPA; `crates/vs-providers` = OpenRouter / fal / Runware clients; SQLite
(`AI-Cut.db`) for jobs and spend. `desktop/src-tauri` is excluded from the Cargo workspace (heavy tauri tree) and
built by Tauri itself.

## Frontend layout (feature-sliced, boundaries enforced)

```
frontend/src/
  features/<feature>/{components,services,stores,utils,hooks,deps}
  shared/{ui,state,timeline,utils,projects,...}
  infrastructure/{storage,desktop,gpu-effects,analysis,...}
  runtime/{renderer,composition-runtime,player}
  routes/   (TanStack Router, file-based, `$slug.lazy.tsx` chunks)
```

- A feature **never** imports another feature directly. Cross-feature access goes through
  `features/<feature>/deps/<x>-contract.ts` (thin re-export) and a matching `<x>.ts` wrapper.
- Boundaries are checked by scripts: `check:boundaries`, `check:deps-contracts`, `check:layer-boundaries`,
  `check:deps-wrapper-health`, `check:edge-budgets`.
- Routes are code-split with `*.lazy.tsx`; heavy features (Timeline, NodeCanvas, ColorDock) are `lazy()` too.

## Timeline model (the most important invariants)

- `TimelineTrack.kind` is **only** `'video' | 'audio'`. **Video tracks are universal** — photos, videos, text,
  subtitles and adjustment layers all live there. There is no subtitle track kind by design.
- Item types: `video | audio | image | text | subtitle | composition | ...`. A subtitle segment
  (`SubtitleSegmentItem`, `type: 'subtitle'`) is an ordinary item on a video lane.
- Clips carry `from`, `durationInFrames`, `sourceStart`, `trackId`, plus `linkedGroupId` for video+audio pairs.
- Captions: `item.transcriptCaptions` (per-clip cues with `words`), `source: { type: 'transcript', mediaId, clipId }`.
  Ownership/deduplication live in `shared/timeline/caption-ownership.ts`; cue math in `caption-cues.ts`;
  `edit-caption-cue.ts` re-times words when the word count is unchanged (keeps karaoke alive).
- Editing a cue must stay **one undoable operation**.

## Drag & drop rules (hard-won)

- **Lanes first, time second.** `utils/linked-drag-targeting.ts` assigns a lane per dragged item
  (`resolveGroupDragTrackAssignments`, `resolveLinkedDragTargetTrackTargets`): the anchor goes where the pointer is,
  items of the same track kind follow the same lane delta, everything else keeps its own lane when free/unlocked.
  A per-item `staysOnOwnLane` flag keeps subtitles put while the picture changes lane.
- **One time shift for the group.** `utils/group-drop-placement.ts` (`resolveGroupDropDelta`) collects each item's
  nearest free position as candidates, verifies each candidate against the whole group, takes the smallest that
  works, and returns `null` (refuse the drop) when nothing satisfies everyone. There is deliberately **no**
  per-item shifting: that would break sync.
- Insert/overwrite from the Source Monitor carries the linked partner (`stores/actions/source-edit-actions.ts`).

## Audio skimming (perf-sensitive)

- One resolved source per media for the session: `features/timeline/services/skim-source-cache.ts`.
- Two engines: media-element grains (`utils/timeline-audio-skim.ts`, keeps playing and seeks — never
  pause/seek/play per frame) and tape (`utils/timeline-tape-skim.ts`, one buffer, `playbackRate` follows the
  pointer, 12 kHz mono proxy from `scrub-proxy.ts`, reversed proxy for backwards).
- Grain length follows pointer speed (`skim-grain-timing.ts`); grains cross-fade.
- The workspace fs layer memoises directory handles (`infrastructure/storage/workspace-fs/fs-primitives.ts`) and
  persists keyframe indexes once per media; the audio meter reads the cached waveform, not the media file.
- Settings: `audioSkimMode: 'grains' | 'tape'`, `audioSkimMaxRate`.

## Color page

- `features/editor/components/color-timeline-navigator.tsx` renders filmstrip column + viewer + mini timeline from
  **one** instance (two mounts used to duplicate all derivation).
- `color-grading-dock.tsx` + `features/effects/components/color-grade-section.tsx`: Primary / Curves / LUT tabs,
  effects column, keyframe lane behind a toggle; layout persisted per workspace.
- Scopes toggle lives in the preview controls (`preview-scopes-toggle.tsx`), state in the workspace layout.

## Generation

- `features/generate`: panel, canvas (`@xyflow/react` nodes), storyboard, workflow, elements.
- `services/generation-review.ts` holds a run with `returnTo: {to:'canvas'|'shot'}`; `claimReviewReturn` +
  `returnReviewedResult` put the finished job back into the node/shot that was waiting for it.
- Jobs are persisted before sending; results are downloaded immediately.

## Settings & persistence

- `features/settings/stores/settings-store.ts` (zustand `persist`, key `freecut-settings`) — merged with
  normalisation on rehydrate (never trust stored values).
- Workspace layout: `localStorage['editor:workspaceLayout:<workspace>']`.
- Project: `data/workspace/projects/<id>/project.json` (+ `node-canvas.json`, exports). Schema validated with zod
  in `features/project-bundle/schemas/project-schema.ts`.
