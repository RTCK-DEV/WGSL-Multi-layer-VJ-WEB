import type { ProjectState, Store } from '../core/types';
import { saveAutosave } from './db';

const AUTOSAVE_DEBOUNCE_MS = 500;

export interface AutosaveOptions {
  /** IndexedDB書き込みが失敗した時(容量超過・プライベートブラウジング等)に通知する。 */
  onError?: (error: unknown) => void;
}

export function attachAutosave(store: Store, options: AutosaveOptions = {}): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latestState: ProjectState = store.getState();
  let dirty = false;

  function flush(): void {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!dirty) return;
    dirty = false;
    void saveAutosave(latestState).catch(error => {
      console.error('Autosave failed', error);
      options.onError?.(error);
    });
  }

  const unsubscribe = store.subscribe(state => {
    latestState = state;
    dirty = true;
    if (timer) clearTimeout(timer);
    timer = setTimeout(flush, AUTOSAVE_DEBOUNCE_MS);
  });

  // タブが隠れる/閉じる直前にデバウンス中の変更を即座にフラッシュする。
  // beforeunload だけだとブラウザによって非同期処理が保証されないため、
  // より確実に発火する visibilitychange(hidden) も併用する。
  const flushOnHide = () => { if (document.visibilityState === 'hidden') flush(); };
  document.addEventListener('visibilitychange', flushOnHide);
  window.addEventListener('pagehide', flush);

  return () => {
    if (timer) clearTimeout(timer);
    document.removeEventListener('visibilitychange', flushOnHide);
    window.removeEventListener('pagehide', flush);
    unsubscribe();
  };
}
