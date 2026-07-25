"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type DragEvent,
  type PointerEvent,
} from "react";
import { useTranslations } from "next-intl";
import { ZoomIn, ZoomOut } from "lucide-react";
import { cn, formatTime } from "@/lib/utils";
import { audioEngine } from "@/lib/audio/engine";
import { useProjectStore } from "@/lib/store/projectStore";
import { AccessibleButton } from "@/components/shared/AccessibleButton";
import { TrackRow } from "@/components/studio/Track";

export interface TimelineProps {
  /** Files dropped on the timeline (imported by the shell). */
  onImportFiles: (files: File[]) => void;
  /** Opens the FX rack drawer for a track. */
  onOpenFx: (trackId: string) => void;
}

/** Width of the sticky per-track control column (must match TrackRow w-48). */
const CONTROL_COLUMN_PX = 192;
const MIN_PX_PER_SEC = 10;
const MAX_PX_PER_SEC = 400;
const DEFAULT_PX_PER_SEC = 50;
const MIN_DURATION_S = 10;
/** Extra empty seconds shown after the longest clip. */
const RULER_PADDING_S = 5;

/**
 * Timeline: vertical list of track rows under a second ruler, with a
 * playhead driven by the engine progress loop, click/drag-to-seek on the
 * ruler, zoom controls and a drag-and-drop import area.
 */
export function Timeline({ onImportFiles, onOpenFx }: TimelineProps) {
  const t = useTranslations("studio");
  const tracks = useProjectStore((state) => state.project?.tracks ?? []);

  const [pxPerSec, setPxPerSec] = useState(DEFAULT_PX_PER_SEC);
  const [maxDuration, setMaxDuration] = useState(MIN_DURATION_S);
  const [dragOver, setDragOver] = useState(false);

  const playheadRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const seekingRef = useRef(false);

  const zoom = useCallback((factor: number) => {
    setPxPerSec((current) =>
      Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, Math.round(current * factor))),
    );
  }, []);

  /* Playhead: updated imperatively every animation frame (no re-renders). */
  useEffect(() => {
    const unsubscribe = audioEngine.onProgress((seconds) => {
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translateX(${seconds * pxPerSec}px)`;
      }
      const engineMax = audioEngine.getMaxDuration();
      if (engineMax > 0) {
        setMaxDuration((current) => (Math.abs(engineMax - current) > 0.5 ? engineMax : current));
      }
    });
    return unsubscribe;
  }, [pxPerSec]);

  /* Reposition the playhead when zoom/tracks change; re-check the max
     duration shortly after (engine decodes new clips asynchronously). */
  useEffect(() => {
    if (playheadRef.current) {
      playheadRef.current.style.transform = `translateX(${audioEngine.position * pxPerSec}px)`;
    }
    const refresh = () =>
      setMaxDuration(Math.max(MIN_DURATION_S, audioEngine.getMaxDuration()));
    refresh();
    const timer = window.setTimeout(refresh, 800);
    return () => window.clearTimeout(timer);
  }, [pxPerSec, tracks]);

  const rulerSeconds = Math.ceil(Math.max(maxDuration, MIN_DURATION_S)) + RULER_PADDING_S;
  const timelineWidth = rulerSeconds * pxPerSec;

  const seekFromClientX = useCallback(
    (clientX: number) => {
      const ruler = rulerRef.current;
      if (!ruler) return;
      const rect = ruler.getBoundingClientRect();
      const seconds = Math.max(0, (clientX - rect.left) / pxPerSec);
      audioEngine.seek(seconds);
      if (playheadRef.current) {
        playheadRef.current.style.transform = `translateX(${audioEngine.position * pxPerSec}px)`;
      }
    },
    [pxPerSec],
  );

  function handleRulerPointerDown(event: PointerEvent<HTMLDivElement>) {
    seekingRef.current = true;
    event.currentTarget.setPointerCapture(event.pointerId);
    seekFromClientX(event.clientX);
  }

  function handleRulerPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (seekingRef.current) {
      seekFromClientX(event.clientX);
    }
  }

  function handleRulerPointerUp(event: PointerEvent<HTMLDivElement>) {
    seekingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    if (event.dataTransfer.types.includes("Files")) {
      event.preventDefault();
      setDragOver(true);
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    if (event.currentTarget === event.target) {
      setDragOver(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragOver(false);
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) {
      onImportFiles(files);
    }
  }

  return (
    <section aria-label={t("timeline")} className="flex min-h-0 flex-1 flex-col">
      {/* Zoom controls */}
      <div className="flex items-center justify-end gap-1 px-2 py-1">
        <AccessibleButton
          variant="icon"
          size="sm"
          ariaLabel={t("zoomOut")}
          onClick={() => zoom(1 / 1.5)}
          disabled={pxPerSec <= MIN_PX_PER_SEC}
        >
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </AccessibleButton>
        <AccessibleButton
          variant="icon"
          size="sm"
          ariaLabel={t("zoomIn")}
          onClick={() => zoom(1.5)}
          disabled={pxPerSec >= MAX_PX_PER_SEC}
        >
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </AccessibleButton>
      </div>

      {/* Scrollable timeline (horizontal ruler + lanes share one scroll) */}
      <div
        className={cn(
          "relative min-h-0 flex-1 overflow-auto border-t border-border",
          dragOver && "outline outline-2 -outline-offset-2 outline-accent",
        )}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-label={t("dropHint")}
      >
        <div className="relative" style={{ width: CONTROL_COLUMN_PX + timelineWidth }}>
          {/* Ruler */}
          <div className="sticky top-0 z-20 flex h-8 bg-panel">
            <div
              className="sticky left-0 z-10 w-48 shrink-0 border-b border-r border-border bg-panel"
              aria-hidden="true"
            />
            <div
              ref={rulerRef}
              role="slider"
              tabIndex={0}
              aria-label={t("ruler")}
              aria-valuemin={0}
              aria-valuemax={rulerSeconds}
              aria-valuenow={Math.round(audioEngine.position)}
              aria-valuetext={formatTime(audioEngine.position)}
              onPointerDown={handleRulerPointerDown}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
              onKeyDown={(event) => {
                if (event.key === "ArrowLeft") audioEngine.seek(audioEngine.position - 1);
                if (event.key === "ArrowRight") audioEngine.seek(audioEngine.position + 1);
              }}
              className="relative h-8 shrink-0 cursor-text touch-none select-none border-b border-border bg-panel"
              style={{ width: timelineWidth }}
            >
              {Array.from({ length: rulerSeconds + 1 }, (_, second) => (
                <div
                  key={second}
                  className={cn(
                    "absolute bottom-0 border-l border-border",
                    second % 5 === 0 ? "h-4 border-neutral-600" : "h-2",
                  )}
                  style={{ left: second * pxPerSec }}
                >
                  {second % 5 === 0 && (
                    <span className="absolute -top-0.5 left-1 text-[10px] text-neutral-500">
                      {formatTime(second)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Track rows */}
          {tracks.length === 0 ? (
            <div className="flex h-40 items-center justify-center px-4">
              <p className="max-w-sm text-center text-sm text-neutral-500">
                {t("noTracks")}
                <span className="mt-1 block text-xs text-neutral-600">{t("dropHint")}</span>
              </p>
            </div>
          ) : (
            tracks.map((track) => (
              <TrackRow key={track.id} track={track} pxPerSec={pxPerSec} onOpenFx={onOpenFx} />
            ))
          )}

          {/* Playhead (spans ruler + lanes, offset by the control column) */}
          <div
            ref={playheadRef}
            className="pointer-events-none absolute bottom-0 top-0 z-30 w-px bg-red-500"
            style={{ left: CONTROL_COLUMN_PX }}
            aria-hidden="true"
          />
        </div>
      </div>
    </section>
  );
}
