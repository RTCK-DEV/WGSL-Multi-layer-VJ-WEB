import { describe, expect, it } from 'vitest';
import { importLegacy, migrate } from './migrate';

describe('migrate', () => {
  it('fills missing v1 fields from the initial project shape', () => {
    const state = migrate({
      version: 1,
      name: 'Partial',
      scenes: [ { name: 'Only Scene' } ],
    });

    expect(state.version).toBe(1);
    expect(state.name).toBe('Partial');
    expect(state.scenes).toHaveLength(1);
    expect(state.scenes[0]?.name).toBe('Only Scene');
    expect(state.scenes[0]?.layers).toEqual([]);
    expect(state.bpm).toBe(120);
    expect(state.output).toEqual({ width: 1920, height: 1080, dpr: 1 });
    expect(state.midi.bindings).toEqual([]);
  });

  it('round-trips a fully populated current-shape project unchanged (export → import)', () => {
    const original = {
      version: 1,
      name: 'My Live Set',
      scenes: [
        {
          id: 'scene-1',
          name: 'Intro',
          layers: [
            {
              id: 'layer-1',
              shaderKey: 'custom:layer-1',
              name: 'My Fractal',
              blend: 'ADD',
              opacity: 0.75,
              muted: false,
              solo: true,
              params: { fold: 1.5, color: [ 1, 0.5, 0 ] },
            },
          ],
        },
      ],
      activeSceneIndex: 0,
      selectedLayerId: 'layer-1',
      crossfade: { active: false, toSceneIndex: 0, startBeat: 0, durationBeats: 0 },
      autoSwitch: { enabled: true, mode: 'random', intervalBeats: 32 },
      crossfadeBeats: 4,
      bpm: 128,
      output: { width: 1280, height: 720, dpr: 2 },
      blackout: false,
      midi: {
        bindings: [
          { id: 'bind-1', source: { kind: 'cc', channel: 1, number: 20 }, behavior: 'trigger', action: { type: 'bpm.tap' } },
        ],
        clockSync: true,
        devices: { 'device-1': { enabled: true } },
      },
      customShaders: {
        'custom:layer-1': { wgsl: 'fn shade() {}', name: 'My Fractal', params: { fold: { type: 'f32', default: 1.5, min: 0, max: 3 } } },
      },
      liveScript: "layer(0).opacity(0.5);",
    };

    // export → import と同じ経路(JSON.stringify/parse)を通した上でmigrateする
    const roundTripped = migrate(JSON.parse(JSON.stringify(original)));

    expect(roundTripped).toEqual(original);
  });
});

describe('importLegacy', () => {
  it('converts legacy scenes, blend indexes, uniforms, and shader keys', () => {
    const state = importLegacy({
      name: 'Legacy Project',
      bpm: 128,
      width: 1280,
      height: 720,
      dpr: 2,
      scenes: [
        {
          name: 'Legacy Scene',
          layers: [
            {
              key: 'old-plasma',
              blend: 1,
              opacity: 0.5,
              muted: true,
              uniformsDef: {
                u_speed: { value: 0.75 },
                u_color: { value: [ 1, 0.5, 0 ] },
                ignored: { value: 123 },
              },
            },
          ],
        },
      ],
    });

    expect(state).not.toBeNull();
    expect(state?.name).toBe('Legacy Project');
    expect(state?.bpm).toBe(128);
    expect(state?.output).toEqual({ width: 1280, height: 720, dpr: 2 });
    expect(state?.scenes[0]?.name).toBe('Legacy Scene');
    expect(state?.scenes[0]?.layers[0]).toMatchObject({
      shaderKey: 'old-plasma',
      name: 'old-plasma',
      blend: 'ADD',
      opacity: 0.5,
      muted: true,
      solo: false,
      params: {
        speed: 0.75,
        color: [ 1, 0.5, 0 ],
      },
    });
  });
});
