# Product Context — AI-Cut

## Why it exists

The loop "generate with a model → download → import into an editor → cut" is where AI video work loses time.
AI-Cut puts generation and editing in one window, with the price visible before the run and the result landing
straight on the timeline.

## Who uses it

A single editor / content creator working alone on their own machine, with their own provider keys, who wants an
agent (Claude Code, Claude Desktop, any MCP client) to be able to help inside the same project.

## Core workflows

1. **Generate → timeline.** Pick a task (image, image edit, video from text/frames, video edit, lip sync, upscale,
   background removal, music, voice, SFX, transcript, text), pick a model, fill the schema-driven form (media slots
   accept library files and earlier results), see the price, run. The result imports into the project library and
   optionally lands at the playhead.
2. **Cut.** Multiple video/audio tracks, ripple/rolling/slip/slide trims, transitions, keyframes with a Bezier
   graph, masks, blend modes, text and shapes, captions/subtitles, color grading.
3. **Grade.** The Color workspace: filmstrip column, viewer + scopes, Primary/Curves/LUT tabs, wheels, presets,
   keyframe editor on demand.
4. **Caption.** Transcribe a clip, edit the text in the timeline (per-word reveal / karaoke), promote clip captions
   to a subtitle track, export SRT/VTT/TXT/JSON or burn/embed them.
5. **Export.** Pick the folder and file name first, render (GPU-assisted), then open the folder or the file — no
   browser download step on the desktop.

## UX principles learned in this codebase

- **Deterministic, non-destructive drops.** A drag never leaves two clips overlapping on one lane; when a single
  shift cannot satisfy a group, the drop is refused instead of damaging the edit.
- **One lane per half of a pair.** Moving the picture up a video lane must not shove the sound down or drag the
  subtitles along; sync is preserved by moving everything in time together.
- **Panels decide shortcuts.** `I`/`O`/`Alt+X` act on the pane that holds the keyboard (Source Monitor vs
  timeline), following remapped hotkeys.
- **No layout surprises.** Workspace layout (panels, sizes, scopes, color tabs, filmstrip width) persists per
  workspace; the Color page never steals height from the picture when it can take it from the dock.
- **Quiet performance.** Hovering the timeline must not hammer the disk; the UI reuses one resolved source, one
  waveform and one directory handle per thing.
- **Explain, don't block.** When an action is unavailable (join of unrelated clips, locked track), say why in a
  toast instead of failing silently.
