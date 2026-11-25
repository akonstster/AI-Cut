# Project Brief — AI-Cut

## What this is

AI-Cut is a **desktop AI video studio for Windows**: one native window where the user generates images, video,
music, speech, sound effects, transcripts and text through their **own** OpenRouter / fal / Runware keys, and cuts
everything on a real multitrack timeline into a finished video.

- Product name: **AI-Cut** (internal package name still `freecut` in `frontend/package.json`).
- Version: **2.2.0**.
- License: MIT. Author: Andrey Konstantinov.
- Repository: `https://github.com/akonstster/AI-Cut`, site: `https://akonstster.github.io/AI-Cut/`
  (served from the `docs/` folder on `main`).
- While it runs it serves **MCP** at `http://127.0.0.1:8796/mcp` so an agent can generate, edit the timeline and
  export together with the user.

## Scope

In scope:
- A native shell (Tauri v2) with an embedded local Rust server (axum) that serves the SPA, the API, the exports
  and MCP on one origin.
- A full NLE editor (based on FreeCut): tracks, trims, transitions, keyframes, masks, color grading with scopes,
  text/shapes, captions and a GPU-assisted export to MP4/WebM/MOV/MKV.
- A generation pipeline: live model catalogues, forms drawn from each model's schema, price before the run,
  jobs that survive a restart, results downloaded and imported into the project.
- A project workspace on disk, portable mode, Russian + English UI (plus 8 partial editor locales).

Out of scope / explicitly removed in the fork:
- Telemetry and its identifiers, upstream auto-updater, upstream donations, GitHub star charts, the v1 Next.js app
  (kept only on the old `legacy-v1` branch upstream, not on this repo).

## Hard constraints

- **User's own keys**; AI-Cut never proxies provider accounts.
- **Files on the user's disk**: workspace, generations, jobs, database live beside the program.
- **Never pay twice**: a job is persisted before it is sent and followed after a restart, never re-sent.
- No secrets in the repository (an inherited PAT was found in old history — see `progress.md`).
