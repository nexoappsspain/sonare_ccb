"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Headphones } from "lucide-react";
import { AccessibleButton } from "@/components/shared/AccessibleButton";

export interface HeadphoneWarningDialogProps {
  onConnect: () => void;
  onRecordWithoutPlayback: () => void;
  onCancel: () => void;
}

/**
 * Warning shown when the user starts an overdub recording without headphones
 * connected. Prevents the microphone from picking up the backing track playing
 * through the device speaker.
 */
export function HeadphoneWarningDialog({
  onConnect,
  onRecordWithoutPlayback,
  onCancel,
}: HeadphoneWarningDialogProps) {
  const t = useTranslations("studio");
  const tCommon = useTranslations("common");

  const connectRef = useRef<HTMLButtonElement>(null);
  const withoutRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    connectRef.current?.focus();
  }, []);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
      return;
    }

    if (event.key === "Tab") {
      const focusables = [connectRef.current, withoutRef.current, cancelRef.current].filter(
        (el): el is HTMLButtonElement => el !== null,
      );
      if (focusables.length === 0) return;

      const active = document.activeElement;
      const index = focusables.indexOf(active as HTMLButtonElement);

      if (event.shiftKey) {
        if (index <= 0) {
          event.preventDefault();
          focusables[focusables.length - 1].focus();
        }
      } else if (index === -1 || index === focusables.length - 1) {
        event.preventDefault();
        focusables[0].focus();
      }
    }
  }

  const titleId = "headphone-warning-dialog-title";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onKeyDown={handleKeyDown}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <Headphones className="h-6 w-6 shrink-0 text-accent" aria-hidden="true" />
          <h2 id={titleId} className="text-lg font-semibold text-neutral-100">
            {t("headphoneWarningTitle")}
          </h2>
        </div>

        <p className="mt-4 text-sm text-neutral-300">{t("headphoneWarningBody")}</p>

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <AccessibleButton
            ref={cancelRef}
            variant="secondary"
            ariaLabel={tCommon("cancel")}
            onClick={onCancel}
          >
            {tCommon("cancel")}
          </AccessibleButton>
          <AccessibleButton
            ref={withoutRef}
            variant="secondary"
            ariaLabel={t("recordWithoutPlayback")}
            onClick={() => onRecordWithoutPlayback()}
          >
            {t("recordWithoutPlayback")}
          </AccessibleButton>
          <AccessibleButton
            ref={connectRef}
            variant="primary"
            ariaLabel={t("headphonesConnected")}
            onClick={() => onConnect()}
          >
            {t("headphonesConnected")}
          </AccessibleButton>
        </div>
      </div>
    </div>
  );
}
