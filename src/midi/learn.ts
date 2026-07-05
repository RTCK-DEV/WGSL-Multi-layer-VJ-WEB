import type { MidiSource } from '../core/types';

export interface MidiLearnController {
  armLearn(): Promise<MidiSource>;
  cancel(reason?: string): void;
  capture(source: MidiSource): boolean;
  readonly armed: boolean;
}

export function createMidiLearn(): MidiLearnController {
  let pending:
    | {
        resolve: (source: MidiSource) => void;
        reject: (error: Error) => void;
      }
    | null = null;

  return {
    get armed(): boolean {
      return pending !== null;
    },

    armLearn(): Promise<MidiSource> {
      if (pending) {
        pending.reject(new Error('MIDI learn superseded by a new armLearn call'));
      }

      return new Promise<MidiSource>((resolve, reject) => {
        pending = { resolve, reject };
      });
    },

    cancel(reason = 'MIDI learn cancelled'): void {
      if (!pending) return;
      const current = pending;
      pending = null;
      current.reject(new Error(reason));
    },

    capture(source: MidiSource): boolean {
      if (!pending) return false;
      const current = pending;
      pending = null;
      current.resolve(source);
      return true;
    },
  };
}
