"use client";

/**
 * CCB Sonare Music — AudioGate
 *
 * Fullscreen overlay that blocks the studio until the user interacts with it.
 * Chrome (and other browsers) require a user gesture before an AudioContext
 * can transition out of "suspended". This component calls Tone.start() on
 * click and only renders children after the context is running.
 */

import { useCallback, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Headphones } from "lucide-react";
import * as Tone from "tone";
import { audioEngine } from "@/lib/audio/engine";

export interface AudioGateProps {
  children: React.ReactNode;
}

export function AudioGate({ children }: AudioGateProps) {
  const t = useTranslations("studio");
  const [started, setStarted] = useState(false);

  const startAudio = useCallback(async () => {
    await Tone.start();
    await audioEngine.ensureStarted();
    setStarted(true);
  }, []);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        void startAudio();
      }
    },
    [startAudio],
  );

  if (started) {
    return children;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-6"
      onClick={() => void startAudio()}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={t("audioStartTitle")}
    >
      <Headphones className="mb-4 h-12 w-12 text-neutral-300" aria-hidden="true" />
      <p className="mb-2 text-center text-lg font-semibold text-neutral-100">
        {t("audioStartTitle")}
      </p>
      <p className="text-center text-sm text-neutral-400">{t("audioStartHint")}</p>
    </div>
  );
}
