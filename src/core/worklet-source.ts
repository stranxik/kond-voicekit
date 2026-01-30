// ⚠️ AUTO-GENERATED - DO NOT EDIT MANUALLY
// Run `pnpm build:worklet` to regenerate from public/audio-processor.worklet.js
// This file embeds the AudioWorklet code for zero-config SDK usage

/**
 * Embedded AudioWorklet source code
 * This allows the SDK to work without users copying files to their public folder
 */
export const AUDIO_PROCESSOR_WORKLET_SOURCE = `
class AudioCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.isCapturing = true;
    const processorOptions = options.processorOptions || {};
    this.inputSampleRate = processorOptions.inputSampleRate || sampleRate || 48000;
    this.outputSampleRate = processorOptions.outputSampleRate || 16000;
    this.downsampleRatio = this.inputSampleRate / this.outputSampleRate;
    this.CHUNK_SIZE = 640;
    this.buffer = new Float32Array(this.CHUNK_SIZE);
    this.bufferIndex = 0;
    this.sampleAccumulator = 0;
    this.RMS_THRESHOLD = 0.015;
    this.RMS_HISTORY_SIZE = 5; 
    this.rmsHistory = [];
    this.RMS_FLOOR = 0.008;
    this.RMS_CEILING = 0.08;
    this.port.onmessage = (event) => {
      if (event.data.type === "stop") {
        this.isCapturing = false;
        if (this.bufferIndex > 0) {
          const remaining = this.buffer.slice(0, this.bufferIndex);
          const rms = this.calculateRMS(remaining);
          const speechProbability = this.calculateSpeechProbability(rms);
          this.port.postMessage({
            type: "audio",
            data: remaining,
            rms: rms,
            isSpeaking: rms > this.RMS_THRESHOLD,
            speechProbability: speechProbability,
          });
          this.bufferIndex = 0;
        }
      } else if (event.data.type === "start") {
        this.isCapturing = true;
        this.bufferIndex = 0;
        this.sampleAccumulator = 0;
        this.rmsHistory = []; 
      } else if (event.data.type === "setThreshold") {
        this.RMS_THRESHOLD = event.data.threshold;
      }
    };
  }
  calculateRMS(samples) {
    let sum = 0;
    for (let i = 0; i < samples.length; i++) {
      sum += samples[i] * samples[i];
    }
    return Math.sqrt(sum / samples.length);
  }
  calculateSpeechProbability(currentRms) {
    this.rmsHistory.push(currentRms);
    if (this.rmsHistory.length > this.RMS_HISTORY_SIZE) {
      this.rmsHistory.shift();
    }
    const avgRms =
      this.rmsHistory.reduce((a, b) => a + b, 0) / this.rmsHistory.length;
    if (avgRms <= this.RMS_FLOOR) {
      return 0;
    }
    if (avgRms >= this.RMS_CEILING) {
      return 1;
    }
    return (avgRms - this.RMS_FLOOR) / (this.RMS_CEILING - this.RMS_FLOOR);
  }
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
      output[i] =
        inputSamples[srcIndexFloor] * (1 - fraction) +
        inputSamples[srcIndexCeil] * fraction;
    }
    return output;
  }
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    if (input && input.length > 0 && this.isCapturing) {
      const inputChannel = input[0];
      if (inputChannel && inputChannel.length > 0) {
        const downsampled = this.downsample(inputChannel);
        for (let i = 0; i < downsampled.length; i++) {
          this.buffer[this.bufferIndex++] = downsampled[i];
          if (this.bufferIndex >= this.CHUNK_SIZE) {
            const audioData = new Float32Array(this.buffer);
            const rms = this.calculateRMS(audioData);
            const speechProbability = this.calculateSpeechProbability(rms);
            this.port.postMessage({
              type: "audio",
              data: audioData,
              rms: rms,
              isSpeaking: rms > this.RMS_THRESHOLD,
              speechProbability: speechProbability,
            });
            this.bufferIndex = 0;
          }
        }
      }
    }
    return true;
  }
}
registerProcessor("audio-capture-processor", AudioCaptureProcessor);
`;

/**
 * SDK version - used for CDN fallback URL versioning
 */
export const WORKLET_VERSION = "0.7.0";
