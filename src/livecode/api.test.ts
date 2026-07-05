import { describe, expect, it } from 'vitest';
import { createLiveCodeApi } from './api';
import { createLiveModulatorRegistry } from '../core/live-modulators';
import type { BpmClock, Command, ProjectState, Store } from '../core/types';

function makeState(): ProjectState {
  return {
    version: 1,
    name: 'test',
    scenes: [
      {
        id: 'scene-1',
        name: 'Scene 1',
        layers: [
          { id: 'layer-1', shaderKey: 'shader-a', name: 'Layer 1', blend: 'NORMAL', opacity: 1, muted: false, solo: false, params: {} },
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
}

function createMockStore(): Store & { dispatched: Command[] } {
  let state = makeState();
  const dispatched: Command[] = [];
  return {
    dispatched,
    getState: () => state,
    dispatch: (cmd) => {
      dispatched.push(cmd);
      if (cmd.type === 'layer/setMuted') {
        state = {
          ...state,
          scenes: state.scenes.map((s) => s.id === cmd.sceneId
            ? { ...s, layers: s.layers.map((l) => (l.id === cmd.layerId ? { ...l, muted: cmd.muted } : l)) }
            : s),
        };
      }
      if (cmd.type === 'layer/setSolo') {
        state = {
          ...state,
          scenes: state.scenes.map((s) => s.id === cmd.sceneId
            ? { ...s, layers: s.layers.map((l) => (l.id === cmd.layerId ? { ...l, solo: cmd.solo } : l)) }
            : s),
        };
      }
    },
    subscribe: () => () => undefined,
    undo: () => undefined,
    redo: () => undefined,
    canUndo: () => false,
    canRedo: () => false,
  };
}

function createMockBpmClock(): BpmClock {
  return {
    tap: () => undefined,
    setBpm: () => undefined,
    clockPulse: () => undefined,
    transportStart: () => undefined,
    transportStop: () => undefined,
    getFrame: () => ({ bpm: 120, beat: 10, phase: 0.5 }),
  };
}

describe('createLiveCodeApi', () => {
  it('layer(0).blend("ADD") dispatches the correct command', () => {
    const store = createMockStore();
    const api = createLiveCodeApi({ store, bpmClock: createMockBpmClock(), modulators: createLiveModulatorRegistry() });

    api.layer(0).blend('ADD');

    expect(store.dispatched).toContainEqual({ type: 'layer/setBlend', sceneId: 'scene-1', layerId: 'layer-1', blend: 'ADD' });
  });

  it('layer(0).opacity(0.5) dispatches and clears any modulator', () => {
    const store = createMockStore();
    const modulators = createLiveModulatorRegistry();
    modulators.set('layer-1', '__opacity__', () => 1);
    const api = createLiveCodeApi({ store, bpmClock: createMockBpmClock(), modulators });

    api.layer(0).opacity(0.5);

    expect(store.dispatched).toContainEqual({ type: 'layer/setOpacity', sceneId: 'scene-1', layerId: 'layer-1', value: 0.5 });
    expect(modulators.get('layer-1', '__opacity__')).toBeUndefined();
  });

  it('layer(0).opacity(fn) registers a modulator without dispatching', () => {
    const store = createMockStore();
    const modulators = createLiveModulatorRegistry();
    const api = createLiveCodeApi({ store, bpmClock: createMockBpmClock(), modulators });
    const fn = (ctx: { t: number }) => ctx.t;

    api.layer(0).opacity(fn);

    expect(store.dispatched.some((c) => c.type === 'layer/setOpacity')).toBe(false);
    expect(modulators.get('layer-1', '__opacity__')).toBe(fn);
  });

  it('layer(0).param registers/clears modulators the same way as opacity', () => {
    const store = createMockStore();
    const modulators = createLiveModulatorRegistry();
    const api = createLiveCodeApi({ store, bpmClock: createMockBpmClock(), modulators });

    api.layer(0).param('zoom', (ctx: { bass: number }) => ctx.bass);
    expect(modulators.get('layer-1', 'zoom')).toBeDefined();

    api.layer(0).param('zoom', 3);
    expect(modulators.get('layer-1', 'zoom')).toBeUndefined();
    expect(store.dispatched).toContainEqual({ type: 'layer/setParam', sceneId: 'scene-1', layerId: 'layer-1', param: 'zoom', value: 3 });
  });

  it('toggles mute/solo when called without an argument', () => {
    const store = createMockStore();
    const api = createLiveCodeApi({ store, bpmClock: createMockBpmClock(), modulators: createLiveModulatorRegistry() });

    api.layer(0).mute();
    expect(store.getState().scenes[0]!.layers[0]!.muted).toBe(true);
    api.layer(0).mute();
    expect(store.getState().scenes[0]!.layers[0]!.muted).toBe(false);
  });

  it('is a no-op for a layer index that does not exist, without throwing', () => {
    const store = createMockStore();
    const api = createLiveCodeApi({ store, bpmClock: createMockBpmClock(), modulators: createLiveModulatorRegistry() });

    expect(() => {
      api.layer(99).blend('ADD').opacity(0.5).mute().solo().param('x', 1).clear('x').clearAll();
    }).not.toThrow();
    expect(store.dispatched).toHaveLength(0);
  });

  it('scene.recall dispatches a crossfadeTo using the project default beats when omitted', () => {
    const store = createMockStore();
    store.dispatch({ type: 'scene/add' });
    const api = createLiveCodeApi({ store, bpmClock: createMockBpmClock(), modulators: createLiveModulatorRegistry() });

    api.scene.recall(0, {});

    expect(store.dispatched).toContainEqual({ type: 'scene/crossfadeTo', index: 0, durationBeats: 2, startBeat: 10 });
  });

  it('blackout dispatches app/setBlackout', () => {
    const store = createMockStore();
    const api = createLiveCodeApi({ store, bpmClock: createMockBpmClock(), modulators: createLiveModulatorRegistry() });

    api.blackout(true);

    expect(store.dispatched).toContainEqual({ type: 'app/setBlackout', blackout: true });
  });
});
