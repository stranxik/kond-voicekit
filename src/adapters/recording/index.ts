/**
 * Recording Adapters
 *
 * Concrete implementations of the RecordingProvider port.
 */

// MediaRecorder-based adapter (WebM/Opus)
export { MediaRecorderAdapter, createMediaRecorderAdapter } from "./media-recorder";
export type { MediaRecorderAdapterConfig } from "./media-recorder";

// AudioWorklet-based adapter (WAV with dual-voice mixing)
export { AudioWorkletRecordingAdapter, createAudioWorkletRecorder } from "./audio-worklet-recorder";
export type { AudioWorkletRecorderConfig } from "./audio-worklet-recorder";

// Mock adapter (for testing)
export { MockRecordingAdapter, createMockRecordingAdapter } from "./mock";
export type { MockRecordingAdapterConfig } from "./mock";
