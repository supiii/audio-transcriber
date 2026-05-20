import * as path from 'path';
import { TranscriptionOptions } from '../types';
import {
  ensureDirectoryExists,
  getMediaFiles,
  isVideoFile,
  saveTranscription,
} from '../utils/fileSystem';
import { formatTranscription } from '../utils/formatting';
import { transcribeAudioFile } from './transcription';
import { EXTRACTED_AUDIO_DIRNAME, extractAudio } from './audioExtraction';

export async function transcribeDirectory(
  dirPath: string,
  outputDir: string,
  options: TranscriptionOptions = {}
): Promise<void> {
  ensureDirectoryExists(outputDir);

  const mediaFiles = getMediaFiles(dirPath);
  const cacheDir = path.join(dirPath, EXTRACTED_AUDIO_DIRNAME);

  console.log(`Found ${mediaFiles.length} media files to transcribe`);

  for (const file of mediaFiles) {
    const filePath = path.join(dirPath, file);
    const outputFileName = `${path.parse(file).name}.txt`;
    const outputPath = path.join(outputDir, outputFileName);

    try {
      const audioPath = isVideoFile(file)
        ? await extractAudio(filePath, cacheDir)
        : filePath;

      const result = await transcribeAudioFile(audioPath, options);
      const formattedOutput = formatTranscription(result);

      saveTranscription(outputPath, formattedOutput);
      console.log(`✓ Saved transcription to: ${outputPath}`);

      if (result.speakers) {
        console.log(
          `  Found ${new Set(result.speakers.map((s) => s.speaker)).size} speakers`
        );
      }
    } catch (error) {
      console.error(`✗ Failed to transcribe ${file}`);
    }
  }
}
