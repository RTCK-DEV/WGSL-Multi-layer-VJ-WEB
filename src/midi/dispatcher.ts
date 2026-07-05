import { BLEND_MODES } from '../core/types';
import type {
  BlendMode,
  BpmClock,
  ControlAction,
  Layer,
  MidiBehavior,
  MidiBinding,
  MidiSource,
  ProjectState,
  Store,
} from '../core/types';

export interface MidiDispatcherDeps {
  store: Store;
  bpmClock: BpmClock;
  onCrossfadeMix: (value: number) => void;
  resolveParamRange: (shaderKey: string, param: string) => { min: number; max: number };
  getCrossfadeBeats: () => number;
  onLearn?: (deviceId: string, source: MidiSource, value01: number, isRelease: boolean) => boolean | void;
}

export interface MidiDispatcher {
  handleMessage(deviceId: string, source: MidiSource, value01: number, isRelease: boolean): boolean;
  reset(): void;
}

type PressState = 'up' | 'down';

export function createMidiDispatcher(deps: MidiDispatcherDeps): MidiDispatcher {
  const pressStates = new Map<string, PressState>();

  function handleMessage(deviceId: string, source: MidiSource, value01: number, isRelease: boolean): boolean {
    const normalizedValue = clamp01(value01);
    if (deps.onLearn?.(deviceId, source, normalizedValue, isRelease) === true) {
      return true;
    }

    const state = deps.store.getState();
    const matches = state.midi.bindings.filter((binding) => sourceMatches(binding.source, source));
    let handled = false;

    for (const binding of matches) {
      const edge = resolveEdge(binding, source, normalizedValue, isRelease, pressStates);
      if (dispatchBinding(deps, binding, source, normalizedValue, edge)) {
        handled = true;
      }
    }

    return handled;
  }

  return {
    handleMessage,
    reset(): void {
      pressStates.clear();
    },
  };
}

function dispatchBinding(
  deps: MidiDispatcherDeps,
  binding: MidiBinding,
  source: MidiSource,
  value01: number,
  edge: { pressed: boolean; released: boolean },
): boolean {
  const action = binding.action;

  if (isContinuousAction(action)) {
    if (source.kind !== 'cc') return false;
    return dispatchContinuous(deps, action, value01);
  }

  if (binding.behavior === 'trigger') {
    if (!edge.pressed) return false;
    return dispatchDiscrete(deps, action, 'trigger');
  }

  if (binding.behavior === 'toggle') {
    if (!edge.pressed) return false;
    return dispatchDiscrete(deps, action, 'toggle');
  }

  if (binding.behavior === 'momentary') {
    if (edge.pressed) return dispatchDiscrete(deps, action, 'momentary-on');
    if (edge.released) return dispatchDiscrete(deps, action, 'momentary-off');
  }

  return false;
}

function dispatchContinuous(deps: MidiDispatcherDeps, action: ControlAction, value01: number): boolean {
  switch (action.type) {
    case 'layer.opacity': {
      const resolved = resolveLayer(deps.store.getState(), action.layerIndex);
      if (!resolved) return false;
      deps.store.dispatch({
        type: 'layer/setOpacity',
        sceneId: resolved.scene.id,
        layerId: resolved.layer.id,
        value: value01,
      });
      return true;
    }
    case 'param.set': {
      const resolved = resolveLayer(deps.store.getState(), action.layerIndex);
      if (!resolved) return false;
      const range = deps.resolveParamRange(resolved.layer.shaderKey, action.param);
      const value = range.min + value01 * (range.max - range.min);
      deps.store.dispatch({
        type: 'layer/setParam',
        sceneId: resolved.scene.id,
        layerId: resolved.layer.id,
        param: action.param,
        value,
      });
      return true;
    }
    case 'crossfade.mix':
      deps.onCrossfadeMix(value01);
      return true;
    default:
      return false;
  }
}

function dispatchDiscrete(
  deps: MidiDispatcherDeps,
  action: ControlAction,
  mode: 'trigger' | 'toggle' | 'momentary-on' | 'momentary-off',
): boolean {
  const state = deps.store.getState();

  switch (action.type) {
    case 'scene.recall':
      return crossfadeToScene(deps, action.sceneIndex);
    case 'scene.next':
      return crossfadeToScene(deps, nextSceneIndex(state, 1));
    case 'scene.prev':
      return crossfadeToScene(deps, nextSceneIndex(state, -1));
    case 'layer.mute':
      return setLayerBoolean(deps.store, action.layerIndex, 'muted', mode, true);
    case 'layer.solo':
      return setLayerBoolean(deps.store, action.layerIndex, 'solo', mode, true);
    case 'layer.select': {
      const resolved = resolveLayer(state, action.layerIndex);
      if (!resolved) return false;
      deps.store.dispatch({ type: 'layer/select', layerId: resolved.layer.id });
      return true;
    }
    case 'layer.blendNext':
      return blendNext(deps.store, action.layerIndex);
    case 'bpm.tap':
      deps.bpmClock.tap();
      deps.store.dispatch({ type: 'bpm/set', bpm: deps.bpmClock.getFrame().bpm });
      return true;
    case 'app.blackout': {
      const blackout = booleanForMode(state.blackout, mode);
      deps.store.dispatch({ type: 'app/setBlackout', blackout });
      return true;
    }
    case 'app.panic':
      runPanic(deps.store);
      return true;
    default:
      return false;
  }
}

function sourceMatches(bindingSource: MidiSource, incoming: MidiSource): boolean {
  return (
    bindingSource.kind === incoming.kind &&
    bindingSource.channel === incoming.channel &&
    bindingSource.number === incoming.number
  );
}

function resolveEdge(
  binding: MidiBinding,
  source: MidiSource,
  value01: number,
  isRelease: boolean,
  pressStates: Map<string, PressState>,
): { pressed: boolean; released: boolean } {
  if (source.kind === 'pc') {
    return { pressed: true, released: false };
  }

  const down = !isRelease && (source.kind !== 'cc' || value01 >= 0.5);
  const previous = pressStates.get(binding.id) ?? 'up';
  const next: PressState = down ? 'down' : 'up';
  pressStates.set(binding.id, next);

  return {
    pressed: previous === 'up' && next === 'down',
    released: previous === 'down' && next === 'up',
  };
}

function isContinuousAction(action: ControlAction): boolean {
  return action.type === 'layer.opacity' || action.type === 'param.set' || action.type === 'crossfade.mix';
}

function resolveLayer(
  state: ProjectState,
  layerIndex: number,
): { scene: ProjectState['scenes'][number]; layer: Layer } | null {
  const scene = state.scenes[state.activeSceneIndex];
  const layer = scene?.layers[layerIndex];
  if (!scene || !layer) return null;
  return { scene, layer };
}

function setLayerBoolean(
  store: Store,
  layerIndex: number,
  field: 'muted' | 'solo',
  mode: 'trigger' | 'toggle' | 'momentary-on' | 'momentary-off',
  triggerValue: boolean,
): boolean {
  const resolved = resolveLayer(store.getState(), layerIndex);
  if (!resolved) return false;
  const current = resolved.layer[field];
  const next = mode === 'toggle' ? !current : mode === 'momentary-off' ? false : triggerValue;
  if (field === 'muted') {
    store.dispatch({
      type: 'layer/setMuted',
      sceneId: resolved.scene.id,
      layerId: resolved.layer.id,
      muted: next,
    });
  } else {
    store.dispatch({
      type: 'layer/setSolo',
      sceneId: resolved.scene.id,
      layerId: resolved.layer.id,
      solo: next,
    });
  }
  return true;
}

function blendNext(store: Store, layerIndex: number): boolean {
  const resolved = resolveLayer(store.getState(), layerIndex);
  if (!resolved) return false;
  const currentIndex = BLEND_MODES.indexOf(resolved.layer.blend);
  const nextBlend = BLEND_MODES[(currentIndex + 1) % BLEND_MODES.length];
  if (!nextBlend) return false;
  store.dispatch({
    type: 'layer/setBlend',
    sceneId: resolved.scene.id,
    layerId: resolved.layer.id,
    blend: nextBlend as BlendMode,
  });
  return true;
}

function crossfadeToScene(deps: MidiDispatcherDeps, index: number): boolean {
  const state = deps.store.getState();
  if (state.scenes.length === 0) return false;
  const normalizedIndex = ((index % state.scenes.length) + state.scenes.length) % state.scenes.length;
  deps.store.dispatch({
    type: 'scene/crossfadeTo',
    index: normalizedIndex,
    durationBeats: Math.max(0, deps.getCrossfadeBeats()),
    startBeat: deps.bpmClock.getFrame().beat,
  });
  return true;
}

function nextSceneIndex(state: ProjectState, delta: 1 | -1): number {
  if (state.scenes.length === 0) return 0;
  return (state.activeSceneIndex + delta + state.scenes.length) % state.scenes.length;
}

export function runPanic(store: Store): void {
  const state = store.getState();
  for (const scene of state.scenes) {
    for (const layer of scene.layers) {
      if (layer.muted) {
        store.dispatch({ type: 'layer/setMuted', sceneId: scene.id, layerId: layer.id, muted: false });
      }
      if (layer.solo) {
        store.dispatch({ type: 'layer/setSolo', sceneId: scene.id, layerId: layer.id, solo: false });
      }
    }
  }
  if (state.blackout) {
    store.dispatch({ type: 'app/setBlackout', blackout: false });
  }
  if (state.crossfade.active) {
    store.dispatch({ type: 'scene/crossfadeDone' });
  }
}

function booleanForMode(
  current: boolean,
  mode: 'trigger' | 'toggle' | 'momentary-on' | 'momentary-off',
): boolean {
  if (mode === 'toggle') return !current;
  if (mode === 'momentary-off') return false;
  return true;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
