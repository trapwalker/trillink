import { CrcError, TruncatedError, VersionError, decodeFrame } from '@trillink/protocol';
import type { TrilinkFrame } from '@trillink/protocol';
import { f32ToI8, getGGWave } from './ggwave.js';

export type StopListening = () => void;

const PROCESSOR_BUFFER = 4096; // samples per ScriptProcessorNode callback

/**
 * Start continuous audio decoding from the microphone.
 *
 * Returns a stop function. The caller is responsible for calling it.
 *
 * Important: AudioContext must be in "running" state (requires prior user gesture on iOS Safari).
 * getUserMedia should be called with { echoCancellation: false, noiseSuppression: false, autoGainControl: false }.
 */
export async function startDecoder(
  ctx: AudioContext,
  stream: MediaStream,
  onFrame: (frame: TrilinkFrame) => void,
  onSignal?: () => void,
  onError?: (reason: 'crc' | 'version' | 'truncated' | 'unknown') => void,
): Promise<StopListening> {
  const { gw, instance } = await getGGWave(ctx.sampleRate);

  const source = ctx.createMediaStreamSource(stream);

  // ScriptProcessorNode is deprecated but has no cross-browser alternative without
  // full AudioWorklet + WASM-in-worker setup. Suitable for current scope.
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const processor = ctx.createScriptProcessor(PROCESSOR_BUFFER, 1, 1);
  let signalActive = false;

  processor.onaudioprocess = (e: AudioProcessingEvent) => {
    const input = e.inputBuffer.getChannelData(0);
    const i8 = f32ToI8(input);
    const result = gw.decode(instance, i8) as Uint8Array | null;

    if (result !== null && result.length > 0) {
      if (!signalActive) {
        signalActive = true;
        onSignal?.();
      }
      try {
        const frame = decodeFrame(result);
        onFrame(frame);
      } catch (err) {
        if (err instanceof CrcError) {
          onError?.('crc');
        } else if (err instanceof VersionError) {
          onError?.('version');
        } else if (err instanceof TruncatedError) {
          onError?.('truncated');
        } else {
          onError?.('unknown');
        }
      }
      signalActive = false;
    }
  };

  source.connect(processor);
  processor.connect(ctx.destination);

  return () => {
    processor.disconnect();
    source.disconnect();
  };
}
