"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { AccessibleButton } from "@/components/shared/AccessibleButton";

export interface TakeChoiceDialogProps {
  open: boolean;
  title: string;
  replaceLabel: string;
  stackLabel: string;
  cancelLabel: string;
  onReplace: () => void;
  onStack: () => void;
  onCancel: () => void;
}

/**
 * Choice modal shown when a recording lands on a track that already has
 * audio: replace the current take, stack the previous one, or cancel
 * (discards the new recording). Follows the ConfirmDialog a11y pattern:
 * role="dialog" + aria-modal, Escape cancels, initial focus on cancel and
 * a focus trap across the three actions.
 */
export function TakeChoiceDialog({
  open,
  title,
  replaceLabel,
  stackLabel,
  cancelLabel,
  onReplace,
  onStack,
  onCancel,
}: TakeChoiceDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const stackRef = useRef<HTMLButtonElement>(null);
  const replaceRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      cancelRef.current?.focus();
    }
  }, [open]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onCancel();
      return;
    }

    if (event.key === "Tab") {
      const focusables = [cancelRef.current, stackRef.current, replaceRef.current].filter(
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onKeyDown={handleKeyDown}
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="take-choice-dialog-title"
        className="card w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="take-choice-dialog-title" className="text-lg font-semibold text-neutral-100">
          {title}
        </h2>
        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <AccessibleButton
            ref={cancelRef}
            variant="secondary"
            ariaLabel={cancelLabel}
            onClick={onCancel}
          >
            {cancelLabel}
          </AccessibleButton>
          <AccessibleButton
            ref={stackRef}
            variant="primary"
            ariaLabel={stackLabel}
            onClick={onStack}
          >
            {stackLabel}
          </AccessibleButton>
          <AccessibleButton
            ref={replaceRef}
            variant="danger"
            ariaLabel={replaceLabel}
            onClick={onReplace}
          >
            {replaceLabel}
          </AccessibleButton>
        </div>
      </div>
    </div>
  );
}
