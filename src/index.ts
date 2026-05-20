import { transcribeDirectory } from './services/batchProcessor';
import { transcribeAudioFile } from './services/transcription';

// Main execution
async function main() {
  const audioDir = process.argv[2] || './audio';
  const outputDir = process.argv[3] || './transcriptions';
  const languageArg = process.argv[4];
  const autoDetect = !languageArg || languageArg.toLowerCase() === 'auto';
  const language = autoDetect ? undefined : languageArg;

  console.log('Starting transcription process with speaker diarization...');
  console.log(`Audio directory: ${audioDir}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Language: ${autoDetect ? 'auto-detect' : language}`);

  await transcribeDirectory(audioDir, outputDir, {
    language,
    speakerLabels: true,
    speakersExpected: 1,
  });

  console.log('Transcription complete!');
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { transcribeAudioFile, transcribeDirectory };