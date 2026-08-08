// §8 step 8 / §10: voice input. Tap the mic to record, tap to stop (or it
// auto-stops on silence); the transcript lands in the chat input for review and
// is NEVER auto-sent. On denied permission, failed transcription, or a device
// with no speech recogniser, it shows an inline error and the user just types
// (§10 fallback).
//
// Speech-to-text needs a native module. This hook loads @react-native-voice/
// voice lazily and reports `available: false` when it isn't present, so the app
// builds and runs either way — installing that module (plus its microphone
// permission) activates voice with no further wiring.
import { useCallback, useEffect, useRef, useState } from 'react';

interface VoiceModule {
  start(locale?: string): Promise<void>;
  stop(): Promise<void>;
  destroy(): Promise<void>;
  removeAllListeners(): void;
  onSpeechResults?: (e: { value?: string[] }) => void;
  onSpeechError?: (e: { error?: { message?: string } }) => void;
  onSpeechEnd?: () => void;
}

function loadVoice(): VoiceModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('@react-native-voice/voice');
    return (mod?.default ?? mod) as VoiceModule;
  } catch {
    return null;
  }
}

export interface VoiceInput {
  available: boolean;
  recording: boolean;
  error: string | null;
  /** Start if idle, stop if recording. */
  toggle: () => Promise<void>;
  clearError: () => void;
}

export function useVoiceInput(onTranscript: (text: string) => void): VoiceInput {
  const voiceRef = useRef<VoiceModule | null>(null);
  const [available, setAvailable] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const voice = loadVoice();
    voiceRef.current = voice;
    setAvailable(voice != null);
    if (!voice) return;

    voice.onSpeechResults = (e) => {
      const text = e.value?.[0];
      if (text) onTranscript(text); // lands in the input — never auto-sent
    };
    voice.onSpeechError = (e) => {
      setError(e.error?.message || 'Couldn\'t hear that. Try again or type it instead.');
      setRecording(false);
    };
    voice.onSpeechEnd = () => setRecording(false);

    return () => {
      voice.removeAllListeners();
      voice.destroy().catch(() => {});
    };
  }, [onTranscript]);

  const toggle = useCallback(async () => {
    const voice = voiceRef.current;
    if (!voice) {
      setError('Voice input isn\'t available on this device — type your message instead.');
      return;
    }
    setError(null);
    try {
      if (recording) {
        await voice.stop();
        setRecording(false);
      } else {
        await voice.start('en-US');
        setRecording(true);
      }
    } catch {
      setError('Couldn\'t start the microphone. Check the permission, or type instead.');
      setRecording(false);
    }
  }, [recording]);

  const clearError = useCallback(() => setError(null), []);

  return { available, recording, error, toggle, clearError };
}
