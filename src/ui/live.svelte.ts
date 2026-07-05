/**
 * 揮発データ(オーディオ/BPM/FPS)のUI表示用ミラー。
 * レンダーループとは独立に約10HzでUIへ publish される(main.tsが更新)。
 */
export const live = $state({
  fps: 0,
  bpm: 120,
  phase: 0,
  bands: new Array<number>(8).fill(0),
  midiConnected: 0,
  audioSource: 'none' as 'none' | 'mic' | 'system',
  gpuOk: true,
  webcamActive: false,
  outputOpen: false,
  cpuFrameMs: 0,
  layerCount: 0,
  gpuTimingAvailable: false,
  layerTimings: [] as { layerId: string; ms: number }[],
  errorLog: [] as string[],
});
