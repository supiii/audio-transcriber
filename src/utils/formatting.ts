import { TranscriptionResult } from '../types';

export function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

export function formatTranscription(result: TranscriptionResult): string {
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
