import express, { Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { processUpload, ProgressEvent } from './services/processUpload';
import { EXTRACTED_AUDIO_DIRNAME } from './services/audioExtraction';
import {
  SUPPORTED_AUDIO_FORMATS,
  SUPPORTED_VIDEO_FORMATS,
  ensureDirectoryExists,
} from './utils/fileSystem';

const PORT = Number(process.env.PORT) || 3000;
const UPLOAD_DIR = path.resolve('./uploads');
const CACHE_DIR = path.join(UPLOAD_DIR, EXTRACTED_AUDIO_DIRNAME);
const ACCEPTED_EXTS = [...SUPPORTED_AUDIO_FORMATS, ...SUPPORTED_VIDEO_FORMATS];
const ACCEPTED_LANGUAGES = ['en', 'et', 'fi'] as const;
const MAX_SPEAKERS = 10;

ensureDirectoryExists(UPLOAD_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const random = Math.random().toString(36).slice(2, 10);
    cb(null, `${Date.now()}-${random}${ext}`);
  },
});

const upload = multer({ storage });

const INDEX_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Audio Transcriber</title>
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: system-ui, -apple-system, sans-serif; max-width: 560px; margin: 4rem auto; padding: 0 1rem; color: #222; }
  h1 { font-size: 1.5rem; margin-bottom: 0.25rem; }
  p.lede { color: #666; margin-top: 0; }
  form { margin-top: 2rem; padding: 1.5rem; border: 1px solid #ddd; border-radius: 8px; }
  input[type=file] { display: block; margin-bottom: 1rem; width: 100%; }
  label { display: block; font-size: 0.9rem; color: #444; margin-bottom: 0.35rem; }
  select { display: block; margin-bottom: 1rem; padding: 0.4rem 0.5rem; font-size: 0.95rem; border: 1px solid #ccc; border-radius: 4px; background: #fff; }
  button { padding: 0.6rem 1.2rem; font-size: 1rem; border: 0; border-radius: 6px; background: #111; color: #fff; cursor: pointer; }
  button:disabled { background: #999; cursor: not-allowed; }
  #status { margin-top: 1rem; font-size: 0.95rem; color: #555; min-height: 1.5em; }
  #status.error { color: #c00; }
  .note { margin-top: 1rem; font-size: 0.85rem; color: #888; }
  .progress { margin-top: 1rem; height: 8px; background: #eee; border-radius: 999px; overflow: hidden; display: none; }
  .progress.visible { display: block; }
  .progress-bar { height: 100%; width: 0%; background: #111; transition: width 0.4s ease; }
  .progress.indeterminate .progress-bar { width: 40%; animation: slide 1.4s ease-in-out infinite; }
  @keyframes slide { 0% { margin-left: -40%; } 100% { margin-left: 100%; } }
  #eta { margin-top: 0.4rem; font-size: 0.8rem; color: #888; min-height: 1em; }
</style>
</head>
<body>
  <h1>Audio Transcriber</h1>
  <p class="lede">Upload an audio or video file, download the transcription.</p>

  <form id="form">
    <input type="file" name="file" id="file" accept="${ACCEPTED_EXTS.join(',')}" required />
    <label for="language">Language</label>
    <select name="language" id="language">
      <option value="auto" selected>Auto-detect</option>
      <option value="en">English</option>
      <option value="et">Estonian</option>
      <option value="fi">Finnish</option>
    </select>
    <label for="speakers">Number of speakers</label>
    <select name="speakers" id="speakers">
      ${Array.from({ length: MAX_SPEAKERS }, (_, i) => {
        const n = i + 1;
        return `<option value="${n}"${n === 1 ? ' selected' : ''}>${n}</option>`;
      }).join('')}
    </select>
    <button type="submit" id="submit">Transcribe</button>
    <div id="status"></div>
    <div id="progress" class="progress"><div id="bar" class="progress-bar"></div></div>
    <div id="eta"></div>
    <p class="note">Progress is estimated — AssemblyAI doesn't report a true percentage. Don't close this tab.</p>
  </form>

<script>
  const form = document.getElementById('form');
  const fileInput = document.getElementById('file');
  const languageSelect = document.getElementById('language');
  const speakersSelect = document.getElementById('speakers');
  const submit = document.getElementById('submit');
  const status = document.getElementById('status');
  const progress = document.getElementById('progress');
  const bar = document.getElementById('bar');
  const eta = document.getElementById('eta');

  // AssemblyAI's "best" tier processes audio at roughly 1–2% of real-time
  // (≈1 minute for a 100-minute file). Cap visible progress at 95% until
  // 'done' arrives, and floor the estimate so short files don't show 2s.
  const SPEED_FACTOR = 0.015;
  const MIN_ESTIMATE_MS = 15000;
  const MAX_BEFORE_DONE = 95;

  let tickHandle = null;
  let estimatedTotalMs = null;
  let phaseStartedAt = null;
  let phaseStartPct = 0;
  let currentPct = 0;

  function setBar(pct) {
    currentPct = Math.max(0, Math.min(100, pct));
    bar.style.width = currentPct + '%';
  }

  function showProgress(indeterminate) {
    progress.classList.add('visible');
    progress.classList.toggle('indeterminate', !!indeterminate);
    if (indeterminate) bar.style.width = '';
  }

  function hideProgress() {
    progress.classList.remove('visible');
    progress.classList.remove('indeterminate');
  }

  function stopTick() {
    if (tickHandle != null) { clearInterval(tickHandle); tickHandle = null; }
  }

  function startProcessingTick() {
    stopTick();
    if (estimatedTotalMs == null) { showProgress(true); return; }
    progress.classList.remove('indeterminate');
    phaseStartedAt = Date.now();
    phaseStartPct = currentPct;
    tickHandle = setInterval(() => {
      const elapsed = Date.now() - phaseStartedAt;
      const fraction = Math.min(1, elapsed / estimatedTotalMs);
      const target = phaseStartPct + (MAX_BEFORE_DONE - phaseStartPct) * fraction;
      setBar(target);
      const remainingMs = Math.max(0, estimatedTotalMs - elapsed);
      eta.textContent = 'Estimated time remaining: ' + formatDuration(remainingMs);
    }, 500);
  }

  function formatDuration(ms) {
    const s = Math.ceil(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m + 'm ' + r.toString().padStart(2, '0') + 's';
  }

  function reset() {
    stopTick();
    estimatedTotalMs = null;
    phaseStartedAt = null;
    phaseStartPct = 0;
    currentPct = 0;
    hideProgress();
    eta.textContent = '';
  }

  function handleEvent(event) {
    switch (event.type) {
      case 'probed':
        estimatedTotalMs = Math.max(MIN_ESTIMATE_MS, Math.round(event.durationMs * SPEED_FACTOR));
        eta.textContent = 'Estimated time: ' + formatDuration(estimatedTotalMs);
        break;
      case 'extracting':
        status.textContent = 'Extracting audio from video…';
        showProgress(true);
        break;
      case 'extracted':
        status.textContent = 'Audio extracted.';
        setBar(5);
        progress.classList.remove('indeterminate');
        break;
      case 'uploading':
        status.textContent = 'Uploading to AssemblyAI…';
        showProgress(estimatedTotalMs == null);
        if (estimatedTotalMs != null) setBar(Math.max(currentPct, 8));
        break;
      case 'submitted':
        status.textContent = 'Submitted. Waiting in queue…';
        if (estimatedTotalMs != null) setBar(Math.max(currentPct, 12));
        break;
      case 'queued':
        status.textContent = 'Queued at AssemblyAI…';
        startProcessingTick();
        break;
      case 'processing':
        status.textContent = 'Transcribing…';
        startProcessingTick();
        break;
    }
  }

  async function readSSE(response, onEvent) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let idx;
      while ((idx = buffer.indexOf('\\n\\n')) !== -1) {
        const raw = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        const dataLine = raw.split('\\n').find((l) => l.startsWith('data: '));
        if (!dataLine) continue;
        try { onEvent(JSON.parse(dataLine.slice(6))); } catch (e) {}
      }
    }
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!fileInput.files || !fileInput.files[0]) return;

    submit.disabled = true;
    status.className = '';
    status.textContent = 'Uploading file…';
    reset();
    showProgress(true);

    let finalEvent = null;
    let errorEvent = null;

    try {
      const data = new FormData();
      data.append('file', fileInput.files[0]);
      data.append('language', languageSelect.value);
      data.append('speakers', speakersSelect.value);
      const res = await fetch('/transcribe', { method: 'POST', body: data });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || ('Server error: ' + res.status));
      }

      await readSSE(res, (event) => {
        if (event.type === 'done') finalEvent = event;
        else if (event.type === 'error') errorEvent = event;
        else handleEvent(event);
      });

      if (errorEvent) throw new Error(errorEvent.message);
      if (!finalEvent) throw new Error('Stream ended without a result.');

      stopTick();
      setBar(100);
      eta.textContent = '';

      const blob = new Blob([finalEvent.content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = finalEvent.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      status.textContent = 'Done. Downloaded ' + finalEvent.filename;
    } catch (err) {
      status.className = 'error';
      status.textContent = err.message || String(err);
      hideProgress();
      stopTick();
      eta.textContent = '';
    } finally {
      submit.disabled = false;
    }
  });
</script>
</body>
</html>`;

const app = express();

app.get('/', (_req: Request, res: Response) => {
  res.type('html').send(INDEX_HTML);
});

app.post(
  '/transcribe',
  upload.single('file'),
  async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).type('text/plain').send('No file uploaded.');
      return;
    }

    const uploadedPath = req.file.path;
    const originalName = req.file.originalname;
    const ext = path.extname(originalName).toLowerCase();

    if (!ACCEPTED_EXTS.includes(ext)) {
      cleanup(uploadedPath);
      res
        .status(400)
        .type('text/plain')
        .send(`Unsupported file type: ${ext || '(none)'}. Accepted: ${ACCEPTED_EXTS.join(', ')}`);
      return;
    }

    const language = parseLanguage(req.body?.language);
    if (language === INVALID) {
      cleanup(uploadedPath);
      res
        .status(400)
        .type('text/plain')
        .send(`Unsupported language. Accepted: auto, ${ACCEPTED_LANGUAGES.join(', ')}`);
      return;
    }

    const speakersExpected = parseSpeakers(req.body?.speakers);
    if (speakersExpected === INVALID) {
      cleanup(uploadedPath);
      res
        .status(400)
        .type('text/plain')
        .send(`Unsupported speaker count. Accepted: 1-${MAX_SPEAKERS}`);
      return;
    }

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    const send = (event: object): void => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    try {
      const { filename, content } = await processUpload(
        uploadedPath,
        originalName,
        CACHE_DIR,
        { language, speakerLabels: true, speakersExpected },
        (event: ProgressEvent) => send(event)
      );

      send({ type: 'done', filename: sanitizeFilename(filename), content });
    } catch (err) {
      console.error('Transcription failed:', err);
      send({ type: 'error', message: 'Transcription failed. Check server logs.' });
    } finally {
      cleanup(uploadedPath);
      res.end();
    }
  }
);

app.listen(PORT, () => {
  console.log(`Listening on http://localhost:${PORT}`);
});

function cleanup(filePath: string): void {
  fs.promises.unlink(filePath).catch(() => {});
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

const INVALID = Symbol('invalid-language');

function parseLanguage(value: unknown): string | undefined | typeof INVALID {
  if (typeof value !== 'string' || value === '' || value === 'auto') {
    return undefined;
  }
  return (ACCEPTED_LANGUAGES as readonly string[]).includes(value) ? value : INVALID;
}

function parseSpeakers(value: unknown): number | typeof INVALID {
  if (value === undefined || value === '') return 1;
  const n = typeof value === 'string' ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= MAX_SPEAKERS ? n : INVALID;
}
