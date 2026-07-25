"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Headphones, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useProjectStore } from "@/lib/store/projectStore";
import { AccessibleButton } from "@/components/shared/AccessibleButton";
import { TRACK_COLOR_CLASSES } from "@/components/studio/trackColors";
import type { Track } from "@/types";

export interface MixerProps {
  /** Mobile only: whether the bottom sheet is open. */
  open: boolean;
  /** Mobile only: closes the bottom sheet. */
  onClose: () => void;
}

function MixerChannel({ track }: { track: Track }) {
  const t = useTranslations("studio");
  const updateTrack = useProjectStore((state) => state.updateTrack);
  const setSelectedTrack = useProjectStore((state) => state.setSelectedTrack);
  const isSelected = useProjectStore((state) => state.selectedTrackId === track.id);
  const volumeId = useId();
  const panId = useId();
  const colorClasses = TRACK_COLOR_CLASSES[track.color];

  return (
    <div
      className={cn(
        "flex w-20 shrink-0 flex-col items-center gap-2 rounded-lg border border-border bg-background p-2",
        isSelected && "ring-2 ring-accent",
      )}
    >
      <button
        type="button"
        onClick={() => setSelectedTrack(track.id)}
        aria-label={`${t("trackControls")} — ${track.name}`}
        className={cn(
          "flex w-full items-center justify-center gap-1 truncate rounded px-1 py-0.5 text-xs font-medium text-neutral-200 transition-colors hover:text-accent",
        )}
      >
        <span className={cn("h-2 w-2 shrink-0 rounded-full", colorClasses.bar)} aria-hidden="true" />
        <span className="truncate">{track.name}</span>
      </button>

      <label htmlFor={volumeId} className="sr-only">
        {`${t("volume")} — ${track.name}`}
      </label>
      <input
        id={volumeId}
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(track.volume * 100)}
        onChange={(event) => updateTrack(track.id, { volume: Number(event.target.value) / 100 })}
        aria-label={`${t("volume")} — ${track.name}`}
        aria-orientation="vertical"
        className="h-24 w-2 [appearance:slider-vertical] [direction:rtl] [writing-mode:vertical-lr] accent-accent"
      />
      <span className="text-[10px] tabular-nums text-neutral-500" aria-hidden="true">
        {Math.round(track.volume * 100)}
      </span>

      <label htmlFor={panId} className="sr-only">
        {`${t("pan")} — ${track.name}`}
      </label>
      <input
        id={panId}
        type="range"
        min={-50}
        max={50}
        step={1}
        value={Math.round(track.pan * 50)}
        onChange={(event) => updateTrack(track.id, { pan: Number(event.target.value) / 50 })}
        aria-label={`${t("pan")} — ${track.name}`}
        className="h-1 w-full accent-accent"
      />

      <div className="flex gap-1">
        <AccessibleButton
          variant="icon"
          size="sm"
          ariaLabel={`${t("mute")} — ${track.name}`}
          aria-pressed={track.mute}
          onClick={() => updateTrack(track.id, { mute: !track.mute })}
          className={cn("p-1", track.mute && "bg-red-950 text-red-400 hover:bg-red-950 hover:text-red-300")}
        >
          <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />
        </AccessibleButton>
        <AccessibleButton
          variant="icon"
          size="sm"
          ariaLabel={`${t("solo")} — ${track.name}`}
          aria-pressed={track.solo}
          onClick={() => updateTrack(track.id, { solo: !track.solo })}
          className={cn("p-1", track.solo && "bg-amber-950 text-amber-400 hover:bg-amber-950 hover:text-amber-300")}
        >
          <Headphones className="h-3.5 w-3.5" aria-hidden="true" />
        </AccessibleButton>
      </div>
    </div>
  );
}

/**
 * Mixer: vertical volume fader + pan + mute/solo per track.
 * Desktop: fixed side panel (hidden below md). Mobile: bottom sheet that
 * slides over the timeline when `open` (leaves the transport bar visible).
 */
export function Mixer({ open, onClose }: MixerProps) {
  const t = useTranslations("studio");
  const tCommon = useTranslations("common");
  const tracks = useProjectStore((state) => state.project?.tracks ?? []);

  const channels = (
    <>
      {tracks.length === 0 ? (
        <p className="p-3 text-sm text-neutral-500">{t("noTrackSelected")}</p>
      ) : (
        tracks.map((track) => <MixerChannel key={track.id} track={track} />)
      )}
    </>
  );

  return (
    <>
      {/* Desktop side panel */}
      <aside
        aria-label={t("mixer")}
        className="hidden w-72 shrink-0 flex-col border-l border-border bg-panel md:flex"
      >
        <h2 className="border-b border-border px-3 py-2 text-sm font-semibold text-neutral-200">
          {t("mixer")}
        </h2>
        <div className="flex min-h-0 flex-1 flex-wrap content-start gap-2 overflow-y-auto p-3">
          {channels}
        </div>
      </aside>

      {/* Mobile bottom sheet (leaves the fixed transport bar visible) */}
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-label={t("mixer")}
          className="fixed inset-x-0 bottom-20 z-40 max-h-[55vh] overflow-y-auto rounded-t-xl border-t border-border bg-panel shadow-2xl md:hidden"
        >
          <div className="sticky top-0 flex items-center justify-between border-b border-border bg-panel px-3 py-2">
            <h2 className="text-sm font-semibold text-neutral-200">{t("mixer")}</h2>
            <AccessibleButton
              variant="icon"
              size="sm"
              ariaLabel={tCommon("close")}
              onClick={onClose}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </AccessibleButton>
          </div>
          <div className="flex flex-wrap gap-2 p-3">{channels}</div>
        </div>
      )}
    </>
  );
}
