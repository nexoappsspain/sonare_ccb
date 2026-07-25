/**
 * CCB Sonare Music — Microphone permission helpers
 *
 * Wraps the Permissions API (with graceful degradation) plus an explicit
 * getUserMedia request, so the studio can show an explanatory dialog BEFORE
 * the browser's native prompt and guide the user when access was blocked.
 *
 * Client-only module: every function asserts a browser environment.
 */

export type MicPermissionState = "granted" | "denied" | "prompt" | "unknown";

const mapPermissionState = (state: PermissionState): MicPermissionState => {
  if (state === "granted" || state === "denied" || state === "prompt") {
    return state;
  }
  return "unknown";
};

/**
 * Queries the current microphone permission without triggering a prompt.
 * Returns "unknown" when the Permissions API is unavailable (Firefox/Safari
 * partial support) or when the browser rejects the "microphone" name
 * (older Safari throws a TypeError).
 */
export async function checkMicrophonePermission(): Promise<MicPermissionState> {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return "unknown";
  }
  try {
    const result = await navigator.permissions.query({
      name: "microphone" as PermissionName,
    });
    return mapPermissionState(result.state);
  } catch {
    return "unknown";
  }
}

/**
 * Triggers the browser's native permission prompt (must be called from a
 * user gesture). The stream is released immediately — this is only about
 * flipping the permission state. Resolves true when access was granted.
 */
export async function requestMicrophoneAccess(): Promise<boolean> {
  if (
    typeof navigator === "undefined" ||
    typeof navigator.mediaDevices?.getUserMedia !== "function"
  ) {
    return false;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) {
      track.stop();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Subscribes to microphone permission changes (e.g. the user re-enables the
 * mic in the browser site settings while the dialog is open). Returns an
 * unsubscribe function; a no-op when the Permissions API is unsupported.
 */
export function onMicrophonePermissionChange(
  callback: (state: MicPermissionState) => void,
): () => void {
  if (typeof navigator === "undefined" || !navigator.permissions?.query) {
    return () => {};
  }

  let status: PermissionStatus | null = null;
  let cancelled = false;

  const handleChange = (): void => {
    if (status) {
      callback(mapPermissionState(status.state));
    }
  };

  navigator.permissions
    .query({ name: "microphone" as PermissionName })
    .then((result) => {
      if (cancelled) return;
      status = result;
      status.addEventListener("change", handleChange);
    })
    .catch(() => {
      // Older Safari rejects "microphone" — subscription silently unsupported.
    });

  return () => {
    cancelled = true;
    status?.removeEventListener("change", handleChange);
    status = null;
  };
}
