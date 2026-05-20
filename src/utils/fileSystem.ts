import * as fs from 'fs';
import * as path from 'path';

export const SUPPORTED_AUDIO_FORMATS = [
  '.mp3',
  '.mpeg',
  '.mpga',
  '.m4a',
  '.wav',
  '.flac',
  '.ogg',
  '.opus',
];

export const SUPPORTED_VIDEO_FORMATS = [
  '.mp4',
  '.mov',
  '.mkv',
  '.avi',
  '.webm',
];

export function ensureDirectoryExists(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

export function isVideoFile(file: string): boolean {
  return SUPPORTED_VIDEO_FORMATS.includes(path.extname(file).toLowerCase());
}

export function getMediaFiles(dirPath: string): string[] {
  const files = fs.readdirSync(dirPath);
  const accepted = [...SUPPORTED_AUDIO_FORMATS, ...SUPPORTED_VIDEO_FORMATS];
  return files.filter((file) =>
    accepted.includes(path.extname(file).toLowerCase())
  );
}

export function saveTranscription(
  outputPath: string,
  content: string
): void {
  fs.writeFileSync(outputPath, content, 'utf-8');
}
