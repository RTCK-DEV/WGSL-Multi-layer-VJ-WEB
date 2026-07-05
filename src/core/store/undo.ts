import { applyPatches, type Patch } from 'immer';
import type { ProjectState } from '../types';

interface HistoryEntry {
  patches: Patch[];
  inversePatches: Patch[];
  coalesceKey?: string;
  timestampMs: number;
}

export interface UndoManager {
  record(patches: Patch[], inversePatches: Patch[], opts: { coalesceKey?: string; timestampMs: number }): void;
  undo(state: ProjectState): ProjectState | null;
  redo(state: ProjectState): ProjectState | null;
  canUndo(): boolean;
  canRedo(): boolean;
}

const MAX_HISTORY = 100;
const COALESCE_WINDOW_MS = 500;

export function createUndoManager(maxHistory = MAX_HISTORY): UndoManager {
  const undoStack: HistoryEntry[] = [];
  const redoStack: HistoryEntry[] = [];

  return {
    record(patches, inversePatches, opts) {
      if (patches.length === 0 && inversePatches.length === 0) return;

      const previous = undoStack.at(-1);
      if (
        previous &&
        opts.coalesceKey &&
        previous.coalesceKey === opts.coalesceKey &&
        opts.timestampMs - previous.timestampMs <= COALESCE_WINDOW_MS
      ) {
        previous.patches = [ ...previous.patches, ...patches ];
        previous.inversePatches = [ ...inversePatches, ...previous.inversePatches ];
        previous.timestampMs = opts.timestampMs;
        redoStack.length = 0;
        return;
      }

      undoStack.push({
        patches,
        inversePatches,
        coalesceKey: opts.coalesceKey,
        timestampMs: opts.timestampMs,
      });
      if (undoStack.length > maxHistory) {
        undoStack.shift();
      }
      redoStack.length = 0;
    },

    undo(state) {
      const entry = undoStack.pop();
      if (!entry) return null;

      redoStack.push(entry);
      return applyPatches(state, entry.inversePatches);
    },

    redo(state) {
      const entry = redoStack.pop();
      if (!entry) return null;

      undoStack.push(entry);
      return applyPatches(state, entry.patches);
    },

    canUndo() {
      return undoStack.length > 0;
    },

    canRedo() {
      return redoStack.length > 0;
    },
  };
}
