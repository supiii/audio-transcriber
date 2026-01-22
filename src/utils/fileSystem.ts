import * as fs from 'fs';
import * as path from 'path';

export const SUPPORTED_AUDIO_FORMATS = [
  '.mp3',
  '.mp4',
  '.mpeg',
  '.mpga',
  '.m4a',
  '.wav',
  '.webm',
  '.flac',
  '.ogg',
  '.opus',
];

export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function getAudioFiles(dirPath: string): string[] {
  const files = fs.readdirSync(dirPath);
  return files.filter((file) =>
    SUPPORTED_AUDIO_FORMATS.includes(path.extname(file).toLowerCase())
  );
}

export function saveTranscription(
  outputPath: string,
  content: string
): void {
  fs.writeFileSync(outputPath, content, 'utf-8');
}
