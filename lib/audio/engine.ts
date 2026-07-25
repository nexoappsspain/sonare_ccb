/**
 * CCB Sonare Music — AudioEngine (Stage 4)
 *
 * Singleton wrapping Tone.js. Per-track graph:
 *
 *   Tone.Player ─► FxChain (buildFxChain) ─► Tone.Panner ─► Tone.Volume
 *       ─► soloGain (Tone.Gain, mute/solo logic) ─► master (Tone.Gain) ─► Destination
 *
 * Playback is synchronized to Tone.Transport: players are `sync()`ed so
 * play/pause/seek stay sample-accurate. trimStart/trimEnd/offset are honored
 * via `player.start(transportTime, bufferOffset, duration)`.
 *
 * Rules honored here:
 *  - Client-only: nothing touches an AudioContext until ensureStarted(),
 *    which is a no-op on the server.
 *  - Zero audio Blobs in React state: blobs are decoded into internal
 *    Tone.ToneAudioBuffers and never escape the engine.
 *  - Solo is implemented through per-track gains (not Tone.Solo) so N soloed
 *    tracks can play together.
 */

import * as Tone from "tone";
import type { FxSettings, Track } from "@/types";
import { clamp } from "@/lib/utils";
import { buildFxChain, type FxChainHandle } from "./effects";

/** Per-track mixer state (copied from Track metadata, never a live reference). */
interface TrackMixSettings {
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  trimStart: number;
  trimEnd: number;
  offset: number;
}

interface TrackChain {
  player: Tone.Player;
  fx: FxChainHandle;
  panner: Tone.Panner;
  volume: Tone.Volume;
  /** Dedicated gain stage that implements mute/solo audibility. */
  soloGain: Tone.Gain;
  settings: TrackMixSettings;
}

const extractMixSettings = (track: Track): TrackMixSettings => ({
  volume: track.volume,
  pan: track.pan,
  mute: track.mute,
  solo: track.solo,
  trimStart: track.trimStart,
  trimEnd: track.trimEnd,
  offset: track.offset,
});

export class AudioEngine {
  private started = false;
  private master: Tone.Gain | null = null;
  private readonly chains = new Map<string, TrackChain>();
  private readonly progressCallbacks = new Set<(seconds: number) => void>();
  private rafId: number | null = null;

  /* ------------------------------ Lifecycle ------------------------------ */

  /**
   * Resumes/creates the AudioContext (must be called from a user gesture the
   * first time) and builds the master bus. Safe to call repeatedly; no-op on
   * the server.
   */
  async ensureStarted(): Promise<void> {
    if (typeof window === "undefined") return;
    if (!this.started) {
      await Tone.start();
      this.master = new Tone.Gain(1).toDestination();
      this.started = true;
      return;
    }
    if (Tone.getContext().state !== "running") {
      await Tone.start();
    }
  }

  dispose(): void {
    if (this.rafId !== null && typeof window !== "undefined") {
      window.cancelAnimationFrame(this.rafId);
    }
    this.rafId = null;
    this.progressCallbacks.clear();
    if (!this.started) return;

    const transport = Tone.getTransport();
    transport.stop();
    transport.cancel(0);
    for (const id of [...this.chains.keys()]) {
      this.unloadTrack(id);
    }
    this.master?.disconnect();
    this.master?.dispose();
    this.master = null;
    this.started = false;
  }

  /* ----------------------------- Track loading --------------------------- */

  private async decodeBlob(blob: Blob): Promise<Tone.ToneAudioBuffer> {
    const arrayBuffer = await blob.arrayBuffer();
    const context = Tone.getContext().rawContext;
    const audioBuffer = await context.decodeAudioData(arrayBuffer);
    return new Tone.ToneAudioBuffer(audioBuffer);
  }

  /**
   * Decodes the blob and builds the full per-track chain. If the transport
   * is already playing, the clip joins at the correct position immediately.
   */
  async loadTrack(track: Track, blob: Blob): Promise<void> {
    await this.ensureStarted();
    if (typeof window === "undefined" || !this.master) return;

    this.unloadTrack(track.id);
    const buffer = await this.decodeBlob(blob);

    const player = new Tone.Player({ url: buffer, autostart: false });
    const fx = buildFxChain(track.fxChain);
    const panner = new Tone.Panner(clamp(track.pan, -1, 1));
    const volume = new Tone.Volume(0);
    const soloGain = new Tone.Gain(1);

    player.connect(fx.input);
    fx.output.connect(panner);
    panner.connect(volume);
    volume.connect(soloGain);
    soloGain.connect(this.master);

    const chain: TrackChain = {
      player,
      fx,
      panner,
      volume,
      soloGain,
      settings: extractMixSettings(track),
    };
    this.chains.set(track.id, chain);
    this.applyMix(chain);
    this.scheduleChain(chain);
  }

  /** Replaces the audio buffer of an already-loaded track (e.g. re-recording). */
  async setTrackBuffer(trackId: string, blob: Blob): Promise<void> {
    const chain = this.chains.get(trackId);
    if (!chain) return;
    const buffer = await this.decodeBlob(blob);
    chain.player.buffer = buffer;
    this.reschedule(chain);
  }

  unloadTrack(trackId: string): void {
    const chain = this.chains.get(trackId);
    if (!chain) return;
    this.chains.delete(trackId);

    chain.player.unsync();
    if (chain.player.state === "started") {
      chain.player.stop();
    }
    chain.player.disconnect();
    chain.player.dispose();
    chain.fx.output.disconnect();
    chain.fx.dispose();
    chain.panner.disconnect();
    chain.panner.dispose();
    chain.volume.disconnect();
    chain.volume.dispose();
    chain.soloGain.disconnect();
    chain.soloGain.dispose();
  }

  /* ----------------------------- Mix controls ---------------------------- */

  private anySolo(): boolean {
    for (const chain of this.chains.values()) {
      if (chain.settings.solo) return true;
    }
    return false;
  }

  /** Applies volume/pan/mute/solo for one chain (short ramps avoid clicks). */
  private applyMix(chain: TrackChain): void {
    const s = chain.settings;
    const soloActive = this.anySolo();
    const audible = !s.mute && (!soloActive || s.solo);

    chain.soloGain.gain.rampTo(audible ? 1 : 0, 0.03);
    chain.panner.pan.rampTo(clamp(s.pan, -1, 1), 0.03);

    const volume = clamp(s.volume, 0, 1);
    chain.volume.mute = volume <= 0;
    if (volume > 0) {
      chain.volume.volume.rampTo(Tone.gainToDb(volume), 0.03);
    }
  }

  private applyAllMix(): void {
    for (const chain of this.chains.values()) {
      this.applyMix(chain);
    }
  }

  setVolume(trackId: string, value: number): void {
    const chain = this.chains.get(trackId);
    if (!chain) return;
    chain.settings.volume = value;
    this.applyMix(chain);
  }

  setPan(trackId: string, value: number): void {
    const chain = this.chains.get(trackId);
    if (!chain) return;
    chain.settings.pan = value;
    this.applyMix(chain);
  }

  setMute(trackId: string, muted: boolean): void {
    const chain = this.chains.get(trackId);
    if (!chain) return;
    chain.settings.mute = muted;
    this.applyMix(chain);
  }

  /** Toggling solo changes audibility of every track, so re-apply all. */
  setSolo(trackId: string, soloed: boolean): void {
    const chain = this.chains.get(trackId);
    if (!chain) return;
    chain.settings.solo = soloed;
    this.applyAllMix();
  }

  /** Applies volume/pan/mute/solo + fxChain + trims/offset in one shot. */
  syncTrackSettings(track: Track): void {
    const chain = this.chains.get(track.id);
    if (!chain) return;
    chain.settings = extractMixSettings(track);
    this.applyAllMix();
    this.replaceFxChain(track.id, track.fxChain);
    this.reschedule(chain);
  }

  /** Rebuilds the FX chain while keeping player/panner/volume intact. */
  replaceFxChain(trackId: string, fxChain: FxSettings[]): void {
    const chain = this.chains.get(trackId);
    if (!chain) return;

    chain.player.disconnect();
    chain.fx.output.disconnect();
    chain.fx.dispose();

    const fx = buildFxChain(fxChain);
    chain.player.connect(fx.input);
    fx.output.connect(chain.panner);
    chain.fx = fx;
  }

  /* ------------------------------ Scheduling ----------------------------- */

  /** Playable segment of the source buffer, in source-buffer seconds. */
  private segment(chain: TrackChain): { sourceOffset: number; duration: number } {
    const bufferDuration = chain.player.buffer.duration || 0;
    const sourceOffset = clamp(chain.settings.trimStart, 0, bufferDuration);
    const duration = Math.max(
      0,
      bufferDuration - sourceOffset - Math.max(0, chain.settings.trimEnd),
    );
    return { sourceOffset, duration };
  }

  /**
   * Syncs the player to the transport at (timeline offset, buffer offset,
   * duration). When the transport is already running we additionally start
   * the audible remainder right now, because sync() only reacts to future
   * transport "start" events.
   */
  private scheduleChain(chain: TrackChain): void {
    const { sourceOffset, duration } = this.segment(chain);
    if (duration <= 0) return;

    const timelineStart = Math.max(0, chain.settings.offset);
    chain.player.sync().start(timelineStart, sourceOffset, duration);

    if (Tone.getTransport().state === "started") {
      const position = Tone.getTransport().seconds;
      const clipEnd = timelineStart + duration;
      if (position < clipEnd) {
        const intoClip = Math.max(0, position - timelineStart);
        chain.player.start(Tone.now(), sourceOffset + intoClip, duration - intoClip);
      }
    }
  }

  private reschedule(chain: TrackChain): void {
    chain.player.unsync();
    if (chain.player.state === "started") {
      chain.player.stop();
    }
    this.scheduleChain(chain);
  }

  /** Longest timeline end (offset + playable duration) across loaded tracks. */
  getMaxDuration(): number {
    let max = 0;
    for (const chain of this.chains.values()) {
      const { duration } = this.segment(chain);
      max = Math.max(max, chain.settings.offset + duration);
    }
    return max;
  }

  /* ------------------------------- Transport ----------------------------- */

  async play(): Promise<void> {
    await this.ensureStarted();
    if (typeof window === "undefined") return;
    const transport = Tone.getTransport();
    if (transport.state !== "started") {
      transport.start();
    }
    this.startProgressLoop();
  }

  pause(): void {
    if (!this.started) return;
    Tone.getTransport().pause();
  }

  stop(): void {
    if (!this.started) return;
    const transport = Tone.getTransport();
    transport.stop();
    transport.seconds = 0;
  }

  seek(seconds: number): void {
    if (!this.started) return;
    Tone.getTransport().seconds = clamp(seconds, 0, Math.max(this.getMaxDuration(), 0));
  }

  /** Current transport position in seconds. */
  get position(): number {
    return this.started ? Tone.getTransport().seconds : 0;
  }

  get state(): "started" | "paused" | "stopped" {
    return this.started ? Tone.getTransport().state : "stopped";
  }

  /** Project BPM. Audio clips are time-based (unaffected); the metronome follows. */
  setBpm(bpm: number): void {
    if (!this.started) return;
    Tone.getTransport().bpm.value = clamp(bpm, 40, 300);
  }

  /* ------------------------------- Progress ------------------------------ */

  /**
   * Registers a progress callback fired on every animation frame while
   * playing. When the playhead reaches the end of the longest clip the
   * transport stops, the position resets to 0 and a final callback with 0 is
   * emitted. Returns an unsubscribe function.
   */
  onProgress(callback: (seconds: number) => void): () => void {
    this.progressCallbacks.add(callback);
    return () => {
      this.progressCallbacks.delete(callback);
    };
  }

  private emitProgress(seconds: number): void {
    for (const callback of this.progressCallbacks) {
      callback(seconds);
    }
  }

  private startProgressLoop(): void {
    if (this.rafId !== null || typeof window === "undefined") return;

    const tick = (): void => {
      if (!this.started || Tone.getTransport().state !== "started") {
        this.rafId = null;
        return;
      }
      const position = this.position;
      const maxDuration = this.getMaxDuration();
      this.emitProgress(position);

      if (maxDuration > 0 && position >= maxDuration) {
        // End of project: stop and reset the playhead.
        this.stop();
        this.emitProgress(0);
        this.rafId = null;
        return;
      }
      this.rafId = window.requestAnimationFrame(tick);
    };

    this.rafId = window.requestAnimationFrame(tick);
  }
}

/** Shared singleton. Import this, never `new AudioEngine()` in components. */
export const audioEngine = new AudioEngine();
