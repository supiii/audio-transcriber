import { spawn } from 'child_process';
import ffmpegPath from 'ffmpeg-static';

export async function getMediaDurationMs(filePath: string): Promise<number> {
  if (!ffmpegPath) {
    throw new Error('ffmpeg-static did not provide a binary for this platform');
  }

  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath as string, ['-i', filePath], {
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    let stderr = '';
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);
    proc.on('close', () => {
      const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      if (!match) {
        reject(new Error('Could not parse media duration from ffmpeg output'));
        return;
      }
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      const seconds = parseFloat(match[3]);
      resolve(Math.round((hours * 3600 + minutes * 60 + seconds) * 1000));
    });
  });
}
