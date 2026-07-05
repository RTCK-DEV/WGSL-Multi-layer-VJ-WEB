import type { ProjectState } from '../types';
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
