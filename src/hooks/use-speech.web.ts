// Web build: no speech recognition (browser support is patchy). The mic explains that and the user types.
import { useCallback, useState } from 'react';

import type { SpeechResult } from './use-speech';

export type { SpeechResult };

export function useSpeech(_onFinal: (r: SpeechResult) => void) {
  const [error, setError] = useState<string | null>(null);
  const start = useCallback(async () => setError('Voice works in the Android app — type here instead.'), []);
  const stop = useCallback(() => {}, []);
  return { listening: false, partial: '', error, start, stop };
}
