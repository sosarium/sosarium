import { useEffect, useRef } from 'react';

export interface UrlStateSync {
  paramKey: string;
  stateKey: string;
  apply: () => void;
  sync: () => void;
}

export function useUrlStateSync({ paramKey, stateKey, apply, sync }: UrlStateSync): void {
  const pendingRef = useRef<string | null>(null);
  const applyRef = useRef(apply);
  const syncRef = useRef(sync);
  applyRef.current = apply;
  syncRef.current = sync;

  useEffect(() => {
    pendingRef.current = paramKey;
    applyRef.current();
    const handle = window.setTimeout(() => {
      pendingRef.current = null;
    }, 300);
    return () => window.clearTimeout(handle);
  }, [paramKey]);

  useEffect(() => {
    if (pendingRef.current !== null) {
      if (stateKey === pendingRef.current) {
        pendingRef.current = null;
      }
      return;
    }
    if (stateKey !== paramKey) {
      syncRef.current();
    }
  }, [stateKey, paramKey]);
}
