/** トースト通知(揮発) */
export interface Toast { id: number; text: string; kind: 'info' | 'warn' | 'error' }

let seq = 0;
export const toasts = $state<Toast[]>([]);

export function toast(text: string, kind: Toast['kind'] = 'info'): void {
  const t = { id: ++seq, text, kind };
  toasts.push(t);
  setTimeout(() => {
    const i = toasts.findIndex((x) => x.id === t.id);
    if (i >= 0) toasts.splice(i, 1);
  }, 3500);
}
