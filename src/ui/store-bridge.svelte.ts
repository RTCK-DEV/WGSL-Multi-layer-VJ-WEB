/**
 * Store(純TS) と Svelte 5 runes の橋渡し。
 * レンダーループは store を直接読む。UI はこの bridge 経由で購読する。
 */
import type { ProjectState, Store, Command } from '../core/types';

let store: Store | null = null;

const bridge = $state<{ project: ProjectState | null; rev: number }>({ project: null, rev: 0 });

export function connectStore(s: Store): void {
  store = s;
  bridge.project = s.getState();
  s.subscribe((state) => {
    bridge.project = state;
    bridge.rev++;
  });
}

export function project(): ProjectState {
  if (!bridge.project) throw new Error('store not connected');
  return bridge.project;
}

export function dispatch(cmd: Command, opts?: { undoable?: boolean; coalesceKey?: string }): void {
  store?.dispatch(cmd, opts);
}

export function getStore(): Store {
  if (!store) throw new Error('store not connected');
  return store;
}
