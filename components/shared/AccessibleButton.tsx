"use client";

import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export type AccessibleButtonVariant = "primary" | "secondary" | "danger" | "icon";
export type AccessibleButtonSize = "sm" | "md" | "icon";

export interface AccessibleButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  /** Required: every button must expose an accessible name. */
  ariaLabel: string;
  variant?: AccessibleButtonVariant;
  size?: AccessibleButtonSize;
}

const VARIANT_CLASSES: Record<AccessibleButtonVariant, string> = {
  primary: "btn-primary",
  secondary: "btn-secondary",
  danger: "btn-danger",
  icon: "inline-flex items-center justify-center rounded-lg bg-transparent p-2 text-neutral-300 transition-colors hover:bg-panelHover hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-50",
};

const SIZE_CLASSES: Record<AccessibleButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "",
  icon: "p-2",
};

export const AccessibleButton = forwardRef<HTMLButtonElement, AccessibleButtonProps>(
  function AccessibleButton(
    { ariaLabel, variant = "primary", size = "md", className, type = "button", ...rest },
    ref,
  ) {
    return (
      <button
        ref={ref}
        type={type}
        aria-label={ariaLabel}
        className={cn(VARIANT_CLASSES[variant], SIZE_CLASSES[size], className)}
        {...rest}
      />
    );
  },
);
