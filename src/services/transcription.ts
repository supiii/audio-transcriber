import { client } from '../config/client';
import { TranscriptionOptions, TranscriptionResult } from '../types';

export type TranscriptionPhase = 'uploading' | 'submitted' | 'queued' | 'processing';

export async function transcribeAudioFile(
  filePath: string,
  options: TranscriptionOptions = {},
  onPhase?: (phase: TranscriptionPhase) => void
): Promise<TranscriptionResult> {
  try {
    console.log(`Transcribing: ${filePath}`);

    onPhase?.('uploading');
    const uploadUrl = await client.files.upload(filePath);

    const submitted = await client.transcripts.submit({
      audio: uploadUrl,
      ...(options.language
        ? { language_code: options.language as never }
        : { language_detection: true }),
      speaker_labels: options.speakerLabels !== false, // Default true
      speakers_expected: options.speakersExpected || 2,
    });
    onPhase?.('submitted');

    const POLL_INTERVAL_MS = 3000;
    let transcript = submitted;
    let lastReported: TranscriptionPhase | null = null;

    while (transcript.status === 'queued' || transcript.status === 'processing') {
      if (transcript.status !== lastReported) {
        onPhase?.(transcript.status);
        lastReported = transcript.status;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      transcript = await client.transcripts.get(submitted.id);
    }

    if (transcript.status === 'error') {
      throw new Error(`Transcription failed: ${transcript.error}`);
    }

    if (!options.language && transcript.language_code) {
      console.log(`  Detected language: ${transcript.language_code}`);
    }

    const result: TranscriptionResult = {
      text: transcript.text || '',
    };

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
