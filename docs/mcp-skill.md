---
name: AI-Cut
description: Drive AI-Cut on this computer through its MCP server - generate images, video, music, speech, sound effects and text with the person's OpenRouter, fal and Runware keys, put the results into a project and edit it on the multitrack timeline, then export a video. Use whenever the person asks for anything AI-Cut does.
---

# AI-Cut for agents

AI-Cut is a desktop video studio: a multitrack editor (a FreeCut fork) with generation of every modality
through three providers the person pays with their own keys — OpenRouter, fal and Runware. Its MCP server
listens on `http://127.0.0.1:8796/mcp` while the program runs. The person watches the window: every action
you take in it is shown to them ("Agent: edits the timeline") and written to the Activity journal.

## Start

1. `studio_status` — version, which keys are set, catalogues, running jobs, money spent today, the agents'
   daily limit, and what the window shows (`editor`).
2. No project open? `projects_list`, then `project_open` with an id. The window must be open for the editor
   tools (`timeline_*`, `media_*`, `ui_*`); generation and the catalogue work without it.

## Generate

1. `models_list` with a `task`: `image`, `image_edit`, `video`, `video_edit`, `lip_sync`, `upscale`,
   `remove_background`, `music`, `speech`, `sound`, `transcribe`, `text`. Narrow with `provider` and `query`.
   Each model has the provider's price line; `status` other than `live` means it is retiring.
2. `model_form` — the fields the model takes. `key` is what you put into `values`; `role` says what a field
   means (`prompt`, `duration`, `resolution`, `aspect`, `size`, `first_frame`, `reference`, ...); a field of
   `type: media` takes files; `size` takes one of its `options` (`"1344x768"`).
3. `price_estimate` with the same values. Tell the person the price before anything costly (video, many
   runs). `null` means the provider bills only after the run.
4. `generate` with `project_id` of the open project. Files for media fields:
   - `{"media": "<id>"}` — a media item of the project (`media_list` gives ids);
   - `{"job": "<job id>", "index": 0}` — a result of an earlier generation;
   - `{"file": "C:\\path\\to\\file.png"}` — a file on this computer;
   - an `https://` URL.
   `place_on_timeline: true` puts the result at the playhead once it arrives. `repeat` runs it several times
   (each run is paid).
5. `job_wait` until `status` is `done` (or `failed` with `error`). A finished job lists `outputs`; with a
   project open the results are already in its library (`media_list`, tagged `generated`).

Text and transcription jobs end in text (`outputs[].text`). A job that was sent is never sent twice: after a
restart of the program it is followed, not repeated. `job_cancel` stops fal jobs; OpenRouter and Runware
cannot cancel, the program only stops waiting.

## Edit

- `timeline_get` — tracks and clips of the open project: ids, `from`/`durationInFrames` in frames of the
  project's `fps`, `start_s`/`length_s` in seconds, media names, text.
- `timeline_edit` with `ops`, each one undoable step of the editor:
  - `{"op": "addClip", "mediaId": "...", "from": 0}` — a media item as a clip;
  - `{"op": "addText", "text": "Title", "from": 0, "durationInFrames": 90, "fontSize": 96}`;
  - `{"op": "moveItem", "id": "...", "from": 150}`, `{"op": "removeItems", "ids": ["..."]}`;
  - `{"op": "split", "id": "...", "frame": 120}`, `{"op": "trimStart", "id": "...", "frames": 15}`;
  - `{"op": "addTransition", "leftClipId": "...", "rightClipId": "...", "durationInFrames": 15}`;
  - `{"op": "addKeyframe", "itemId": "...", "property": "opacity", "frame": 0, "value": 0}`.
  Give an op `callerId` and refer to what it created later: `{"$ref": "a#/detail/created/0"}`.
- `timeline_undo` / `timeline_redo`, `playhead_seek`, `playback`, `editor_tab`.
- `media_import` with `path` (a file on this computer) or `url`.
- `ui_screenshot` to see the result; `ui_read_page`, `ui_click`, `ui_type` for any control of the window.

## Recipes

**A shot from a picture.** `generate` an image (task `image`), `job_wait`, then `generate` a video with the
image as its first frame: `values: {"positivePrompt": "...", "inputs.frameImages": [{"job": "<image job>",
"index": 0}]}` for Runware, `"frame_first"` for OpenRouter, `"image_url"` for fal — read the model's form.

**Voice-over.** task `speech`, the text in the `prompt`-role field, a voice from the `voice` field's options,
`place_on_timeline: true`.

**A cut.** `timeline_get`, then one `timeline_edit` with all the ops in order; check with `ui_screenshot`.

## Money

Every generation is paid from the person's account. The person sets a daily limit for agents in Settings;
`generate` is refused past it — tell the person, never work around it. `spend` reports what was spent.

**Takes.** Runs of one request (the same model and values, the seed aside) are takes of each other: `job_like` marks
the best one, and the `timeline_edit` op `replaceMedia` puts another take's media item in a clip's place, keeping the
clip's start and length.

- `motion_render {html, seconds?, name?}` makes HTML and CSS motion graphics (titles, lower thirds, counters,
  badges) into a transparent clip at the playhead; CSS animations only, no scripts. Free.

### Storyboard, Canvas and 3D blocking

- Read the open project's storyboard with `storyboard_get`. Follow `next_offset` with `offset` until it is null. Use `limit` to change the page size and `include_script` to control whether the script is returned.
- Use `storyboard_set` to write a script and a list of shots. A supplied list replaces the current list. The response confirms the save and reports `total_shots`.
- Include each existing shot's `id` when changing its prompt, duration, name or order with `storyboard_set`. Keeping the ID preserves the links to the shot's blocking and workflow. Supply `frame_media_id` or `previs_video_media_id` to attach existing project media.
- Use `storyboard_workflow` with `shot_id` to add a linked workflow. Its prompt and media come from the storyboard. Pass `shot_id` to `previs_render` to save the scene and its rendered frame or video on that shot.
- For OpenRouter video, read `model_form` first. When available, `input_references` takes images and `input_video` takes an HTTPS video URL. Use these together for reference-guided video, or use `frame_first` and `frame_last` for frame-based generation. Combining those two modes is refused. A local previs MP4 stays local until you provide an HTTPS URL you control.
- Elements belong to the open project. Use `media_list` to find image IDs, `element_save` to assign them a name, and `elements_list` to see saved references. Use `@name` in storyboard or `generate` prompts. Open the target project to resolve references in MCP generation and price estimates. Use `element_delete` to remove a name.
  Each shot has `prompt` and can include `label`, duration `seconds`, absolute `start_seconds`, and generation
  IDs `image_job` and `video_job`. Supplying `shots` replaces the current list. This does not generate clips.
- `canvas_get` reads the open project's node graph and template IDs. `canvas_template` appends a template.
  `canvas_set` transfers a graph. Pass `add: true` to append it instead of replacing the canvas.
  On generation nodes, put field values in `data.settings` using keys from `model_form`. A media edge can target `media:<field_key>` to select a specific input. Values from connections take precedence over manual settings.
- For a generation explicitly requested at an existing timecode, pass `place_on_timeline: true` and its absolute
  `place_at_seconds` to `generate`. Use the open project's ID and quote the price before paid work.
- `previs_render` accepts an authored `scene` or a text `description` with `output: "scene" | "frame" | "video"`.
  JSON scene rendering is local. The description path calls a paid language model. PNG and MP4 results go into the library.
