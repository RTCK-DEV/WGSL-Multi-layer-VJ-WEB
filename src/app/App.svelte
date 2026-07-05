<script lang="ts">
  /** アプリシェル: header / scene rail / preview / inspector / layer deck */
  import Header from '../ui/Header.svelte';
  import ScenePanel from '../ui/panels/ScenePanel.svelte';
  import Inspector from '../ui/panels/Inspector.svelte';
  import LayerDeck from '../ui/panels/LayerDeck.svelte';
  import Toasts from '../ui/Toasts.svelte';
  import DebugPanel from '../ui/panels/DebugPanel.svelte';
  import LiveCodePanel from '../ui/panels/LiveCodePanel.svelte';
  import MidiConfigModal from '../ui/panels/MidiConfigModal.svelte';
  import { project } from '../ui/store-bridge.svelte';
  import { modals } from '../ui/modals.svelte';

  let { previewCanvas }: { previewCanvas: HTMLCanvasElement } = $props();

  let previewHost: HTMLDivElement | undefined = $state();
  $effect(() => {
    if (previewHost && previewCanvas.parentElement !== previewHost) {
      previewHost.appendChild(previewCanvas);
    }
  });

  const blackout = $derived(project().blackout);
</script>

<div class="shell">
  <Header />
  <div class="body">
    <aside class="rail"><ScenePanel /></aside>
    <main class="stage">
      <div class="preview" bind:this={previewHost} class:blackout>
        {#if blackout}<div class="blackout-tag mono">BLACKOUT</div>{/if}
      </div>
      <LayerDeck />
    </main>
    <aside class="side"><Inspector /></aside>
  </div>
  <Toasts />
  <DebugPanel />
  <LiveCodePanel />
  {#if modals.midiConfig}
    <MidiConfigModal onclose={() => (modals.midiConfig = false)} />
  {/if}
</div>

<style>
  .shell { display: flex; flex-direction: column; height: 100vh; gap: 6px; padding: 6px; }
  .body { display: flex; gap: 6px; flex: 1; min-height: 0; }
  .rail { width: var(--scene-w); flex: none; display: flex; }
  .side { width: var(--inspector-w); flex: none; display: flex; }
  .rail > :global(*), .side > :global(*) { flex: 1; }
  .stage { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .preview {
    flex: 1; min-height: 0; position: relative;
    background: var(--bg-0);
    border: 1px solid var(--stroke); border-radius: var(--radius);
    display: grid; place-items: center; overflow: hidden;
  }
  .preview :global(canvas) {
    max-width: 100%; max-height: 100%;
    object-fit: contain; display: block;
  }
  .preview.blackout :global(canvas) { opacity: 0; }
  .blackout-tag {
    position: absolute; inset: 0; display: grid; place-items: center;
    color: var(--hot); font-size: 14px; letter-spacing: 0.3em;
    animation: blink-warn 1.2s infinite;
  }
</style>
