/**
 * STT (Speech-to-Text) Adapters
 */

export {
  DeepgramStreamingAdapter,
  createDeepgramAdapter,
  createDeepgramAdapterWithAuth,
  configureDeepgram,
  getDeepgramConfig,
} from "./deepgram";
export type { DeepgramConfig } from "./deepgram";
