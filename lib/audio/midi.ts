/**
 * CCB Sonare Music — Web MIDI (Stage 4)
 *
 * Thin wrapper over navigator.requestMIDIAccess with hot-plug support and
 * note on/off parsing (0x90 / 0x80, velocity-0 noteOn treated as noteOff).
 * Client-only: all guards return empty/no-op on the server.
 */

import * as Tone from "tone";

export function isMidiSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.requestMIDIAccess === "function"
  );
}

export interface MidiDeviceInfo {
  id: string;
  name: string;
  manufacturer: string;
  state: string;
}

export type MidiNoteCallback = (note: number, velocity: number, type: "on" | "off") => void;
export type MidiDeviceChangeCallback = (devices: MidiDeviceInfo[]) => void;

const NOTE_ON = 0x90;
const NOTE_OFF = 0x80;

export class MidiManager {
  private access: MIDIAccess | null = null;
  private readonly noteCallbacks = new Set<MidiNoteCallback>();
  private readonly deviceChangeCallbacks = new Set<MidiDeviceChangeCallback>();

  private readonly handleStateChange = (): void => {
    this.attachInputs();
    const devices = this.listDevices();
    for (const callback of this.deviceChangeCallbacks) {
      callback(devices);
    }
  };

  private readonly handleMessage = (event: MIDIMessageEvent): void => {
    const data = event.data;
    if (!data || data.length < 3) return;

    const command = data[0] & 0xf0;
    const note = data[1];
    const velocity = data[2];

    if (command === NOTE_ON && velocity > 0) {
      this.emitNote(note, velocity / 127, "on");
    } else if (command === NOTE_OFF || (command === NOTE_ON && velocity === 0)) {
      this.emitNote(note, 0, "off");
    }
  };

  /** Requests MIDI access, wires listeners and returns connected inputs. */
  async init(): Promise<MidiDeviceInfo[]> {
    if (!isMidiSupported()) return [];
    this.access = await navigator.requestMIDIAccess();
    this.access.addEventListener("statechange", this.handleStateChange);
    this.attachInputs();
    return this.listDevices();
  }

  /** Subscribe to note on/off. Returns an unsubscribe function. */
  onNote(callback: MidiNoteCallback): () => void {
    this.noteCallbacks.add(callback);
    return () => {
      this.noteCallbacks.delete(callback);
    };
  }

  /** Subscribe to device hot-plug changes. Returns an unsubscribe function. */
  onDeviceChange(callback: MidiDeviceChangeCallback): () => void {
    this.deviceChangeCallbacks.add(callback);
    return () => {
      this.deviceChangeCallbacks.delete(callback);
    };
  }

  private attachInputs(): void {
    this.access?.inputs.forEach((input) => {
      input.onmidimessage = this.handleMessage;
    });
  }

  private emitNote(note: number, velocity: number, type: "on" | "off"): void {
    for (const callback of this.noteCallbacks) {
      callback(note, velocity, type);
    }
  }

  private listDevices(): MidiDeviceInfo[] {
    const devices: MidiDeviceInfo[] = [];
    this.access?.inputs.forEach((input) => {
      devices.push({
        id: input.id,
        name: input.name ?? "MIDI Device",
        manufacturer: input.manufacturer ?? "",
        state: input.state,
      });
    });
    return devices;
  }

  dispose(): void {
    this.access?.removeEventListener("statechange", this.handleStateChange);
    this.access?.inputs.forEach((input) => {
      input.onmidimessage = null;
    });
    this.access = null;
    this.noteCallbacks.clear();
    this.deviceChangeCallbacks.clear();
  }
}

/** 60 -> "C4", 69 -> "A4", etc. */
export function midiNumberToNote(noteNumber: number): string {
  return Tone.Frequency(noteNumber, "midi").toNote();
}
