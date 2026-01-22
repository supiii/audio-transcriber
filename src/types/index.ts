export interface TranscriptionOptions {
  language?: string;
  speakerLabels?: boolean;
  speakersExpected?: number;
}

export interface TranscriptionResult {
  text: string;
  speakers?: Array<{
    speaker: string;
    text: string;
    start: number;
    end: number;
  }>;
}
