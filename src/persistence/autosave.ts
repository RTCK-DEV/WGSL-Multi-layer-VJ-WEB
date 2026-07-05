import type { Store } from '../core/types';
import { saveAutosave } from './db';

const AUTOSAVE_DEBOUNCE_MS = 500;

export function attachAutosave(store: Store): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const unsubscribe = store.subscribe(state => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      void saveAutosave(state).catch(error => {
        console.error('Autosave failed', error);
      });
    }, AUTOSAVE_DEBOUNCE_MS);
  });

  return () => {
    if (timer) clearTimeout(timer);
    unsubscribe();
  };
}
