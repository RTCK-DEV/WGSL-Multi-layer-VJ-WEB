import type { BpmClock, MidiSource, Store } from '../core/types';
import { createMidiDispatcher } from './dispatcher';
import type { MidiDispatcherDeps } from './dispatcher';
import { createMidiInput } from './midi-input';
import type { MidiDeviceInfo } from './midi-input';
import { createMidiLearn } from './learn';

export interface MidiSystemDeps
  extends Omit<MidiDispatcherDeps, 'onLearn' | 'store' | 'bpmClock' | 'onCrossfadeMix'> {
  store: Store;
  bpmClock: BpmClock;
  onCrossfadeMix?: (value: number) => void;
  onDevicesChanged?: (connectedEnabledCount: number, devices: readonly MidiDeviceInfo[]) => void;
}

export interface MidiSystem {
  init(): Promise<void>;
  destroy(): void;
  learn: {
    armLearn(): Promise<MidiSource>;
    cancel(reason?: string): void;
    readonly armed: boolean;
  };
  devices$(listener: (devices: readonly MidiDeviceInfo[]) => void): () => void;
}

export function createMidiSystem(deps: MidiSystemDeps): MidiSystem {
  const learn = createMidiLearn();
  const input = createMidiInput(deps.store);
  const dispatcher = createMidiDispatcher({
    ...deps,
    onCrossfadeMix: deps.onCrossfadeMix ?? (() => undefined),
    onLearn: (_deviceId, source) => learn.capture(source),
  });
  const unsubscribeDevices = input.subscribeDevices((devices) => {
    deps.onDevicesChanged?.(devices.filter((device) => device.enabled && device.state === 'connected').length, devices);
  });

  const unsubscribeMessage = input.onMessage((deviceId, source, value01, isRelease) => {
    dispatcher.handleMessage(deviceId, source, value01, isRelease);
  });
  const unsubscribeClock = input.onClock((nowMs) => {
    if (!deps.store.getState().midi.clockSync) return;
    const previousBpm = deps.bpmClock.getFrame().bpm;
    deps.bpmClock.clockPulse(nowMs);
    const nextBpm = deps.bpmClock.getFrame().bpm;
    if (Math.abs(nextBpm - previousBpm) >= 0.001) {
      deps.store.dispatch({ type: 'bpm/set', bpm: nextBpm });
    }
  });
  const unsubscribeTransport = input.onTransport((kind) => {
    if (!deps.store.getState().midi.clockSync) return;
    if (kind === 'start') deps.bpmClock.transportStart();
    else deps.bpmClock.transportStop();
  });

  return {
    async init(): Promise<void> {
      await input.init();
    },

    destroy(): void {
      learn.cancel('MIDI system destroyed');
      unsubscribeMessage();
      unsubscribeClock();
      unsubscribeTransport();
      unsubscribeDevices();
      input.destroy();
      dispatcher.reset();
    },

    learn,

    devices$(listener: (devices: readonly MidiDeviceInfo[]) => void): () => void {
      return input.subscribeDevices(listener);
    },
  };
}

export type { MidiDeviceInfo } from './midi-input';
export { createMidiDispatcher, runPanic } from './dispatcher';
export { createMidiInput } from './midi-input';
export { createMidiLearn } from './learn';
