/**
 * 起動シーケンス:
 * GPU init → store 復元 → renderer/audio/bpm/midi 組み立て → UI mount → rAF ループ
 */
import { mount } from 'svelte';
import './ui/theme.css';
import App from './app/App.svelte';
import { createStore } from './core/store/store';
import { createInitialProject } from './core/store/initial';
import { loadAutosave } from './persistence/db';
import { attachAutosave } from './persistence/autosave';
import { exportProject, importProject } from './persistence/file-io';
import { BUILTIN_SHADERS } from './shaders/registry';
import { Renderer } from './gpu/renderer';
import { AudioEngineImpl } from './audio/audio-engine';
import { BpmClockImpl } from './sync/bpm-clock';
import { createMidiSystem } from './midi';
import { connectStore, getStore } from './ui/store-bridge.svelte';
import { live } from './ui/live.svelte';
import { thumbnails } from './ui/thumbs.svelte';
import { shaderCatalog } from './ui/catalog.svelte';
import { appEvents } from './app/app-events';
import { toast } from './ui/toast.svelte';
import { midiState } from './ui/midi-state.svelte';
import { setMidiSystem } from './ui/midi-ref';
import { setRenderer } from './ui/renderer-ref';
import { setLiveCodeApi } from './ui/livecode-ref';
import { openOutputWindow } from './output/output-window';
import { WebcamSource } from './video/webcam-source';
import { createLiveModulatorRegistry } from './core/live-modulators';
import { createLiveCodeApi } from './livecode';
import type { FrameContext, ShaderModuleDef } from './core/types';

async function boot(): Promise<void> {
  const root = document.getElementById('app')!;

  if (!navigator.gpu) {
    root.innerHTML =
      '<div style="display:grid;place-items:center;height:100vh;color:#9aa3b2;font-family:system-ui">' +
      '<div><h2 style="color:#e8ebf0">WebGPU が利用できません</h2>' +
      '<p>Chrome / Edge / Safari 26+ / Firefox 141+ でお試しください。</p></div></div>';
    return;
  }

  // --- shaders ---
  const shaderMap = new Map<string, ShaderModuleDef>(BUILTIN_SHADERS.map((s) => [s.key, s]));
  shaderCatalog.list = BUILTIN_SHADERS;

  const resolveShaderDefaults = (shaderKey: string) => {
    const def = shaderMap.get(shaderKey);
    const params: Record<string, number | number[]> = {};
    if (def) {
      for (const [k, pd] of Object.entries(def.params)) {
        params[k] = Array.isArray(pd.default) ? [...pd.default] : pd.default;
      }
    }
    return { name: def?.name ?? shaderKey, params };
  };

  // --- store ---
  const saved = await loadAutosave().catch(() => null);
  const store = createStore(saved ?? createInitialProject(), { resolveShaderDefaults });
  attachAutosave(store);
  connectStore(store);

  // --- engines ---
  const audio = new AudioEngineImpl();
  const bpmClock = new BpmClockImpl();
  bpmClock.setBpm(store.getState().bpm);

  let frameNo = 0;
  const t0 = performance.now();
  const frameContext = (): FrameContext => ({
    time: (performance.now() - t0) / 1000,
    frame: frameNo++,
    audio: audio.getFrame(),
    beat: bpmClock.getFrame(),
  });

  // --- webcam ---
  const webcam = new WebcamSource();

  // --- ライブコーディング用モジュレータレジストリ ---
  // レンダラー(読み取り)とDSL API(書き込み)が同一インスタンスを共有する。
  const modulators = createLiveModulatorRegistry();

  // --- renderer ---
  const canvas = document.createElement('canvas');
  const renderer = new Renderer({
    canvas,
    store,
    shaders: shaderMap,
    getFrameContext: frameContext,
    getWebcamTexture: (device) => webcam.updateTexture(device),
    modulators,
    onError: (e) => {
      console.error('[renderer]', e);
      const msg = e instanceof Error ? e.message : String(e);
      live.errorLog = [...live.errorLog.slice(-19), msg];
    },
  });
  await renderer.init();
  setRenderer(renderer);

  // --- ライブコーディング DSL API ---
  setLiveCodeApi(createLiveCodeApi({ store, bpmClock, modulators }));

  // --- MIDI ---
  const midi = createMidiSystem({
    store,
    bpmClock,
    getCrossfadeBeats: () => store.getState().crossfadeBeats,
    resolveParamRange: (shaderKey: string, param: string) => {
      const pd = shaderMap.get(shaderKey)?.params[param];
      return { min: pd?.min ?? 0, max: pd?.max ?? 1 };
    },
    onDevicesChanged: (count, devices) => {
      live.midiConnected = count;
      midiState.devices = [...devices];
    },
  });
  setMidiSystem(midi);
  midi.init().catch(() => toast('MIDI を初期化できませんでした', 'warn'));

  // --- 出力ウィンドウ ---
  let outputHandle: ReturnType<typeof openOutputWindow> | null = null;
  appEvents.on('output:open', () => {
    if (outputHandle) { outputHandle.close(); outputHandle = null; return; }
    const st = store.getState();
    const handle = openOutputWindow(st.output.width, st.output.height);
    outputHandle = handle;
    live.outputOpen = true;
    handle.canvas
      .then((offscreen) => renderer.setOutputCanvas(offscreen))
      .catch(() => toast('出力ウィンドウを開けませんでした(ポップアップブロック?)', 'error'));
    handle.onClosed(() => {
      renderer.setOutputCanvas(null);
      outputHandle = null;
      live.outputOpen = false;
    });
  });

  // --- webcam イベント配線 ---
  appEvents.on('webcam:start', () => {
    void webcam.start().then(() => { live.webcamActive = true; toast('Webカメラを開始'); })
      .catch(() => toast('カメラにアクセスできません', 'error'));
  });
  appEvents.on('webcam:stop', () => {
    webcam.stop();
    live.webcamActive = false;
  });

  // --- シーン自動切替スケジューラ ---
  // nextAutoSwitchBeat: 次に自動切替を発火するビート位置。null は非アクティブ。
  // 手動切替(MIDI含む)や設定変更が入るたびに基準を仕切り直す。
  let nextAutoSwitchBeat: number | null = null;
  store.subscribe((state, cmd) => {
    if (!cmd) return;
    if (cmd.type === 'scene/crossfadeTo' && state.autoSwitch.enabled) {
      nextAutoSwitchBeat = bpmClock.getFrame().beat + state.autoSwitch.intervalBeats;
    }
    if (cmd.type === 'scene/autoSwitch') {
      nextAutoSwitchBeat = state.autoSwitch.enabled ? bpmClock.getFrame().beat + state.autoSwitch.intervalBeats : null;
    }
  });

  function tickAutoSwitch(): void {
    const st = store.getState();
    if (!st.autoSwitch.enabled || st.crossfade.active || nextAutoSwitchBeat === null || st.scenes.length < 2) {
      return;
    }
    const beat = bpmClock.getFrame().beat;
    if (beat < nextAutoSwitchBeat) return;

    const total = st.scenes.length;
    let index = st.activeSceneIndex;
    if (st.autoSwitch.mode === 'random' && total > 1) {
      do { index = Math.floor(Math.random() * total); } while (index === st.activeSceneIndex);
    } else {
      index = (st.activeSceneIndex + 1) % total;
    }
    store.dispatch({ type: 'scene/crossfadeTo', index, durationBeats: st.crossfadeBeats, startBeat: beat });
    nextAutoSwitchBeat = beat + st.autoSwitch.intervalBeats;
  }

  // --- UI 揮発ミラー更新 (10Hz) ---
  setInterval(() => {
    const a = audio.getFrame();
    const b = bpmClock.getFrame();
    const s = renderer.getStats();
    live.fps = Math.round(s.fps);
    live.bpm = b.bpm;
    live.phase = b.phase;
    for (let i = 0; i < 8; i++) live.bands[i] = a.bands[i] ?? 0;
    live.audioSource = audio.sourceKind;
    live.cpuFrameMs = s.cpuFrameMs;
    live.layerCount = s.layerCount;
    live.gpuTimingAvailable = s.gpuTimingAvailable;
    live.layerTimings = s.layerTimings;
    tickAutoSwitch();
    // サムネイル pull
    const st = store.getState();
    const scene = st.scenes[st.activeSceneIndex];
    if (scene) {
      for (const l of scene.layers) {
        const bmp = renderer.getThumbnail(l.id);
        if (bmp) thumbnails.map[l.id] = bmp;
      }
    }
  }, 100);

  // --- UIイベント配線 ---
  appEvents.on('bpm:tap', () => {
    bpmClock.tap();
    store.dispatch({ type: 'bpm/set', bpm: bpmClock.getFrame().bpm });
  });
  appEvents.on('audio:mic', () => {
    void audio.initMic().then(() => toast('マイク入力を開始')).catch(() => toast('マイクにアクセスできません', 'error'));
  });
  appEvents.on('audio:system', () => {
    void audio.initSystem().then(() => toast('システムオーディオを開始')).catch(() => toast('キャプチャできません', 'error'));
  });
  appEvents.on('io:export', () => exportProject(store.getState()));
  appEvents.on('io:import', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const state = await importProject(f);
        store.dispatch({ type: 'project/load', state });
        toast('プロジェクトを読み込みました');
      } catch {
        toast('読み込みに失敗しました', 'error');
      }
    };
    input.click();
  });

  // --- キーボードショートカット ---
  window.addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) getStore().redo(); else getStore().undo();
    }
    if (e.key === 'b' && !mod && (e.target as HTMLElement).tagName !== 'INPUT') {
      store.dispatch({ type: 'app/setBlackout', blackout: !store.getState().blackout });
    }
  });

  // --- mount ---
  mount(App, { target: root, props: { previewCanvas: canvas } });

  renderer.start();

  // デバッグ用(開発時のみ)
  if (import.meta.env.DEV) {
    (window as unknown as Record<string, unknown>).__vj = { renderer, store, audio, bpmClock, midi, webcam };
  }
}

void boot();
