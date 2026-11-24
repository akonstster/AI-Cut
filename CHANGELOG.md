# Changelog

## AI-Cut 2.2.0

The editing core got a deep pass: the timeline, the Color page, audio skimming and export.

### Timeline & editing
- Dragging a group moves it without landing on another clip. A linked pair keeps its picture and sound together, and
  each half stays on its own lane — moving the video up one lane no longer shoves the audio down or drags the
  subtitles along. Groups of any size (video + audio + subtitles) never put an audio clip on a video lane, and a drop
  that would overlap another clip is refused instead.
- A red badge on a linked pair now says the two halves have drifted apart, with a context-menu "Restore sync" that
  slides the sound back under the picture in one undoable step.
- Shift+J joins the two parts of a cut, including a linked video/audio pair; Slip and Slide live inside the Trim tool
  (drag the clip's top strip to slide, the body to slip), and nudge (Shift+Arrows / Ctrl+Shift+Arrows) works on every
  visual clip, even one that has never been moved.
- A Source Monitor insert or overwrite carries the other half of a linked pair, so a single insert on the video track
  cannot leave the sound of every later clip behind. In/out keys act on the panel that has the keyboard (Source
  Monitor or timeline), following remapped shortcuts.
- Ctrl+wheel on the timeline keeps the playhead where it is on screen, like the zoom slider does.

### Color
- The Color page now reads like a grading desk: a scopes button beside the zoom control opens and closes the video
  scopes (remembered per workspace), the parameter dock splits into Primary / Curves / LUT tabs, the clip filmstrip
  is a resizable vertical column left of the viewer, and the keyframe editor opens from the left of the dock instead
  of squeezing the wheels.
- Compare, copy/paste, adjustment-layer and preset actions are a compact icon rail beside the parameters (the preset
  name in a popover); panel headers moved into the tab row; the curves stay square; the wheels fit with their channel
  chips and both parameter rows visible. Video scopes use one compact header instead of three stacked rows.

### Audio & playback
- Audio skimming no longer hammers the disk: directory handles are memoised, the audio meter reads the stored
  waveform instead of the media file, and the resolved skim source is shared across panels — hovering the timeline
  dropped from ~240 workspace requests to ~16.
- Skim grains follow the pointer speed and overlap instead of cutting each other (no more clicks), and a new Settings
  → General option "Tape-style audio skimming" plays one buffer whose speed follows the pointer, like dragging a reel,
  over a 12 kHz mono scrub proxy that is also reversed for backwards motion. The Color mini timeline skims too.
- J/K/L shuttle backwards, stop and forwards (repeat L or J to speed up); they are now documented as the editor's jog
  wheel.

### Subtitles & captions
- Clip captions can be promoted to a real subtitle track ("Move to subtitle track"), cues can be added and deleted one
  by one, and editing the text of a recognised line re-times its words instead of dropping the karaoke/word timing.

### Export & render queue
- Export picks the folder and file name before rendering (Documents by default, remembered per project), writes the
  finished file straight there, and offers its folder or the system player instead of a download. The render queue
  and the saved-exports list use the same "Open folder / Open" buttons instead of "Download".

### Generation
- A Settings → Providers & Agent option "Review generation parameters first" fills the Generate panel instead of
  sending a run immediately, so you confirm the fields; the finished result then returns to the canvas node or the
  shot that was waiting for it. Clicking a picture result opens it large, as in the media library.

### Interface & settings
- Text fields keep the caret where you type; tooltips stay inside the window; the projects screen has tooltips on its
  buttons and an option to reopen the last project on start; Alt+4 opens the Canvas workspace and Ctrl+` toggles the
  preview full screen; the keyboard-shortcuts editor scrolls to its last entry.

## AI-Cut 2.1.0

- Storyboard, Workflow, reusable elements and local 3D previs.
- Project-scoped generation drafts and portable project archives.
- Multilingual scene search, local model management and large media previews.
- OpenRouter capability checks and expanded MCP commands.

## AI-Cut 2.0.0

AI-Cut is now a native desktop program. Everything below is new.

- **One window for generation and editing.** A Generate tab beside the media library: images, image edits, video
  from text or frames, video edits, lip sync, upscale, background removal, music, voice, sound effects, transcripts
  and text, through OpenRouter, fal and Runware with your own keys.
- **Live model catalogues** of the three providers, newest first, with their prices; forms drawn from each model's
  own schema; the price shown before a run and the provider's bill recorded after.
- **Jobs that survive a restart** and are never sent twice; results downloaded to disk at once and imported into the
  project's library, optionally straight onto the timeline at the playhead.
- **A full multitrack editor** (based on FreeCut): trims, transitions, keyframes, masks, color, text, captions and a
  hardware-accelerated export to MP4, WebM, MOV and MKV, saved where you choose.
- **MCP server** at `http://127.0.0.1:8796/mcp` with 37 tools: an agent generates, edits the open project's timeline
  with undo, imports media, exports, and sees the window; a daily spending limit for agents.
- **Projects on your disk**: the workspace, generations and history live beside the program.
- **Russian and English** interface (and eight more languages of the editor).
- Updates from GitHub releases, an installer in English and Russian, a portable zip.
