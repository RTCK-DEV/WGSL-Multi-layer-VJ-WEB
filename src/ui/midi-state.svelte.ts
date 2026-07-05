/** MIDIデバイス一覧の揮発UIミラー(main.ts が midi.devices$ から更新) */
import type { MidiDeviceInfo } from '../midi';

export const midiState = $state<{ devices: MidiDeviceInfo[] }>({ devices: [] });
