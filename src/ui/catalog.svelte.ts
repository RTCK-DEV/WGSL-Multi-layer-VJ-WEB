/** UIが参照するシェーダーカタログ(main.ts が registry から投入) */
import type { ShaderModuleDef } from '../core/types';

export const shaderCatalog = $state<{ list: ShaderModuleDef[] }>({ list: [] });

export function findShader(key: string): ShaderModuleDef | undefined {
  return shaderCatalog.list.find((s) => s.key === key);
}
