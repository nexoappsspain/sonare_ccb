/**
 * CCB Sonare Music — Microphone recording (Stage 4)
 *
 * Recording uses the NATIVE MediaRecorder API (chosen over Tone.Recorder):
 * MediaRecorder encodes to opus/webm on a browser internal thread, so the
 * main thread stays free and mobile recording does not lag — Tone.Recorder
 * would PCM-buffer raw float samples in memory, which grows fast on phones.
 *
 * The live level meter runs on Tone's AudioContext (shared with the engine)
 * via an AnalyserNode; monitoring uses Tone.UserMedia through a low gain.
 *
 * Client-only module: every public method asserts a browser environment.
 */

import * as Tone from "tone";
import { clamp } from "@/lib/utils";
import { getMicPermission } from "./micPermission";

export function checkMicSupport(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getUserMedia === "function" &&
    typeof MediaRecorder !== "undefined"
  );
}

export interface RecorderStartOptions {
  /** Number of metronome beats to wait before recording starts. 0 = none. */
  countIn?: number;
  /** Project BPM used to translate countIn beats into seconds. */
  bpm?: number;
}

/** Preferred containers/codecs, first supported wins (mobile-safe fallbacks). */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
] as const;

/** Musical-quality capture: no browser voice processing. */
const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
};

/**
 * Digital gain applied to the mic signal before encoding. Phones often capture
 * very quietly when voice processing is disabled, so a moderate boost makes
 * the recording usable without forcing the user to max every fader.
 */
const RECORD_GAIN = 2.5;

const pickMimeType = (): string =>
  MIME_CANDIDATES.find((mime) => MediaRecorder.isTypeSupported(mime)) ?? "";

/**
 * Switches the browser audio session to "playback-and-record" while recording
 * on mobile. Without this, activating the microphone can force the OS to move
 * playback from headphones/earphones back to the device speaker, making it
 * impossible to monitor the backing track while overdubbing.
 */
class RecordingAudioSession {
  private previousType: AudioSession["type"] | null = null;

  enter(): void {
    const session = navigator.audioSession;
    if (!session) return;
    this.previousType = session.type;
    try {
      session.type = "playback-and-record";
    } catch {
      // Some browsers expose the API but reject the type change — ignore.
    }
  }

  leave(): void {
    const session = navigator.audioSession;
    if (!session || !this.previousType) return;
    try {
      session.type = this.previousType;
    } catch {
      // Ignore restore failures.
    }
    this.previousType = null;
  }
}

export class TrackRecorder {
  private stream: MediaStream | null = null;
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;
  private mediaStreamDestination: MediaStreamAudioDestinationNode | null = null;
  private analyser: AnalyserNode | null = null;
  private analyserData: Uint8Array | null = null;

  private monitorMedia: Tone.UserMedia | null = null;
  private monitorGain: Tone.Gain | null = null;

  private audioSession = new RecordingAudioSession();

  private _isRecording = false;
  private countInAborted = false;

  get isRecording(): boolean {
    return this._isRecording;
  }

  /* ------------------------------ Recording ------------------------------ */

  async start(options: RecorderStartOptions = {}): Promise<void> {
    if (typeof window === "undefined") {
      throw new Error("TrackRecorder só funciona no navegador.");
    }
    if (!checkMicSupport()) {
      throw new Error("Este navegador não suporta gravação de áudio.");
    }
    if (this._isRecording) return;

    // Verify microphone permission before requesting the stream. The UI layer
    // must call getMicPermission() first and only call recorder.start() after
    // permission is granted; these guards exist as defense-in-depth.
    const micState = await getMicPermission();
    if (micState === "denied") {
      throw new Error("microphone-denied");
    }
    if (micState === "prompt" || micState === "unknown") {
      // The UI layer (MicPermissionDialog) must handle this case and call
      // requestMicrophoneAccess() before retrying start().
      throw new Error("microphone-prompt");
    }

    // Start/resume Tone immediately. The caller must invoke this from a user
    // gesture; we also synchronously request resume here so the browser sees it
    // inside the same interaction.
    void Tone.start();
    await Tone.start();

    // Keep playback routed to headphones/earphones while the mic is open.
    this.audioSession.enter();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
    this.stream = stream;
    this.countInAborted = false;

    // Level meter on the shared Tone AudioContext. Use duck typing instead of
    // instanceof to avoid false negatives when the global AudioContext reference
    // differs from the one Tone.js used (e.g. polyfills, HMR, strict bundles).
    const rawContext = Tone.getContext().rawContext as AudioContext | OfflineAudioContext;
    const realtimeContext =
      rawContext &&
      typeof (rawContext as AudioContext).createMediaStreamSource === "function" &&
      rawContext.state !== "closed"
        ? (rawContext as AudioContext)
        : null;
    if (!realtimeContext) {
      throw new Error("AudioContext em tempo real indisponível.");
    }
    this.sourceNode = realtimeContext.createMediaStreamSource(stream);
    this.gainNode = realtimeContext.createGain();
    this.gainNode.gain.value = RECORD_GAIN;
    this.mediaStreamDestination = realtimeContext.createMediaStreamDestination();

    // Boost the mic signal before it reaches the encoder.
    this.sourceNode.connect(this.gainNode);
    this.gainNode.connect(this.mediaStreamDestination);

    // Level meter reads the boosted signal so the UI reflects what is recorded.
    this.analyser = realtimeContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.gainNode.connect(this.analyser);
    this.analyserData = new Uint8Array(this.analyser.fftSize);

    const mimeType = pickMimeType();
    this.mediaRecorder = new MediaRecorder(
      this.mediaStreamDestination.stream,
      mimeType ? { mimeType } : undefined,
    );
    this.chunks = [];
    this.mediaRecorder.ondataavailable = (event: BlobEvent): void => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    // Optional count-in: wait N beats (at the project BPM) before recording.
    const countIn = options.countIn ?? 0;
    if (countIn > 0) {
      const bpm = clamp(options.bpm ?? 120, 40, 300);
      const waitMs = countIn * (60 / bpm) * 1000;
      await new Promise<void>((resolve) => {
        window.setTimeout(resolve, waitMs);
      });
      if (this.countInAborted || !this.stream) {
        this.teardownCapture();
        return;
      }
    }

    // Timeslice keeps chunks flowing so memory stays bounded on long takes.
    this.mediaRecorder.start(250);
    this._isRecording = true;
  }

  /** Stops recording and resolves with the encoded audio Blob. */
  stop(): Promise<Blob> {
    this.countInAborted = true;
    const recorder = this.mediaRecorder;

    if (!recorder || recorder.state === "inactive") {
      const empty = new Blob(this.chunks, { type: recorder?.mimeType || "audio/webm" });
      this.teardownCapture();
      this._isRecording = false;
      return Promise.resolve(empty);
    }

    return new Promise<Blob>((resolve, reject) => {
      recorder.onstop = (): void => {
        const blob = new Blob(this.chunks, {
          type: recorder.mimeType || "audio/webm",
        });
        this.teardownCapture();
        this._isRecording = false;
        resolve(blob);
      };
      recorder.onerror = (event: Event): void => {
        this.teardownCapture();
        this._isRecording = false;
        reject(event instanceof ErrorEvent ? event.error : new Error("Falha na gravação."));
      };
      recorder.stop();
    });
  }

  /** Live input peak level in 0..1 for meter UI (cheap, call per frame). */
  getLevel(): number {
    if (!this.analyser || !this.analyserData) return 0;
    // `as never`: TS 5.7+ types getByteTimeDomainData as Uint8Array<ArrayBuffer>
    // while the field is Uint8Array<ArrayBufferLike>; pre-5.7 libs have no such
    // generic. The buffer is always a plain ArrayBuffer here.
    this.analyser.getByteTimeDomainData(this.analyserData as never);
    let peak = 0;
    for (let i = 0; i < this.analyserData.length; i += 1) {
      const amplitude = Math.abs(this.analyserData[i] - 128) / 128;
      if (amplitude > peak) peak = amplitude;
    }
    return peak;
  }

  /* ------------------------------ Monitoring ----------------------------- */

  /**
   * Routes the microphone to the speakers through a LOW gain (0.25).
   * WARNING: can cause acoustic feedback — recommend headphones in the UI.
   */
  async startMonitoring(callback?: (active: boolean) => void): Promise<void> {
    if (typeof window === "undefined") return;
    if (this.monitorMedia) {
      callback?.(true);
      return;
    }
    await Tone.start();
    this.monitorMedia = new Tone.UserMedia({ volume: 0 });
    await this.monitorMedia.open();
    this.monitorGain = new Tone.Gain(0.25).toDestination();
    this.monitorMedia.connect(this.monitorGain);
    callback?.(true);
  }

  stopMonitoring(): void {
    this.monitorMedia?.disconnect();
    this.monitorMedia?.close();
    this.monitorMedia?.dispose();
    this.monitorMedia = null;
    this.monitorGain?.disconnect();
    this.monitorGain?.dispose();
    this.monitorGain = null;
  }

  /* ------------------------------- Teardown ------------------------------ */

  private teardownCapture(): void {
    this.sourceNode?.disconnect();
    this.sourceNode = null;
    this.gainNode?.disconnect();
    this.gainNode = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.analyserData = null;
    // The original mic stream is not needed once recording stops.
    if (this.stream) {
      for (const track of this.stream.getTracks()) {
        track.stop();
      }
      this.stream = null;
    }
    this.mediaStreamDestination = null;
    this.mediaRecorder = null;
    this.chunks = [];
    // Restore the previous audio session so normal playback resumes.
    this.audioSession.leave();
  }

  dispose(): void {
    this.countInAborted = true;
    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop();
    }
    this._isRecording = false;
    this.stopMonitoring();
    this.teardownCapture();
  }
}
