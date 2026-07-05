import { BLEND_MODES, type BlendMode, type Layer, type ProjectState, type Scene, type ShaderParamDef } from '../core/types';
import { createInitialProject } from '../core/store/initial';
import { newId } from '../core/store/ids';

const CURRENT_VERSION = 1;

export function migrate(raw: unknown): ProjectState {
  if (!isRecord(raw)) {
    return createInitialProject();
  }

  const rawVersion = typeof raw.version === 'number' ? raw.version : 1;
  if (!Number.isInteger(rawVersion) || rawVersion < 1) {
    throw new Error(`Unsupported project version: ${String(raw.version)}`);
  }
  if (rawVersion > CURRENT_VERSION) {
    throw new Error(`Cannot migrate future project version ${rawVersion}; current version is ${CURRENT_VERSION}`);
  }

  return normalizeProjectV1(raw);
}

export function importLegacy(json: unknown): ProjectState | null {
  if (!isRecord(json) || !Array.isArray(json.scenes)) {
    return null;
  }

  const initial = createInitialProject();
  const scenes = json.scenes.map(toLegacyScene).filter((scene): scene is Scene => scene !== null);
  if (scenes.length === 0) {
    return null;
  }

  const outputRecord = isRecord(json.output) ? json.output : {};

  return normalizeProjectV1({
    ...initial,
    name: readString(json.name, initial.name),
    scenes,
    activeSceneIndex: readInteger(json.activeSceneIndex, 0),
    selectedLayerId: readStringOrNull(json.selectedLayerId),
    bpm: readFiniteNumber(json.bpm, initial.bpm),
    output: {
      width: readFiniteNumber(json.width, readFiniteNumber(outputRecord.width, initial.output.width)),
      height: readFiniteNumber(json.height, readFiniteNumber(outputRecord.height, initial.output.height)),
      dpr: readFiniteNumber(json.dpr, readFiniteNumber(outputRecord.dpr, initial.output.dpr)),
    },
  });
}

function normalizeProjectV1(raw: unknown): ProjectState {
  const initial = createInitialProject();
  if (!isRecord(raw)) return initial;

  const scenes = normalizeScenes(raw.scenes, initial.scenes);
  const activeSceneIndex = clampInteger(readInteger(raw.activeSceneIndex, initial.activeSceneIndex), 0, scenes.length - 1);
  const selectedLayerId = normalizeSelectedLayerId(readStringOrNull(raw.selectedLayerId), scenes);
  const crossfadeRecord = isRecord(raw.crossfade) ? raw.crossfade : {};
  const autoSwitchRecord = isRecord(raw.autoSwitch) ? raw.autoSwitch : {};
  const outputRecord = isRecord(raw.output) ? raw.output : {};
  const midiRecord = isRecord(raw.midi) ? raw.midi : {};

  return {
    version: 1,
    name: readString(raw.name, initial.name),
    scenes,
    activeSceneIndex,
    selectedLayerId,
    crossfade: {
      active: readBoolean(crossfadeRecord.active, initial.crossfade.active),
      toSceneIndex: clampInteger(readInteger(crossfadeRecord.toSceneIndex, activeSceneIndex), 0, scenes.length - 1),
      startBeat: readFiniteNumber(crossfadeRecord.startBeat, initial.crossfade.startBeat),
      durationBeats: readFiniteNumber(crossfadeRecord.durationBeats, initial.crossfade.durationBeats),
    },
    autoSwitch: {
      enabled: readBoolean(autoSwitchRecord.enabled, initial.autoSwitch.enabled),
      mode: autoSwitchRecord.mode === 'random' ? 'random' : 'sequential',
      intervalBeats: readFiniteNumber(autoSwitchRecord.intervalBeats, initial.autoSwitch.intervalBeats),
    },
    crossfadeBeats: Math.max(0, readFiniteNumber(raw.crossfadeBeats, initial.crossfadeBeats)),
    bpm: readFiniteNumber(raw.bpm, initial.bpm),
    output: {
      width: readFiniteNumber(outputRecord.width, initial.output.width),
      height: readFiniteNumber(outputRecord.height, initial.output.height),
      dpr: readFiniteNumber(outputRecord.dpr, initial.output.dpr),
    },
    blackout: readBoolean(raw.blackout, initial.blackout),
    midi: {
      bindings: Array.isArray(midiRecord.bindings) ? midiRecord.bindings.filter(isMidiBindingLike) : initial.midi.bindings,
      clockSync: readBoolean(midiRecord.clockSync, initial.midi.clockSync),
      devices: normalizeMidiDevices(midiRecord.devices),
    },
    customShaders: normalizeCustomShaders(raw.customShaders),
    liveScript: readString(raw.liveScript, initial.liveScript),
  };
}

function normalizeScenes(raw: unknown, fallback: Scene[]): Scene[] {
  if (!Array.isArray(raw)) return fallback;

  const scenes = raw.map(normalizeScene).filter((scene): scene is Scene => scene !== null);
  return scenes.length > 0 ? scenes : fallback;
}

function normalizeScene(raw: unknown): Scene | null {
  if (!isRecord(raw)) return null;

  return {
    id: readString(raw.id, newId('scene')),
    name: readString(raw.name, 'Scene'),
    layers: Array.isArray(raw.layers)
      ? raw.layers.map(normalizeLayer).filter((layer): layer is Layer => layer !== null)
      : [],
  };
}

function normalizeLayer(raw: unknown): Layer | null {
  if (!isRecord(raw)) return null;
  const shaderKey = readString(raw.shaderKey, '');
  if (!shaderKey) return null;

  return {
    id: readString(raw.id, newId('layer')),
    shaderKey,
    name: readString(raw.name, shaderKey),
    blend: normalizeBlend(raw.blend),
    opacity: clampNumber(readFiniteNumber(raw.opacity, 1), 0, 1),
    muted: readBoolean(raw.muted, false),
    solo: readBoolean(raw.solo, false),
    params: normalizeParamValues(raw.params),
  };
}

function toLegacyScene(raw: unknown): Scene | null {
  if (!isRecord(raw)) return null;

  return {
    id: readString(raw.id, newId('scene')),
    name: readString(raw.name, 'Scene'),
    layers: Array.isArray(raw.layers)
      ? raw.layers.map(toLegacyLayer).filter((layer): layer is Layer => layer !== null)
      : [],
  };
}

function toLegacyLayer(raw: unknown): Layer | null {
  if (!isRecord(raw)) return null;
  const shaderKey = readString(raw.key, '');
  if (!shaderKey) return null;

  return {
    id: readString(raw.id, newId('layer')),
    shaderKey,
    name: readString(raw.name, shaderKey),
    blend: normalizeLegacyBlend(raw.blend),
    opacity: clampNumber(readFiniteNumber(raw.opacity, 1), 0, 1),
    muted: readBoolean(raw.muted, false),
    solo: false,
    params: normalizeLegacyParams(raw.uniformsDef),
  };
}

function normalizeLegacyParams(raw: unknown): Record<string, number | number[]> {
  if (!isRecord(raw)) return {};

  const params: Record<string, number | number[]> = {};
  for (const [ key, def ] of Object.entries(raw)) {
    if (!key.startsWith('u_') || !isRecord(def)) continue;
    const value = normalizeParamValue(def.value);
    if (value !== undefined) {
      params[key.slice(2)] = value;
    }
  }
  return params;
}

function normalizeParamValues(raw: unknown): Record<string, number | number[]> {
  if (!isRecord(raw)) return {};

  const params: Record<string, number | number[]> = {};
  for (const [ key, value ] of Object.entries(raw)) {
    const normalized = normalizeParamValue(value);
    if (normalized !== undefined) {
      params[key] = normalized;
    }
  }
  return params;
}

function normalizeParamValue(value: unknown): number | number[] | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (Array.isArray(value) && value.every(item => typeof item === 'number' && Number.isFinite(item))) {
    return [ ...value ];
  }
  return undefined;
}

function normalizeBlend(value: unknown): BlendMode {
  return typeof value === 'string' && BLEND_MODES.includes(value as BlendMode) ? (value as BlendMode) : 'NORMAL';
}

function normalizeLegacyBlend(value: unknown): BlendMode {
  if (typeof value !== 'number' || !Number.isInteger(value)) return 'NORMAL';
  return BLEND_MODES[value] ?? 'NORMAL';
}

function normalizeSelectedLayerId(value: string | null, scenes: Scene[]): string | null {
  if (!value) return null;
  return scenes.some(scene => scene.layers.some(layer => layer.id === value)) ? value : null;
}

function normalizeMidiDevices(raw: unknown): ProjectState['midi']['devices'] {
  if (!isRecord(raw)) return {};

  const devices: ProjectState['midi']['devices'] = {};
  for (const [ deviceId, value ] of Object.entries(raw)) {
    if (isRecord(value)) {
      devices[deviceId] = { enabled: readBoolean(value.enabled, false) };
    }
  }
  return devices;
}

function normalizeCustomShaders(raw: unknown): ProjectState['customShaders'] {
  if (!isRecord(raw)) return {};

  const shaders: ProjectState['customShaders'] = {};
  for (const [ key, value ] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    const wgsl = readString(value.wgsl, '');
    const name = readString(value.name, key);
    if (!wgsl) continue;

    shaders[key] = {
      wgsl,
      name,
      params: normalizeShaderParamDefs(value.params),
    };
  }
  return shaders;
}

function normalizeShaderParamDefs(raw: unknown): Record<string, ShaderParamDef> {
  if (!isRecord(raw)) return {};

  const params: Record<string, ShaderParamDef> = {};
  for (const [ key, value ] of Object.entries(raw)) {
    if (!isRecord(value)) continue;
    if (value.type !== 'f32' && value.type !== 'vec2' && value.type !== 'vec3' && value.type !== 'color') continue;
    const defaultValue = normalizeParamValue(value.default);
    if (defaultValue === undefined) continue;

    params[key] = {
      type: value.type,
      default: defaultValue,
      min: typeof value.min === 'number' ? value.min : undefined,
      max: typeof value.max === 'number' ? value.max : undefined,
      step: typeof value.step === 'number' ? value.step : undefined,
      label: typeof value.label === 'string' ? value.label : undefined,
    };
  }
  return params;
}

function isMidiBindingLike(value: unknown): value is ProjectState['midi']['bindings'][number] {
  if (!isRecord(value) || typeof value.id !== 'string' || !isRecord(value.source) || !isRecord(value.action)) {
    return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback;
}

function readStringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function readFiniteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function readInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
