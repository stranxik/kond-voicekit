/**
 * WAV Encoder - Encode Float32 audio samples to WAV format
 *
 * Creates uncompressed WAV files suitable for post-processing or archival.
 * Optimized for voice recordings at 24kHz mono.
 *
 * WAV Format (RIFF):
 * - RIFF header (12 bytes)
 * - fmt chunk (24 bytes for PCM)
 * - data chunk (8 bytes header + samples)
 */

// =============================================================================
// Types
// =============================================================================

export interface WAVEncoderOptions {
  /** Sample rate in Hz @default 24000 */
  sampleRate?: number;
  /** Number of channels @default 1 (mono) */
  channels?: number;
  /** Bits per sample @default 16 */
  bitsPerSample?: number;
}

// =============================================================================
// Constants
// =============================================================================

const DEFAULT_SAMPLE_RATE = 24000;
const DEFAULT_CHANNELS = 1;
const DEFAULT_BITS_PER_SAMPLE = 16;

// WAV header size: RIFF (12) + fmt (24) + data header (8) = 44 bytes
const WAV_HEADER_SIZE = 44;

// =============================================================================
// Public API
// =============================================================================

/**
 * Encode Float32 audio samples to WAV Blob
 *
 * @param samples - Float32Array of audio samples (-1.0 to 1.0)
 * @param options - Encoding options
 * @returns WAV audio as Blob
 *
 * @example
 * ```typescript
 * const samples = new Float32Array([0.1, 0.2, -0.3, ...]);
 * const wavBlob = encodeWAV(samples, { sampleRate: 24000 });
 * // wavBlob can be downloaded or uploaded
 * ```
 */
export function encodeWAV(samples: Float32Array, options: WAVEncoderOptions = {}): Blob {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels = options.channels ?? DEFAULT_CHANNELS;
  const bitsPerSample = options.bitsPerSample ?? DEFAULT_BITS_PER_SAMPLE;

  const bytesPerSample = bitsPerSample / 8;
  const blockAlign = channels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const fileSize = WAV_HEADER_SIZE + dataSize - 8; // -8 because RIFF size excludes first 8 bytes

  // Allocate buffer for entire WAV file
  const buffer = new ArrayBuffer(WAV_HEADER_SIZE + dataSize);
  const view = new DataView(buffer);

  // Write RIFF header
  writeString(view, 0, "RIFF");
  view.setUint32(4, fileSize, true);
  writeString(view, 8, "WAVE");

  // Write fmt chunk
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size (16 for PCM)
  view.setUint16(20, 1, true); // Audio format (1 = PCM)
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);

  // Write data chunk header
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  // Convert Float32 samples to Int16 and write
  const offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i];
    // Clamp to [-1, 1] and convert to Int16
    const clamped = Math.max(-1, Math.min(1, sample));
    const int16 = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
    view.setInt16(offset + i * bytesPerSample, int16, true);
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Encode interleaved stereo Float32 samples to WAV Blob
 *
 * @param leftSamples - Float32Array of left channel samples
 * @param rightSamples - Float32Array of right channel samples
 * @param options - Encoding options (channels is forced to 2)
 * @returns WAV audio as Blob
 */
export function encodeWAVStereo(
  leftSamples: Float32Array,
  rightSamples: Float32Array,
  options: WAVEncoderOptions = {}
): Blob {
  const length = Math.min(leftSamples.length, rightSamples.length);
  const interleaved = new Float32Array(length * 2);

  for (let i = 0; i < length; i++) {
    interleaved[i * 2] = leftSamples[i];
    interleaved[i * 2 + 1] = rightSamples[i];
  }

  return encodeWAV(interleaved, { ...options, channels: 2 });
}

/**
 * Calculate WAV file size in bytes for given duration
 *
 * Useful for estimating storage requirements and implementing max duration limits.
 *
 * @param durationSeconds - Duration in seconds
 * @param options - Encoding options
 * @returns Estimated file size in bytes
 */
export function estimateWAVSize(durationSeconds: number, options: WAVEncoderOptions = {}): number {
  const sampleRate = options.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const channels = options.channels ?? DEFAULT_CHANNELS;
  const bitsPerSample = options.bitsPerSample ?? DEFAULT_BITS_PER_SAMPLE;

  const bytesPerSample = bitsPerSample / 8;
  const samplesCount = Math.floor(durationSeconds * sampleRate);
  const dataSize = samplesCount * channels * bytesPerSample;

  return WAV_HEADER_SIZE + dataSize;
}

/**
 * Calculate duration from sample count
 *
 * @param sampleCount - Number of samples
 * @param sampleRate - Sample rate in Hz
 * @returns Duration in seconds
 */
export function calculateDuration(sampleCount: number, sampleRate = DEFAULT_SAMPLE_RATE): number {
  return sampleCount / sampleRate;
}

// =============================================================================
// Private Helpers
// =============================================================================

/**
 * Write ASCII string to DataView at offset
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
