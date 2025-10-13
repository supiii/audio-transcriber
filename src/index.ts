import { AssemblyAI } from 'assemblyai';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';

config();

const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY || '',
});

interface TranscriptionOptions {
  language?: string;
  speakerLabels?: boolean;
  speakersExpected?: number;
}

interface TranscriptionResult {
  text: string;
  speakers?: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
  }>;
}

async function transcribeAudioFile(
  filePath: string,
  options: TranscriptionOptions = {}
): Promise<TranscriptionResult> {
  try {
    console.log(`Transcribing: ${filePath}`);
    
    const transcript = await client.transcripts.transcribe({
      audio: filePath,
      language_code: options.language || 'et',
      speaker_labels: options.speakerLabels !== false, // Default true
      speakers_expected: options.speakersExpected || 2,
    });

    if (transcript.status === 'error') {
      throw new Error(`Transcription failed: ${transcript.error}`);
    }

    const result: TranscriptionResult = {
      text: transcript.text || '',
    };

    // Add speaker information if available
    if (transcript.utterances && transcript.utterances.length > 0) {
      result.speakers = transcript.utterances.map(utterance => ({
        speaker: utterance.speaker,
        text: utterance.text,
        start: utterance.start,
        end: utterance.end,
      }));
    }

    return result;
  } catch (error) {
    console.error(`Error transcribing ${filePath}:`, error);
    throw error;
  }
}

function formatTranscription(result: TranscriptionResult): string {
  let output = '';

  if (result.speakers && result.speakers.length > 0) {
    // Format with speaker labels
    output += '=== TRANSCRIPTION WITH SPEAKERS ===\n\n';
    
    for (const utterance of result.speakers) {
      const timestamp = formatTimestamp(utterance.start);
      output += `[${timestamp}] ${utterance.speaker}: ${utterance.text}\n\n`;
    }
    
    output += '\n=== FULL TEXT ===\n\n';
    output += result.text;
  } else {
    // Format without speaker labels
    output = result.text;
  }

  return output;
}

function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

async function transcribeDirectory(
  dirPath: string,
  outputDir: string,
  options: TranscriptionOptions = {}
): Promise<void> {
  // Supported audio formats
  const supportedFormats = [
    '.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', 
    '.webm', '.flac', '.ogg', '.opus'
  ];
  
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const files = fs.readdirSync(dirPath);
  const audioFiles = files.filter(file => 
    supportedFormats.includes(path.extname(file).toLowerCase())
  );

  console.log(`Found ${audioFiles.length} audio files to transcribe`);

  for (const file of audioFiles) {
    const filePath = path.join(dirPath, file);
    const outputFileName = `${path.parse(file).name}.txt`;
    const outputPath = path.join(outputDir, outputFileName);

    try {
      const result = await transcribeAudioFile(filePath, options);
      const formattedOutput = formatTranscription(result);
      
      fs.writeFileSync(outputPath, formattedOutput, 'utf-8');
      console.log(`✓ Saved transcription to: ${outputPath}`);
      
      if (result.speakers) {
        console.log(`  Found ${new Set(result.speakers.map(s => s.speaker)).size} speakers`);
      }
    } catch (error) {
      console.error(`✗ Failed to transcribe ${file}`);
    }
  }
}

// Main execution
async function main() {
  const audioDir = process.argv[2] || './audio';
  const outputDir = process.argv[3] || './transcriptions';

  if (!process.env.ASSEMBLYAI_API_KEY) {
    console.error('Error: ASSEMBLYAI_API_KEY not found in environment variables');
    console.log('Please create a .env file with your AssemblyAI API key');
    process.exit(1);
  }

  console.log('Starting transcription process with speaker diarization...');
  console.log(`Audio directory: ${audioDir}`);
  console.log(`Output directory: ${outputDir}`);

  await transcribeDirectory(audioDir, outputDir, {
    language: 'et', // Estonian
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