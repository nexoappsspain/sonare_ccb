/**
 * CCB Sonare Music — Export layer (Stage 4)
 *
 * - renderMixdown: offline render of every audible track through a native
 *   OfflineAudioContext (44.1 kHz stereo). Per track:
 *     BufferSource(trim/offset) -> offline FX approximations -> Gain(volume)
 *       -> StereoPanner(pan) -> destination
 *
 *   Offline FX notes:
 *   - reverb: ConvolverNode with a PROCEDURAL impulse response (stereo noise
 *     with exponential decay), wet/dry mixed — real convolution, close to the
 *     live Tone.Reverb behavior.
 *   - delay: DelayNode + feedback GainNode loop, wet/dry mixed.
 *   - compressor: DynamicsCompressorNode (same DSP as live).
 *   - eq: 3 BiquadFilters (lowshelf 320 Hz / peaking 1 kHz / highshelf 3.2 kHz),
 *     approximating Tone.EQ3.
 *   - noiseGate: SKIPPED offline. A gate only attenuates below-threshold
 *     material; the linear FX chain before it leaves silence silent, so
 *     gating adds nothing to a static bounce while risking chopping soft
 *     passages that the live (interactive) gate tolerates via monitoring.
 *
 * Client-only: uses OfflineAudioContext/Blob/FileReader — never call on SSR.
 */

import WavEncoder from "wav-encoder";
import { Mp3Encoder } from "lamejs";
import { z } from "zod";
import type { FxSettings, Project, SonareFile, Track } from "@/types";
import { TRACK_COLOR_VALUES } from "@/types";
import { base64ToBlob, blobToBase64, clamp } from "@/lib/utils";
import { defaultFxParams } from "./effects";

const OFFLINE_SAMPLE_RATE = 44100;
const MP3_BLOCK_SIZE = 1152;
/** Yield to the event loop every N MP3 blocks (~1.3 s of audio) so the UI never freezes on mobile. */
const MP3_BLOCKS_PER_YIELD = 50;

export type GetAudioBlobFn = (audioKey: string) => Promise<Blob | undefined>;

function assertBrowser(): void {
  if (typeof window === "undefined") {
    throw new Error("Exportação de áudio só está disponível no navegador.");
  }
}

/* ------------------------------- Mixdown --------------------------------- */

interface OfflineFxHandle {
  input: GainNode;
  output: GainNode;
}

/** Procedurally generated stereo impulse response: decaying white noise. */
function createImpulseResponse(context: BaseAudioContext, decaySeconds: number): AudioBuffer {
  const length = Math.max(1, Math.floor(context.sampleRate * Math.max(0.1, decaySeconds)));
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let i = 0; i < length; i += 1) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 2.5);
    }
  }
  return impulse;
}

function buildOfflineFx(context: OfflineAudioContext, fx: FxSettings): OfflineFxHandle | null {
  const p = { ...defaultFxParams(fx.type), ...fx.params };
  const input = context.createGain();
  const output = context.createGain();

  switch (fx.type) {
    case "reverb": {
      const wet = clamp(p.wet, 0, 1);
      const convolver = context.createConvolver();
      convolver.buffer = createImpulseResponse(context, p.decay);
      const dryGain = context.createGain();
      dryGain.gain.value = 1 - wet;
      const wetGain = context.createGain();
      wetGain.gain.value = wet;
      input.connect(dryGain);
      dryGain.connect(output);
      input.connect(convolver);
      convolver.connect(wetGain);
      wetGain.connect(output);
      return { input, output };
    }

    case "delay": {
      const wet = clamp(p.wet, 0, 1);
      const delay = context.createDelay(2);
      delay.delayTime.value = Math.max(0, p.time);
      const feedback = context.createGain();
      feedback.gain.value = clamp(p.feedback, 0, 0.95);
      const dryGain = context.createGain();
      dryGain.gain.value = 1 - wet;
      const wetGain = context.createGain();
      wetGain.gain.value = wet;
      input.connect(dryGain);
      dryGain.connect(output);
      input.connect(delay);
      delay.connect(feedback);
      feedback.connect(delay);
      delay.connect(wetGain);
      wetGain.connect(output);
      return { input, output };
    }

    case "compressor": {
      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = clamp(p.threshold, -60, 0);
      compressor.ratio.value = clamp(p.ratio, 1, 20);
      compressor.attack.value = Math.max(0, p.attack);
      compressor.release.value = Math.max(0.001, p.release);
      input.connect(compressor);
      compressor.connect(output);
      return { input, output };
    }

    case "eq": {
      const lowShelf = context.createBiquadFilter();
      lowShelf.type = "lowshelf";
      lowShelf.frequency.value = 320;
      lowShelf.gain.value = clamp(p.low, -24, 24);
      const midPeak = context.createBiquadFilter();
      midPeak.type = "peaking";
      midPeak.frequency.value = 1000;
      midPeak.Q.value = 1;
      midPeak.gain.value = clamp(p.mid, -24, 24);
      const highShelf = context.createBiquadFilter();
      highShelf.type = "highshelf";
      highShelf.frequency.value = 3200;
      highShelf.gain.value = clamp(p.high, -24, 24);
      input.connect(lowShelf);
      lowShelf.connect(midPeak);
      midPeak.connect(highShelf);
      highShelf.connect(output);
      return { input, output };
    }

    case "noiseGate":
      // Skipped offline by design — see module docstring.
      return null;
  }
}

/**
 * Renders the full project to a single stereo AudioBuffer (44.1 kHz).
 * Respects mute/solo (if any track is soloed, only soloed non-muted tracks
 * are rendered), trimStart/trimEnd, timeline offset, volume and pan.
 */
export async function renderMixdown(
  project: Project,
  getBlob: GetAudioBlobFn,
): Promise<AudioBuffer> {
  assertBrowser();

  const anySolo = project.tracks.some((track) => track.solo);
  const audibleTracks = project.tracks.filter(
    (track) =>
      track.kind === "audio" &&
      track.audioKey !== "" &&
      !track.mute &&
      (!anySolo || track.solo),
  );
  if (audibleTracks.length === 0) {
    throw new Error("Nenhuma pista de áudio audível para exportar.");
  }

  // Decode every source first (a 1-frame OfflineAudioContext decodes and
  // resamples to 44.1 kHz without needing a real-time context).
  const decodeContext = new OfflineAudioContext(1, 1, OFFLINE_SAMPLE_RATE);
  const decoded: { track: Track; buffer: AudioBuffer }[] = [];
  for (const track of audibleTracks) {
    const blob = await getBlob(track.audioKey);
    if (!blob) continue;
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = await decodeContext.decodeAudioData(arrayBuffer);
    decoded.push({ track, buffer });
  }
  if (decoded.length === 0) {
    throw new Error("Não foi possível carregar o áudio das pistas audíveis.");
  }

  const playableDuration = ({ track, buffer }: { track: Track; buffer: AudioBuffer }): number =>
    track.offset + Math.max(0, buffer.duration - track.trimStart - track.trimEnd);
  const duration = Math.max(...decoded.map(playableDuration));
  if (!(duration > 0)) {
    throw new Error("A duração do projeto é zero — nada para exportar.");
  }

  const context = new OfflineAudioContext(
    2,
    Math.ceil(duration * OFFLINE_SAMPLE_RATE),
    OFFLINE_SAMPLE_RATE,
  );

  for (const { track, buffer } of decoded) {
    const sourceOffset = clamp(track.trimStart, 0, buffer.duration);
    const playDuration = Math.max(0, buffer.duration - sourceOffset - Math.max(0, track.trimEnd));
    if (playDuration <= 0) continue;

    const source = context.createBufferSource();
    source.buffer = buffer;

    let head: AudioNode = source;
    for (const fx of track.fxChain) {
      if (!fx.enabled) continue;
      const node = buildOfflineFx(context, fx);
      if (node) {
        head.connect(node.input);
        head = node.output;
      }
    }

    const gain = context.createGain();
    gain.gain.value = clamp(track.volume, 0, 1);
    const panner = context.createStereoPanner();
    panner.pan.value = clamp(track.pan, -1, 1);

    head.connect(gain);
    gain.connect(panner);
    panner.connect(context.destination);

    source.start(Math.max(0, track.offset), sourceOffset, playDuration);
  }

  return context.startRendering();
}

/* ------------------------------- Encoders -------------------------------- */

/** Encodes an AudioBuffer as 16/24-bit PCM WAV (synchronous wav-encoder). */
export async function encodeWav(buffer: AudioBuffer, bitDepth: 16 | 24 = 16): Promise<Blob> {
  assertBrowser();
  const channelData: Float32Array[] = [];
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    channelData.push(buffer.getChannelData(channel));
  }
  const arrayBuffer = WavEncoder.encode.sync(
    { sampleRate: buffer.sampleRate, channelData },
    { bitDepth },
  );
  return new Blob([arrayBuffer], { type: "audio/wav" });
}

const floatToInt16 = (sample: number): number => {
  const s = clamp(sample, -1, 1);
  return Math.round(s < 0 ? s * 32768 : s * 32767);
};

/**
 * Encodes an AudioBuffer as MP3 via lamejs. Runs in 1152-sample blocks and
 * yields to the event loop periodically so the UI stays responsive on mobile.
 */
export async function encodeMp3(buffer: AudioBuffer, kbps: 128 | 192 | 320 = 192): Promise<Blob> {
  assertBrowser();
  const channels = Math.min(2, buffer.numberOfChannels);
  const encoder = new Mp3Encoder(channels, buffer.sampleRate, kbps);

  const left = buffer.getChannelData(0);
  const right = channels > 1 ? buffer.getChannelData(1) : left;
  const totalSamples = left.length;
  const parts: Int8Array[] = [];

  const leftBlock = new Int16Array(MP3_BLOCK_SIZE);
  const rightBlock = new Int16Array(MP3_BLOCK_SIZE);
  let blockIndex = 0;

  for (let i = 0; i < totalSamples; i += MP3_BLOCK_SIZE) {
    const blockLength = Math.min(MP3_BLOCK_SIZE, totalSamples - i);
    for (let j = 0; j < blockLength; j += 1) {
      leftBlock[j] = floatToInt16(left[i + j]);
      rightBlock[j] = floatToInt16(right[i + j]);
    }
    const chunk =
      channels === 2
        ? encoder.encodeBuffer(leftBlock.subarray(0, blockLength), rightBlock.subarray(0, blockLength))
        : encoder.encodeBuffer(leftBlock.subarray(0, blockLength));
    if (chunk.length > 0) {
      parts.push(chunk);
    }
    blockIndex += 1;
    if (blockIndex % MP3_BLOCKS_PER_YIELD === 0) {
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, 0);
      });
    }
  }

  const tail = encoder.flush();
  if (tail.length > 0) {
    parts.push(tail);
  }
  // slice() guarantees each BlobPart covers its whole backing buffer; the
  // ArrayBuffer cast keeps this compiling on both pre-5.7 and 5.7+ libs
  // (ArrayBuffer vs ArrayBufferLike generic variance).
  return new Blob(parts.map((part) => part.slice().buffer as ArrayBuffer), {
    type: "audio/mpeg",
  });
}

/* ------------------------------ .sonare I/O ------------------------------ */

/**
 * Serializes the project to a .sonare file (JSON, version 1) embedding every
 * track's audio as a base64 data URI. Suggested download name:
 * `${project.name}.sonare`.
 */
export async function exportProjectSonare(
  project: Project,
  getBlob: GetAudioBlobFn,
): Promise<Blob> {
  assertBrowser();
  const audio: Record<string, string> = {};
  const collectKeys: string[] = [];
  for (const track of project.tracks) {
    if (track.audioKey) collectKeys.push(track.audioKey);
    for (const take of track.takes ?? []) {
      if (take.audioKey) collectKeys.push(take.audioKey);
    }
  }
  for (const key of collectKeys) {
    if (audio[key] !== undefined) continue;
    const blob = await getBlob(key);
    if (blob) {
      audio[key] = await blobToBase64(blob);
    }
  }

  const file: SonareFile = {
    version: 1,
    project: {
      id: project.id,
      name: project.name,
      bpm: project.bpm,
      tracks: project.tracks,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    audio,
  };
  return new Blob([JSON.stringify(file)], { type: "application/json" });
}

const fxSchema = z.object({
  id: z.string(),
  type: z.enum(["reverb", "delay", "compressor", "eq", "noiseGate"]),
  enabled: z.boolean(),
  params: z.record(z.string(), z.number()),
});

const takeSchema = z.object({
  audioKey: z.string(),
  label: z.string(),
  createdAt: z.string(),
});

const trackSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  instrument: z.string(),
  audioKey: z.string(),
  volume: z.number().min(0).max(1),
  pan: z.number().min(-1).max(1),
  mute: z.boolean(),
  solo: z.boolean(),
  trimStart: z.number().min(0),
  trimEnd: z.number().min(0),
  offset: z.number().min(0),
  fxChain: z.array(fxSchema),
  color: z.enum(TRACK_COLOR_VALUES),
  kind: z.enum(["audio", "midi"]),
  samplerId: z.string().optional(),
  takes: z.array(takeSchema).optional(),
});

const sonareFileSchema = z.object({
  version: z.literal(1),
  project: z.object({
    id: z.string().min(1),
    name: z.string(),
    bpm: z.number().min(40).max(300),
    tracks: z.array(trackSchema),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  audio: z.record(z.string(), z.string()),
});

/**
 * Parses and validates a .sonare file. Returns the metadata-only Project plus
 * a map audioKey -> decoded audio Blob (ready to persist in IndexedDB).
 */
export async function importProjectSonare(
  file: File,
): Promise<{ project: Project; audio: Record<string, Blob> }> {
  assertBrowser();

  let raw: unknown;
  try {
    raw = JSON.parse(await file.text());
  } catch {
    throw new Error("Arquivo .sonare inválido: JSON corrompido.");
  }

  const parsed = sonareFileSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("Arquivo .sonare inválido ou versão não suportada (esperado version 1).");
  }

  const audio: Record<string, Blob> = {};
  for (const [audioKey, dataUri] of Object.entries(parsed.data.audio)) {
    audio[audioKey] = base64ToBlob(dataUri);
  }

  return { project: parsed.data.project, audio };
}
