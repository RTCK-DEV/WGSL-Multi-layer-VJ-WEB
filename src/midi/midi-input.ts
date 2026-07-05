import type { MidiSource, Store } from '../core/types';

type MidiMessageListener = (
  deviceId: string,
  source: MidiSource,
  value01: number,
  isRelease: boolean,
) => void;
type MidiClockListener = (nowMs: number) => void;
type MidiTransportListener = (kind: 'start' | 'stop') => void;
type MidiDevicesListener = (devices: readonly MidiDeviceInfo[]) => void;

interface RawMidiMessageEvent {
  data: Uint8Array | readonly number[];
}

interface RawMidiInput {
  id: string;
  name?: string | null;
  manufacturer?: string | null;
  state?: 'connected' | 'disconnected';
  type?: string;
  onmidimessage: ((event: RawMidiMessageEvent) => void) | null;
}

interface RawMidiAccess {
  inputs: Map<string, RawMidiInput> | { values(): IterableIterator<RawMidiInput> };
  onstatechange: (() => void) | null;
}

type NavigatorWithMidi = {
  requestMIDIAccess?: (options: { sysex: false }) => Promise<RawMidiAccess>;
};

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: 'connected' | 'disconnected';
  enabled: boolean;
}

export interface MidiInput {
  init(): Promise<void>;
  destroy(): void;
  onMessage(listener: MidiMessageListener): () => void;
  onClock(listener: MidiClockListener): () => void;
  onTransport(listener: MidiTransportListener): () => void;
  subscribeDevices(listener: MidiDevicesListener): () => void;
  listDevices(): readonly MidiDeviceInfo[];
}

export function createMidiInput(store: Store): MidiInput {
  let access: RawMidiAccess | null = null;
  const messageListeners = new Set<MidiMessageListener>();
  const clockListeners = new Set<MidiClockListener>();
  const transportListeners = new Set<MidiTransportListener>();
  const deviceListeners = new Set<MidiDevicesListener>();
  let devices: MidiDeviceInfo[] = [];

  async function init(): Promise<void> {
    const requestMIDIAccess = (navigator as unknown as NavigatorWithMidi).requestMIDIAccess;
    if (!requestMIDIAccess) {
      throw new Error('Web MIDI API is not available in this browser');
    }

    access = await requestMIDIAccess.call(navigator, { sysex: false });
    access.onstatechange = handleStateChange;
    bindInputs();
  }

  function destroy(): void {
    if (access) {
      for (const input of access.inputs.values()) {
        input.onmidimessage = null;
      }
      access.onstatechange = null;
    }
    access = null;
    messageListeners.clear();
    clockListeners.clear();
    transportListeners.clear();
    deviceListeners.clear();
    devices = [];
  }

  function onMessage(listener: MidiMessageListener): () => void {
    messageListeners.add(listener);
    return () => messageListeners.delete(listener);
  }

  function onClock(listener: MidiClockListener): () => void {
    clockListeners.add(listener);
    return () => clockListeners.delete(listener);
  }

  function onTransport(listener: MidiTransportListener): () => void {
    transportListeners.add(listener);
    return () => transportListeners.delete(listener);
  }

  function subscribeDevices(listener: MidiDevicesListener): () => void {
    deviceListeners.add(listener);
    listener(devices);
    return () => deviceListeners.delete(listener);
  }

  function listDevices(): readonly MidiDeviceInfo[] {
    return devices;
  }

  function handleStateChange(): void {
    bindInputs();
  }

  function bindInputs(): void {
    if (!access) return;

    devices = [];
    for (const input of access.inputs.values()) {
      input.onmidimessage = (event) => handleMidiMessage(input.id, event);
      const existing = store.getState().midi.devices[input.id];
      if (!existing) {
        store.dispatch({ type: 'midi/setDeviceEnabled', deviceId: input.id, enabled: true });
      }
      devices.push({
        id: input.id,
        name: input.name ?? input.id,
        manufacturer: input.manufacturer ?? '',
        state: input.state ?? 'connected',
        enabled: store.getState().midi.devices[input.id]?.enabled !== false,
      });
    }

    emitDevices();
  }

  function handleMidiMessage(deviceId: string, event: RawMidiMessageEvent): void {
    if (store.getState().midi.devices[deviceId]?.enabled === false) {
      return;
    }

    const data = event.data;
    const status = data[0];
    if (status === undefined) return;

    if (status === 0xf8) {
      const nowMs = performance.now();
      for (const listener of clockListeners) listener(nowMs);
      return;
    }
    if (status === 0xfa) {
      for (const listener of transportListeners) listener('start');
      return;
    }
    if (status === 0xfc) {
      for (const listener of transportListeners) listener('stop');
      return;
    }

    const command = status & 0xf0;
    const channel = (status & 0x0f) + 1;
    const number = data[1];
    if (number === undefined) return;

    if (command === 0x90) {
      const velocity = normalize7Bit(data[2] ?? 0);
      const isRelease = velocity === 0;
      emitMessage(deviceId, { kind: 'note', channel, number }, velocity, isRelease);
      return;
    }
    if (command === 0x80) {
      emitMessage(deviceId, { kind: 'note', channel, number }, 0, true);
      return;
    }
    if (command === 0xb0) {
      const value01 = normalize7Bit(data[2] ?? 0);
      emitMessage(deviceId, { kind: 'cc', channel, number }, value01, value01 < 0.5);
      return;
    }
    if (command === 0xc0) {
      emitMessage(deviceId, { kind: 'pc', channel, number }, 1, false);
    }
  }

  function emitMessage(deviceId: string, source: MidiSource, value01: number, isRelease: boolean): void {
    for (const listener of messageListeners) {
      listener(deviceId, source, value01, isRelease);
    }
  }

  function emitDevices(): void {
    for (const listener of deviceListeners) {
      listener(devices);
    }
  }

  return { init, destroy, onMessage, onClock, onTransport, subscribeDevices, listDevices };
}

function normalize7Bit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value / 127));
}
