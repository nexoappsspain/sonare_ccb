/**
 * CCB Sonare Music — Multi-instrument "sampler" (Stage 4)
 *
 * We cannot ship/download real sample libraries, so every SamplerId is
 * SYNTHESIZED with Tone.PolySynth voices tuned for distinct timbres. The
 * return type keeps the Tone.Sampler union so a future sample-based
 * implementation is a drop-in replacement.
 *
 * Approximation notes (documented per instrument below): organ vibrato and
 * string chorus are approximated via PolySynth detune; flute "breath" via a
 * softened sine attack — PolySynth voices have no external FX bus without
 * hijacking the output node, so timbre shaping stays inside voice options.
 *
 * Client-only: instruments instantiate Tone nodes; create them after a user
 * gesture / Tone.start().
 */

import * as Tone from "tone";
import type { SamplerId } from "@/types";

export const SAMPLER_IDS: SamplerId[] = [
  "acousticPiano",
  "electricPiano",
  "organ",
  "strings",
  "flute",
  "clarinet",
  "acousticBass",
  "electricBass",
];

/** Any voice combination createSamplerInstrument may return. */
export type SamplerInstrument =
  | Tone.Sampler
  | Tone.PolySynth<Tone.Synth>
  | Tone.PolySynth<Tone.AMSynth>
  | Tone.PolySynth<Tone.FMSynth>
  | Tone.PolySynth<Tone.MonoSynth>
  | Tone.PolySynth<Tone.MembraneSynth>;

export function createSamplerInstrument(id: SamplerId): SamplerInstrument {
  switch (id) {
    case "acousticPiano":
      // FM "piano": near-integer harmonicity, fast bright strike decaying
      // to a soft sustain, medium decay + short release.
      return new Tone.PolySynth(Tone.FMSynth, {
        harmonicity: 1,
        modulationIndex: 14,
        oscillator: { type: "sine" },
        modulation: { type: "sine" },
        envelope: { attack: 0.002, decay: 0.6, sustain: 0.15, release: 0.9 },
        modulationEnvelope: { attack: 0.002, decay: 0.3, sustain: 0.2, release: 0.5 },
      });

    case "electricPiano":
      // AM "tine" piano: non-integer harmonicity gives the bell/tremolo edge.
      return new Tone.PolySynth(Tone.AMSynth, {
        harmonicity: 2.5,
        oscillator: { type: "sine" },
        modulation: { type: "triangle" },
        envelope: { attack: 0.004, decay: 0.5, sustain: 0.2, release: 0.8 },
        modulationEnvelope: { attack: 0.01, decay: 0.35, sustain: 0.3, release: 0.6 },
      });

    case "organ":
      // Square-ish drawbar body through a gentle lowpass; attack 0, short
      // release. Vibrato/leslie approximated by slight PolySynth detune.
      return new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: "square" },
        detune: 3,
        filter: { type: "lowpass", frequency: 2500, Q: 0.5 },
        filterEnvelope: {
          attack: 0.001,
          decay: 0.01,
          sustain: 1,
          release: 0.1,
          baseFrequency: 2500,
          octaves: 0,
        },
        envelope: { attack: 0, decay: 0, sustain: 1, release: 0.1 },
      });

    case "strings":
      // Sawtooth ensemble: slow swell attack, long release; chorus leve
      // approximated via detune spread.
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sawtooth" },
        detune: 8,
        envelope: { attack: 0.3, decay: 0.4, sustain: 0.8, release: 1.5 },
      });

    case "flute":
      // Sine with soft attack; vibrato/breath approximated by a slightly
      // slower attack + gentle decay into sustain.
      return new Tone.PolySynth(Tone.Synth, {
        oscillator: { type: "sine" },
        envelope: { attack: 0.08, decay: 0.15, sustain: 0.9, release: 0.35 },
      });

    case "clarinet":
      // Square (odd harmonics) tamed by a ~1200 Hz lowpass, quick attack.
      return new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: "square" },
        filter: { type: "lowpass", frequency: 1200, Q: 1 },
        filterEnvelope: {
          attack: 0.05,
          decay: 0.1,
          sustain: 1,
          release: 0.2,
          baseFrequency: 1200,
          octaves: 0,
        },
        envelope: { attack: 0.05, decay: 0.2, sustain: 0.7, release: 0.2 },
      });

    case "acousticBass":
      // MembraneSynth-ish plucked body: low pitch decay keeps it tonal.
      return new Tone.PolySynth(Tone.MembraneSynth, {
        pitchDecay: 0.008,
        octaves: 3.5,
        oscillator: { type: "sine" },
        envelope: { attack: 0.002, decay: 0.4, sustain: 0.05, release: 0.6 },
      });

    case "electricBass":
      // Triangle through a snappy filter envelope = round electric bass.
      return new Tone.PolySynth(Tone.MonoSynth, {
        oscillator: { type: "triangle" },
        filter: { type: "lowpass", frequency: 900, Q: 1 },
        filterEnvelope: {
          attack: 0.005,
          decay: 0.25,
          sustain: 0.4,
          release: 0.2,
          baseFrequency: 120,
          octaves: 2.5,
        },
        envelope: { attack: 0.005, decay: 0.3, sustain: 0.6, release: 0.3 },
      });
  }
}

/** Triggers a note immediately. duration accepts Tone time ("4n", 0.5...). */
export function triggerNote(
  instrument: SamplerInstrument,
  note: string,
  duration: Tone.Unit.Time,
  velocity = 0.8,
): void {
  instrument.triggerAttackRelease(note, duration, Tone.now(), clamp01(velocity));
}

/** Releases a sustained note (pair with a manual triggerAttack). */
export function releaseNote(instrument: SamplerInstrument, note: string): void {
  instrument.triggerRelease(note, Tone.now());
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));
