import { createStore, get, set, del, keys } from "idb-keyval";
import type { Project, Track } from "@/types";

/**
 * Local persistence layer (IndexedDB via idb-keyval).
 *
 * Key layout inside the "sonare" database/store:
 *   audio:{audioKey}   -> Blob         (raw recorded/imported audio)
 *   project:{id}       -> Project      (metadata only — never Blobs)
 *   projects-index     -> string[]     (ids of non-deleted projects)
 *   autosave           -> Project      (crash-recovery snapshot)
 */

/**
 * Lazy store factory: idb-keyval's createStore() chama indexedDB.open() de
 * imediato, o que quebraria o SSR/prerender do Next.js (indexedDB não existe
 * no Node). A instância só é criada no primeiro acesso, sempre no browser.
 */
type Store = ReturnType<typeof createStore>;
let storeInstance: Store | undefined;
function store(): Store {
  if (!storeInstance) {
    storeInstance = createStore("sonare", "keyval");
  }
  return storeInstance;
}

const audioKey = (key: string) => `audio:${key}`;
const projectKey = (id: string) => `project:${id}`;
const PROJECTS_INDEX = "projects-index";
const AUTOSAVE = "autosave";

const newId = (): string => crypto.randomUUID();

async function readIndex(): Promise<string[]> {
  const index = await get<string[]>(PROJECTS_INDEX, store());
  return Array.isArray(index) ? index : [];
}

async function writeIndex(ids: string[]): Promise<void> {
  await set(PROJECTS_INDEX, ids, store());
}

async function addToIndex(id: string): Promise<void> {
  const index = await readIndex();
  if (!index.includes(id)) {
    index.push(id);
    await writeIndex(index);
  }
}

async function removeFromIndex(id: string): Promise<void> {
  const index = await readIndex();
  const next = index.filter((existing) => existing !== id);
  if (next.length !== index.length) {
    await writeIndex(next);
  }
}

/* ------------------------------ Audio blobs ------------------------------ */

export async function saveAudioBlob(key: string, blob: Blob): Promise<void> {
  await set(audioKey(key), blob, store());
}

export async function getAudioBlob(key: string): Promise<Blob | undefined> {
  return get<Blob>(audioKey(key), store());
}

export async function deleteAudioBlob(key: string): Promise<void> {
  await del(audioKey(key), store());
}

export async function audioKeyExists(key: string): Promise<boolean> {
  if (!key) return false;
  const blob = await getAudioBlob(key);
  return blob !== undefined;
}

/* -------------------------------- Projects ------------------------------- */

export async function saveProject(project: Project): Promise<void> {
  await set(projectKey(project.id), project, store());
  if (!project.deletedAt) {
    await addToIndex(project.id);
  }
}

export async function getProject(id: string): Promise<Project | undefined> {
  return get<Project>(projectKey(id), store());
}

export async function listProjects(): Promise<Project[]> {
  const index = await readIndex();
  const projects = await Promise.all(index.map((id) => getProject(id)));
  return projects
    .filter((p): p is Project => p !== undefined && !p.deletedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Soft-delete: marks deletedAt, removes the id from the projects index
 * and deletes every audio blob referenced by the project's tracks.
 */
export async function deleteProject(id: string): Promise<void> {
  const project = await getProject(id);
  if (!project) return;

  await Promise.all(
    project.tracks.flatMap((track) =>
      [track.audioKey, ...(track.takes ?? []).map((take) => take.audioKey)]
        .filter((key) => key)
        .map((key) => deleteAudioBlob(key)),
    ),
  );

  await set(
    projectKey(id),
    { ...project, deletedAt: new Date().toISOString() },
    store(),
  );
  await removeFromIndex(id);
}

/**
 * Deep copy of a project: new project id, new track ids, new audioKeys
 * and duplicated audio blobs so both projects stay fully independent.
 */
export async function duplicateProject(id: string): Promise<Project | undefined> {
  const source = await getProject(id);
  if (!source) return undefined;

  const now = new Date().toISOString();

  const tracks: Track[] = await Promise.all(
    source.tracks.map(async (track) => {
      let nextAudioKey = track.audioKey;
      if (track.audioKey) {
        const blob = await getAudioBlob(track.audioKey);
        if (blob) {
          nextAudioKey = newId();
          await saveAudioBlob(nextAudioKey, blob);
        }
      }
      // Duplicate stacked take blobs too, so deleting one project never
      // removes audio still referenced by the other.
      let nextTakes = track.takes;
      if (track.takes) {
        nextTakes = await Promise.all(
          track.takes.map(async (take) => {
            const blob = await getAudioBlob(take.audioKey);
            if (!blob) return take;
            const takeKey = newId();
            await saveAudioBlob(takeKey, blob);
            return { ...take, audioKey: takeKey };
          }),
        );
      }
      return { ...track, id: newId(), audioKey: nextAudioKey, takes: nextTakes };
    }),
  );

  const copy: Project = {
    ...source,
    id: newId(),
    name: `${source.name} (cópia)`,
    tracks,
    createdAt: now,
    updatedAt: now,
    deletedAt: undefined,
    cloudId: undefined,
  };

  await saveProject(copy);
  return copy;
}

/* -------------------------------- Autosave ------------------------------- */

export async function saveAutosave(project: Project): Promise<void> {
  await set(AUTOSAVE, project, store());
}

export async function getAutosave(): Promise<Project | undefined> {
  return get<Project>(AUTOSAVE, store());
}

export async function clearAutosave(): Promise<void> {
  await del(AUTOSAVE, store());
}

/* --------------------------------- Debug --------------------------------- */

/** Lists every raw key in the store (diagnostics / migrations). */
export async function listAllKeys(): Promise<IDBValidKey[]> {
  return keys(store());
}
