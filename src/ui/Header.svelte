<script lang="ts">
  /** ステータスヘッダー: ロゴ / BPM+TAP / オーディオメーター / MIDI / BLACKOUT */
  import { project, dispatch, getStore } from './store-bridge.svelte';
  import { live } from './live.svelte';
  import { appEvents } from '../app/app-events';
  import { modals } from './modals.svelte';

  const p = $derived(project());

  function tap() { appEvents.emit('bpm:tap'); }
  function toggleBlackout() {
    dispatch({ type: 'app/setBlackout', blackout: !p.blackout });
  }
  function undo() { getStore().undo(); }
  function redo() { getStore().redo(); }
  function toggleWebcam() { appEvents.emit(live.webcamActive ? 'webcam:stop' : 'webcam:start'); }
  function toggleLiveCode() {
    if (modals.livecode) { modals.livecode = false; return; }
    modals.livecodeTab = 'script';
    modals.livecode = true;
  }
</script>

<header class="hdr panel">
  <div class="brand mono">VJ<span class="accent">·</span>GPU</div>

  <div class="group">
    <span class="microlabel">BPM</span>
    <span class="bpm mono" class:beat={live.phase < 0.15}>{live.bpm.toFixed(1)}</span>
    <button class="btn" onclick={tap}>TAP</button>
  </div>

  <div class="meter" title="audio 8-band">
    {#each live.bands as b, i (i)}
      <div class="bar"><div class="fill" style="height:{Math.round(b * 100)}%"></div></div>
    {/each}
  </div>

  <div class="group">
    <button class="btn" class:on={live.audioSource === 'mic'} onclick={() => appEvents.emit('audio:mic')}>MIC</button>
    <button class="btn" class:on={live.audioSource === 'system'} onclick={() => appEvents.emit('audio:system')}>SYS</button>
    <button class="btn" class:on={live.webcamActive} onclick={toggleWebcam}>CAM</button>
  </div>

  <div class="spacer"></div>

  <div class="group">
    <button class="btn" onclick={undo} title="Undo (⌘Z)">↩</button>
    <button class="btn" onclick={redo} title="Redo (⇧⌘Z)">↪</button>
  </div>

  <button
    class="btn" class:on={live.midiConnected > 0}
    onclick={() => (modals.midiConfig = true)}
    title="MIDI Configuration"
  >
    <span class="dot" class:ok={live.midiConnected > 0}></span> MIDI {live.midiConnected}
  </button>

  <button class="btn" class:on={modals.debugPanel} onclick={() => (modals.debugPanel = !modals.debugPanel)}>
    <span class="mono fps">{live.fps} fps</span>
  </button>

  <button class="btn" class:on={modals.livecode} onclick={toggleLiveCode} title="Live Code (Shader / Script)">CODE</button>
  <button class="btn" class:on={live.outputOpen} onclick={() => appEvents.emit('output:open')}>POPUP ↗</button>
  <button class="btn" onclick={() => appEvents.emit('io:export')}>SAVE</button>
  <button class="btn" onclick={() => appEvents.emit('io:import')}>LOAD</button>

  <button class="btn hot" class:on={p.blackout} onclick={toggleBlackout}>BLACKOUT</button>
</header>

<style>
  .hdr {
    height: var(--header-h); flex: none;
    flex-direction: row; align-items: center;
    gap: 14px; padding: 0 12px;
  }
  .brand { font-size: 15px; font-weight: 700; letter-spacing: 0.06em; }
  .accent { color: var(--acc); }
  .group { display: flex; align-items: center; gap: 6px; }
  .spacer { flex: 1; }
  .bpm { font-size: 15px; min-width: 52px; text-align: right; transition: color .05s; }
  .bpm.beat { color: var(--ok); }
  .fps { color: var(--tx-3); font-size: 11px; }
  .meter { display: flex; gap: 2px; height: 26px; align-items: flex-end; }
  .bar { width: 5px; height: 100%; background: var(--bg-3); border-radius: 1px; position: relative; overflow: hidden; }
  .fill {
    position: absolute; bottom: 0; left: 0; right: 0;
    background: linear-gradient(to top, var(--meter-lo), var(--meter-hi));
  }
  .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--tx-3); }
  .dot.ok { background: var(--ok); box-shadow: 0 0 6px var(--ok); }
</style>
