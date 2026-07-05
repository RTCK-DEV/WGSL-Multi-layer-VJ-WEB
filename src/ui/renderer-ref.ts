/** RendererFacade インスタンスの参照ホルダー(main.ts が起動時に設定、UIから読む) */
import type { RendererFacade } from '../core/types';

let ref: RendererFacade | null = null;

export function setRenderer(renderer: RendererFacade): void {
  ref = renderer;
}

export function getRenderer(): RendererFacade {
  if (!ref) throw new Error('Renderer is not ready yet');
  return ref;
}
