"use client";

/**
 * CCB Sonare Music — StudioShell (Stage 5)
 *
 * The heart of the studio: owns the project lifecycle (create/load),
 * autosave, beforeunload protection, global keyboard shortcuts, recording
 * (overdub with count-in), audio import (picker + drag-drop), Web MIDI
 * routing to the selected sampler track and the engine <-> store sync
 * (audio loading, mix parameters, FX chains, BPM).
 *
 * Hard rules honored here:
 *  - Audio Blobs NEVER enter React state (local variables / refs only).
 *  - Engine calls are diffed against snapshots so slider drags do not
 *    rebuild FX chains on every tick.
 */

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import * as Tone from "tone";
import {
  ArrowLeft,
  Circle,
  Download,
  Loader2,
  Piano,
  Plus,
  SlidersHorizontal,
  Timer,
  Upload,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { FxSettings, SamplerId, Track } from "@/types";
import {
  audioKeyExists,
  deleteAudioBlob,
  getAudioBlob,
  saveAudioBlob,
} from "@/lib/db/indexedDB";
import { audioEngine } from "@/lib/audio/engine";
import { metronome } from "@/lib/audio/metronome";
import { checkMicSupport, TrackRecorder } from "@/lib/audio/recorder";
import {
  getMicPermission,
  requestMicrophoneAccess,
} from "@/lib/audio/micPermission";
import {
  createSamplerInstrument,
  releaseNote,
  type SamplerInstrument,
} from "@/lib/audio/instruments";
import { isMidiSupported, MidiManager, midiNumberToNote } from "@/lib/audio/midi";
import { startAutosaveInterval, useProjectStore } from "@/lib/store/projectStore";
import { useMonitoringStore } from "@/lib/store/monitoringStore";
import { useToast } from "@/components/shared/ToastProvider";
import { AppHeader } from "@/components/shared/AppHeader";
import { AccessibleButton } from "@/components/shared/AccessibleButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Timeline } from "@/components/studio/Timeline";
import { Mixer } from "@/components/studio/Mixer";
import { TransportControls } from "@/components/studio/TransportControls";
import { MetronomePanel } from "@/components/studio/Metronome";
import { FxRack } from "@/components/studio/FxRack";
import { ExportDialog } from "@/components/studio/ExportDialog";
import { TakeChoiceDialog } from "@/components/studio/TakeChoiceDialog";
import { MicPermissionDialog } from "@/components/studio/MicPermissionDialog";

export interface StudioShellProps {
  /** When present, loads that project from IndexedDB; otherwise ensures a project exists. */
  projectId?: string;
}

const COUNT_IN_BEATS = 4;
const ACCEPTED_AUDIO = ".mp3,.wav,.ogg,.m4a,audio/*";

/** Snapshot of the engine-affecting fields of a track (for diffed sync). */
interface TrackSnapshot {
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  fxChain: FxSettings[];
  trimStart: number;
  trimEnd: number;
  offset: number;
}

const snapshotTrack = (track: Track): TrackSnapshot => ({
  volume: track.volume,
  pan: track.pan,
  mute: track.mute,
  solo: track.solo,
  fxChain: track.fxChain,
  trimStart: track.trimStart,
  trimEnd: track.trimEnd,
  offset: track.offset,
});

/** Recording that landed on a track which already had audio — awaits the
    replace/stack/cancel choice. The new Blob lives only in IndexedDB. */
interface PendingTake {
  trackId: string;
  newAudioKey: string;
  previousAudioKey: string;
  offset: number;
}

export function StudioShell({ projectId }: StudioShellProps) {
  const t = useTranslations("studio");
  const tCommon = useTranslations("common");
  const tErrors = useTranslations("errors");
  const tDashboard = useTranslations("dashboard");
  const locale = useLocale();
  const toast = useToast();

  const project = useProjectStore((state) => state.project);
  const hydrated = useProjectStore((state) => state.hydrated);
  const isDirty = useProjectStore((state) => state.isDirty);
  const newProject = useProjectStore((state) => state.newProject);
  const loadProject = useProjectStore((state) => state.loadProject);
  const renameProject = useProjectStore((state) => state.renameProject);
  const removeTrack = useProjectStore((state) => state.removeTrack);

  const [notFound, setNotFound] = useState(false);
  const [micDialogMode, setMicDialogMode] = useState<"prompt" | "denied" | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [metronomeOn, setMetronomeOn] = useState(false);
  const [metronomeVolume, setMetronomeVolume] = useState(0.8);
  const [metronomePanelOpen, setMetronomePanelOpen] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);
  const [fxTrackId, setFxTrackId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [deleteTrackId, setDeleteTrackId] = useState<string | null>(null);
  const [takeDialogOpen, setTakeDialogOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const initRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recorderRef = useRef<TrackRecorder | null>(null);
  const startingRecordingRef = useRef(false);
  const recordingTrackIdRef = useRef<string | null>(null);
  const recordedOffsetRef = useRef(0);
  const pendingTakeRef = useRef<PendingTake | null>(null);
  const wasPlayingRef = useRef(false);
  const midiRef = useRef<MidiManager | null>(null);
  const samplersRef = useRef<Map<string, { samplerId: SamplerId; instrument: SamplerInstrument }>>(
    new Map(),
  );
  const mixSnapshotRef = useRef<Map<string, TrackSnapshot>>(new Map());
  /** Tracks already handed to the engine (or being loaded), keyed `${id}:${audioKey}`. */
  const loadPromisesRef = useRef<Map<string, Promise<void>>>(new Map());
  const missingWarnedRef = useRef<Set<string>>(new Set());
  const metronomeOnRef = useRef(metronomeOn);
  metronomeOnRef.current = metronomeOn;

  /* --------------------------- Project lifecycle --------------------------- */

  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    if (projectId) {
      void (async () => {
        const ok = await loadProject(projectId);
        if (!ok) {
          setNotFound(true);
          toast.error(t("projectNotFound"));
        }
      })();
    } else if (!useProjectStore.getState().project) {
      newProject(t("newProject"));
    }
  }, [projectId, loadProject, newProject, t, toast]);

  useEffect(() => startAutosaveInterval(), []);

  useEffect(() => {
    if (!isDirty) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  useEffect(() => {
    if (project) setNameDraft(project.name);
  }, [project?.id, project?.name]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ----------------------------- Engine sync ------------------------------ */

  /* Load (once) the audio of every audio track into the engine. StrictMode-safe:
     the in-flight promise map survives the double effect invocation. */
  useEffect(() => {
    if (!project) return;
    for (const track of project.tracks) {
      if (track.kind !== "audio" || !track.audioKey) continue;
      const loadKey = `${track.id}:${track.audioKey}`;
      if (loadPromisesRef.current.has(loadKey)) continue;
      const promise = (async () => {
        try {
          const exists = await audioKeyExists(track.audioKey);
          if (!exists) {
            if (!missingWarnedRef.current.has(track.audioKey)) {
              missingWarnedRef.current.add(track.audioKey);
              toast.error(t("audioMissing"));
            }
            return;
          }
          const blob = await getAudioBlob(track.audioKey);
          if (!blob) return;
          await audioEngine.loadTrack(track, blob);
        } catch (error) {
          console.error(error);
          toast.error(tErrors("audioDecode"));
        }
      })();
      loadPromisesRef.current.set(loadKey, promise);
    }
  }, [project?.tracks, t, tErrors, toast]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Diffed mix/FX sync: cheap setters for mix params, full sync for FX/trim. */
  useEffect(() => {
    if (!project) return;
    const seen = new Set<string>();
    for (const track of project.tracks) {
      seen.add(track.id);
      const previous = mixSnapshotRef.current.get(track.id);
      if (!previous) {
        mixSnapshotRef.current.set(track.id, snapshotTrack(track));
        continue;
      }
      if (previous.volume !== track.volume) audioEngine.setVolume(track.id, track.volume);
      if (previous.pan !== track.pan) audioEngine.setPan(track.id, track.pan);
      if (previous.mute !== track.mute) audioEngine.setMute(track.id, track.mute);
      if (previous.solo !== track.solo) audioEngine.setSolo(track.id, track.solo);
      if (
        previous.fxChain !== track.fxChain ||
        previous.trimStart !== track.trimStart ||
        previous.trimEnd !== track.trimEnd ||
        previous.offset !== track.offset
      ) {
        audioEngine.syncTrackSettings(track);
      }
      mixSnapshotRef.current.set(track.id, snapshotTrack(track));
    }
    for (const id of Array.from(mixSnapshotRef.current.keys())) {
      if (!seen.has(id)) {
        mixSnapshotRef.current.delete(id);
        audioEngine.unloadTrack(id);
        for (const key of Array.from(loadPromisesRef.current.keys())) {
          if (key.startsWith(`${id}:`)) loadPromisesRef.current.delete(key);
        }
      }
    }
  }, [project?.tracks]); // eslint-disable-line react-hooks/exhaustive-deps

  /* BPM follows the project (engine transport + metronome click). */
  useEffect(() => {
    if (!project) return;
    audioEngine.setBpm(project.bpm);
    metronome.setBpm(project.bpm);
  }, [project?.bpm]); // eslint-disable-line react-hooks/exhaustive-deps

  /* Dispose everything owned by this shell on unmount. */
  useEffect(
    () => () => {
      audioEngine.stop();
      metronome.stop();
      recorderRef.current?.dispose();
      midiRef.current?.dispose();
      for (const entry of samplersRef.current.values()) {
        entry.instrument.dispose();
      }
      samplersRef.current.clear();
    },
    [],
  );

  /* ------------------------------ Transport ------------------------------- */

  const togglePlay = useCallback(() => {
    if (audioEngine.state === "started") {
      audioEngine.pause();
    } else {
      void audioEngine.play();
    }
  }, []);

  const toggleMetronome = useCallback(async () => {
    if (metronomeOnRef.current) {
      metronome.stop();
      setMetronomeOn(false);
      return;
    }
    try {
      await audioEngine.ensureStarted();
      const bpm = useProjectStore.getState().project?.bpm ?? 120;
      metronome.setBpm(bpm);
      metronome.setVolume(metronomeVolume);
      await metronome.start();
      // The metronome shares Tone.Transport with the engine: start the
      // progress loop so the playhead follows the click.
      await audioEngine.play();
      setMetronomeOn(true);
    } catch (error) {
      console.error(error);
      toast.error(tErrors("generic"));
    }
  }, [metronomeVolume, tErrors, toast]);

  const changeMetronomeVolume = useCallback((volume: number) => {
    setMetronomeVolume(volume);
    metronome.setVolume(volume);
  }, []);

  /* ------------------------------ Recording ------------------------------- */

  /** Loads the freshly recorded blob into the engine (existing shell pattern:
      reserve the load key first so the load effect does not double-decode). */
  const loadRecordedBlob = useCallback(
    async (trackId: string, audioKey: string) => {
      const track = useProjectStore
        .getState()
        .project?.tracks.find((candidate) => candidate.id === trackId);
      if (!track) return;
      try {
        const blob = await getAudioBlob(audioKey);
        if (!blob) return;
        await audioEngine.loadTrack(track, blob);
      } catch (error) {
        console.error(error);
        toast.error(tErrors("audioDecode"));
      }
    },
    [tErrors, toast],
  );

  const commitTakeChoice = useCallback(
    async (mode: "replace" | "stack") => {
      const pending = pendingTakeRef.current;
      pendingTakeRef.current = null;
      setTakeDialogOpen(false);
      if (!pending) return;
      const state = useProjectStore.getState();
      const track = state.project?.tracks.find(
        (candidate) => candidate.id === pending.trackId,
      );
      try {
        if (mode === "replace") {
          // Replace discards the previous active blob; stacked takes stay.
          await deleteAudioBlob(pending.previousAudioKey);
        }
        const takes =
          mode === "stack" && track
            ? [
                ...(track.takes ?? []),
                {
                  audioKey: pending.previousAudioKey,
                  label: `Take ${(track.takes?.length ?? 0) + 1}`,
                  createdAt: new Date().toISOString(),
                },
              ]
            : track?.takes;
        // Reserve the load key before the store update triggers the load effect.
        loadPromisesRef.current.set(
          `${pending.trackId}:${pending.newAudioKey}`,
          Promise.resolve(),
        );
        state.updateTrack(pending.trackId, {
          audioKey: pending.newAudioKey,
          offset: pending.offset,
          ...(takes ? { takes } : {}),
        });
        await loadRecordedBlob(pending.trackId, pending.newAudioKey);
      } catch (error) {
        console.error(error);
        toast.error(tErrors("generic"));
      }
    },
    [loadRecordedBlob, tErrors, toast],
  );

  const cancelTakeChoice = useCallback(async () => {
    const pending = pendingTakeRef.current;
    pendingTakeRef.current = null;
    setTakeDialogOpen(false);
    if (!pending) return;
    // Cancel discards the freshly recorded blob.
    try {
      await deleteAudioBlob(pending.newAudioKey);
    } catch (error) {
      console.error(error);
    }
  }, []);

  const stopRecording = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    setIsRecording(false);
    try {
      const blob = await recorder.stop();
      if (!wasPlayingRef.current) audioEngine.pause();
      const trackId = recordingTrackIdRef.current;
      recordingTrackIdRef.current = null;
      if (!trackId || blob.size === 0) return;

      const audioKey = crypto.randomUUID();
      await saveAudioBlob(audioKey, blob);
      const offset = recordedOffsetRef.current;

      // Recording onto an armed track that already has audio: ask whether
      // to replace the current take or stack the previous one.
      const existingTrack = useProjectStore
        .getState()
        .project?.tracks.find((candidate) => candidate.id === trackId);
      if (existingTrack && existingTrack.audioKey) {
        pendingTakeRef.current = {
          trackId,
          newAudioKey: audioKey,
          previousAudioKey: existingTrack.audioKey,
          offset,
        };
        setTakeDialogOpen(true);
        return;
      }

      // Reserve the load key before the store update triggers the load effect.
      loadPromisesRef.current.set(`${trackId}:${audioKey}`, Promise.resolve());
      useProjectStore.getState().updateTrack(trackId, { audioKey, offset });
      await loadRecordedBlob(trackId, audioKey);
    } catch (error) {
      console.error(error);
      toast.error(tErrors("generic"));
    } finally {
      // Monitoring must ALWAYS stop (stop/cancel/error paths).
      recorder.stopMonitoring();
      recorderRef.current = null;
    }
  }, [loadRecordedBlob, tErrors, toast]);

  const startRecording = useCallback(async () => {
    const state = useProjectStore.getState();
    const currentProject = state.project;
    if (!currentProject || startingRecordingRef.current || recorderRef.current?.isRecording) {
      return;
    }
    if (!checkMicSupport()) {
      toast.error(t("micNotSupported"));
      return;
    }

    // Check microphone permission before doing anything else. Browsers that do
    // not support the Permissions API return "unknown" — treat that as "prompt"
    // so the user is never hit with a native permission request without warning.
    const micState = await getMicPermission();
    if (micState === "denied") {
      setMicDialogMode("denied");
      return;
    }
    if (micState === "prompt" || micState === "unknown") {
      setMicDialogMode("prompt");
      return;
    }

    // Permission already granted — proceed.
    await startRecordingAfterPermission();
  }, [t, toast]);

  /** Actual recording logic, called after mic permission is confirmed. */
  const startRecordingAfterPermission = useCallback(async () => {
    const state = useProjectStore.getState();
    const currentProject = state.project;
    if (!currentProject || startingRecordingRef.current || recorderRef.current?.isRecording) {
      return;
    }
    startingRecordingRef.current = true;
    try {
      await audioEngine.ensureStarted();

      const bpm = currentProject.bpm;
      const countInBeats = metronomeOnRef.current ? COUNT_IN_BEATS : 0;
      const countInSeconds = countInBeats * (60 / bpm);
      const startPosition = audioEngine.position;
      wasPlayingRef.current = audioEngine.state === "started";

      const recorder = new TrackRecorder();
      recorderRef.current = recorder;
      const startPromise = recorder.start({ countIn: countInBeats, bpm });

      if (metronomeOnRef.current) {
        metronome.setBpm(bpm);
        try {
          await metronome.start();
        } catch (error) {
          console.error(error);
        }
      }
      await audioEngine.play();
      setIsRecording(true);
      recordedOffsetRef.current = startPosition + countInSeconds;

      await startPromise;
      // Aborted during the count-in (user pressed R again).
      if (recorderRef.current !== recorder || !recorder.isRecording) return;

      // Live monitoring (mic -> speakers through a low gain) while recording.
      if (useMonitoringStore.getState().enabled) {
        try {
          await recorder.startMonitoring();
        } catch (error) {
          console.error(error);
        }
      }

      // Record onto the armed audio track when there is one; otherwise
      // create a fresh track (previous behavior).
      const armedId = useProjectStore.getState().armedTrackId;
      const armedTrack = armedId
        ? useProjectStore
            .getState()
            .project?.tracks.find(
              (candidate) => candidate.id === armedId && candidate.kind === "audio",
            )
        : undefined;
      if (armedTrack) {
        recordingTrackIdRef.current = armedTrack.id;
      } else {
        const track = state.addTrack({
          name: t("trackDefaultName", { count: currentProject.tracks.length + 1 }),
          kind: "audio",
        });
        recordingTrackIdRef.current = track?.id ?? null;
      }
    } catch (error) {
      console.error(error);
      toast.error(t("micDenied"));
      if (!wasPlayingRef.current) audioEngine.pause();
      recorderRef.current?.dispose();
      recorderRef.current = null;
      recordingTrackIdRef.current = null;
      setIsRecording(false);
    } finally {
      startingRecordingRef.current = false;
    }
  }, [t, toast]);

  const toggleRecord = useCallback(() => {
    if (recorderRef.current?.isRecording || startingRecordingRef.current) {
      void stopRecording();
    } else {
      void startRecording();
    }
  }, [startRecording, stopRecording]);

  const handleMicGranted = useCallback(() => {
    setMicDialogMode(null);
    void startRecordingAfterPermission();
  }, [startRecordingAfterPermission]);

  /* ---------------------------- Import (audio) ---------------------------- */

  const importFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;
      await audioEngine.ensureStarted();
      for (const file of files) {
        const state = useProjectStore.getState();
        if (!state.project) continue;
        const audioKey = crypto.randomUUID();
        const name = file.name.replace(/\.[^.]+$/, "") || file.name;
        let createdId: string | null = null;
        try {
          await saveAudioBlob(audioKey, file);
          const track = state.addTrack({ name, kind: "audio", audioKey });
          createdId = track?.id ?? null;
          if (!track) continue;
          // Reserve the load key before the store update triggers the load effect.
          loadPromisesRef.current.set(`${track.id}:${audioKey}`, Promise.resolve());
          // loadTrack doubles as the decode check (throws on invalid audio).
          await audioEngine.loadTrack(track, file);
          toast.success(t("audioImported"));
        } catch (error) {
          console.error(error);
          // Roll back the track (removeTrack also deletes the saved blob).
          if (createdId) useProjectStore.getState().removeTrack(createdId);
          toast.error(tErrors("audioDecode"));
        }
      }
    },
    [t, tErrors, toast],
  );

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files ? Array.from(event.target.files) : [];
    event.target.value = "";
    void importFiles(files);
  }

  /* ------------------------------ Track adds ------------------------------ */

  const addAudioTrack = useCallback(() => {
    const state = useProjectStore.getState();
    if (!state.project) return;
    state.addTrack({
      name: t("trackDefaultName", { count: state.project.tracks.length + 1 }),
      kind: "audio",
    });
  }, [t]);

  /* --------------------------------- MIDI --------------------------------- */

  const handleMidiNote = useCallback((note: number, velocity: number, type: "on" | "off") => {
    const { project: currentProject, selectedTrackId } = useProjectStore.getState();
    const track = currentProject?.tracks.find(
      (candidate) => candidate.id === selectedTrackId && candidate.kind === "midi",
    );
    if (!track) return;

    const samplerId = (track.samplerId ?? "acousticPiano") as SamplerId;
    let entry = samplersRef.current.get(track.id);
    if (!entry || entry.samplerId !== samplerId) {
      entry?.instrument.dispose();
      const instrument = createSamplerInstrument(samplerId);
      instrument.toDestination();
      entry = { samplerId, instrument };
      samplersRef.current.set(track.id, entry);
    }

    const noteName = midiNumberToNote(note);
    if (type === "on") {
      entry.instrument.triggerAttack(noteName, Tone.now(), velocity);
    } else {
      releaseNote(entry.instrument, noteName);
    }
  }, []);

  const connectMidi = useCallback(async () => {
    if (!isMidiSupported()) {
      toast.error(t("midiNotSupported"));
      return;
    }
    try {
      await audioEngine.ensureStarted();
      if (!midiRef.current) {
        const manager = new MidiManager();
        midiRef.current = manager;
        manager.onNote(handleMidiNote);
        manager.onDeviceChange((devices) => {
          if (devices.length > 0) {
            toast.success(t("midiConnected"));
          } else {
            toast.info(t("midiDisconnected"));
          }
        });
      }
      const devices = await midiRef.current.init();
      if (devices.length === 0) {
        toast.info(t("noMidiDevice"));
      } else {
        toast.success(t("midiConnected"));
      }
    } catch (error) {
      console.error(error);
      toast.error(t("midiNotSupported"));
    }
  }, [handleMidiNote, t, toast]);

  const addMidiTrack = useCallback(() => {
    const state = useProjectStore.getState();
    if (!state.project) return;
    state.addTrack({ name: t("midiTrack"), kind: "midi", samplerId: "acousticPiano" });
    void connectMidi();
  }, [connectMidi, t]);

  /* -------------------------- Keyboard shortcuts -------------------------- */

  const togglePlayRef = useRef(togglePlay);
  togglePlayRef.current = togglePlay;
  const toggleRecordRef = useRef(toggleRecord);
  toggleRecordRef.current = toggleRecord;

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      switch (event.code) {
        case "Space":
          event.preventDefault();
          if (!event.repeat) togglePlayRef.current();
          break;
        case "KeyR":
          if (!event.repeat) toggleRecordRef.current();
          break;
        case "KeyM": {
          const { selectedTrackId, project: currentProject, updateTrack } =
            useProjectStore.getState();
          const track = currentProject?.tracks.find(
            (candidate) => candidate.id === selectedTrackId,
          );
          if (track) updateTrack(track.id, { mute: !track.mute });
          break;
        }
        case "KeyS": {
          const { selectedTrackId, project: currentProject, updateTrack } =
            useProjectStore.getState();
          const track = currentProject?.tracks.find(
            (candidate) => candidate.id === selectedTrackId,
          );
          if (track) updateTrack(track.id, { solo: !track.solo });
          break;
        }
        case "Delete": {
          const { selectedTrackId } = useProjectStore.getState();
          if (selectedTrackId) setDeleteTrackId(selectedTrackId);
          break;
        }
        default:
          break;
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  /* --------------------------------- Render -------------------------------- */

  if (!hydrated || (!project && !notFound)) {
    return (
      <div className="flex h-dvh items-center justify-center" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-accent" aria-label={tCommon("loading")} />
      </div>
    );
  }

  if (notFound || !project) {
    return (
      <div className="flex h-dvh flex-col">
        <AppHeader />
        <main className="flex flex-1 items-center justify-center px-4">
          <div className="card w-full max-w-md text-center" role="alert">
            <p className="text-sm text-neutral-200">{t("projectNotFound")}</p>
            <Link href={`/${locale}`} className="btn-primary mt-4" aria-label={tCommon("back")}>
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              {tCommon("back")}
            </Link>
          </div>
        </main>
      </div>
    );
  }

  const trackToDelete = project.tracks.find((candidate) => candidate.id === deleteTrackId);

  function commitProjectName() {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== project?.name) {
      renameProject(trimmed);
    } else if (project) {
      setNameDraft(project.name);
    }
  }

  return (
    <div className="flex h-dvh flex-col">
      <AppHeader />

      {/* Studio toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-panel px-3 py-2">
        <Link
          href={`/${locale}`}
          className="btn-secondary px-2.5"
          aria-label={tCommon("back")}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>

        <div className="flex min-w-0 items-center gap-2">
          <label htmlFor="project-name-input" className="sr-only">
            {tDashboard("projectName")}
          </label>
          <input
            id="project-name-input"
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitProjectName}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setNameDraft(project.name);
                event.currentTarget.blur();
              }
            }}
            aria-label={t("editProjectName")}
            maxLength={120}
            className="w-40 min-w-0 truncate rounded border border-transparent bg-transparent px-1.5 py-1 text-sm font-semibold text-neutral-100 transition-colors hover:border-border focus:border-accent sm:w-64"
          />
          {isDirty && (
            <span
              className="h-2 w-2 shrink-0 rounded-full bg-amber-400"
              role="status"
              aria-label={t("unsavedChanges")}
              title={t("unsavedChanges")}
            />
          )}
          <span className="hidden shrink-0 text-xs text-neutral-400 sm:inline">
            {t("bpm")}: {project.bpm}
          </span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <AccessibleButton
            variant="icon"
            size="sm"
            ariaLabel={t("record")}
            aria-pressed={isRecording}
            onClick={toggleRecord}
            className={cn(isRecording && "animate-pulse bg-red-950 hover:bg-red-950")}
          >
            <Circle
              className={cn(
                "h-4 w-4",
                isRecording ? "fill-red-500 text-red-500" : "text-red-500",
              )}
              aria-hidden="true"
            />
          </AccessibleButton>
          <AccessibleButton
            variant="icon"
            size="sm"
            ariaLabel={t("importAudio")}
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
          <AccessibleButton
            variant="icon"
            size="sm"
            ariaLabel={t("midiTrack")}
            onClick={addMidiTrack}
          >
            <Piano className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
          <AccessibleButton
            variant="icon"
            size="sm"
            ariaLabel={t("addTrack")}
            onClick={addAudioTrack}
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
          <AccessibleButton
            variant="icon"
            size="sm"
            ariaLabel={t("metronome")}
            aria-pressed={metronomePanelOpen}
            onClick={() => setMetronomePanelOpen((open) => !open)}
            className={cn(metronomeOn && "text-accent")}
          >
            <Timer className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
          <AccessibleButton
            variant="icon"
            size="sm"
            ariaLabel={t("export")}
            onClick={() => setExportOpen(true)}
          >
            <Download className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
        </div>
      </div>

      {/* Hidden file picker for audio import */}
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_AUDIO}
        multiple
        onChange={handleFileInputChange}
        aria-label={t("importAudio")}
        className="hidden"
        tabIndex={-1}
      />

      {/* Main area: timeline + mixer */}
      <div className="flex min-h-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col pb-20" aria-label={t("title")}>
          <Timeline onImportFiles={(files) => void importFiles(files)} onOpenFx={setFxTrackId} />
        </main>
        <Mixer open={mixerOpen} onClose={() => setMixerOpen(false)} />
      </div>

      {/* Mobile: floating button to open the mixer bottom sheet */}
      <div className="fixed bottom-24 left-3 z-40 md:hidden">
        <AccessibleButton
          variant="primary"
          ariaLabel={t("openMixer")}
          onClick={() => setMixerOpen(true)}
          className="rounded-full p-3 shadow-lg"
        >
          <SlidersHorizontal className="h-5 w-5" aria-hidden="true" />
        </AccessibleButton>
      </div>

      {/* Metronome popover panel */}
      {metronomePanelOpen && (
        <div className="fixed bottom-24 right-3 z-40">
          <MetronomePanel
            on={metronomeOn}
            volume={metronomeVolume}
            onToggle={() => void toggleMetronome()}
            onVolumeChange={changeMetronomeVolume}
            onClose={() => setMetronomePanelOpen(false)}
          />
        </div>
      )}

      <TransportControls
        isRecording={isRecording}
        onToggleRecord={toggleRecord}
        metronomeOn={metronomeOn}
        onToggleMetronome={() => void toggleMetronome()}
        metronomeVolume={metronomeVolume}
        onMetronomeVolumeChange={changeMetronomeVolume}
      />

      <FxRack trackId={fxTrackId} onClose={() => setFxTrackId(null)} />
      <ExportDialog open={exportOpen} onClose={() => setExportOpen(false)} />

      <ConfirmDialog
        open={deleteTrackId !== null}
        title={t("deleteTrack")}
        message={`${t("deleteTrackConfirm")}${trackToDelete ? ` (${trackToDelete.name})` : ""}`}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        onConfirm={() => {
          if (deleteTrackId) removeTrack(deleteTrackId);
          setDeleteTrackId(null);
        }}
        onCancel={() => setDeleteTrackId(null)}
      />

      <TakeChoiceDialog
        open={takeDialogOpen}
        title={t("newTake")}
        replaceLabel={t("replace")}
        stackLabel={t("stack")}
        cancelLabel={tCommon("cancel")}
        onReplace={() => void commitTakeChoice("replace")}
        onStack={() => void commitTakeChoice("stack")}
        onCancel={() => void cancelTakeChoice()}
      />

      {/* Mic permission dialog */}
      {micDialogMode && (
        <MicPermissionDialog
          mode={micDialogMode}
          onClose={() => setMicDialogMode(null)}
          onGranted={handleMicGranted}
        />
      )}

    </div>
  );
}
