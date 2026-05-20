# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev -- [audioDir] [outputDir] [language]` — run the CLI via ts-node without building.
- `npm run build` — compile TypeScript to `dist/`.
- `npm start -- [audioDir] [outputDir] [language]` — run the compiled CLI.
- `npm run server` — start the web UI on `http://localhost:3000` (override with `PORT=...`).
- `npm run start:server` — run the compiled web UI from `dist/`.

CLI positional args (all optional, defaults shown):
1. `audioDir` — `./audio`
2. `outputDir` — `./transcriptions`
3. `language` — omit or pass `auto` for AssemblyAI `language_detection`; pass an ISO code (e.g. `en`, `et`, `no`) to force `language_code` instead. The two params are mutually exclusive on AssemblyAI's side — [src/services/transcription.ts](src/services/transcription.ts) picks one or the other, never both.

There is no test suite or linter configured.

## Environment

Requires `ASSEMBLYAI_API_KEY` in a local `.env` file. The client module ([src/config/client.ts](src/config/client.ts)) is a module-level singleton: it reads the env var and instantiates `AssemblyAI` at import time, throwing if the key is missing. Any code path that imports `client` (directly or transitively) will fail fast without the key — keep that in mind when adding scripts or tests.

## Architecture

Single-purpose CLI that batch-transcribes audio (and video) files in a directory using AssemblyAI with speaker diarization, writing one `.txt` per input file. Video files are preprocessed locally with ffmpeg before upload.

Call chain:
- [src/index.ts](src/index.ts) parses argv and calls `transcribeDirectory`.
- [src/services/batchProcessor.ts](src/services/batchProcessor.ts) iterates media files in `dirPath`. For video files it first calls `extractAudio` to produce a mono MP3 in `<dirPath>/.extracted/`, then transcribes the extracted file; audio files go straight to `transcribeAudioFile`. Output filename is derived from the original (video or audio) basename. Failures are logged and skipped — the batch keeps going.
- [src/services/transcription.ts](src/services/transcription.ts) wraps `client.transcripts.transcribe` and normalizes the response into the local `TranscriptionResult` shape (full text + optional per-utterance speaker segments with ms timestamps).
- [src/services/audioExtraction.ts](src/services/audioExtraction.ts) spawns the `ffmpeg-static` binary to strip video and re-encode to mono MP3 (VBR `-q:a 4`). Cache is mtime-based: if `<cacheDir>/<name>.mp3` is newer than the source video, extraction is skipped.
- [src/utils/fileSystem.ts](src/utils/fileSystem.ts) defines two allow-lists: `SUPPORTED_AUDIO_FORMATS` (sent to AssemblyAI as-is) and `SUPPORTED_VIDEO_FORMATS` (extracted first). `getMediaFiles` returns both kinds; `isVideoFile` discriminates. Extend the appropriate list when adding formats rather than filtering elsewhere.
- [src/utils/formatting.ts](src/utils/formatting.ts) renders the output file. When speakers are present, the format is `[mm:ss] SPEAKER: text` per utterance followed by a `=== FULL TEXT ===` section; otherwise just the raw text.
- [src/types/index.ts](src/types/index.ts) — shared `TranscriptionOptions` / `TranscriptionResult` types.

Defaults set in `index.ts` enable diarization with `speakersExpected: 1`. Toggling diarization off requires passing `speakerLabels: false` (the service treats `!== false` as truthy).

## Web UI

[src/server.ts](src/server.ts) is a thin Express layer over the same services. `GET /` serves an inline HTML upload form; `POST /transcribe` accepts one multipart file, hands it to [src/services/processUpload.ts](src/services/processUpload.ts), and streams the formatted `.txt` back as an attachment. Uploads land in `./uploads/` (gitignored) and are deleted after the response; video uploads also produce a cached MP3 under `./uploads/.extracted/` (reuses `EXTRACTED_AUDIO_DIRNAME` from the CLI path). Same defaults as the CLI: auto language detection, `speakerLabels: true`, `speakersExpected: 1`. The HTTP request hangs until AssemblyAI returns — no job queue, so very long files may hit proxy/browser timeouts.

## Legacy code

[src/index-old.ts](src/index-old.ts) is a prior OpenAI Whisper implementation (uses `OPENAI_API_KEY`, `form-data`, `node-fetch`, chunked upload). It is not part of the active CLI path — `tsc` still compiles it because of `include: ["src/**/*"]`, but nothing imports it. Treat it as reference for the Whisper-based approach; the AssemblyAI path is the current one. The `openai`, `form-data`, and `node-fetch` dependencies in `package.json` exist solely for this file.
