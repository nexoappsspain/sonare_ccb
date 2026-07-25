"use client";

import { useEffect, useId } from "react";
import { useTranslations } from "next-intl";
import { Power, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FX_PARAM_DEFS, FX_PRESETS, defaultFxParams } from "@/lib/audio/effects";
import { useProjectStore } from "@/lib/store/projectStore";
import { AccessibleButton } from "@/components/shared/AccessibleButton";
import type { FxSettings, FxType } from "@/types";

export interface FxRackProps {
  /** Track being edited; drawer is hidden when null. */
  trackId: string | null;
  onClose: () => void;
}

const FX_TYPES: FxType[] = ["reverb", "delay", "compressor", "eq", "noiseGate"];
const PRESET_KEYS = ["voice", "wind", "strings", "keys"] as const;
const PRESET_LABEL_KEYS = {
  voice: "presetVoice",
  wind: "presetWind",
  strings: "presetStrings",
  keys: "presetKeys",
} as const;

/**
 * FX rack drawer for one track: the five effect types with an enable toggle
 * and per-parameter sliders (definitions from FX_PARAM_DEFS), plus one-click
 * presets (voice/wind/strings/keys). Every change is written to the project
 * store; the StudioShell syncs the engine FX chain from there.
 */
export function FxRack({ trackId, onClose }: FxRackProps) {
  const t = useTranslations("fx");
  const tCommon = useTranslations("common");
  const track = useProjectStore((state) =>
    state.project?.tracks.find((candidate) => candidate.id === trackId),
  );
  const updateTrack = useProjectStore((state) => state.updateTrack);
  const titleId = useId();

  /* Escape closes the drawer. */
  useEffect(() => {
    if (!trackId) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [trackId, onClose]);

  if (!trackId || !track) return null;

  // Narrowed aliases: closures below capture definitely-defined values.
  const currentTrackId = track.id;
  const fxChain = track.fxChain;

  const writeChain = (nextChain: FxSettings[]) =>
    updateTrack(currentTrackId, { fxChain: nextChain });

  const findFx = (type: FxType) => fxChain.find((fx) => fx.type === type);

  function toggleFx(type: FxType) {
    const existing = findFx(type);
    if (!existing) {
      writeChain([
        ...fxChain,
        { id: crypto.randomUUID(), type, enabled: true, params: defaultFxParams(type) },
      ]);
      return;
    }
    writeChain(
      fxChain.map((fx) => (fx.id === existing.id ? { ...fx, enabled: !fx.enabled } : fx)),
    );
  }

  function setParam(fx: FxSettings, key: string, value: number) {
    writeChain(
      fxChain.map((candidate) =>
        candidate.id === fx.id
          ? { ...candidate, params: { ...candidate.params, [key]: value } }
          : candidate,
      ),
    );
  }

  function applyPreset(presetKey: (typeof PRESET_KEYS)[number]) {
    writeChain(
      FX_PRESETS[presetKey].map((fx) => ({
        ...fx,
        id: crypto.randomUUID(),
        params: { ...fx.params },
      })),
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex h-full w-full max-w-sm flex-col border-l border-border bg-panel"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 id={titleId} className="truncate text-sm font-semibold text-neutral-100">
            {t("title")} — {track.name}
          </h2>
          <AccessibleButton variant="icon" size="sm" ariaLabel={tCommon("close")} onClick={onClose}>
            <X className="h-4 w-4" aria-hidden="true" />
          </AccessibleButton>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          {/* Presets */}
          <div className="mb-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-neutral-500">
              {t("presets")}
            </p>
            <div className="flex flex-wrap gap-2">
              {PRESET_KEYS.map((presetKey) => (
                <AccessibleButton
                  key={presetKey}
                  variant="secondary"
                  size="sm"
                  ariaLabel={`${t("presets")}: ${t(PRESET_LABEL_KEYS[presetKey])}`}
                  onClick={() => applyPreset(presetKey)}
                >
                  {t(PRESET_LABEL_KEYS[presetKey])}
                </AccessibleButton>
              ))}
            </div>
          </div>

          {/* Effect chain */}
          <div className="flex flex-col gap-3">
            {FX_TYPES.map((type) => {
              const fx = findFx(type);
              const enabled = fx?.enabled ?? false;
              return (
                <section
                  key={type}
                  aria-label={t(type)}
                  className={cn(
                    "rounded-lg border border-border bg-background p-3",
                    !enabled && "opacity-60",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium text-neutral-200">{t(type)}</h3>
                    <AccessibleButton
                      variant="icon"
                      size="sm"
                      ariaLabel={`${enabled ? t("enabled") : t("disabled")} — ${t(type)}`}
                      aria-pressed={enabled}
                      onClick={() => toggleFx(type)}
                      className={cn(enabled && "bg-accent/20 text-accent hover:bg-accent/20 hover:text-accent")}
                    >
                      <Power className="h-4 w-4" aria-hidden="true" />
                    </AccessibleButton>
                  </div>

                  {fx && enabled && (
                    <div className="mt-3 flex flex-col gap-2">
                      {FX_PARAM_DEFS[type].map((def) => {
                        const value = fx.params[def.key] ?? def.default;
                        const inputId = `fx-${fx.id}-${def.key}`;
                        return (
                          <div key={def.key} className="flex items-center gap-2">
                            <label
                              htmlFor={inputId}
                              className="w-20 shrink-0 text-xs text-neutral-400"
                            >
                              {t(def.key as FxParamLabelKey)}
                            </label>
                            <input
                              id={inputId}
                              type="range"
                              min={def.min}
                              max={def.max}
                              step={def.step}
                              value={value}
                              onChange={(event) =>
                                setParam(fx, def.key, Number(event.target.value))
                              }
                              aria-label={`${t(def.key as FxParamLabelKey)} — ${t(type)} — ${track.name}`}
                              className="h-1 min-w-0 flex-1 accent-accent"
                            />
                            <span
                              className="w-12 shrink-0 text-right text-xs tabular-nums text-neutral-400"
                              aria-hidden="true"
                            >
                              {formatParamValue(value)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      </aside>
    </div>
  );
}

type FxParamLabelKey =
  | "decay"
  | "wet"
  | "time"
  | "feedback"
  | "threshold"
  | "ratio"
  | "attack"
  | "release"
  | "low"
  | "mid"
  | "high";

function formatParamValue(value: number): string {
  return Math.abs(value) >= 10 ? value.toFixed(0) : value.toFixed(2).replace(/\.?0+$/, "");
}
