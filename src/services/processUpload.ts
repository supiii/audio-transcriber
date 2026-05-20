import * as path from 'path';
import { TranscriptionOptions } from '../types';
import { isVideoFile } from '../utils/fileSystem';
import { formatTranscription } from '../utils/formatting';
import { transcribeAudioFile } from './transcription';
import { extractAudio } from './audioExtraction';

export interface ProcessedTranscription {
  filename: string;
  content: string;
}

export async function processUpload(
  uploadedPath: string,
  originalName: string,
  cacheDir: string,
  options: TranscriptionOptions = {}
): Promise<ProcessedTranscription> {
  const audioPath = isVideoFile(originalName)
    ? await extractAudio(uploadedPath, cacheDir)
    : uploadedPath;

  const result = await transcribeAudioFile(audioPath, options);
  const content = formatTranscription(result);
  const filename = `${path.parse(originalName).name}.txt`;

  return { filename, content };
}
