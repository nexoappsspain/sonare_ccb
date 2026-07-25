/**
 * CCB Sonare Music — Domain types (Stage 2)
 *
 * Timestamps are ISO 8601 strings so that Project/Track objects are
 * structured-cloneable (IndexedDB) and JSON-serializable (.sonare files)
 * without any conversion step.
 */

export type FxType = "reverb" | "delay" | "compressor" | "eq" | "noiseGate";

export interface FxSettings {
  id: string;
  type: FxType;
  enabled: boolean;
  /** Normalized effect parameters, e.g. { decay: 2.5, wet: 0.3 } */
  params: Record<string, number>;
}

export const TRACK_COLOR_VALUES = [
  "blue",
  "green",
  "purple",
  "orange",
  "pink",
  "teal",
  "yellow",
  "red",
] as const;

export type TrackColor = (typeof TRACK_COLOR_VALUES)[number];

/** A previous recording kept alongside the active one (take stacking). */
export interface Take {
  /** Key of the raw audio Blob in IndexedDB (`audio:{audioKey}`). */
  audioKey: string;
  label: string;
  /** ISO 8601 timestamp. */
  createdAt: string;
}

export interface Track {
  id: string;
  name: string;
  /** Free-form instrument label, e.g. "clarinet", "voice". */
  instrument: string;
  /**
   * Key of the raw audio Blob in IndexedDB (`audio:{audioKey}`).
   * Empty string when the track has no recorded audio yet (e.g. fresh MIDI track).
   * NEVER store the Blob itself in React state.
   */
  audioKey: string;
  /** 0..1 */
  volume: number;
  /** -1..1 */
  pan: number;
  mute: boolean;
  solo: boolean;
  /** Trim start in seconds (from the beginning of the source buffer). */
  trimStart: number;
  /** Trim end in seconds (from the end of the source buffer). */
  trimEnd: number;
  /** Offset in seconds — where the clip starts on the project timeline. */
  offset: number;
  fxChain: FxSettings[];
  color: TrackColor;
  kind: "audio" | "midi";
  /** Present only when kind === "midi". */
  samplerId?: string;
  /**
   * Previous takes (older recordings), oldest first. Optional so projects
   * saved before take stacking existed keep loading unchanged.
   */
  takes?: Take[];
}

/**
 * Track metadata is exactly what gets persisted to PostgreSQL (Json column)
 * and inside .sonare files. It contains no audio data, only the audioKey pointer.
 */
export type TrackMetadata = Track;

export interface Project {
  id: string;
  name: string;
  bpm: number;
  tracks: Track[];
  createdAt: string;
  updatedAt: string;
  /** Soft-delete marker (ISO string). Present = moved to trash. */
  deletedAt?: string;
  /** Id of the cloud (PostgreSQL) copy, when synced. */
  cloudId?: string;
}

export type SamplerId =
  | "acousticPiano"
  | "electricPiano"
  | "organ"
  | "strings"
  | "flute"
  | "clarinet"
  | "acousticBass"
  | "electricBass";

/** Metadata-only view of a Project embedded in a .sonare file. */
export interface SonareFileProject {
  id: string;
  name: string;
  bpm: number;
  tracks: TrackMetadata[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Portable project file format (.sonare).
 * audio maps audioKey -> base64 data URI (e.g. "data:audio/wav;base64,...").
 */
export interface SonareFile {
  version: 1;
  project: SonareFileProject;
  audio: Record<string, string>;
}
