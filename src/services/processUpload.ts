import * as path from 'path';
import { TranscriptionOptions } from '../types';
import { isVideoFile } from '../utils/fileSystem';
import { formatTranscription } from '../utils/formatting';
import { getMediaDurationMs } from '../utils/mediaDuration';
import { transcribeAudioFile } from './transcription';
import { extractAudio } from './audioExtraction';

export interface ProcessedTranscription {
  filename: string;
  content: string;
}

export type ProgressEvent =
  | { type: 'probed'; durationMs: number }
  | { type: 'extracting' }
  | { type: 'extracted' }
  | { type: 'uploading' }
  | { type: 'submitted' }
  | { type: 'queued' }
  | { type: 'processing' };

export async function processUpload(
  uploadedPath: string,
  originalName: string,
  cacheDir: string,
  options: TranscriptionOptions = {},
  onProgress?: (event: ProgressEvent) => void
): Promise<ProcessedTranscription> {
  // Probe the original upload so we can estimate total time as early as possible.
  try {
    const durationMs = await getMediaDurationMs(uploadedPath);
    onProgress?.({ type: 'probed', durationMs });
  } catch {
    // Duration probe is best-effort; UI will fall back to indeterminate progress.
  }

  let audioPath = uploadedPath;
  if (isVideoFile(originalName)) {
    onProgress?.({ type: 'extracting' });
    audioPath = await extractAudio(uploadedPath, cacheDir);
    onProgress?.({ type: 'extracted' });
  }

  const result = await transcribeAudioFile(audioPath, options, (phase) => {
    onProgress?.({ type: phase });
  });

  const content = formatTranscription(result);
  const filename = `${path.parse(originalName).name}.txt`;

  return { filename, content };
}
