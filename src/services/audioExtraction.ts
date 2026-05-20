import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import ffmpegPath from 'ffmpeg-static';
import { ensureDirectoryExists } from '../utils/fileSystem';

export const EXTRACTED_AUDIO_DIRNAME = '.extracted';

export async function extractAudio(
  videoPath: string,
  cacheDir: string
): Promise<string> {
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static did not provide a binary for this platform');
  }

  ensureDirectoryExists(cacheDir);

  const baseName = path.parse(videoPath).name;
  const outputPath = path.join(cacheDir, `${baseName}.mp3`);

  if (isCacheFresh(videoPath, outputPath)) {
    console.log(`  ↻ Reusing cached audio: ${outputPath}`);
    return outputPath;
  }

  console.log(`  ⇣ Extracting audio from ${path.basename(videoPath)}`);
  await runFfmpeg(ffmpegPath, videoPath, outputPath);
  return outputPath;
}

function isCacheFresh(sourcePath: string, cachedPath: string): boolean {
  if (!fs.existsSync(cachedPath)) return false;
  const sourceMtime = fs.statSync(sourcePath).mtimeMs;
  const cachedMtime = fs.statSync(cachedPath).mtimeMs;
  return cachedMtime >= sourceMtime;
}

function runFfmpeg(
  binary: string,
  input: string,
  output: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = [
      '-y',
      '-i', input,
      '-vn',
      '-acodec', 'libmp3lame',
      '-q:a', '4',
      '-ac', '1',
      output,
    ];
    const proc = spawn(binary, args, { stdio: ['ignore', 'ignore', 'pipe'] });

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
  });
}
