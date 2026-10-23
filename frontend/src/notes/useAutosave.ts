import { useEffect, useRef, useState } from 'react';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'failed';

export function useAutosave(key: string, enabled: boolean, save: () => Promise<void>, delay = 400) {
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const saveRef = useRef(save);
  const skip = useRef(true);
  saveRef.current = save;

  useEffect(() => {
    if (!enabled) return;
    if (skip.current) {
      skip.current = false;
      return;
    }
    setStatus('saving');
    const timer = window.setTimeout(() => {
      void saveRef.current().then(
        () => {
          setStatus('saved');
          setError(null);
        },
        (err: unknown) => {
          setStatus('failed');
          setError(err instanceof Error ? err.message : 'Save failed.');
        },
      );
    }, delay);
    return () => window.clearTimeout(timer);
  }, [key, enabled, delay]);

  const retry = () => {
    setStatus('saving');
    void saveRef.current().then(
      () => {
        setStatus('saved');
        setError(null);
      },
      (err: unknown) => {
        setStatus('failed');
        setError(err instanceof Error ? err.message : 'Save failed.');
      },
    );
  };

  return { status, error, retry };
}
