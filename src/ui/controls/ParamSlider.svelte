<script lang="ts">
  /** ラベル+数値+スライダーの標準パラメータ行 */
  let { label, value, min, max, step, onchange }: {
    label: string; value: number; min: number; max: number; step: number;
    onchange: (v: number) => void;
  } = $props();

  const fill = $derived(((value - min) / (max - min || 1)) * 100);

  function oninput(e: Event) {
    onchange(Number((e.target as HTMLInputElement).value));
  }
</script>

<label class="row">
  <span class="head">
    <span class="lab">{label}</span>
    <span class="val mono">{value.toFixed(3)}</span>
  </span>
  <input type="range" {min} {max} {step} {value} style="--fill:{fill}%" {oninput} />
</label>

<style>
  .row { display: flex; flex-direction: column; gap: 2px; }
  .head { display: flex; justify-content: space-between; align-items: baseline; }
  .lab { font-size: 11px; color: var(--tx-2); }
  .val { font-size: 10px; color: var(--tx-3); }
</style>
