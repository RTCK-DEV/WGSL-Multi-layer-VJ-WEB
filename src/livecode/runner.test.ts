import { describe, expect, it } from 'vitest';
import { runLiveScript } from './runner';
import type { LiveCodeApi } from './api';

function createSpyApi(options: { warnOnLayerIndex?: number } = {}) {
  const calls: string[] = [];
  const warnings: string[] = [];
  const layerHandle: Record<string, unknown> = {};
  layerHandle.blend = (mode: string) => { calls.push(`blend:${mode}`); return layerHandle; };
  layerHandle.opacity = (v: unknown) => { calls.push(`opacity:${String(v)}`); return layerHandle; };

  const api: LiveCodeApi = {
    layer: (index: number) => {
      calls.push(`layer:${index}`);
      if (index === options.warnOnLayerIndex) {
        warnings.push(`layer(${index}) は現在のシーンに存在しません(レイヤー数: 1)`);
      }
      return layerHandle as never;
    },
    scene: {
      next: () => calls.push('scene.next'),
      prev: () => calls.push('scene.prev'),
      recall: () => calls.push('scene.recall'),
      add: () => calls.push('scene.add'),
    },
    bpm: {
      tap: () => calls.push('bpm.tap'),
      set: () => calls.push('bpm.set'),
    },
    blackout: () => calls.push('blackout'),
    drainWarnings: () => warnings.splice(0, warnings.length),
  };
  return { api, calls };
}

describe('runLiveScript', () => {
  it('executes valid script and reflects layer operations via the api', () => {
    const { api, calls } = createSpyApi();

    const result = runLiveScript("layer(0).blend('ADD').opacity(0.5); bpm.tap();", api);

    expect(result).toEqual({ ok: true, warnings: [] });
    expect(calls).toEqual(['layer:0', 'blend:ADD', 'opacity:0.5', 'bpm.tap']);
  });

  it('returns ok:false with an error message on a syntax error', () => {
    const { api } = createSpyApi();

    const result = runLiveScript('layer(0).blend(', api);

    expect(result.ok).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('returns ok:false with an error message when the script throws at runtime', () => {
    const { api } = createSpyApi();

    const result = runLiveScript('throw new Error("boom")', api);

    expect(result).toEqual({ ok: false, error: 'boom', warnings: [] });
  });

  it('surfaces warnings collected during the run (e.g. a non-existent layer index)', () => {
    const { api } = createSpyApi({ warnOnLayerIndex: 9 });

    const result = runLiveScript("layer(9).blend('ADD');", api);

    expect(result.ok).toBe(true);
    expect(result.warnings).toEqual(['layer(9) は現在のシーンに存在しません(レイヤー数: 1)']);
  });
});
