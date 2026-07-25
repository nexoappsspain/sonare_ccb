"use client";

import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LoadingSpinnerProps {
  /** Extra classes for the outer wrapper (defaults to a centered block). */
  className?: string;
}

/**
 * Reusable centered spinner with an accessible name (common.loading)
 * and role="status" for assistive technologies.
 */
export function LoadingSpinner({ className }: LoadingSpinnerProps) {
  const t = useTranslations("common");

  return (
    <div
      className={cn("flex min-h-[40vh] items-center justify-center", className)}
      role="status"
    >
      <Loader2
        className="h-8 w-8 animate-spin text-accent"
        aria-label={t("loading")}
      />
      <span className="sr-only">{t("loading")}</span>
    </div>
  );
}
