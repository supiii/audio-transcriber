import { client } from '../config/client';
import { TranscriptionOptions, TranscriptionResult } from '../types';

export async function transcribeAudioFile(
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
      result.speakers = transcript.utterances.map((utterance) => ({
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
