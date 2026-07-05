/**
 * UI→アプリ配線用の軽量イベント(揮発アクションのみ。状態変更は必ず store.dispatch)。
 * 型付き・最小実装。
 */
type AppEventMap = {
  'bpm:tap': void;
  'audio:mic': void;
  'audio:system': void;
  'io:export': void;
  'io:import': void;
  'midi:learn': void;
  'output:open': void;
  'webcam:start': void;
  'webcam:stop': void;
};

type Handler<T> = (payload: T) => void;

class Emitter {
  private m = new Map<string, Set<Handler<never>>>();
  on<K extends keyof AppEventMap>(k: K, fn: Handler<AppEventMap[K]>): () => void {
    let s = this.m.get(k);
    if (!s) { s = new Set(); this.m.set(k, s); }
    s.add(fn as Handler<never>);
    return () => s.delete(fn as Handler<never>);
  }
  emit<K extends keyof AppEventMap>(k: K, ...args: AppEventMap[K] extends void ? [] : [AppEventMap[K]]): void {
    this.m.get(k)?.forEach((fn) => (fn as (p?: unknown) => void)(args[0]));
  }
}

export const appEvents = new Emitter();
