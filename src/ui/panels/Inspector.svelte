<script lang="ts">
  /** インスペクタ: 選択レイヤーのパラメータを ShaderParamDef から自動生成 */
  import { project, dispatch } from '../store-bridge.svelte';
  import { findShader } from '../catalog.svelte';
  import ParamSlider from '../controls/ParamSlider.svelte';
  import ColorParam from '../controls/ColorParam.svelte';

  const p = $derived(project());
  const scene = $derived(p.scenes[p.activeSceneIndex]);
  const layer = $derived(scene?.layers.find((l) => l.id === p.selectedLayerId));
  const def = $derived(layer ? findShader(layer.shaderKey) : undefined);

  function setParam(param: string, value: number | number[]) {
    if (!scene || !layer) return;
    dispatch(
      { type: 'layer/setParam', sceneId: scene.id, layerId: layer.id, param, value },
      { undoable: true, coalesceKey: `pp:${layer.id}:${param}` },
    );
  }
</script>

<div class="panel">
  <div class="panel-head">
    <span class="microlabel">Inspector</span>
    {#if layer}<span class="lname">{layer.name}</span>{/if}
  </div>

  <div class="body">
    {#if !layer || !def}
      <div class="empty">レイヤーを選択するとパラメータが表示されます</div>
    {:else}
      {#each Object.entries(def.params) as [key, pd] (key)}
        {#if pd.type === 'color'}
          <ColorParam
            label={pd.label ?? key}
            value={(layer.params[key] as number[] | undefined) ?? (pd.default as number[])}
            onchange={(v) => setParam(key, v)}
          />
        {:else if pd.type === 'f32'}
          <ParamSlider
            label={pd.label ?? key}
            value={(layer.params[key] as number | undefined) ?? (pd.default as number)}
            min={pd.min ?? 0} max={pd.max ?? 1} step={pd.step ?? 0.001}
            onchange={(v) => setParam(key, v)}
          />
        {:else}
          <!-- vec2 / vec3: 成分スライダー -->
          {#each ((layer.params[key] as number[] | undefined) ?? (pd.default as number[])) as comp, ci (ci)}
            <ParamSlider
              label={`${pd.label ?? key}.${'xyz'[ci]}`}
              value={comp}
              min={pd.min ?? 0} max={pd.max ?? 1} step={pd.step ?? 0.001}
              onchange={(v) => {
                const cur = [...(((layer!.params[key]) as number[] | undefined) ?? (pd.default as number[]))];
                cur[ci] = v;
                setParam(key, cur);
              }}
            />
          {/each}
        {/if}
      {/each}
      {#if Object.keys(def.params).length === 0}
        <div class="empty">このシェーダーに調整パラメータはありません</div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .lname { font-size: 12px; font-weight: 600; color: var(--acc); }
  .body { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 12px; }
  .empty { color: var(--tx-3); font-size: 12px; text-align: center; margin-top: 24px; line-height: 1.6; }
</style>
