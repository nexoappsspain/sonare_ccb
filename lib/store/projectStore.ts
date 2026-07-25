import { create } from "zustand";
import type { Project, Track, TrackColor } from "@/types";
import {
  deleteAudioBlob,
  getProject,
  saveProject,
} from "@/lib/db/indexedDB";

/**
 * Active-project store for the studio.
 *
 * CRITICAL: this store NEVER holds audio Blobs — only audioKey strings
 * pointing to IndexedDB. Raw audio lives in refs / IndexedDB only.
 */

export const TRACK_COLORS: TrackColor[] = [
  "blue",
  "green",
  "purple",
  "orange",
  "pink",
  "teal",
  "yellow",
  "red",
];

export const DEFAULT_BPM = 120;
export const AUTOSAVE_INTERVAL_MS = 30_000;

type NewTrackInput = Partial<Omit<Track, "id" | "color">> &
  Pick<Track, "name">;

interface ProjectState {
  project: Project | null;
  isDirty: boolean;
  selectedTrackId: string | null;
  /** Track record-armed for the next recording (null = record to a new track). */
  armedTrackId: string | null;
  hydrated: boolean;

  newProject: (name: string, bpm?: number) => void;
  loadProject: (id: string) => Promise<boolean>;
  setBpm: (bpm: number) => void;
  renameProject: (name: string) => void;
  addTrack: (track: NewTrackInput) => Track | null;
  updateTrack: (id: string, patch: Partial<Track>) => void;
  removeTrack: (id: string) => void;
  moveTrack: (id: string, dir: "up" | "down") => void;
  setSelectedTrack: (id: string | null) => void;
  setArmedTrack: (id: string | null) => void;
  markSaved: () => void;
  reset: () => void;
}

const nowIso = (): string => new Date().toISOString();

/** Applies a mutation to the project, stamping updatedAt and isDirty. */
function mutateProject(
  project: Project,
  mutate: (draft: Project) => Project,
): Project {
  return { ...mutate(project), updatedAt: nowIso() };
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  project: null,
  isDirty: false,
  selectedTrackId: null,
  armedTrackId: null,
  hydrated: false,

  newProject: (name, bpm = DEFAULT_BPM) => {
    const now = nowIso();
    const project: Project = {
      id: crypto.randomUUID(),
      name,
      bpm,
      tracks: [],
      createdAt: now,
      updatedAt: now,
    };
    set({
      project,
      isDirty: true,
      selectedTrackId: null,
      armedTrackId: null,
      hydrated: true,
    });
    void saveProject(project).then(() => get().markSaved());
  },

  loadProject: async (id) => {
    const project = await getProject(id);
    if (!project || project.deletedAt) {
      set({
        project: null,
        isDirty: false,
        selectedTrackId: null,
        armedTrackId: null,
        hydrated: true,
      });
      return false;
    }
    set({
      project,
      isDirty: false,
      selectedTrackId: null,
      armedTrackId: null,
      hydrated: true,
    });
    return true;
  },

  setBpm: (bpm) => {
    const { project } = get();
    if (!project) return;
    const clamped = Math.round(Math.min(300, Math.max(30, bpm)));
    set({
      project: mutateProject(project, (draft) => ({ ...draft, bpm: clamped })),
      isDirty: true,
    });
  },

  renameProject: (name) => {
    const { project } = get();
    if (!project) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    set({
      project: mutateProject(project, (draft) => ({ ...draft, name: trimmed })),
      isDirty: true,
    });
  },

  addTrack: (input) => {
    const { project } = get();
    if (!project) return null;

    const track: Track = {
      id: crypto.randomUUID(),
      name: input.name,
      instrument: input.instrument ?? "",
      audioKey: input.audioKey ?? "",
      volume: input.volume ?? 0.8,
      pan: input.pan ?? 0,
      mute: input.mute ?? false,
      solo: input.solo ?? false,
      trimStart: input.trimStart ?? 0,
      trimEnd: input.trimEnd ?? 0,
      offset: input.offset ?? 0,
      fxChain: input.fxChain ?? [],
      color: TRACK_COLORS[project.tracks.length % TRACK_COLORS.length],
      kind: input.kind ?? "audio",
      ...(input.samplerId ? { samplerId: input.samplerId } : {}),
    };

    set({
      project: mutateProject(project, (draft) => ({
        ...draft,
        tracks: [...draft.tracks, track],
      })),
      isDirty: true,
      selectedTrackId: track.id,
    });
    return track;
  },

  updateTrack: (id, patch) => {
    const { project } = get();
    if (!project) return;
    set({
      project: mutateProject(project, (draft) => ({
        ...draft,
        tracks: draft.tracks.map((track) =>
          track.id === id ? { ...track, ...patch, id: track.id } : track,
        ),
      })),
      isDirty: true,
    });
  },

  removeTrack: (id) => {
    const { project, selectedTrackId, armedTrackId } = get();
    if (!project) return;

    const track = project.tracks.find((t) => t.id === id);
    if (track?.audioKey) {
      void deleteAudioBlob(track.audioKey);
    }
    // Stacked takes own blobs too — delete them with the track.
    if (track?.takes) {
      for (const take of track.takes) {
        void deleteAudioBlob(take.audioKey);
      }
    }

    set({
      project: mutateProject(project, (draft) => ({
        ...draft,
        tracks: draft.tracks.filter((t) => t.id !== id),
      })),
      isDirty: true,
      selectedTrackId: selectedTrackId === id ? null : selectedTrackId,
      armedTrackId: armedTrackId === id ? null : armedTrackId,
    });
  },

  moveTrack: (id, dir) => {
    const { project } = get();
    if (!project) return;
    const index = project.tracks.findIndex((t) => t.id === id);
    if (index === -1) return;
    const target = dir === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= project.tracks.length) return;

    const tracks = [...project.tracks];
    const [moved] = tracks.splice(index, 1);
    tracks.splice(target, 0, moved);

    set({
      project: mutateProject(project, (draft) => ({ ...draft, tracks })),
      isDirty: true,
    });
  },

  setSelectedTrack: (id) => set({ selectedTrackId: id }),

  // Arming a track disarms the others; arming the same track again disarms it.
  setArmedTrack: (id) =>
    set({
      armedTrackId: id === null ? null : get().armedTrackId === id ? null : id,
    }),

  markSaved: () => set({ isDirty: false }),

  reset: () =>
    set({
      project: null,
      isDirty: false,
      selectedTrackId: null,
      armedTrackId: null,
      hydrated: false,
    }),
}));

/**
 * Persists the active project to IndexedDB every 30s while it is dirty.
 * Returns a cleanup function that stops the interval.
 */
export function startAutosaveInterval(): () => void {
  const timer = setInterval(() => {
    const { project, isDirty, markSaved } = useProjectStore.getState();
    if (!project || !isDirty) return;
    void saveProject(project).then(() => {
      // Only clear the dirty flag if the project wasn't edited again
      // while the write was in flight.
      const current = useProjectStore.getState();
      if (current.project?.updatedAt === project.updatedAt) {
        markSaved();
      }
    });
  }, AUTOSAVE_INTERVAL_MS);

  return () => clearInterval(timer);
}
