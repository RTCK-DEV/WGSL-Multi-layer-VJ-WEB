import { enablePatches, produceWithPatches } from 'immer';
import type { Command, ProjectState, Store } from '../types';
import { reduceProject, type ReducerContext } from './reducer';
import { createUndoManager } from './undo';

enablePatches();

export interface CreateStoreOptions {
  resolveShaderDefaults?: ReducerContext['resolveShaderDefaults'];
  now?: () => number;
}

const fallbackResolveShaderDefaults: ReducerContext['resolveShaderDefaults'] = shaderKey => ({
  name: shaderKey,
  params: {},
});

export function createStore(initial: ProjectState, options: CreateStoreOptions = {}): Store {
  let state = initial;
  const listeners = new Set<(state: ProjectState, cmd: Command | null) => void>();
  const undoManager = createUndoManager();
  const now = options.now ?? Date.now;
  const context: ReducerContext = {
    resolveShaderDefaults: options.resolveShaderDefaults ?? fallbackResolveShaderDefaults,
  };

  function notify(cmd: Command | null): void {
    for (const listener of listeners) {
      listener(state, cmd);
    }
  }

  return {
    getState() {
      return state;
    },

    dispatch(cmd, opts = {}) {
      const [ nextState, patches, inversePatches ] = produceWithPatches(state, draft =>
        reduceProject(draft, cmd, context),
      );

      state = nextState;
      if (opts.undoable === true) {
        undoManager.record(patches, inversePatches, {
          coalesceKey: opts.coalesceKey,
          timestampMs: now(),
        });
      }
      notify(cmd);
    },

    subscribe(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },

    undo() {
      const nextState = undoManager.undo(state);
      if (!nextState) return;

      state = nextState;
      notify(null);
    },

    redo() {
      const nextState = undoManager.redo(state);
      if (!nextState) return;

      state = nextState;
      notify(null);
    },

    canUndo() {
      return undoManager.canUndo();
    },

    canRedo() {
      return undoManager.canRedo();
    },
  };
}
