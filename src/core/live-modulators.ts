/**
 * ライブコーディングDSLが登録する継続値モジュレータの管理。
 * Immer/undo履歴を経由せず、レンダラーが毎フレーム直接読み出して
 * ParamPacker へ書き込む(オーディオ反応/LFO的な連続変調を安価に行うため)。
 */
import type { LiveModulatorRegistry, ModulatorFn } from './types';

export function createLiveModulatorRegistry(): LiveModulatorRegistry {
  const layers = new Map<string, Map<string, ModulatorFn>>();

  return {
    set(layerId, param, fn) {
      let params = layers.get(layerId);
      if (!params) {
        params = new Map();
        layers.set(layerId, params);
      }
      params.set(param, fn);
    },

    clear(layerId, param) {
      const params = layers.get(layerId);
      if (!params) return;
      params.delete(param);
      if (params.size === 0) layers.delete(layerId);
    },

    clearLayer(layerId) {
      layers.delete(layerId);
    },

    clearAll() {
      layers.clear();
    },

    get(layerId, param) {
      return layers.get(layerId)?.get(param);
    },

    has(layerId) {
      return layers.has(layerId);
    },
  };
}
