/**
 * Type declarations for wav-encoder@1.3.0 (ships without TypeScript types).
 *
 * wav-encoder is a CommonJS module:
 *   module.exports.encode = encode;          // async wrapper
 *   module.exports.encode.sync = encodeSync; // synchronous encoder
 *
 * We use `export =` so `import WavEncoder from "wav-encoder"` (with
 * esModuleInterop) resolves to the `module.exports` object and
 * `WavEncoder.encode.sync(...)` is fully typed.
 */
declare module "wav-encoder" {
  interface WavAudioData {
    sampleRate: number;
    /** One Float32Array per channel, all with the same length. */
    channelData: Float32Array[];
  }

  interface WavEncodeOptions {
    /** PCM bit depth. Supported by wav-encoder: 8, 16, 24, 32 (int). */
    bitDepth?: number;
    /** When true, writes 32-bit IEEE float PCM (formatId 0x0003). */
    float?: boolean;
    /** Alias of `float`. */
    floatingPoint?: boolean;
    /** Symmetric quantization for integer PCM. */
    symmetric?: boolean;
  }

  interface WavEncoderApi {
    encode: {
      (audioData: WavAudioData, opts?: WavEncodeOptions): Promise<ArrayBuffer>;
      sync(audioData: WavAudioData, opts?: WavEncodeOptions): ArrayBuffer;
    };
  }

  const WavEncoder: WavEncoderApi;
  export = WavEncoder;
}
