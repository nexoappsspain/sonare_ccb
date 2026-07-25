"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslations } from "next-intl";
import { Mic, MicOff, RefreshCw } from "lucide-react";
import { AccessibleButton } from "@/components/shared/AccessibleButton";
import {
  onMicrophonePermissionChange,
  requestMicrophoneAccess,
} from "@/lib/audio/micPermission";

export interface MicPermissionDialogProps {
  /** "prompt": ask before the browser prompt; "denied": unblock instructions. */
  mode: "prompt" | "denied";
  onClose: () => void;
  /** Permission became available — the shell closes the dialog and retries recording. */
  onGranted: () => void;
}

/**
 * Microphone permission modal. Follows the TakeChoiceDialog a11y pattern:
 * role="dialog" + aria-modal, Escape cancels, initial focus on the primary
 * action and a focus trap across the two actions.
 *
 * Two modes: "prompt" explains why the mic is needed before triggering the
 * native browser prompt; if the user denies it there, the dialog transitions
 * internally to "denied", which shows step-by-step unblock instructions for
 * Chrome and Safari plus a reload action. While open, it watches the
 * Permissions API so re-enabling the mic in site settings auto-continues.
 */
export function MicPermissionDialog({ mode, onClose, onGranted }: MicPermissionDialogProps) {
  const t = useTranslations("studio");
  const tCommon = useTranslations("common");

  // Internal mode lets a denied browser prompt transition prompt -> denied
  // without the parent having to re-render the dialog.
  const [internalMode, setInternalMode] = useState<"prompt" | "denied">(mode);
  useEffect(() => {
    setInternalMode(mode);
  }, [mode]);

  const [requesting, setRequesting] = useState(false);

  const secondaryRef = useRef<HTMLButtonElement>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    primaryRef.current?.focus();
  }, [internalMode]);

  // If the user re-enables the mic in the browser site settings while this
  // dialog is open, continue straight into recording.
  useEffect(() => {
    const unsubscribe = onMicrophonePermissionChange((state) => {
      if (state === "granted") {
        onGranted();
      }
    });
    return unsubscribe;
  }, [onGranted]);

  async function handleAllow() {
    setRequesting(true);
    try {
      const granted = await requestMicrophoneAccess();
      if (granted) {
        onGranted();
      } else {
        setInternalMode("denied");
      }
    } finally {
      setRequesting(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key === "Tab") {
      const focusables = [secondaryRef.current, primaryRef.current].filter(
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

  const isPrompt = internalMode === "prompt";
  const titleId = "mic-permission-dialog-title";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onKeyDown={handleKeyDown}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="card w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          {isPrompt ? (
            <Mic className="h-6 w-6 shrink-0 text-neutral-100" aria-hidden="true" />
          ) : (
            <MicOff className="h-6 w-6 shrink-0 text-red-400" aria-hidden="true" />
          )}
          <h2 id={titleId} className="text-lg font-semibold text-neutral-100">
            {isPrompt ? t("micPromptTitle") : t("micDeniedTitle")}
          </h2>
        </div>

        {isPrompt ? (
          <p className="mt-4 text-sm text-neutral-300">{t("micPromptBody")}</p>
        ) : (
          <div className="mt-4 space-y-4 text-sm text-neutral-300">
            <section>
              <h3 className="font-semibold text-neutral-100">{t("micStepsChromeTitle")}</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                <li>{t("micStepsChrome1")}</li>
                <li>{t("micStepsChrome2")}</li>
                <li>{t("micStepsChrome3")}</li>
                <li>{t("micStepsChrome4")}</li>
              </ol>
            </section>
            <section>
              <h3 className="font-semibold text-neutral-100">{t("micStepsSafariTitle")}</h3>
              <ol className="mt-1 list-decimal space-y-1 pl-5">
                <li>{t("micStepsSafari1")}</li>
                <li>{t("micStepsSafari2")}</li>
                <li>{t("micStepsSafari3")}</li>
              </ol>
            </section>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <AccessibleButton
            ref={secondaryRef}
            variant="secondary"
            ariaLabel={isPrompt ? tCommon("cancel") : tCommon("close")}
            onClick={onClose}
          >
            {isPrompt ? tCommon("cancel") : tCommon("close")}
          </AccessibleButton>
          {isPrompt ? (
            <AccessibleButton
              ref={primaryRef}
              variant="primary"
              ariaLabel={t("micAllow")}
              onClick={() => void handleAllow()}
              disabled={requesting}
            >
              {t("micAllow")}
            </AccessibleButton>
          ) : (
            <AccessibleButton
              ref={primaryRef}
              variant="primary"
              ariaLabel={t("micReload")}
              onClick={() => window.location.reload()}
            >
              <span className="inline-flex items-center gap-2">
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                {t("micReload")}
              </span>
            </AccessibleButton>
          )}
        </div>
      </div>
    </div>
  );
}
