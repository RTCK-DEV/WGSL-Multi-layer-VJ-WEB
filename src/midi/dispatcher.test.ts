import { describe, expect, it, vi } from 'vitest';
import { createBpmClock } from '../sync/bpm-clock';
import type { Command, ProjectState, Store } from '../core/types';
import { createMidiDispatcher } from './dispatcher';

describe('createMidiDispatcher', () => {
  it('maps a CC binding to a layer opacity command', () => {
    const store = createMockStore();
    const dispatcher = createMidiDispatcher({
      store,
      bpmClock: createBpmClock({ now: () => 0 }),
      onCrossfadeMix: vi.fn(),
      resolveParamRange: () => ({ min: 0, max: 1 }),
      getCrossfadeBeats: () => 4,
    });

    store.state.midi.bindings.push({
      id: 'opacity',
      source: { kind: 'cc', channel: 1, number: 7 },
      behavior: 'trigger',
      action: { type: 'layer.opacity', layerIndex: 0 },
    });

    expect(dispatcher.handleMessage('dev', { kind: 'cc', channel: 1, number: 7 }, 0.25, true)).toBe(true);
    expect(store.commands).toEqual([
      { type: 'layer/setOpacity', sceneId: 'scene-1', layerId: 'layer-1', value: 0.25 },
    ]);
  });

  it('toggles layer mute from current state on press only', () => {
    const store = createMockStore();
    const dispatcher = createMidiDispatcher({
      store,
      bpmClock: createBpmClock({ now: () => 0 }),
      onCrossfadeMix: vi.fn(),
      resolveParamRange: () => ({ min: 0, max: 1 }),
      getCrossfadeBeats: () => 4,
    });

    store.state.midi.bindings.push({
      id: 'mute',
      source: { kind: 'note', channel: 1, number: 60 },
      behavior: 'toggle',
      action: { type: 'layer.mute', layerIndex: 0 },
    });

    dispatcher.handleMessage('dev', { kind: 'note', channel: 1, number: 60 }, 1, false);
    store.state.scenes[0]!.layers[0]!.muted = true;
    dispatcher.handleMessage('dev', { kind: 'note', channel: 1, number: 60 }, 0, true);
    dispatcher.handleMessage('dev', { kind: 'note', channel: 1, number: 60 }, 1, false);

    expect(store.commands).toEqual([
      { type: 'layer/setMuted', sceneId: 'scene-1', layerId: 'layer-1', muted: true },
      { type: 'layer/setMuted', sceneId: 'scene-1', layerId: 'layer-1', muted: false },
    ]);
  });

  it('uses momentary press/release semantics for blackout', () => {
    const store = createMockStore();
    const dispatcher = createMidiDispatcher({
      store,
      bpmClock: createBpmClock({ now: () => 0 }),
      onCrossfadeMix: vi.fn(),
      resolveParamRange: () => ({ min: 0, max: 1 }),
      getCrossfadeBeats: () => 4,
    });

    store.state.midi.bindings.push({
      id: 'blackout',
      source: { kind: 'note', channel: 1, number: 61 },
      behavior: 'momentary',
      action: { type: 'app.blackout' },
    });

    dispatcher.handleMessage('dev', { kind: 'note', channel: 1, number: 61 }, 1, false);
    dispatcher.handleMessage('dev', { kind: 'note', channel: 1, number: 61 }, 0, true);

    expect(store.commands).toEqual([
      { type: 'app/setBlackout', blackout: true },
      { type: 'app/setBlackout', blackout: false },
    ]);
  });

  it('maps param.set through the injected shader param range', () => {
    const store = createMockStore();
    const dispatcher = createMidiDispatcher({
      store,
      bpmClock: createBpmClock({ now: () => 0 }),
      onCrossfadeMix: vi.fn(),
      resolveParamRange: () => ({ min: -2, max: 2 }),
      getCrossfadeBeats: () => 4,
    });

    store.state.midi.bindings.push({
      id: 'param',
      source: { kind: 'cc', channel: 1, number: 74 },
      behavior: 'trigger',
      action: { type: 'param.set', layerIndex: 0, param: 'speed' },
    });

    dispatcher.handleMessage('dev', { kind: 'cc', channel: 1, number: 74 }, 0.75, false);

    expect(store.commands).toEqual([
      { type: 'layer/setParam', sceneId: 'scene-1', layerId: 'layer-1', param: 'speed', value: 1 },
    ]);
  });
});

function createMockStore(): Store & { state: ProjectState; commands: Command[] } {
  const commands: Command[] = [];
  const state: ProjectState = {
    version: 1,
    name: 'test',
    scenes: [
      {
        id: 'scene-1',
        name: 'Scene 1',
        layers: [
          {
            id: 'layer-1',
            shaderKey: 'shader-a',
            name: 'Layer 1',
            blend: 'NORMAL',
            opacity: 1,
            muted: false,
            solo: false,
            params: {},
          },
        ],
      },
    ],
    activeSceneIndex: 0,
    selectedLayerId: null,
    crossfade: { active: false, toSceneIndex: 0, startBeat: 0, durationBeats: 0 },
    autoSwitch: { enabled: false, mode: 'sequential', intervalBeats: 16 },
    crossfadeBeats: 2,
    bpm: 120,
    output: { width: 1920, height: 1080, dpr: 1 },
    blackout: false,
    midi: { bindings: [], clockSync: false, devices: {} },
    customShaders: {},
    liveScript: '',
  };

  return {
    state,
    commands,
    getState: () => state,
    dispatch: (command) => {
      commands.push(command);
    },
    subscribe: () => () => undefined,
    undo: () => undefined,
    redo: () => undefined,
    canUndo: () => false,
    canRedo: () => false,
  };
}
