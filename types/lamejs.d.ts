/**
 * Type declarations for lamejs@1.2.1 (ships without TypeScript types).
 *
 * lamejs is a CommonJS module (`module.exports = lamejs`) whose export
 * object exposes the `Mp3Encoder` class. With `esModuleInterop` enabled,
 * `import { Mp3Encoder } from "lamejs"` compiles to a property access on
 * the required module and works correctly in the Next.js/webpack bundle.
 *
 * Only the surface used by lib/audio/exporter.ts is declared.
 */
declare module "lamejs" {
  /**
   * MPEG Layer III encoder.
   * @param channels 1 (mono) or 2 (stereo)
   * @param sampleRate e.g. 44100
   * @param kbps bitrate, e.g. 128 | 192 | 320
   */
  class Mp3Encoder {
    constructor(channels: number, sampleRate: number, kbps: number);
    /**
     * Encodes one MPEG granule (multiples of 1152 samples recommended).
     * Pass both channels for stereo, only `left` for mono.
     * Returns the encoded MP3 bytes for this block (may be empty while
     * the internal bit reservoir fills).
     */
    encodeBuffer(left: Int16Array, right?: Int16Array): Int8Array;
    /** Flushes the encoder, returning the final MP3 bytes. */
    flush(): Int8Array;
  }

  export { Mp3Encoder };
}
