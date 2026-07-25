"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { useTranslations } from "next-intl";
import { ChevronDown, Circle, Headphones, SlidersHorizontal, Trash2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { audioEngine } from "@/lib/audio/engine";
import { getAudioBlob } from "@/lib/db/indexedDB";
import { useProjectStore } from "@/lib/store/projectStore";
import { AccessibleButton } from "@/components/shared/AccessibleButton";
import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { Waveform } from "@/components/studio/Waveform";
import { InstrumentSelector } from "@/components/studio/InstrumentSelector";
import { TRACK_COLOR_CLASSES } from "@/components/studio/trackColors";
import type { Take, Track } from "@/types";

/** Round to milliseconds so drags/arrow keys do not produce float noise. */
const round3 = (value: number): number => Math.round(value * 1000) / 1000;

/** Next "Take N" label, avoiding collisions with existing labels. */
function nextTakeLabel(takes: Take[]): string {
  let max = 0;
  for (const take of takes) {
    const match = /^Take (\d+)$/.exec(take.label);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `Take ${max + 1}`;
}

export interface TrackRowProps {
  track: Track;
  pxPerSec: number;
  /** Opens the FX rack drawer for this track. */
  onOpenFx: (trackId: string) => void;
}

/**
 * One row of the timeline: sticky control cell (color, editable name,
 * mute/solo, volume/pan, FX, delete, expandable trim/instrument details)
 * plus the waveform lane. Clicking the row selects the track.
 */
export function TrackRow({ track, pxPerSec, onOpenFx }: TrackRowProps) {
  const t = useTranslations("studio");
  const tCommon = useTranslations("common");
  const updateTrack = useProjectStore((state) => state.updateTrack);
  const removeTrack = useProjectStore((state) => state.removeTrack);
  const setSelectedTrack = useProjectStore((state) => state.setSelectedTrack);
  const isSelected = useProjectStore((state) => state.selectedTrackId === track.id);
  const isArmed = useProjectStore((state) => state.armedTrackId === track.id);
  const setArmedTrack = useProjectStore((state) => state.setArmedTrack);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [nameDraft, setNameDraft] = useState(track.name);
  /** Clip offset while a horizontal drag is in progress (visual feedback). */
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const clipDragRef = useRef<{ pointerId: number; startX: number; startOffset: number } | null>(
    null,
  );

  const nameInputId = useId();
  const volumeId = useId();
  const panId = useId();
  const trimStartId = useId();
  const trimEndId = useId();
  const offsetId = useId();

  useEffect(() => {
    setNameDraft(track.name);
  }, [track.name, track.id]);

  function commitName() {
    const trimmed = nameDraft.trim();
    if (trimmed && trimmed !== track.name) {
      updateTrack(track.id, { name: trimmed });
    } else {
      setNameDraft(track.name);
    }
  }

  function handleNameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.currentTarget.blur();
    } else if (event.key === "Escape") {
      setNameDraft(track.name);
      event.currentTarget.blur();
    }
  }

  /* ------------------- Clip horizontal drag (move offset) ------------------- */

  const displayedOffset = dragOffset ?? track.offset;

  function handleClipPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    clipDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startOffset: track.offset,
    };
    setDragOffset(track.offset);
  }

  function handleClipPointerMove(event: PointerEvent<HTMLDivElement>) {
    const drag = clipDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || pxPerSec <= 0) return;
    const deltaSeconds = (event.clientX - drag.startX) / pxPerSec;
    setDragOffset(Math.max(0, drag.startOffset + deltaSeconds));
  }

  function handleClipPointerUp(event: PointerEvent<HTMLDivElement>) {
    const drag = clipDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    clipDragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
    if (dragOffset !== null) {
      const next = round3(Math.max(0, dragOffset));
      if (Math.abs(next - track.offset) > 0.0005) {
        // Engine sync: the StudioShell diff already calls syncTrackSettings
        // when offset changes.
        updateTrack(track.id, { offset: next });
      }
    }
    setDragOffset(null);
  }

  function handleClipPointerCancel(event: PointerEvent<HTMLDivElement>) {
    const drag = clipDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    clipDragRef.current = null;
    setDragOffset(null);
  }

  function handleClipKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 1 : 0.1;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      updateTrack(track.id, { offset: round3(Math.max(0, track.offset - step)) });
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      updateTrack(track.id, { offset: round3(track.offset + step) });
    }
  }

  /* ------------------------------ Take switch ----------------------------- */

  /** Swaps the active take with a stacked one and loads it into the engine. */
  async function switchTake(takeAudioKey: string) {
    const state = useProjectStore.getState();
    const current = state.project?.tracks.find((candidate) => candidate.id === track.id);
    if (!current || !current.audioKey || current.audioKey === takeAudioKey) return;
    const chosen = current.takes?.find((take) => take.audioKey === takeAudioKey);
    if (!chosen) return;

    const remaining = (current.takes ?? []).filter((take) => take.audioKey !== takeAudioKey);
    const newTake: Take = {
      audioKey: current.audioKey,
      label: nextTakeLabel(current.takes ?? []),
      createdAt: new Date().toISOString(),
    };
    state.updateTrack(track.id, {
      audioKey: chosen.audioKey,
      takes: [...remaining, newTake],
    });

    // Explicit load: the shell's load effect skips audioKeys it loaded
    // earlier in the session (they stay reserved in its load map).
    try {
      const blob = await getAudioBlob(chosen.audioKey);
      if (!blob) return;
      const updated = useProjectStore
        .getState()
        .project?.tracks.find((candidate) => candidate.id === track.id);
      if (updated) {
        await audioEngine.loadTrack(updated, blob);
      }
    } catch (error) {
      console.error(error);
    }
  }

  const colorClasses = TRACK_COLOR_CLASSES[track.color];

  return (
    <div
      className={cn(
        "flex border-b border-border transition-colors",
        isSelected && "bg-panelHover/60",
      )}
      onClick={() => setSelectedTrack(track.id)}
      data-track-id={track.id}
    >
      {/* ------------------------- Control cell ------------------------- */}
      <div
        className={cn(
          "sticky left-0 z-10 flex w-48 shrink-0 flex-col gap-1.5 border-r border-border bg-panel p-2",
          isSelected && "ring-2 ring-inset ring-accent",
        )}
      >
        <div className="flex items-center gap-1.5">
          <span
            className={cn("h-8 w-1.5 shrink-0 rounded-full", colorClasses.bar)}
            aria-hidden="true"
          />
          <label htmlFor={nameInputId} className="sr-only">
            {t("trackName")}
          </label>
          <input
            id={nameInputId}
            value={nameDraft}
            onChange={(event) => setNameDraft(event.target.value)}
            onBlur={commitName}
            onKeyDown={handleNameKeyDown}
            aria-label={`${t("trackName")} — ${track.name}`}
            className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 py-0.5 text-sm font-medium text-neutral-100 transition-colors hover:border-border focus:border-accent"
            maxLength={80}
          />
        </div>

        <div className="flex items-center gap-1">
          {track.kind === "audio" && (
            <AccessibleButton
              variant="icon"
              size="sm"
              ariaLabel={`${t("recordArm")} — ${track.name}`}
              aria-pressed={isArmed}
              onClick={() => setArmedTrack(track.id)}
              className={cn(isArmed && "animate-pulse bg-red-950 hover:bg-red-950")}
            >
              <Circle
                className={cn(
                  "h-4 w-4",
                  isArmed ? "fill-red-500 text-red-500" : "text-red-500",
                )}
                aria-hidden="true"
              />
            </AccessibleButton>
          )}
          <AccessibleButton
            variant="icon"
            size="sm"
            ariaLabel={`${t("mute")} — ${track.name}`}
            aria-pressed={track.mute}
            onClick={() => updateTrack(track.id, { mute: !track.mute })}
            className={cn(track.mute && "bg-red-950 text-red-400 hover:bg-red-950 hover:text-red-300")}
          >
            <VolumeX className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-semibold">M</span>
          </AccessibleButton>
          <AccessibleButton
            variant="icon"
            size="sm"
            ariaLabel={`${t("solo")} — ${track.name}`}
            aria-pressed={track.solo}
            onClick={() => updateTrack(track.id, { solo: !track.solo })}
            className={cn(track.solo && "bg-amber-950 text-amber-400 hover:bg-amber-950 hover:text-amber-300")}
          >
            <Headphones className="h-4 w-4" aria-hidden="true" />
            <span className="text-xs font-semibold">S</span>
          </AccessibleButton>
          <AccessibleButton
            variant="icon"
            size="sm"
            ariaLabel={`${t("effects")} — ${track.name}`}
            onClick={() => onOpenFx(track.id)}
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
          <AccessibleButton
            variant="icon"
            size="sm"
            ariaLabel={`${t("deleteTrack")} — ${track.name}`}
            onClick={() => setConfirmDelete(true)}
            className="hover:bg-red-950 hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
          <AccessibleButton
            variant="icon"
            size="sm"
            ariaLabel={`${t("trackControls")} — ${track.name}`}
            aria-expanded={detailsOpen}
            onClick={() => setDetailsOpen((open) => !open)}
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", detailsOpen && "rotate-180")}
              aria-hidden="true"
            />
          </AccessibleButton>
        </div>

        <div className="flex items-center gap-1.5">
          <label htmlFor={volumeId} className="w-10 shrink-0 text-[10px] uppercase text-neutral-500">
            {t("volume")}
          </label>
          <input
            id={volumeId}
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(track.volume * 100)}
            onChange={(event) =>
              updateTrack(track.id, { volume: Number(event.target.value) / 100 })
            }
            aria-label={`${t("volume")} — ${track.name}`}
            className="h-1 min-w-0 flex-1 accent-accent"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <label htmlFor={panId} className="w-10 shrink-0 text-[10px] uppercase text-neutral-500">
            {t("pan")}
          </label>
          <input
            id={panId}
            type="range"
            min={-50}
            max={50}
            step={1}
            value={Math.round(track.pan * 50)}
            onChange={(event) =>
              updateTrack(track.id, { pan: Number(event.target.value) / 50 })
            }
            aria-label={`${t("pan")} — ${track.name}`}
            className="h-1 min-w-0 flex-1 accent-accent"
          />
        </div>

        {detailsOpen && (
          <div className="mt-1 flex flex-col gap-2 rounded-lg border border-border bg-background p-2">
            <InstrumentSelector track={track} />
            {track.kind === "audio" && (
              <>
                <div className="flex flex-col gap-1">
                  <label htmlFor={trimStartId} className="text-xs text-neutral-400">
                    {t("trimStart")}
                  </label>
                  <input
                    id={trimStartId}
                    type="number"
                    min={0}
                    step={0.1}
                    value={track.trimStart}
                    onChange={(event) =>
                      updateTrack(track.id, {
                        trimStart: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                    aria-label={`${t("trimStart")} — ${track.name}`}
                    className="input-field"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={trimEndId} className="text-xs text-neutral-400">
                    {t("trimEnd")}
                  </label>
                  <input
                    id={trimEndId}
                    type="number"
                    min={0}
                    step={0.1}
                    value={track.trimEnd}
                    onChange={(event) =>
                      updateTrack(track.id, {
                        trimEnd: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                    aria-label={`${t("trimEnd")} — ${track.name}`}
                    className="input-field"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor={offsetId} className="text-xs text-neutral-400">
                    {t("offset")}
                  </label>
                  <input
                    id={offsetId}
                    type="number"
                    min={0}
                    step={0.1}
                    value={track.offset}
                    onChange={(event) =>
                      updateTrack(track.id, {
                        offset: Math.max(0, Number(event.target.value) || 0),
                      })
                    }
                    aria-label={`${t("offset")} — ${track.name}`}
                    className="input-field"
                  />
                </div>
                {track.takes && track.takes.length > 0 && (
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-neutral-400">{t("takes")}</span>
                    <ul className="flex flex-col gap-1">
                      <li>
                        <button
                          type="button"
                          disabled
                          aria-current="true"
                          aria-label={t("currentTake")}
                          className="w-full cursor-default rounded border border-accent/60 bg-accent/10 px-2 py-1 text-left text-xs text-accent ring-1 ring-accent"
                        >
                          {t("currentTake")}
                        </button>
                      </li>
                      {track.takes.map((take) => (
                        <li key={take.audioKey}>
                          <button
                            type="button"
                            aria-label={`${t("switchTake")} — ${take.label}`}
                            onClick={() => void switchTake(take.audioKey)}
                            className="w-full rounded border border-border bg-panel px-2 py-1 text-left text-xs text-neutral-300 transition-colors hover:border-accent hover:text-neutral-100"
                          >
                            {take.label}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* --------------------------- Waveform lane --------------------------- */}
      <div className="flex min-w-0 flex-1 items-center px-2 py-1">
        {track.kind === "midi" ? (
          <div
            className="flex w-full items-center gap-2 rounded border border-dashed border-border px-3 text-xs text-neutral-400"
            style={{ height: 48 }}
            aria-label={`${t("midiTrack")} — ${track.name}`}
          >
            <span className={cn("h-2 w-2 rounded-full", colorClasses.bar)} aria-hidden="true" />
            {t("midiTrack")}
          </div>
        ) : (
          <div
            role="slider"
            tabIndex={0}
            aria-label={`${t("moveClip")} — ${track.name}`}
            aria-valuemin={0}
            aria-valuenow={Math.round(displayedOffset * 100) / 100}
            aria-valuetext={`${Math.round(displayedOffset * 100) / 100} s`}
            onPointerDown={handleClipPointerDown}
            onPointerMove={handleClipPointerMove}
            onPointerUp={handleClipPointerUp}
            onPointerCancel={handleClipPointerCancel}
            onKeyDown={handleClipKeyDown}
            className={cn(
              "w-full cursor-grab touch-none select-none rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              dragOffset !== null &&
                "cursor-grabbing outline outline-2 -outline-offset-2 outline-accent",
            )}
            style={{ transform: `translateX(${displayedOffset * pxPerSec}px)` }}
          >
            <Waveform
              audioKey={track.audioKey}
              color={track.color}
              label={`${t("waveform")} — ${track.name}`}
              pxPerSec={pxPerSec}
            />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        title={t("deleteTrack")}
        message={`${t("deleteTrackConfirm")} (${track.name})`}
        confirmLabel={tCommon("delete")}
        cancelLabel={tCommon("cancel")}
        onConfirm={() => {
          removeTrack(track.id);
          setConfirmDelete(false);
        }}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
