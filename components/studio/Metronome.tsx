"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { Timer, X } from "lucide-react";
import { clamp } from "@/lib/utils";
import { useProjectStore } from "@/lib/store/projectStore";
import { AccessibleButton } from "@/components/shared/AccessibleButton";

export interface MetronomePanelProps {
  on: boolean;
  volume: number;
  onToggle: () => void;
  onVolumeChange: (volume: number) => void;
  onClose: () => void;
}

const MIN_BPM = 40;
const MAX_BPM = 240;

/**
 * Metronome popover panel: BPM slider + numeric input (bound to the project
 * BPM, clamped 40..240), on/off toggle and click volume. The actual click
 * lives in the shared `metronome` singleton (lib/audio/metronome.ts), driven
 * by the StudioShell through the callbacks above.
 */
export function MetronomePanel({
  on,
  volume,
  onToggle,
  onVolumeChange,
  onClose,
}: MetronomePanelProps) {
  const t = useTranslations("studio");
  const tFx = useTranslations("fx");
  const tCommon = useTranslations("common");
  const bpm = useProjectStore((state) => state.project?.bpm ?? 120);
  const setBpm = useProjectStore((state) => state.setBpm);

  const bpmSliderId = useId();
  const bpmInputId = useId();
  const volumeId = useId();

  const commitBpm = (value: number) => {
    if (Number.isFinite(value)) {
      setBpm(clamp(Math.round(value), MIN_BPM, MAX_BPM));
    }
  };

  return (
    <div
      role="dialog"
      aria-label={t("metronome")}
      className="card w-72 p-3 shadow-2xl"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-neutral-200">
          <Timer className="h-4 w-4 text-accent" aria-hidden="true" />
          {t("metronome")}
        </h2>
        <div className="flex items-center gap-1">
          <AccessibleButton
            variant={on ? "primary" : "secondary"}
            size="sm"
            ariaLabel={t("metronome")}
            aria-pressed={on}
            onClick={onToggle}
          >
            {on ? tFx("enabled") : tFx("disabled")}
          </AccessibleButton>
          <AccessibleButton
            variant="icon"
            size="sm"
            ariaLabel={tCommon("close")}
            onClick={onClose}
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        <div className="flex items-end gap-2">
          <div className="flex flex-1 flex-col gap-1">
            <label htmlFor={bpmSliderId} className="text-xs text-neutral-400">
              {t("bpm")} ({MIN_BPM}–{MAX_BPM})
            </label>
            <input
              id={bpmSliderId}
              type="range"
              min={MIN_BPM}
              max={MAX_BPM}
              step={1}
              value={bpm}
              onChange={(event) => commitBpm(Number(event.target.value))}
              aria-label={t("bpm")}
              className="h-1 accent-accent"
            />
          </div>
          <input
            id={bpmInputId}
            type="number"
            min={MIN_BPM}
            max={MAX_BPM}
            step={1}
            value={bpm}
            onChange={(event) => commitBpm(Number(event.target.value))}
            aria-label={`${t("bpm")} (${MIN_BPM}–${MAX_BPM})`}
            className="input-field w-20 text-center"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor={volumeId} className="text-xs text-neutral-400">
            {t("metronomeVolume")}
          </label>
          <input
            id={volumeId}
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(volume * 100)}
            onChange={(event) => onVolumeChange(Number(event.target.value) / 100)}
            aria-label={t("metronomeVolume")}
            className="h-1 accent-accent"
          />
        </div>
      </div>
    </div>
  );
}
