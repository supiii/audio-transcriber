import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { config } from 'dotenv';
import FormData from 'form-data';
import fetch from 'node-fetch';

config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    timeout: 60000, // 60 seconds timeout
    maxRetries: 3, // Retry failed requests
  });

interface TranscriptionOptions {
  language?: string;
  model?: 'whisper-1';
  responseFormat?: 'json' | 'text' | 'srt' | 'vtt' | 'verbose_json';
  temperature?: number;
}

async function getFileSizeMB(filePath: string): Promise<number> {
    const stats = fs.statSync(filePath);
    return stats.size / (1024 * 1024);
  }

  async function transcribeAudioFile(
    filePath: string,
    options: TranscriptionOptions = {}
  ): Promise<string> {
    try {
      console.log(`Transcribing: ${filePath}`);
      
      const form = new FormData();
      form.append('file', fs.createReadStream(filePath), path.basename(filePath));
      form.append('model', options.model || 'whisper-1');
      form.append('language', options.language || 'et');
      form.append('response_format', options.responseFormat || 'text');
      form.append('temperature', String(options.temperature || 0));
      
      // Manual API call with better error handling
      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          ...form.getHeaders()
        },
        body: form,
        timeout: 60000, // 60 seconds
      });
  
      if (!response.ok) {
        const error = await response.text();
        throw new Error(`API error: ${response.status} - ${error}`);
      }
  
      const result = await response.text();
      return result;
    } catch (error) {
      console.error(`Error transcribing ${filePath}:`, error);
      throw error;
    }
  }

/*async function transcribeAudioFile(
    filePath: string,
    options: TranscriptionOptions = {}
  ): Promise<string> {
    try {
      // Check file size
      const fileSizeMB = await getFileSizeMB(filePath);
      console.log(`File size: ${fileSizeMB.toFixed(2)} MB`);
      
      if (fileSizeMB > 25) {
        throw new Error(`File size (${fileSizeMB.toFixed(2)} MB) exceeds OpenAI's 25MB limit`);
      }
  
      console.log(`Transcribing: ${filePath}`);
      
      // Read file as buffer instead of stream
      const audioBuffer = fs.readFileSync(filePath);
      const audioFile = new File([audioBuffer], path.basename(filePath));
      
      const transcription = await openai.audio.transcriptions.create({
        file: audioFile,
        model: options.model || 'whisper-1',
        language: options.language || 'et',
        response_format: options.responseFormat || 'text',
        temperature: options.temperature || 0,
      });
  
      return typeof transcription === 'string' ? transcription : transcription.text;
    } catch (error) {
      console.error(`Error transcribing ${filePath}:`, error);
      throw error;
    }
  }*/

async function transcribeDirectory(
  dirPath: string,
  outputDir: string,
  options: TranscriptionOptions = {}
): Promise<void> {
  // Supported audio formats
  const supportedFormats = ['.mp3', '.mp4', '.mpeg', '.mpga', '.m4a', '.wav', '.webm'];
  
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
      const transcription = await transcribeAudioFile(filePath, options);
      
      fs.writeFileSync(outputPath, transcription, 'utf-8');
      console.log(`✓ Saved transcription to: ${outputPath}`);
    } catch (error) {
      console.error(`✗ Failed to transcribe ${file}`);
    }
  }
}

// Main execution
async function main() {
  const audioDir = process.argv[2] || './audio';
  const outputDir = process.argv[3] || './transcriptions';

  if (!process.env.OPENAI_API_KEY) {
    console.error('Error: OPENAI_API_KEY not found in environment variables');
    console.log('Please create a .env file with your OpenAI API key');
    process.exit(1);
  }

  console.log('Starting transcription process...');
  console.log(`Audio directory: ${audioDir}`);
  console.log(`Output directory: ${outputDir}`);

  await transcribeDirectory(audioDir, outputDir, {
    language: 'et', // Estonian
    responseFormat: 'text',
  });

  console.log('Transcription complete!');
}

// Run if executed directly
if (require.main === module) {
  main().catch(console.error);
}

export { transcribeAudioFile, transcribeDirectory };