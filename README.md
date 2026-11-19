<div align="center">

<img src="frontend/public/aicut-icon.svg" width="88" alt="AI-Cut logo"/>

# AI-Cut

**A desktop AI video studio: generate images, video, music, voices, sound effects and text with the best models of OpenRouter, fal and Runware, and cut them on a real multitrack timeline into a finished video. One native app (Rust + Tauri), your own keys, your files on your disk, and an MCP server so an AI agent can make the video with you.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**English** · [Русский](README.ru.md)

</div>

## What it is

**AI-Cut 2** puts AI generation and video editing into one window. On the left you pick what to make —
an image, an edit of an image, a video from text or from a frame, a lip-synced talking head, an upscale, a
removed background, music, a voice-over, sound effects, a transcript or a script — and a model of **OpenRouter,
fal or Runware**. The form is drawn from the model's own description, so every setting the model takes is
there, and the price is shown **before** you press Generate. The result lands in the project's media library
and, if you like, straight onto the timeline at the playhead.

The editor is a full NLE: multiple video and audio tracks, ripple/rolling/slip/slide trims, transitions,
keyframes with a Bezier graph, masks, blend modes, color grading with scopes, text and shapes, captions, and a
fast export to MP4, WebM, MOV or MKV that runs on your graphics card.

AI-Cut runs as a desktop app with a local Rust server. Projects and generated media are stored on disk, and generation jobs survive a restart. You use your own provider keys.

## Generate everything

| Task | What you get | Providers |
|---|---|---|
| Image | text to image | OpenRouter, fal, Runware |
| Edit image | image with references or a mask | OpenRouter, fal, Runware |
| Video | text to video, first frame, first and last frame, references | OpenRouter, fal, Runware |
| Edit video | video to video, extend, restyle | OpenRouter, fal, Runware |
| Lip sync | a face that speaks your audio | fal, Runware |
| Upscale | images and videos in higher resolution | fal, Runware, OpenRouter (video) |
| Remove background | transparent cut-outs | fal, Runware |
| Music | songs and scores | fal, Runware |
| Voice | text to speech in dozens of voices and languages | OpenRouter, fal, Runware |
| Sound effects | foley from text or from a video | fal, Runware |
| Transcribe | speech to text | OpenRouter, fal |
| Text | scripts, prompts, ideas — any LLM of OpenRouter | OpenRouter |

- **Live catalogues.** Models are read from the providers themselves — over a thousand, newest first, with each
  provider's price line; retiring models are marked. Nothing is hard-coded.
- **Price before you run.** Rates by second, resolution, sound and input images are worked out from the form; after
  the run the provider's own bill is recorded. Settings, Providers shows what you spent today and in total.
- **Files as inputs.** Drag a picture, a clip or a sound from the library — or a result of an earlier generation —
  into a slot: first frame, last frame, references, the video to lip-sync.
- **Never paid twice.** A job is saved before it is sent; after a restart a job that was sent is followed, not sent
  again. Results are downloaded at once, before the providers' links expire.
- **History.** Every run with its model, settings, price and files: run it again, load it back into the form, put it
  on the timeline.

## For AI agents

While AI-Cut is open it serves MCP at `http://127.0.0.1:8796/mcp`. An agent such as Claude Code, Claude Desktop,
Cursor or Codex can do what the window does: pick models and read their settings, estimate prices, generate, wait for
the results, read and edit the open project's timeline (each edit is an undoable step you see happen), import media,
move the playhead, take a picture of the window and export the video. Every action is shown in the window.

```bash
claude mcp add --transport http AI-Cut http://127.0.0.1:8796/mcp
```

Other clients: `{ "mcpServers": { "AI-Cut": { "type": "streamable-http", "url": "http://127.0.0.1:8796/mcp" } } }`.
The server serves its guide as the resource `AI-Cut://skill` (prompt `AI-Cut`) — the same text as
[docs/mcp-skill.md](docs/mcp-skill.md). Generations are paid: Settings, Providers and agent sets **a daily limit for
agents**, past which `generate` is refused. Only agents on this computer and the program's own window may connect;
provider keys are never shown to them.

## Quick start

1. Download `AI-Cut_2.1.0_x64-setup.exe` (or the portable zip) from the
   [latest release](https://github.com/akonstster/AI-Cut/releases/tag/v2.1.0) and run it.
2. Create a project, open the **Generate** tab on the left and paste a key of
   [OpenRouter](https://openrouter.ai/settings/keys), [fal](https://fal.ai/dashboard/keys) or
   [Runware](https://my.runware.ai/keys) when asked. One provider is enough to start.
3. Pick a task and a model, write what you want, press **Generate**.

## Requirements

- Windows 10/11 x64 with Microsoft Edge WebView2 (the installer gets it when missing).
- A graphics card with WebGPU (any recent NVIDIA, AMD or Intel) for the preview and the fast export.
- An internet connection for generation; editing and export work offline.

## Where your files are

Everything lives beside the program (or in `%LOCALAPPDATA%\AI-Cut` when that folder is read-only):
`data\workspace` — projects, media, thumbnails and exports; `data\generations` — the files of every generation;
`secrets` — provider keys; `data\AI-Cut.db` — the generation history. Uninstalling keeps them unless you tick
*Delete the application data*.

## No telemetry

AI-Cut has no telemetry and no news feed: nothing is counted, stored or sent, and there is no install id. The
Studio Hub client of the upstream project, its switches on the first-run screen and in Settings, and its auto-updater
were removed in this fork (see [NOTICE.md](NOTICE.md)).

## Port and MCP

The editor and MCP server share a local port. The default is 8796. To change it, open **Settings → Providers and agent → Server port**. Use the MCP address shown there after restarting AI-Cut. For scripted launches, `AICUT_PORT` overrides the port and `AICUT_ROOT` selects a data directory.

## Build from source

Requirements: Windows 10/11, Node.js 22+ (npm 11), Rust stable with the MSVC target, and the Visual Studio Build
Tools with the **Desktop development with C++** workload. WebView2 ships with Windows 11.

```powershell
cd frontend; npm ci; npm run build       # the editor window into frontend\dist
cd ..\desktop; npm ci; npm run dev       # a development window
npm run build                            # desktop\src-tauri\target\release\AICut.exe
```

`scripts/build-release.ps1` builds the NSIS and MSI installers and a portable zip into `release\<version>`.

## How it is built

- `crates/vs-providers` — OpenRouter, fal and Runware brought to one contract: catalogue, form from the model's
  JSON Schema, a price rule, jobs that end in files. Runware tasks are checked against the model's schema before they
  are sent, so a wrong setting costs nothing.
- `crates/vs-server` — axum on 127.0.0.1: the editor's workspace on disk, the job queue in SQLite, keys, spend, the
  MCP server and its bridge to the window.
- `frontend` — the editor window: a fork of [FreeCut](https://github.com/walterlow/freecut) (MIT) kept as a git
  subtree, with its storage moved to the server and the generation panel, settings and agent bridge added.
- `desktop` — the Tauri shell: one process, the server inside it.

## Maintainer

Andrey Konstantinov.

## Credits

- **Ilya Timonin** and the contributors to [VideoSOS](https://github.com/timoncool/videosos).

- **[FreeCut](https://github.com/walterlow/freecut)** by Walter Low — the editor this window is built on (MIT).
- **[OpenRouter](https://openrouter.ai)**, **[fal](https://fal.ai)** and **[Runware](https://runware.ai)** — the
  providers, and the model makers behind them.
- **[mediabunny](https://github.com/Vanilagy/mediabunny)**, **[Tauri](https://tauri.app)**, **[axum](https://github.com/tokio-rs/axum)**,
  **[jsonschema](https://github.com/Stranger6667/jsonschema)**, **[lucide](https://lucide.dev)**.

## License

The code is [MIT](LICENSE); the editor window is based on FreeCut (MIT). The upstream copyright notices are kept in
[NOTICE.md](NOTICE.md). What you generate is governed by the terms of the provider and the model you used — read them
before you publish or sell.

## Feedback

Use [GitHub Issues](https://github.com/akonstster/AI-Cut/issues/new/choose) to report a bug, suggest a feature, or ask a question.
