"use client";

import { useEffect, useRef, type KeyboardEvent } from "react";
import { AccessibleButton } from "@/components/shared/AccessibleButton";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Accessible confirmation modal:
 * role="dialog" + aria-modal, Escape cancels, initial focus on the
 * cancel button and a simple focus trap between the two actions.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

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
      const focusables = [cancelRef.current, confirmRef.current].filter(
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
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        className="card w-full max-w-md"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="confirm-dialog-title" className="text-lg font-semibold text-neutral-100">
          {title}
        </h2>
        <p id="confirm-dialog-message" className="mt-2 text-sm text-neutral-400">
          {message}
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <AccessibleButton
            ref={cancelRef}
            variant="secondary"
            ariaLabel={cancelLabel}
            onClick={onCancel}
          >
            {cancelLabel}
          </AccessibleButton>
          <AccessibleButton
            ref={confirmRef}
            variant="danger"
            ariaLabel={confirmLabel}
            onClick={onConfirm}
          >
            {confirmLabel}
          </AccessibleButton>
        </div>
      </div>
    </div>
  );
}
