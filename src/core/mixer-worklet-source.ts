// ⚠️ AUTO-GENERATED - DO NOT EDIT MANUALLY
// This file embeds the AudioMixerProcessor worklet code for dual-voice recording
// Run `pnpm build:worklet` to regenerate if needed

/**
 * Embedded AudioWorklet source for mixing user mic + TTS audio
 *
 * Features:
 * - Receives user audio from MediaStreamSource (48kHz browser default)
 * - Receives TTS audio chunks via MessagePort (24kHz from ElevenLabs)
 * - Downsamples user audio from 48kHz to 24kHz
 * - Mixes both streams with soft clipping
 * - Outputs 24kHz mono mixed audio chunks to main thread
 */
export const AUDIO_MIXER_WORKLET_SOURCE = `
/**
 * AudioMixerProcessor - Mix user mic + TTS audio in real-time
 *
 * Input: Channel 0 = User microphone (48kHz from browser)
 * TTS:   Received via MessagePort as Float32Array chunks (24kHz)
 * Output: Mixed mono audio at 24kHz, sent via MessagePort
 */
class AudioMixerProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();

    // Configuration from processorOptions
    const opts = options.processorOptions || {};
    this.inputSampleRate = opts.inputSampleRate || sampleRate || 48000;
    this.outputSampleRate = opts.outputSampleRate || 24000;
    this.chunkSizeMs = opts.chunkSizeMs || 100; // 100ms chunks

    // Calculate derived values
    this.downsampleRatio = this.inputSampleRate / this.outputSampleRate;
    this.outputChunkSize = Math.floor((this.outputSampleRate * this.chunkSizeMs) / 1000);

    // State
    this.isRecording = false;
    this.outputBuffer = new Float32Array(this.outputChunkSize);
    this.outputBufferIndex = 0;

    // TTS ring buffer (holds up to 1 second of TTS audio)
    this.ttsBufferSize = this.outputSampleRate; // 1 second @ 24kHz
    this.ttsBuffer = new Float32Array(this.ttsBufferSize);
    this.ttsWriteIndex = 0;
    this.ttsReadIndex = 0;
    this.ttsAvailableSamples = 0;

    // Metrics for debugging
    this.totalSamplesProcessed = 0;
    this.totalTTSSamplesReceived = 0;

    // Handle messages from main thread
    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };
  }

  handleMessage(data) {
    switch (data.type) {
      case "start":
        this.startRecording();
        break;

      case "stop":
        this.stopRecording();
        break;

      case "ttsAudio":
        this.writeTTSAudio(data.samples);
        break;

      case "getMetrics":
        this.port.postMessage({
          type: "metrics",
          totalSamplesProcessed: this.totalSamplesProcessed,
          totalTTSSamplesReceived: this.totalTTSSamplesReceived,
          ttsBufferLevel: this.ttsAvailableSamples,
        });
        break;
    }
  }

  startRecording() {
    this.isRecording = true;
    this.outputBufferIndex = 0;
    this.ttsWriteIndex = 0;
    this.ttsReadIndex = 0;
    this.ttsAvailableSamples = 0;
    this.totalSamplesProcessed = 0;
    this.totalTTSSamplesReceived = 0;

    this.port.postMessage({ type: "started" });
  }

  stopRecording() {
    // Flush remaining samples if any
    if (this.outputBufferIndex > 0) {
      const remaining = this.outputBuffer.slice(0, this.outputBufferIndex);
      this.port.postMessage({
        type: "audioChunk",
        samples: remaining,
        isFinal: true,
      });
    }

    this.isRecording = false;
    this.port.postMessage({
      type: "stopped",
      totalSamples: this.totalSamplesProcessed,
    });
  }

  /**
   * Write TTS audio samples to ring buffer
   */
  writeTTSAudio(samples) {
    if (!samples || samples.length === 0) return;

    const samplesToWrite = samples.length;
    this.totalTTSSamplesReceived += samplesToWrite;

    // Write samples to ring buffer
    for (let i = 0; i < samplesToWrite; i++) {
      this.ttsBuffer[this.ttsWriteIndex] = samples[i];
      this.ttsWriteIndex = (this.ttsWriteIndex + 1) % this.ttsBufferSize;

      // Handle buffer overflow (overwrite oldest samples)
      if (this.ttsAvailableSamples < this.ttsBufferSize) {
        this.ttsAvailableSamples++;
      } else {
        // Buffer full, advance read index (lose oldest sample)
        this.ttsReadIndex = (this.ttsReadIndex + 1) % this.ttsBufferSize;
      }
    }
  }

  /**
   * Read one sample from TTS buffer (returns 0 if empty)
   */
  readTTSSample() {
    if (this.ttsAvailableSamples === 0) {
      return 0;
    }

    const sample = this.ttsBuffer[this.ttsReadIndex];
    this.ttsReadIndex = (this.ttsReadIndex + 1) % this.ttsBufferSize;
    this.ttsAvailableSamples--;

    return sample;
  }

  /**
   * Downsample input from 48kHz to 24kHz using linear interpolation
   */
  downsample(inputSamples) {
    if (this.downsampleRatio <= 1) {
      return inputSamples;
    }

    const outputLength = Math.floor(inputSamples.length / this.downsampleRatio);
    const output = new Float32Array(outputLength);

    for (let i = 0; i < outputLength; i++) {
      const srcIndex = i * this.downsampleRatio;
      const srcIndexFloor = Math.floor(srcIndex);
      const srcIndexCeil = Math.min(srcIndexFloor + 1, inputSamples.length - 1);
      const fraction = srcIndex - srcIndexFloor;

      // Linear interpolation
      output[i] =
        inputSamples[srcIndexFloor] * (1 - fraction) +
        inputSamples[srcIndexCeil] * fraction;
    }

    return output;
  }

  /**
   * Soft clipping to prevent harsh distortion
   * Uses tanh-based soft clipper
   */
  softClip(sample) {
    // Mild compression before clipping
    const compressed = sample * 0.9;

    // Soft clip using tanh approximation (faster than Math.tanh)
    if (Math.abs(compressed) < 1) {
      return compressed;
    }

    // For samples > 1, apply soft clipping
    const sign = compressed > 0 ? 1 : -1;
    const abs = Math.abs(compressed);
    return sign * (1 - 1 / (1 + abs));
  }

  /**
   * Main audio processing loop
   * Called ~375 times/second (128 samples @ 48kHz)
   */
  process(inputs) {
    if (!this.isRecording) {
      return true;
    }

    const input = inputs[0];
    if (!input || input.length === 0 || !input[0] || input[0].length === 0) {
      return true;
    }

    // Get user audio (mono, channel 0)
    const userAudio = input[0];

    // Downsample user audio from 48kHz to 24kHz
    const downsampled = this.downsample(userAudio);

    // Mix user audio with TTS audio
    for (let i = 0; i < downsampled.length; i++) {
      const userSample = downsampled[i];
      const ttsSample = this.readTTSSample();

      // Mix: simple addition with soft clipping
      const mixed = this.softClip(userSample + ttsSample);

      // Write to output buffer
      this.outputBuffer[this.outputBufferIndex++] = mixed;
      this.totalSamplesProcessed++;

      // Send chunk when buffer is full
      if (this.outputBufferIndex >= this.outputChunkSize) {
        // Create a copy to send (transferable would be more efficient but requires more setup)
        const chunk = new Float32Array(this.outputBuffer);
        this.port.postMessage({
          type: "audioChunk",
          samples: chunk,
          isFinal: false,
        });
        this.outputBufferIndex = 0;
      }
    }

    return true;
  }
}

registerProcessor("audio-mixer-processor", AudioMixerProcessor);
`;

/**
 * Worklet version for CDN fallback URL versioning
 * Increment when making breaking changes to the worklet
 */
export const MIXER_WORKLET_VERSION = "1.0.0";
