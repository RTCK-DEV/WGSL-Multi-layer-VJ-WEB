import type { Draft } from 'immer';
import type { Command, Layer, ProjectState, Scene } from '../types';
import { newId } from './ids';

export interface ReducerContext {
  resolveShaderDefaults(shaderKey: string): { name: string; params: Record<string, number | number[]> };
}

export function reduceProject(
  state: Draft<ProjectState>,
  cmd: Command,
  context: ReducerContext,
): ProjectState | void {
  switch (cmd.type) {
    case 'project/load':
      return cmd.state;

    case 'project/rename':
      state.name = cmd.name;
      return;

    case 'scene/add': {
      state.scenes.push({
        id: newId('scene'),
        name: cmd.name ?? `Scene ${state.scenes.length + 1}`,
        layers: [],
      });
      state.activeSceneIndex = state.scenes.length - 1;
      state.selectedLayerId = null;
      return;
    }

    case 'scene/remove': {
      const index = state.scenes.findIndex(scene => scene.id === cmd.sceneId);
      if (index === -1) return;

      const removed = state.scenes[index];
      state.scenes.splice(index, 1);
      if (state.scenes.length === 0) {
        state.scenes.push({ id: newId('scene'), name: 'Scene 1', layers: [] });
      }

      if (state.activeSceneIndex >= state.scenes.length) {
        state.activeSceneIndex = state.scenes.length - 1;
      } else if (index < state.activeSceneIndex) {
        state.activeSceneIndex -= 1;
      }

      if (removed?.layers.some(layer => layer.id === state.selectedLayerId)) {
        state.selectedLayerId = null;
      }
      return;
    }

    case 'scene/rename': {
      const scene = findScene(state, cmd.sceneId);
      if (scene) scene.name = cmd.name;
      return;
    }

    case 'scene/select':
      if (cmd.index >= 0 && cmd.index < state.scenes.length) {
        state.activeSceneIndex = cmd.index;
        state.crossfade.active = false;
      }
      return;

    case 'scene/crossfadeTo':
      if (cmd.index >= 0 && cmd.index < state.scenes.length) {
        state.crossfade = {
          active: true,
          toSceneIndex: cmd.index,
          startBeat: cmd.startBeat,
          durationBeats: cmd.durationBeats,
        };
      }
      return;

    case 'scene/crossfadeDone':
      if (state.crossfade.toSceneIndex >= 0 && state.crossfade.toSceneIndex < state.scenes.length) {
        state.activeSceneIndex = state.crossfade.toSceneIndex;
      }
      state.crossfade.active = false;
      return;

    case 'scene/autoSwitch':
      if (cmd.enabled !== undefined) state.autoSwitch.enabled = cmd.enabled;
      if (cmd.mode !== undefined) state.autoSwitch.mode = cmd.mode;
      if (cmd.intervalBeats !== undefined) state.autoSwitch.intervalBeats = cmd.intervalBeats;
      return;

    case 'scene/setCrossfadeBeats':
      state.crossfadeBeats = Math.max(0, cmd.beats);
      return;

    case 'layer/add': {
      const scene = findScene(state, cmd.sceneId);
      if (!scene) return;

      const defaults = context.resolveShaderDefaults(cmd.shaderKey);
      const layer: Layer = {
        id: newId('layer'),
        shaderKey: cmd.shaderKey,
        name: defaults.name,
        blend: 'NORMAL',
        opacity: 1,
        muted: false,
        solo: false,
        params: copyParams(defaults.params),
      };
      scene.layers.push(layer);
      state.selectedLayerId = layer.id;
      return;
    }

    case 'layer/remove': {
      const scene = findScene(state, cmd.sceneId);
      if (!scene) return;

      const index = scene.layers.findIndex(layer => layer.id === cmd.layerId);
      if (index === -1) return;

      scene.layers.splice(index, 1);
      if (state.selectedLayerId === cmd.layerId) {
        state.selectedLayerId = null;
      }
      return;
    }

    case 'layer/move': {
      const scene = findScene(state, cmd.sceneId);
      if (!scene) return;

      const from = cmd.from;
      const to = cmd.to;
      if (from < 0 || from >= scene.layers.length || to < 0 || to >= scene.layers.length || from === to) {
        return;
      }

      const layer = scene.layers.splice(from, 1)[0];
      if (!layer) return;
      scene.layers.splice(to, 0, layer);
      return;
    }

    case 'layer/select':
      state.selectedLayerId = cmd.layerId;
      return;

    case 'layer/setOpacity': {
      const layer = findLayer(state, cmd.sceneId, cmd.layerId);
      if (layer) layer.opacity = clamp(cmd.value, 0, 1);
      return;
    }

    case 'layer/rename': {
      const layer = findLayer(state, cmd.sceneId, cmd.layerId);
      if (layer) layer.name = cmd.name;
      return;
    }

    case 'layer/setBlend': {
      const layer = findLayer(state, cmd.sceneId, cmd.layerId);
      if (layer) layer.blend = cmd.blend;
      return;
    }

    case 'layer/setMuted': {
      const layer = findLayer(state, cmd.sceneId, cmd.layerId);
      if (layer) layer.muted = cmd.muted;
      return;
    }

    case 'layer/setSolo': {
      const layer = findLayer(state, cmd.sceneId, cmd.layerId);
      if (layer) layer.solo = cmd.solo;
      return;
    }

    case 'layer/setParam': {
      const layer = findLayer(state, cmd.sceneId, cmd.layerId);
      if (layer) layer.params[cmd.param] = Array.isArray(cmd.value) ? [ ...cmd.value ] : cmd.value;
      return;
    }

    case 'layer/setShaderKey': {
      const layer = findLayer(state, cmd.sceneId, cmd.layerId);
      if (layer) layer.shaderKey = cmd.shaderKey;
      return;
    }

    case 'bpm/set':
      state.bpm = cmd.bpm;
      return;

    case 'output/setResolution':
      state.output.width = cmd.width;
      state.output.height = cmd.height;
      return;

    case 'output/setDpr':
      state.output.dpr = cmd.dpr;
      return;

    case 'app/setBlackout':
      state.blackout = cmd.blackout;
      return;

    case 'midi/addBinding':
      state.midi.bindings.push(cmd.binding);
      return;

    case 'midi/removeBinding':
      state.midi.bindings = state.midi.bindings.filter(binding => binding.id !== cmd.bindingId);
      return;

    case 'midi/updateBinding': {
      const index = state.midi.bindings.findIndex(binding => binding.id === cmd.binding.id);
      if (index === -1) {
        state.midi.bindings.push(cmd.binding);
      } else {
        state.midi.bindings[index] = cmd.binding;
      }
      return;
    }

    case 'midi/setDeviceEnabled':
      state.midi.devices[cmd.deviceId] = { enabled: cmd.enabled };
      return;

    case 'midi/setClockSync':
      state.midi.clockSync = cmd.enabled;
      return;

    case 'shader/saveCustom':
      state.customShaders[cmd.key] = {
        name: cmd.name,
        wgsl: cmd.wgsl,
        params: cmd.params,
      };
      return;

    case 'shader/removeCustom':
      delete state.customShaders[cmd.key];
      return;

    case 'app/setLiveScript':
      state.liveScript = cmd.script;
      return;

    default: {
      const exhaustive: never = cmd;
      return exhaustive;
    }
  }
}

function findScene(state: Draft<ProjectState>, sceneId: string): Draft<Scene> | undefined {
  return state.scenes.find(scene => scene.id === sceneId);
}

function findLayer(state: Draft<ProjectState>, sceneId: string, layerId: string): Draft<Layer> | undefined {
  return findScene(state, sceneId)?.layers.find(layer => layer.id === layerId);
}

function copyParams(params: Record<string, number | number[]>): Record<string, number | number[]> {
  return Object.fromEntries(
    Object.entries(params).map(([ key, value ]) => [ key, Array.isArray(value) ? [ ...value ] : value ]),
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
