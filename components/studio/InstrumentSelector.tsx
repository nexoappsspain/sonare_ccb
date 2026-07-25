"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import { SAMPLER_IDS } from "@/lib/audio/instruments";
import { useProjectStore } from "@/lib/store/projectStore";
import type { Track } from "@/types";

export interface InstrumentSelectorProps {
  track: Track;
}

/**
 * Instrument picker for a track:
 *  - MIDI tracks choose one of the synthesized sampler instruments.
 *  - Audio tracks choose a free-form "real" instrument label (the same 18
 *    options used in the profile settings).
 */
export function InstrumentSelector({ track }: InstrumentSelectorProps) {
  const tStudio = useTranslations("studio");
  const tSampler = useTranslations("sampler");
  const tSettings = useTranslations("settings");
  const updateTrack = useProjectStore((state) => state.updateTrack);
  const selectId = useId();

  if (track.kind === "midi") {
    const value = track.samplerId ?? SAMPLER_IDS[0];
    return (
      <div className="flex flex-col gap-1">
        <label htmlFor={selectId} className="text-xs text-neutral-400">
          {tStudio("selectSampler")}
        </label>
        <select
          id={selectId}
          value={value}
          onChange={(event) => updateTrack(track.id, { samplerId: event.target.value })}
          aria-label={`${tStudio("selectSampler")} — ${track.name}`}
          className="input-field"
        >
          {SAMPLER_IDS.map((samplerId) => (
            <option key={samplerId} value={samplerId}>
              {tSampler(samplerId)}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="text-xs text-neutral-400">
        {tStudio("instrument")}
      </label>
      <select
        id={selectId}
        value={track.instrument}
        onChange={(event) => updateTrack(track.id, { instrument: event.target.value })}
        aria-label={`${tStudio("instrument")} — ${track.name}`}
        className="input-field"
      >
        <option value="">—</option>
        {REAL_INSTRUMENT_KEYS.map((key) => (
          <option key={key} value={key}>
            {tSettings(`instruments.${key}`)}
          </option>
        ))}
      </select>
    </div>
  );
}

const REAL_INSTRUMENT_KEYS = [
  "clarinet",
  "accordion",
  "flute",
  "violin",
  "guitar",
  "electricGuitar",
  "bass",
  "piano",
  "electricPiano",
  "organ",
  "drums",
  "percussion",
  "voice",
  "saxophone",
  "trumpet",
  "trombone",
  "cello",
  "other",
] as const;
