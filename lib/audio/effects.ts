/**
 * CCB Sonare Music — FX layer (Stage 4)
 *
 * Builds Tone.js effect nodes from persisted FxSettings and exposes the
 * preset/parameter metadata the UI uses to render sliders.
 *
 * Client-only: every factory instantiates Tone.js nodes, which require a
 * running AudioContext. Callers must guard `typeof window !== "undefined"`.
 */

import * as Tone from "tone";
import type { FxSettings, FxType } from "@/types";
import { clamp } from "@/lib/utils";

/* ------------------------- Default parameters ---------------------------- */

export function defaultFxParams(type: FxType): Record<string, number> {
  switch (type) {
    case "reverb":
      return { decay: 2, wet: 0.3 };
    case "delay":
      return { time: 0.25, feedback: 0.3, wet: 0.25 };
    case "compressor":
      return { threshold: -24, ratio: 3, attack: 0.01, release: 0.2 };
    case "eq":
      return { low: 0, mid: 0, high: 0 };
    case "noiseGate":
      return { threshold: -50, attack: 0.005, release: 0.1 };
  }
}

export interface FxParamDef {
  key: string;
  min: number;
  max: number;
  step: number;
  default: number;
}

export const FX_PARAM_DEFS: Record<FxType, FxParamDef[]> = {
  reverb: [
    { key: "decay", min: 0.1, max: 10, step: 0.1, default: 2 },
    { key: "wet", min: 0, max: 1, step: 0.01, default: 0.3 },
  ],
  delay: [
    { key: "time", min: 0.01, max: 1, step: 0.01, default: 0.25 },
    { key: "feedback", min: 0, max: 0.95, step: 0.01, default: 0.3 },
    { key: "wet", min: 0, max: 1, step: 0.01, default: 0.25 },
  ],
  compressor: [
    { key: "threshold", min: -60, max: 0, step: 1, default: -24 },
    { key: "ratio", min: 1, max: 20, step: 0.5, default: 3 },
    { key: "attack", min: 0.001, max: 0.3, step: 0.001, default: 0.01 },
    { key: "release", min: 0.01, max: 1, step: 0.01, default: 0.2 },
  ],
  eq: [
    { key: "low", min: -24, max: 24, step: 0.5, default: 0 },
    { key: "mid", min: -24, max: 24, step: 0.5, default: 0 },
    { key: "high", min: -24, max: 24, step: 0.5, default: 0 },
  ],
  noiseGate: [
    { key: "threshold", min: -80, max: 0, step: 1, default: -50 },
    { key: "attack", min: 0.001, max: 0.1, step: 0.001, default: 0.005 },
    { key: "release", min: 0.01, max: 0.5, step: 0.01, default: 0.1 },
  ],
};

/* ------------------------------- Noise gate ------------------------------ */

/**
 * Tone.js 15 does NOT ship a native `Tone.Gate` node. When it is absent we
 * fall back to a real downward-gate built from stock nodes:
 *
 *   audio path:    input ───────────────────────► gateGain ─► output
 *   control path:  input ─► Follower ─► GreaterThan ─► Filter ─► gateGain.gain
 *
 * The Follower produces a smoothed amplitude envelope; GreaterThan turns it
 * into a hard 0/1 open/close signal at the threshold; a signal-rate lowpass
 * Filter rounds the edges (release smoothing) to avoid zipper noise on the
 * gain AudioParam. This is a genuine gate (signals below threshold are
 * silenced), unlike a high-threshold compressor which only tames loud peaks.
 */
class NoiseGateNode extends Tone.ToneAudioNode {
  readonly name = "NoiseGate";
  readonly input: Tone.Gain;
  readonly output: Tone.Gain;

  private readonly gateGain: Tone.Gain;
  private readonly follower: Tone.Follower;
  private readonly comparator: Tone.GreaterThan;
  private readonly smoother: Tone.Filter;

  constructor(params: Record<string, number>) {
    super();
    const defaults = defaultFxParams("noiseGate");
    const thresholdDb = params.threshold ?? defaults.threshold;
    const attack = params.attack ?? defaults.attack;
    const release = params.release ?? defaults.release;

    this.input = new Tone.Gain(1);
    this.output = new Tone.Gain(1);
    this.gateGain = new Tone.Gain(0);

    // Control (sidechain) path.
    this.follower = new Tone.Follower({ smoothing: Math.max(0.001, attack) });
    this.comparator = new Tone.GreaterThan(Tone.dbToGain(clamp(thresholdDb, -80, 0)));
    this.smoother = new Tone.Filter(clamp(1 / Math.max(release, 0.01), 2, 200), "lowpass");

    this.input.connect(this.follower);
    this.follower.connect(this.comparator);
    this.comparator.connect(this.smoother);
    this.smoother.connect(this.gateGain.gain);

    // Audio path.
    this.input.connect(this.gateGain);
    this.gateGain.connect(this.output);
  }

  dispose(): this {
    super.dispose();
    this.smoother.dispose();
    this.comparator.dispose();
    this.follower.dispose();
    this.gateGain.dispose();
    this.output.dispose();
    this.input.dispose();
    return this;
  }
}

/** Feature-detect a native Tone.Gate (not present in Tone 15 — kept for future versions). */
function tryCreateNativeGate(params: Record<string, number>): Tone.ToneAudioNode | null {
  const candidate = (Tone as unknown as Record<string, unknown>).Gate;
  if (typeof candidate !== "function") return null;
  try {
    const GateCtor = candidate as new (options: Record<string, number>) => Tone.ToneAudioNode;
    return new GateCtor(params);
  } catch {
    return null;
  }
}

/* ------------------------------ FX factories ----------------------------- */

export function createFxNode(fx: FxSettings): Tone.ToneAudioNode {
  const p = { ...defaultFxParams(fx.type), ...fx.params };

  switch (fx.type) {
    case "reverb":
      // IR generation is async internally (reverb.ready); the node is
      // usable immediately and starts passing processed audio once ready.
      return new Tone.Reverb({ decay: p.decay, wet: clamp(p.wet, 0, 1) });

    case "delay":
      return new Tone.FeedbackDelay({
        delayTime: Math.max(0, p.time),
        feedback: clamp(p.feedback, 0, 0.95),
        wet: clamp(p.wet, 0, 1),
      });

    case "compressor":
      return new Tone.Compressor({
        threshold: clamp(p.threshold, -60, 0),
        ratio: clamp(p.ratio, 1, 20),
        attack: Math.max(0, p.attack),
        release: Math.max(0.001, p.release),
      });

    case "eq":
      // low/mid/high are gains in dB.
      return new Tone.EQ3({
        low: clamp(p.low, -24, 24),
        mid: clamp(p.mid, -24, 24),
        high: clamp(p.high, -24, 24),
      });

    case "noiseGate":
      return tryCreateNativeGate(p) ?? new NoiseGateNode(p);
  }
}

export interface FxChainHandle {
  /** Connect the source (player/sampler) here. */
  input: Tone.Gain;
  /** Connect this to the next stage (panner). */
  output: Tone.Gain;
  /** Instantiated effect nodes (only fx.enabled entries), in order. */
  nodes: Tone.ToneAudioNode[];
  dispose(): void;
}

/** Connects every enabled effect in series between fresh input/output gains. */
export function buildFxChain(fxChain: FxSettings[]): FxChainHandle {
  const input = new Tone.Gain(1);
  const output = new Tone.Gain(1);
  const nodes = fxChain.filter((fx) => fx.enabled).map((fx) => createFxNode(fx));

  let head: Tone.ToneAudioNode = input;
  for (const node of nodes) {
    head.connect(node);
    head = node;
  }
  head.connect(output);

  return {
    input,
    output,
    nodes,
    dispose(): void {
      input.disconnect();
      input.dispose();
      for (const node of nodes) {
        node.disconnect();
        node.dispose();
      }
      output.disconnect();
      output.dispose();
    },
  };
}

/* -------------------------------- Presets -------------------------------- */

const makeFx = (type: FxType, presetName: string, params: Record<string, number>): FxSettings => ({
  id: `preset-${presetName}-${type}`,
  type,
  enabled: true,
  params: { ...defaultFxParams(type), ...params },
});

export const FX_PRESETS: Record<"voice" | "wind" | "strings" | "keys", FxSettings[]> = {
  /** Voz: compressor leve + EQ cortando graves + reverb curto. */
  voice: [
    makeFx("compressor", "voice", { threshold: -18, ratio: 2.5, attack: 0.01, release: 0.15 }),
    makeFx("eq", "voice", { low: -6, mid: 1, high: 2 }),
    makeFx("reverb", "voice", { decay: 1.2, wet: 0.2 }),
  ],
  /** Sopro: gate contra ruído entre frases + reverb médio. */
  wind: [
    makeFx("noiseGate", "wind", { threshold: -48, attack: 0.005, release: 0.08 }),
    makeFx("reverb", "wind", { decay: 2.2, wet: 0.28 }),
  ],
  /** Cordas: reverb longo + leve brilho. */
  strings: [
    makeFx("reverb", "strings", { decay: 4, wet: 0.35 }),
    makeFx("eq", "strings", { low: -1, mid: 0, high: 1.5 }),
  ],
  /** Teclas: compressor + delay sutil. */
  keys: [
    makeFx("compressor", "keys", { threshold: -20, ratio: 3, attack: 0.005, release: 0.1 }),
    makeFx("delay", "keys", { time: 0.28, feedback: 0.2, wet: 0.15 }),
  ],
};
