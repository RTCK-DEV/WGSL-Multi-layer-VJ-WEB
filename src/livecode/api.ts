/**
 * ライブコーディング Scene Script 用の Hydra 風チェーンAPI。
 * リテラル値を渡すと store.dispatch(undoable) で一発反映、関数を渡すと
 * LiveModulatorRegistry に登録して毎フレーム連続変調する(undo履歴を汚さない)。
 */
import type { BlendMode, BpmClock, LiveModulatorRegistry, ModulatorFn, Store } from '../core/types';

export interface LiveCodeApiDeps {
  store: Store;
  bpmClock: BpmClock;
  modulators: LiveModulatorRegistry;
}

export interface LayerHandle {
  blend(mode: BlendMode): LayerHandle;
  opacity(value: number | ModulatorFn): LayerHandle;
  mute(on?: boolean): LayerHandle;
  solo(on?: boolean): LayerHandle;
  select(): LayerHandle;
  param(name: string, value: number | number[] | ModulatorFn): LayerHandle;
  clear(name: string): LayerHandle;
  clearAll(): LayerHandle;
}

export interface LiveCodeApi {
  layer(index: number): LayerHandle;
  scene: {
    next(): void;
    prev(): void;
    recall(index: number, opts?: { beats?: number }): void;
    add(name?: string): void;
  };
  bpm: {
    tap(): void;
    set(value: number): void;
  };
  blackout(on: boolean): void;
  /**
   * layer(index) が存在しないレイヤーを指した場合などに溜まる警告を取り出してクリアする。
   * no-op自体は例外を投げない設計だが、「コードは実行できたのに何も起きない」という
   * サイレントな混乱を避けるため、UI側で表示できるようにする。
   */
  drainWarnings(): string[];
}

/** opacity はシェーダーパラメータではなくレイヤー自体のフィールドなので専用キーで管理する。 */
export const OPACITY_MODULATOR_KEY = '__opacity__';

function isModulatorFn(value: unknown): value is ModulatorFn {
  return typeof value === 'function';
}

interface ResolvedLayer {
  sceneId: string;
  layerId: string;
}

export function createLiveCodeApi(deps: LiveCodeApiDeps): LiveCodeApi {
  const { store, bpmClock, modulators } = deps;
  const warnings: string[] = [];

  function warn(message: string): void {
    warnings.push(message);
  }

  function resolveLayer(index: number): ResolvedLayer | null {
    const state = store.getState();
    const scene = state.scenes[state.activeSceneIndex];
    const layer = scene?.layers[index];
    if (!scene || !layer) {
      warn(`layer(${index}) は現在のシーンに存在しません(レイヤー数: ${scene?.layers.length ?? 0})`);
      return null;
    }
    return { sceneId: scene.id, layerId: layer.id };
  }

  function currentLayer(resolved: ResolvedLayer) {
    const state = store.getState();
    const scene = state.scenes.find((s) => s.id === resolved.sceneId);
    return scene?.layers.find((l) => l.id === resolved.layerId);
  }

  function createLayerHandle(index: number): LayerHandle {
    // レイヤー解決はハンドル生成時に一度だけ行う(チェーン中の一貫性のため)。
    // 存在しないindexなら以降の全メソッドをno-opにする。
    const resolved = resolveLayer(index);

    const handle: LayerHandle = {
      blend(mode) {
        if (resolved) {
          store.dispatch(
            { type: 'layer/setBlend', sceneId: resolved.sceneId, layerId: resolved.layerId, blend: mode },
            { undoable: true },
          );
        }
        return handle;
      },
      opacity(value) {
        if (!resolved) return handle;
        if (isModulatorFn(value)) {
          modulators.set(resolved.layerId, OPACITY_MODULATOR_KEY, value);
        } else {
          modulators.clear(resolved.layerId, OPACITY_MODULATOR_KEY);
          store.dispatch(
            { type: 'layer/setOpacity', sceneId: resolved.sceneId, layerId: resolved.layerId, value },
            { undoable: true },
          );
        }
        return handle;
      },
      mute(on) {
        if (!resolved) return handle;
        const next = on ?? !(currentLayer(resolved)?.muted ?? false);
        store.dispatch(
          { type: 'layer/setMuted', sceneId: resolved.sceneId, layerId: resolved.layerId, muted: next },
          { undoable: true },
        );
        return handle;
      },
      solo(on) {
        if (!resolved) return handle;
        const next = on ?? !(currentLayer(resolved)?.solo ?? false);
        store.dispatch(
          { type: 'layer/setSolo', sceneId: resolved.sceneId, layerId: resolved.layerId, solo: next },
          { undoable: true },
        );
        return handle;
      },
      select() {
        if (resolved) store.dispatch({ type: 'layer/select', layerId: resolved.layerId });
        return handle;
      },
      param(name, value) {
        if (!resolved) return handle;
        if (isModulatorFn(value)) {
          modulators.set(resolved.layerId, name, value);
        } else {
          modulators.clear(resolved.layerId, name);
          store.dispatch(
            { type: 'layer/setParam', sceneId: resolved.sceneId, layerId: resolved.layerId, param: name, value },
            { undoable: true },
          );
        }
        return handle;
      },
      clear(name) {
        if (resolved) modulators.clear(resolved.layerId, name);
        return handle;
      },
      clearAll() {
        if (resolved) modulators.clearLayer(resolved.layerId);
        return handle;
      },
    };

    return handle;
  }

  return {
    layer(index) {
      return createLayerHandle(index);
    },

    scene: {
      next() {
        const state = store.getState();
        if (state.scenes.length === 0) return;
        const index = (state.activeSceneIndex + 1) % state.scenes.length;
        store.dispatch({
          type: 'scene/crossfadeTo', index,
          durationBeats: state.crossfadeBeats, startBeat: bpmClock.getFrame().beat,
        });
      },
      prev() {
        const state = store.getState();
        if (state.scenes.length === 0) return;
        const index = (state.activeSceneIndex - 1 + state.scenes.length) % state.scenes.length;
        store.dispatch({
          type: 'scene/crossfadeTo', index,
          durationBeats: state.crossfadeBeats, startBeat: bpmClock.getFrame().beat,
        });
      },
      recall(index, opts) {
        const state = store.getState();
        if (index < 0 || index >= state.scenes.length) {
          warn(`scene.recall(${index}) は存在しないシーンです(シーン数: ${state.scenes.length})`);
          return;
        }
        store.dispatch({
          type: 'scene/crossfadeTo', index,
          durationBeats: opts?.beats ?? state.crossfadeBeats, startBeat: bpmClock.getFrame().beat,
        });
      },
      add(name) {
        store.dispatch({ type: 'scene/add', name }, { undoable: true });
      },
    },

    bpm: {
      tap() {
        bpmClock.tap();
        store.dispatch({ type: 'bpm/set', bpm: bpmClock.getFrame().bpm });
      },
      set(value) {
        bpmClock.setBpm(value);
        store.dispatch({ type: 'bpm/set', bpm: value });
      },
    },

    blackout(on) {
      store.dispatch({ type: 'app/setBlackout', blackout: on });
    },

    drainWarnings() {
      return warnings.splice(0, warnings.length);
    },
  };
}
