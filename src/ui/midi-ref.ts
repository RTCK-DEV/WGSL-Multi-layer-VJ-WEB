/** MidiSystem インスタンスの参照ホルダー(main.ts が起動時に設定、UIから読む) */
import type { MidiSystem } from '../midi';

let ref: MidiSystem | null = null;

export function setMidiSystem(system: MidiSystem): void {
  ref = system;
}

export function getMidiSystem(): MidiSystem {
  if (!ref) throw new Error('MidiSystem is not ready yet');
  return ref;
}
