import { create } from "zustand";

/**
 * Live-monitoring preference store (mic routed to speakers while recording).
 *
 * Persisted in localStorage ("sonare-monitoring", default: enabled).
 * zustand gives the transport toggle button reactivity for free, while
 * `useMonitoringStore.getState().enabled` lets the recording flow read the
 * current value imperatively (no hook needed inside callbacks).
 */

const STORAGE_KEY = "sonare-monitoring";

function readInitialEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw === null ? true : raw === "true";
  } catch {
    return true;
  }
}

interface MonitoringState {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  toggle: () => void;
}

export const useMonitoringStore = create<MonitoringState>((set, get) => ({
  enabled: readInitialEnabled(),
  setEnabled: (enabled) => {
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(enabled));
      } catch {
        // Private mode / quota: keep the in-memory value only.
      }
    }
    set({ enabled });
  },
  toggle: () => get().setEnabled(!get().enabled),
}));
