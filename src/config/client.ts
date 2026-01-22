import { AssemblyAI } from 'assemblyai';
import { config } from 'dotenv';

config();

export function getApiKey(): string {
  const apiKey = process.env.ASSEMBLYAI_API_KEY;

  if (!apiKey) {
    throw new Error('ASSEMBLYAI_API_KEY not found in environment variables');
  }

  return apiKey;
}

export function createClient(): AssemblyAI {
  return new AssemblyAI({
    apiKey: getApiKey(),
  });
}

export const client = createClient();
