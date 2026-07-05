/**
 * 共有コントラクト — 全モジュール(gpu/shaders/store/midi/audio/ui)はこのファイルの型に準拠する。
 * このファイルは値を持たない(enum的なものは const オブジェクト + 型)。
 */

// ---------- Blend ----------
export const BLEND_MODES = [
  'NORMAL', 'ADD', 'MULTIPLY', 'SCREEN', 'DIFFERENCE',
  'OVERLAY', 'SOFT_LIGHT', 'HARD_LIGHT', 'COLOR_DODGE', 'COLOR_BURN',
] as const;
export type BlendMode = (typeof BLEND_MODES)[number];

// ---------- Shader ----------
export type ShaderParamType = 'f32' | 'vec2' | 'vec3' | 'color';

export interface ShaderParamDef {
  type: ShaderParamType;
  default: number | number[];
  min?: number;
  max?: number;
  step?: number;
  label?: string;
}

/** generator: 入力なし / filter: u_input が必要 / feedback: 前フレーム自出力 / external: webcam等 */
export type ShaderKind = 'generator' | 'filter' | 'feedback' | 'external';

export interface ShaderModuleDef {
  key: string;              // 安定ID(永続化で使用)
  name: string;             // 表示名
  category: string;         // 'FRACTAL' | 'FLUID' | ... UI グルーピング用
  kind: ShaderKind;
  /** fragment 本体。エントリは `fn shade(uv: vec2f, frag: vec2f) -> vec4f`。
   *  プリアンブル(グローバルuniform/バインド宣言/vertexとfragmentのmain)はビルダーが注入する。 */
  wgsl: string;
  params: Record<string, ShaderParamDef>;
}

// ---------- Project state ----------
export interface Layer {
  id: string;
  shaderKey: string;
  name: string;
  blend: BlendMode;
  opacity: number;           // 0..1
  muted: boolean;
  solo: boolean;
  params: Record<string, number | number[]>;
}

export interface Scene {
  id: string;
  name: string;
  layers: Layer[];           // index 0 が最下層
}

export interface MidiSource {
  kind: 'cc' | 'note' | 'pc';
  channel: number;           // 1..16
  number: number;            // 0..127
}

/** 入力源非依存のアクション(MIDI/キーボード/将来OSCから dispatch される) */
export type ControlAction =
  | { type: 'scene.recall'; sceneIndex: number }
  | { type: 'scene.next' }
  | { type: 'scene.prev' }
  | { type: 'layer.mute'; layerIndex: number }
  | { type: 'layer.solo'; layerIndex: number }
  | { type: 'layer.select'; layerIndex: number }
  | { type: 'layer.opacity'; layerIndex: number }         // 値は正規化入力から
  | { type: 'layer.blendNext'; layerIndex: number }
  | { type: 'param.set'; layerIndex: number; param: string } // 値は正規化入力→min/max写像
  | { type: 'crossfade.mix' }
  | { type: 'bpm.tap' }
  | { type: 'app.blackout' }
  | { type: 'app.panic' };

export type MidiBehavior = 'trigger' | 'toggle' | 'momentary';

export interface MidiBinding {
  id: string;
  source: MidiSource;
  behavior: MidiBehavior;
  action: ControlAction;
  label?: string;
}

export interface ProjectState {
  version: number;                     // スキーマバージョン(migration用)
  name: string;
  scenes: Scene[];
  activeSceneIndex: number;
  selectedLayerId: string | null;
  crossfade: {
    active: boolean;
    toSceneIndex: number;
    startBeat: number;
    durationBeats: number;             // 0 = 即時
  };
  autoSwitch: { enabled: boolean; mode: 'sequential' | 'random'; intervalBeats: number };
  crossfadeBeats: number;
  bpm: number;
  output: { width: number; height: number; dpr: number };
  blackout: boolean;
  midi: {
    bindings: MidiBinding[];
    clockSync: boolean;
    devices: Record<string, { enabled: boolean }>;
  };
  customShaders: Record<string, { wgsl: string; params: Record<string, ShaderParamDef>; name: string }>;
  liveScript: string;                  // ライブコーディングパネルの Scene Script ソース(永続化対象)
}

// ---------- Commands (store dispatch) ----------
export type Command =
  | { type: 'project/load'; state: ProjectState }
  | { type: 'project/rename'; name: string }
  | { type: 'scene/add'; name?: string }
  | { type: 'scene/remove'; sceneId: string }
  | { type: 'scene/rename'; sceneId: string; name: string }
  | { type: 'scene/select'; index: number }                          // 即時切替
  | { type: 'scene/crossfadeTo'; index: number; durationBeats: number; startBeat: number }
  | { type: 'scene/crossfadeDone' }
  | { type: 'scene/autoSwitch'; enabled?: boolean; mode?: 'sequential' | 'random'; intervalBeats?: number }
  | { type: 'scene/setCrossfadeBeats'; beats: number }
  | { type: 'layer/add'; sceneId: string; shaderKey: string }
  | { type: 'layer/remove'; sceneId: string; layerId: string }
  | { type: 'layer/move'; sceneId: string; from: number; to: number }
  | { type: 'layer/select'; layerId: string | null }
  | { type: 'layer/setOpacity'; sceneId: string; layerId: string; value: number }
  | { type: 'layer/setBlend'; sceneId: string; layerId: string; blend: BlendMode }
  | { type: 'layer/setMuted'; sceneId: string; layerId: string; muted: boolean }
  | { type: 'layer/setSolo'; sceneId: string; layerId: string; solo: boolean }
  | { type: 'layer/setParam'; sceneId: string; layerId: string; param: string; value: number | number[] }
  | { type: 'layer/setShaderKey'; sceneId: string; layerId: string; shaderKey: string }
  | { type: 'bpm/set'; bpm: number }
  | { type: 'output/setResolution'; width: number; height: number }
  | { type: 'output/setDpr'; dpr: number }
  | { type: 'app/setBlackout'; blackout: boolean }
  | { type: 'midi/addBinding'; binding: MidiBinding }
  | { type: 'midi/removeBinding'; bindingId: string }
  | { type: 'midi/updateBinding'; binding: MidiBinding }
  | { type: 'midi/setDeviceEnabled'; deviceId: string; enabled: boolean }
  | { type: 'midi/setClockSync'; enabled: boolean }
  | { type: 'shader/saveCustom'; key: string; name: string; wgsl: string; params: Record<string, ShaderParamDef> }
  | { type: 'shader/removeCustom'; key: string }
  | { type: 'app/setLiveScript'; script: string };

// ---------- Store interface ----------
export interface Store {
  getState(): ProjectState;
  dispatch(cmd: Command, opts?: { undoable?: boolean; coalesceKey?: string }): void;
  subscribe(fn: (state: ProjectState, cmd: Command | null) => void): () => void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
}

// ---------- Frame context (揮発データ: ストアに入れない) ----------
export interface AudioFrame {
  bands: Float32Array;   // 8バンド 0..1
  bass: number;          // (b0+b1)/2
  mid: number;           // (b2+b3+b4)/3
  treble: number;        // (b5+b6+b7)/3
}

export interface BeatFrame {
  bpm: number;
  beat: number;    // 連続ビートカウント(小数)
  phase: number;   // beat % 1
}

export interface FrameContext {
  time: number;          // 秒
  frame: number;
  audio: AudioFrame;
  beat: BeatFrame;
}

// ---------- Engine interfaces ----------
export interface AudioEngine {
  initMic(): Promise<void>;
  initSystem(): Promise<void>;
  stop(): void;
  /** 毎フレーム renderer が pull。alloc なし(内部バッファ返却)。 */
  getFrame(): AudioFrame;
  readonly active: boolean;
  readonly sourceKind: 'none' | 'mic' | 'system';
}

export interface BpmClock {
  tap(): void;
  setBpm(bpm: number): void;
  /** MIDI clock pulse (24 PPQN) */
  clockPulse(nowMs: number): void;
  transportStart(): void;
  transportStop(): void;
  getFrame(): BeatFrame;
}

/** WGSL コンパイル診断(Monaco マーカー用。行はユーザーコード基準に補正済み) */
export interface ShaderDiagnostic {
  line: number;
  column: number;
  length: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
}

export interface LayerTiming {
  layerId: string;
  ms: number;
}

export interface EngineStats {
  fps: number;
  cpuFrameMs: number;
  layerCount: number;
  layerTimings: LayerTiming[];
  gpuTimingAvailable: boolean;
}

// ---------- Live coding: 継続値モジュレータ ----------
// ライブコーディングDSLが「関数」を渡したパラメータは、Immer/undo履歴を経由せず
// 毎フレーム直接 GPU バッファへ書き込む(オーディオ反応的な連続変調のため)。
export interface ModulatorContext {
  t: number;
  beat: number;
  phase: number;
  bass: number;
  mid: number;
  treble: number;
}

export type ModulatorFn = (ctx: ModulatorContext) => number | number[];

export interface LiveModulatorRegistry {
  set(layerId: string, param: string, fn: ModulatorFn): void;
  clear(layerId: string, param: string): void;
  clearLayer(layerId: string): void;
  clearAll(): void;
  get(layerId: string, param: string): ModulatorFn | undefined;
  has(layerId: string): boolean;
}

/** レンダラー公開インターフェース(UI から触るのはこれだけ) */
export interface RendererFacade {
  /** シェーダーの検証(ライブエディタ用)。パイプラインは差し替えない。 */
  validateShader(wgslBody: string, params?: Record<string, ShaderParamDef>): Promise<ShaderDiagnostic[]>;
  /** サムネイル: layerId -> ImageBitmap(なければ undefined)。UI が定期 pull。 */
  getThumbnail(layerId: string): ImageBitmap | undefined;
  getStats(): EngineStats;
  setOutputCanvas(canvas: OffscreenCanvas | null): void;  // 出力ウィンドウ用
  destroy(): void;
}
