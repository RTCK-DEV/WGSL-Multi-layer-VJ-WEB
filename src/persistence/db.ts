import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { ProjectState } from '../core/types';
import { migrate } from './migrate';

const DB_NAME = 'vj-gpu';
const DB_VERSION = 1;
const PROJECTS_STORE = 'projects';
const AUTOSAVE_KEY = 'autosave';

interface ProjectRecord {
  id: string;
  state: ProjectState;
  updatedAt: number;
}

interface VjGpuDb extends DBSchema {
  projects: {
    key: string;
    value: ProjectRecord;
  };
}

let dbPromise: Promise<IDBPDatabase<VjGpuDb>> | null = null;

export async function saveAutosave(state: ProjectState): Promise<void> {
  const db = await getDb();
  await db.put(PROJECTS_STORE, {
    id: AUTOSAVE_KEY,
    state,
    updatedAt: Date.now(),
  });
}

export async function loadAutosave(): Promise<ProjectState | null> {
  const db = await getDb();
  const record = await db.get(PROJECTS_STORE, AUTOSAVE_KEY);
  return record ? migrate(record.state) : null;
}

function getDb(): Promise<IDBPDatabase<VjGpuDb>> {
  dbPromise ??= openDB<VjGpuDb>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(PROJECTS_STORE)) {
        db.createObjectStore(PROJECTS_STORE, { keyPath: 'id' });
      }
    },
  });
  return dbPromise;
}
