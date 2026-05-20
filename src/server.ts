import express, { Request, Response } from 'express';
import multer from 'multer';
import * as fs from 'fs';
import * as path from 'path';
import { processUpload } from './services/processUpload';
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
    <button type="submit" id="submit">Transcribe</button>
    <div id="status"></div>
    <p class="note">Transcription may take a few minutes for long files. Don't close this tab.</p>
  </form>

<script>
  const form = document.getElementById('form');
  const fileInput = document.getElementById('file');
  const languageSelect = document.getElementById('language');
  const submit = document.getElementById('submit');
  const status = document.getElementById('status');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!fileInput.files || !fileInput.files[0]) return;

    submit.disabled = true;
    status.className = '';
    status.textContent = 'Uploading and transcribing…';

    try {
      const data = new FormData();
      data.append('file', fileInput.files[0]);
      data.append('language', languageSelect.value);
      const res = await fetch('/transcribe', { method: 'POST', body: data });
      if (!res.ok) {
        const msg = await res.text();
        throw new Error(msg || ('Server error: ' + res.status));
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : 'transcription.txt';

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);

      status.textContent = 'Done. Downloaded ' + filename;
    } catch (err) {
      status.className = 'error';
      status.textContent = err.message || String(err);
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

    try {
      const { filename, content } = await processUpload(
        uploadedPath,
        originalName,
        CACHE_DIR,
        { language, speakerLabels: true, speakersExpected: 1 }
      );

      res
        .status(200)
        .type('text/plain; charset=utf-8')
        .setHeader(
          'Content-Disposition',
          `attachment; filename="${sanitizeFilename(filename)}"`
        );
      res.send(content);
    } catch (err) {
      console.error('Transcription failed:', err);
      res.status(500).type('text/plain').send('Transcription failed. Check server logs.');
    } finally {
      cleanup(uploadedPath);
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
