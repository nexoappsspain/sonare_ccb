/**
 * CCB Sonare Music — Metronome (Stage 4)
 *
 * A single Tone.MembraneSynth plays a high-pitched accent on beat 1 and a
 * lower click on beats 2-4, sequenced by a Tone.Sequence in "4n" and synced
 * to Tone.Transport — the same transport the AudioEngine drives, so the
 * click stays locked to playback/recording.
 *
 * Client-only: nodes are created lazily on start() (user gesture).
 */

import * as Tone from "tone";
import { clamp } from "@/lib/utils";

const MIN_BPM = 40;
const MAX_BPM = 240;

interface MetronomeStep {
  note: string;
  velocity: number;
}

/** Accent on beat 1 (higher pitch + velocity), softer clicks on 2-4. */
const BEAT_PATTERN: MetronomeStep[] = [
  { note: "A4", velocity: 1 },
  { note: "E4", velocity: 0.6 },
  { note: "E4", velocity: 0.6 },
  { note: "E4", velocity: 0.6 },
];

export class Metronome {
  private synth: Tone.MembraneSynth | null = null;
  private volumeNode: Tone.Volume | null = null;
  private sequence: Tone.Sequence<MetronomeStep> | null = null;
  private bpm = 120;

  get isPlaying(): boolean {
    return this.sequence?.state === "started";
  }

  get currentBpm(): number {
    return this.bpm;
  }

  private ensureNodes(): void {
    if (typeof window === "undefined") {
      throw new Error("Metronome só funciona no navegador.");
    }
    if (!this.volumeNode) {
      this.volumeNode = new Tone.Volume(-6).toDestination();
    }
    if (!this.synth) {
      this.synth = new Tone.MembraneSynth({
        pitchDecay: 0.008,
        octaves: 2,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.15, sustain: 0, release: 0.05 },
      }).connect(this.volumeNode);
    }
    if (!this.sequence) {
      this.sequence = new Tone.Sequence<MetronomeStep>(
        (time, step) => {
          this.synth?.triggerAttackRelease(step.note, "32n", time, step.velocity);
        },
        BEAT_PATTERN,
        "4n",
      );
    }
  }

  /** Sets BPM (clamped to 40..240) on this metronome and the shared transport. */
  setBpm(bpm: number): void {
    this.bpm = clamp(Math.round(bpm), MIN_BPM, MAX_BPM);
    Tone.getTransport().bpm.value = this.bpm;
  }

  /** Volume 0..1 (0 mutes). */
  setVolume(value: number): void {
    if (!this.volumeNode) return;
    const v = clamp(value, 0, 1);
    this.volumeNode.mute = v <= 0;
    if (v > 0) {
      this.volumeNode.volume.value = Tone.gainToDb(v);
    }
  }

  /**
   * Starts the click, synced to Tone.Transport. If the transport is not
   * running it is started (this also advances the engine playhead, which is
   * the intended shared-transport behavior).
   */
  async start(): Promise<void> {
    this.ensureNodes();
    await Tone.start();
    Tone.getTransport().bpm.value = this.bpm;
    if (this.sequence && this.sequence.state !== "started") {
      this.sequence.start(0);
    }
    const transport = Tone.getTransport();
    if (transport.state !== "started") {
      transport.start();
    }
  }

  stop(): void {
    this.sequence?.stop();
  }

  dispose(): void {
    this.stop();
    this.sequence?.dispose();
    this.sequence = null;
    this.synth?.dispose();
    this.synth = null;
    this.volumeNode?.dispose();
    this.volumeNode = null;
  }
}

/** Shared singleton metronome. */
export const metronome = new Metronome();
