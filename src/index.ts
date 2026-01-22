import { transcribeDirectory } from './services/batchProcessor';
import { transcribeAudioFile } from './services/transcription';

// Main execution
async function main() {
  const audioDir = process.argv[2] || './audio';
  const outputDir = process.argv[3] || './transcriptions';
  const language = process.argv[4] || 'et'; // Default to Estonian

  console.log('Starting transcription process with speaker diarization...');
  console.log(`Audio directory: ${audioDir}`);
  console.log(`Output directory: ${outputDir}`);
  console.log(`Language: ${language}`);

  await transcribeDirectory(audioDir, outputDir, {
    language,
    speakerLabels: true,
    speakersExpected: 2,
  });

  console.log('Transcription complete!');
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { transcribeAudioFile, transcribeDirectory };