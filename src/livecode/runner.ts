/** Scene Script のサンドボックス実行(`new Function` でグローバルスコープ汚染を避ける)。 */
import type { LiveCodeApi } from './api';

export interface RunResult {
  ok: boolean;
  error?: string;
  /** layer(index)が存在しないなど、例外にはならないが気づきにくい問題への警告。 */
  warnings: string[];
}

export function runLiveScript(code: string, api: LiveCodeApi): RunResult {
  // 実行前の残留分をクリアしておく(前回evalの警告を今回の結果に混ぜないため)。
  api.drainWarnings();
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- ライブコーディングDSLの実行そのものが目的
    const fn = new Function('layer', 'scene', 'bpm', 'blackout', code);
    fn(api.layer, api.scene, api.bpm, api.blackout);
    return { ok: true, warnings: api.drainWarnings() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), warnings: api.drainWarnings() };
  }
}
