import type { ProjectState } from '../core/types';
import { migrate } from './migrate';

export function exportProject(state: ProjectState): void {
  const json = JSON.stringify(state, null, 2);
  const blob = new Blob([ json ], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');

  anchor.href = url;
  anchor.download = `${sanitizeFilename(state.name)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importProject(file: File): Promise<ProjectState> {
  const text = await file.text();
  try {
    return migrate(JSON.parse(text));
  } catch (error) {
    throw new Error(`Failed to import project from ${file.name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function sanitizeFilename(value: string): string {
  const sanitized = value.trim().replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '');
  return sanitized || 'vj-project';
}
