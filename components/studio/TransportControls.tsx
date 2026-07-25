"use client";

import { useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";
import { Circle, Ear, Pause, Play, Square, Timer } from "lucide-react";
import { cn, clamp, formatTime } from "@/lib/utils";
import { useAudioEngine } from "@/hooks/useAudioEngine";
import { audioEngine } from "@/lib/audio/engine";
import { useMonitoringStore } from "@/lib/store/monitoringStore";
import { useProjectStore } from "@/lib/store/projectStore";
import { AccessibleButton } from "@/components/shared/AccessibleButton";

export interface TransportControlsProps {
  isRecording: boolean;
  onToggleRecord: () => void;
  metronomeOn: boolean;
  onToggleMetronome: () => void;
  metronomeVolume: number;
  onMetronomeVolumeChange: (volume: number) => void;
}

const MIN_BPM = 40;
const MAX_BPM = 240;

/**
 * Fixed bottom transport bar: play/pause, stop, record, position display,
 * project BPM input (40..240) and the metronome toggle + click volume.
 */
export function TransportControls({
  isRecording,
  onToggleRecord,
  metronomeOn,
  onToggleMetronome,
  metronomeVolume,
  onMetronomeVolumeChange,
}: TransportControlsProps) {
  const t = useTranslations("studio");
  const { isPlaying, position, play, pause, stop } = useAudioEngine();
  const bpm = useProjectStore((state) => state.project?.bpm ?? 120);
  const setBpm = useProjectStore((state) => state.setBpm);
  const tracks = useProjectStore((state) => state.project?.tracks);
  const monitoringEnabled = useMonitoringStore((state) => state.enabled);
  const toggleMonitoring = useMonitoringStore((state) => state.toggle);

  const [maxDuration, setMaxDuration] = useState(0);
  const [bpmDraft, setBpmDraft] = useState(String(bpm));

  const bpmId = useId();
  const clickVolumeId = useId();

  useEffect(() => {
    const refresh = () => setMaxDuration(audioEngine.getMaxDuration());
    refresh();
    // Engine decodes new clips asynchronously after track changes.
    const timer = window.setTimeout(refresh, 800);
    return () => window.clearTimeout(timer);
  }, [position, tracks]);

  useEffect(() => {
    setBpmDraft(String(bpm));
  }, [bpm]);

  function commitBpm(raw: string) {
    const value = Number(raw);
    if (Number.isFinite(value) && raw.trim() !== "") {
      setBpm(clamp(Math.round(value), MIN_BPM, MAX_BPM));
    } else {
      setBpmDraft(String(bpm));
    }
  }

  return (
    <div
      role="toolbar"
      aria-label={t("transport")}
      className="fixed inset-x-0 bottom-0 z-30 flex h-20 flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-panel px-3 sm:px-4"
    >
      {/* Transport buttons */}
      <div className="flex items-center gap-1">
        <AccessibleButton
          variant="icon"
          ariaLabel={isPlaying ? t("pause") : t("play")}
          aria-pressed={isPlaying}
          onClick={() => {
            if (isPlaying) {
              pause();
            } else {
              void play();
            }
          }}
          className={cn("bg-accent/10 text-accent hover:bg-accent/20 hover:text-accent")}
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" aria-hidden="true" />
          ) : (
            <Play className="h-5 w-5" aria-hidden="true" />
          )}
        </AccessibleButton>
        <AccessibleButton
          variant="icon"
          ariaLabel={t("stop")}
          onClick={stop}
        >
          <Square className="h-4 w-4" aria-hidden="true" />
        </AccessibleButton>
        <AccessibleButton
          variant="icon"
          ariaLabel={isRecording ? t("stop") : t("record")}
          aria-pressed={isRecording}
          onClick={onToggleRecord}
          className={cn(isRecording && "animate-pulse bg-red-950 hover:bg-red-950")}
        >
          <Circle
            className={cn("h-4 w-4", isRecording ? "fill-red-500 text-red-500" : "text-red-500")}
            aria-hidden="true"
          />
        </AccessibleButton>
        <AccessibleButton
          variant="icon"
          ariaLabel={t("monitoring")}
          aria-pressed={monitoringEnabled}
          onClick={toggleMonitoring}
          className={cn(
            monitoringEnabled && "bg-accent/20 text-accent hover:bg-accent/20 hover:text-accent",
          )}
        >
          <Ear className="h-4 w-4" aria-hidden="true" />
        </AccessibleButton>
      </div>

      {/* Position display */}
      <div
        className="min-w-24 text-sm tabular-nums text-neutral-200"
        role="timer"
        aria-label={`${t("position")}: ${formatTime(position)} / ${formatTime(maxDuration)}`}
      >
        {formatTime(position)}
        <span className="text-neutral-500"> / {formatTime(maxDuration)}</span>
        {isRecording && (
          <span className="ml-2 text-xs font-medium text-red-400">{t("recording")}</span>
        )}
      </div>

      {/* BPM */}
      <div className="flex items-center gap-1.5">
        <label htmlFor={bpmId} className="text-xs text-neutral-400">
          {t("bpm")}
        </label>
        <input
          id={bpmId}
          type="number"
          inputMode="numeric"
          min={MIN_BPM}
          max={MAX_BPM}
          step={1}
          value={bpmDraft}
          onChange={(event) => setBpmDraft(event.target.value)}
          onBlur={(event) => commitBpm(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              commitBpm(event.currentTarget.value);
              event.currentTarget.blur();
            }
          }}
          aria-label={`${t("bpm")} (${MIN_BPM}–${MAX_BPM})`}
          className="input-field w-20 text-center"
        />
      </div>

      {/* Metronome toggle + click volume */}
      <div className="flex items-center gap-1.5">
        <AccessibleButton
          variant="icon"
          ariaLabel={t("metronome")}
          aria-pressed={metronomeOn}
          onClick={onToggleMetronome}
          className={cn(metronomeOn && "bg-accent/20 text-accent hover:bg-accent/20 hover:text-accent")}
        >
          <Timer className="h-4 w-4" aria-hidden="true" />
        </AccessibleButton>
        <label htmlFor={clickVolumeId} className="sr-only">
          {t("metronomeVolume")}
        </label>
        <input
          id={clickVolumeId}
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(metronomeVolume * 100)}
          onChange={(event) => onMetronomeVolumeChange(Number(event.target.value) / 100)}
          aria-label={t("metronomeVolume")}
          className="hidden h-1 w-20 accent-accent sm:block"
        />
      </div>
    </div>
  );
}
