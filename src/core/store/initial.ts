import type { Layer, ProjectState } from '../types';
import { newId } from './ids';

export function createInitialProject(): ProjectState {
  return {
    version: 1,
    name: 'Untitled Project',
    scenes: [
      {
        id: newId('scene'),
        name: 'Scene 1',
        layers: [],
      },
    ],
    activeSceneIndex: 0,
    selectedLayerId: null,
    crossfade: {
      active: false,
      toSceneIndex: 0,
      startBeat: 0,
      durationBeats: 0,
    },
    autoSwitch: {
      enabled: false,
      mode: 'sequential',
      intervalBeats: 16,
    },
    crossfadeBeats: 2,
    bpm: 120,
    output: {
      width: 1920,
      height: 1080,
      dpr: 1,
    },
    blackout: false,
    midi: {
      bindings: [],
      clockSync: false,
      devices: {},
    },
    customShaders: {},
    liveScript: '',
  };
}

/**
 * 初回起動時(保存済みプロジェクトが存在しない場合)のデモシーン。
 * 旧GLSL版が起動時に Crystal-KIFS 単層を自動生成していたのを踏襲しつつ、
 * このアプリの主眼であるレイヤー合成が伝わるよう2層構成にしている。
 * createInitialProject() 自体は空のスケルトンのまま(store/migrateの内部フォールバックや
 * テストで使うため)にし、デモ演出はこちらの専用関数に分離する。
 */
export function createDemoProject(): ProjectState {
  const project = createInitialProject();
  const scene = project.scenes[0]!;

  const demoLayers: Layer[] = [
    {
      id: newId('layer'),
      shaderKey: 'crystal-kifs',
      name: 'Crystal KIFS [Fractal]',
      blend: 'NORMAL',
      opacity: 1,
      muted: false,
      solo: false,
      params: { fold: 1.5, scale: 2.0, color: 0.5 },
    },
    {
      id: newId('layer'),
      shaderKey: 'cyberscape',
      name: 'Cyberscape [Neon]',
      blend: 'SCREEN',
      opacity: 0.6,
      muted: false,
      solo: false,
      params: { velocity: 1.0, density: 20.0, height: 1.0 },
    },
  ];

  scene.layers = demoLayers;
  project.selectedLayerId = demoLayers[0]!.id;
  project.name = 'Demo';
  return project;
}
