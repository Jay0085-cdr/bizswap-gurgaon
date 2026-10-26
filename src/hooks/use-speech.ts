// On-device speech-to-text (en-IN). Mic permission is requested only when the user taps the mic.
import { ExpoSpeechRecognitionModule, useSpeechRecognitionEvent } from 'expo-speech-recognition';
import { useCallback, useRef, useState } from 'react';

export type SpeechResult = { text: string; confidence?: number; alternatives: string[] };

export function useSpeech(onFinal: (r: SpeechResult) => void) {
  const [listening, setListening] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const finalRef = useRef<SpeechResult | null>(null);

  useSpeechRecognitionEvent('start', () => {
    setListening(true);
    setError(null);
  });
  useSpeechRecognitionEvent('result', (e) => {
    const best = e.results[0];
    if (!best) return;
    setPartial(best.transcript);
    if (e.isFinal) {
      finalRef.current = {
        text: best.transcript,
        confidence: best.confidence >= 0 ? best.confidence : undefined,
        alternatives: e.results.slice(1).map((r) => r.transcript),
      };
    }
  });
  useSpeechRecognitionEvent('end', () => {
    setListening(false);
    setPartial('');
    const r = finalRef.current;
    finalRef.current = null;
    if (r?.text.trim()) onFinal(r);
  });
  useSpeechRecognitionEvent('error', (e) => {
    setListening(false);
    if (e.error !== 'aborted' && e.error !== 'no-speech') setError(e.message || e.error);
    if (e.error === 'no-speech') setError('Didn’t catch that — try again or type instead.');
  });

  const start = useCallback(async () => {
    setError(null);
    try {
      if (!ExpoSpeechRecognitionModule.isRecognitionAvailable()) {
        setError('Speech recognition isn’t available on this device — please type instead.');
        return;
      }
      const onDevice = ExpoSpeechRecognitionModule.supportsOnDeviceRecognition();
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) {
        setError('Microphone permission denied — you can still type.');
        return;
      }
      ExpoSpeechRecognitionModule.start({
        lang: 'en-IN',
        interimResults: true,
        maxAlternatives: 3,
        continuous: false,
        addsPunctuation: true,
        requiresOnDeviceRecognition: onDevice,
        contextualStrings: ['Gurgaon', 'Gurugram', 'lakh', 'lakhs', 'crore', 'footfall', 'CA practice', 'CS practice', 'Cyber Hub', 'Golf Course Road', 'Sohna Road', 'Ambience Mall'],
        androidIntentOptions: { EXTRA_LANGUAGE_MODEL: 'web_search' },
      });
    } catch (e) {
      setError(String((e as Error)?.message ?? e));
    }
  }, []);

  const stop = useCallback(() => ExpoSpeechRecognitionModule.stop(), []);

  return { listening, partial, error, start, stop };
}
