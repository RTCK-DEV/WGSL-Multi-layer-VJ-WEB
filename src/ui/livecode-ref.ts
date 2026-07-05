/** ライブコーディングDSL APIインスタンスの参照ホルダー(main.ts が起動時に設定、UIから読む) */
import type { LiveCodeApi } from '../livecode';

let ref: LiveCodeApi | null = null;

export function setLiveCodeApi(api: LiveCodeApi): void {
  ref = api;
}

export function getLiveCodeApi(): LiveCodeApi {
  if (!ref) throw new Error('LiveCodeApi is not ready yet');
  return ref;
}
