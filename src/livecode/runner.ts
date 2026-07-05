/** Scene Script のサンドボックス実行(`new Function` でグローバルスコープ汚染を避ける)。 */
import type { LiveCodeApi } from './api';

export interface RunResult {
  ok: boolean;
  error?: string;
}

export function runLiveScript(code: string, api: LiveCodeApi): RunResult {
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval -- ライブコーディングDSLの実行そのものが目的
    const fn = new Function('layer', 'scene', 'bpm', 'blackout', code);
    fn(api.layer, api.scene, api.bpm, api.blackout);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
