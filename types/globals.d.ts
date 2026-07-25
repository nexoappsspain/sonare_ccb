/**
 * Ambient module declarations for side-effect asset imports handled by the
 * Next.js/webpack pipeline (e.g. `import "./globals.css"`). Next only ships
 * declarations for `*.module.css`; plain CSS needs this so newer TypeScript
 * versions (TS2882) accept the import as well.
 */
declare module "*.css";

/**
 * Audio Session API (W3C proposal).
 * Used to keep playback routed to headphones while the microphone is active.
 */
interface AudioSession {
  type:
    | "auto"
    | "playback"
    | "playback-and-record"
    | "ambient"
    | "solo"
    | "solo-ambient";
  onstatechange: ((this: AudioSession, ev: Event) => any) | null;
  readonly state: "active" | "inactive";
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
}

interface Navigator {
  audioSession?: AudioSession;
}
