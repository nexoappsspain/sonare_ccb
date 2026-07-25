"use client";

/**
 * CCB Sonare Music — useAudioEngine (Stage 4)
 *
 * React binding for the AudioEngine singleton. Exposes minimal reactive
 * state (isPlaying, position, bpm) plus transport actions. All heavy audio
 * state (buffers, blobs, node graphs) stays inside the engine — never in
 * React state.
 *
 * Cleanup on unmount: only the progress subscription is removed; the
 * singleton engine itself keeps running (it is shared across pages and
 * disposed explicitly via audioEngine.dispose() when the DAW closes).
 */

import { useCallback, useEffect, useState } from "react";
import { audioEngine, type AudioEngine } from "@/lib/audio/engine";

export interface UseAudioEngineResult {
  engine: AudioEngine;
  isPlaying: boolean;
  /** Transport position in seconds (updated every animation frame while playing). */
  position: number;
  bpm: number;
  play: () => Promise<void>;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setBpm: (bpm: number) => void;
}

export function useAudioEngine(initialBpm = 120): UseAudioEngineResult {
  const [isPlaying, setIsPlaying] = useState(false);
  const [position, setPosition] = useState(0);
  const [bpm, setBpmState] = useState(initialBpm);

  useEffect(() => {
    const unsubscribe = audioEngine.onProgress((seconds) => {
      setPosition(seconds);
      setIsPlaying(audioEngine.state === "started");
    });
    return unsubscribe;
  }, []);

  const play = useCallback(async (): Promise<void> => {
    await audioEngine.play();
    setIsPlaying(audioEngine.state === "started");
  }, []);

  const pause = useCallback((): void => {
    audioEngine.pause();
    setIsPlaying(false);
    setPosition(audioEngine.position);
  }, []);

  const stop = useCallback((): void => {
    audioEngine.stop();
    setIsPlaying(false);
    setPosition(0);
  }, []);

  const seek = useCallback((seconds: number): void => {
    audioEngine.seek(seconds);
    setPosition(audioEngine.position);
  }, []);

  const setBpm = useCallback((nextBpm: number): void => {
    audioEngine.setBpm(nextBpm);
    setBpmState(nextBpm);
  }, []);

  return { engine: audioEngine, isPlaying, position, bpm, play, pause, stop, seek, setBpm };
}
