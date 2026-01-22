import * as path from 'path';
import { TranscriptionOptions } from '../types';
import {
  ensureDirectoryExists,
  getAudioFiles,
  saveTranscription,
} from '../utils/fileSystem';
import { formatTranscription } from '../utils/formatting';
import { transcribeAudioFile } from './transcription';

export async function transcribeDirectory(
  dirPath: string,
  outputDir: string,
  options: TranscriptionOptions = {}
): Promise<void> {
  ensureDirectoryExists(outputDir);

  const audioFiles = getAudioFiles(dirPath);

  console.log(`Found ${audioFiles.length} audio files to transcribe`);

  for (const file of audioFiles) {
    const filePath = path.join(dirPath, file);
    const outputFileName = `${path.parse(file).name}.txt`;
    const outputPath = path.join(outputDir, outputFileName);

    try {
      const result = await transcribeAudioFile(filePath, options);
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
