"use client";

import { useEffect, useRef, useState } from "react";
import WaveSurfer from "wavesurfer.js";
import { useTranslations } from "next-intl";
import { getAudioBlob } from "@/lib/db/indexedDB";
import { trackHex } from "@/components/studio/trackColors";
import type { TrackColor } from "@/types";

export interface WaveformProps {
  /** IndexedDB key of the track audio. Empty string = no audio yet. */
  audioKey: string;
  color: TrackColor;
  /** Accessible label for the waveform region (includes track name). */
  label: string;
  /** Timeline zoom in px/second — stretches the waveform with the ruler. */
  pxPerSec: number;
}

const HEIGHT = 48;
const ACCENT = "#4f46e5";

/**
 * Read-only waveform preview rendered with wavesurfer.js v7.
 *
 * The audio Blob is fetched from IndexedDB into a local variable (never
 * React state) and handed to WaveSurfer, which decodes it internally.
 * Seeking is owned by the transport (interact: false). The instance is
 * destroyed on unmount and recreated only when audioKey changes; zoom is
 * applied in place via WaveSurfer.zoom().
 */
export function Waveform({ audioKey, color, label, pxPerSec }: WaveformProps) {
  const t = useTranslations("studio");
  const containerRef = useRef<HTMLDivElement>(null);
  const wavesurferRef = useRef<WaveSurfer | null>(null);
  // Latest zoom, read by the creation effect below.
  const pxPerSecRef = useRef(pxPerSec);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !audioKey) return;

    let cancelled = false;
    setMissing(false);

    void (async () => {
      const blob = await getAudioBlob(audioKey);
      if (cancelled) return;
      if (!blob) {
        setMissing(true);
        return;
      }
      try {
        const wavesurfer = WaveSurfer.create({
          container,
          height: HEIGHT,
          waveColor: trackHex(color),
          progressColor: ACCENT,
          cursorWidth: 0,
          interact: false,
          minPxPerSec: pxPerSecRef.current,
          hideScrollbar: true,
          normalize: true,
        });
        wavesurferRef.current = wavesurfer;
        await wavesurfer.loadBlob(blob);
      } catch {
        if (!cancelled) setMissing(true);
      }
    })();

    return () => {
      cancelled = true;
      wavesurferRef.current?.destroy();
      wavesurferRef.current = null;
    };
    // Recreate only when the underlying audio (or color) changes.
  }, [audioKey, color]);

  // Keep the ref in sync and apply zoom in place (no recreation).
  useEffect(() => {
    pxPerSecRef.current = pxPerSec;
    wavesurferRef.current?.zoom(pxPerSec);
  }, [pxPerSec]);

  if (!audioKey) {
    return (
      <div
        className="flex w-full items-center rounded border border-dashed border-border px-3 text-xs text-neutral-500"
        style={{ height: HEIGHT }}
        aria-label={label}
      >
        {t("noTracks")}
      </div>
    );
  }

  return (
    <div className="w-full" aria-label={label} role="img">
      {missing ? (
        <div
          className="flex w-full items-center rounded border border-dashed border-red-900 px-3 text-xs text-red-400"
          style={{ height: HEIGHT }}
        >
          {t("audioMissing")}
        </div>
      ) : (
        <div ref={containerRef} className="w-full overflow-hidden rounded" />
      )}
    </div>
  );
}
