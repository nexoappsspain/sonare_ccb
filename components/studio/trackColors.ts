import type { TrackColor } from "@/types";

/**
 * Static Tailwind class map for track colors.
 * Dynamic class interpolation (`bg-track-${color}`) would be purged by the
 * Tailwind JIT, so every class name is written out in full here.
 */
export const TRACK_COLOR_CLASSES: Record<
  TrackColor,
  { bar: string; text: string; ring: string; hex: string }
> = {
  blue: { bar: "bg-track-blue", text: "text-track-blue", ring: "ring-track-blue", hex: "#3b82f6" },
  green: { bar: "bg-track-green", text: "text-track-green", ring: "ring-track-green", hex: "#22c55e" },
  purple: { bar: "bg-track-purple", text: "text-track-purple", ring: "ring-track-purple", hex: "#a855f7" },
  orange: { bar: "bg-track-orange", text: "text-track-orange", ring: "ring-track-orange", hex: "#f97316" },
  pink: { bar: "bg-track-pink", text: "text-track-pink", ring: "ring-track-pink", hex: "#ec4899" },
  teal: { bar: "bg-track-teal", text: "text-track-teal", ring: "ring-track-teal", hex: "#14b8a6" },
  yellow: { bar: "bg-track-yellow", text: "text-track-yellow", ring: "ring-track-yellow", hex: "#eab308" },
  red: { bar: "bg-track-red", text: "text-track-red", ring: "ring-track-red", hex: "#ef4444" },
};

export const trackHex = (color: TrackColor): string => TRACK_COLOR_CLASSES[color].hex;
