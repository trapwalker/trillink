import { CrcError, TruncatedError, VersionError, decodeFrame } from '@trillink/protocol';
import type { TrilinkFrame } from '@trillink/protocol';
import { f32ToI8, getGGWave } from './ggwave.js';

export type StopListening = () => void;

const PROCESSOR_BUFFER = 4096;

export interface DecoderOptions {
  onSignal?: () => void;
  onError?: (reason: 'crc' | 'version' | 'truncated' | 'unknown') => void;
  // Called every PROCESSOR_BUFFER samples with RMS level 0-1 for VU meter
  onLevel?: (rms: number) => void;
}

export interface DecoderHandle {
  stop: StopListening;
  analyser: AnalyserNode;
}

/**
 * Start continuous audio decoding from a MediaStream (typically getUserMedia).
 *
 * Critical: processor output is muted (gain=0) to prevent mic→speaker feedback loop.
 * The ScriptProcessorNode must be connected to the destination graph to keep firing,
 * but we route through a zero-gain node so no audio plays through speakers.
 */
export async function startDecoder(
  ctx: AudioContext,
  stream: MediaStream,
  onFrame: (frame: TrilinkFrame) => void,
  opts: DecoderOptions = {},
): Promise<DecoderHandle> {
  const { gw, instance } = await getGGWave(ctx.sampleRate);

  const source = ctx.createMediaStreamSource(stream);

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.6;

  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const processor = ctx.createScriptProcessor(PROCESSOR_BUFFER, 1, 1);

  // Zero-gain sink: ScriptProcessorNode must be connected to the destination graph
  // or browsers stop calling onaudioprocess. We silence it to prevent feedback.
  const muteGain = ctx.createGain();
  muteGain.gain.value = 0;

  processor.onaudioprocess = (e: AudioProcessingEvent) => {
    const input = e.inputBuffer.getChannelData(0);

    if (opts.onLevel) {
      let sum = 0;
      for (let i = 0; i < input.length; i++) sum += (input[i] ?? 0) ** 2;
      opts.onLevel(Math.sqrt(sum / input.length));
    }

    const i8 = f32ToI8(input);
    const result = gw.decode(instance, i8) as Uint8Array | null;

    if (result !== null && result.length > 0) {
      opts.onSignal?.();
      try {
        onFrame(decodeFrame(result));
      } catch (err) {
        if (err instanceof CrcError)      opts.onError?.('crc');
        else if (err instanceof VersionError)   opts.onError?.('version');
        else if (err instanceof TruncatedError) opts.onError?.('truncated');
        else                              opts.onError?.('unknown');
      }
    }
  };

  source.connect(analyser);
  source.connect(processor);
  processor.connect(muteGain);
  muteGain.connect(ctx.destination);

  return {
    stop: () => {
      processor.disconnect();
      analyser.disconnect();
      source.disconnect();
      muteGain.disconnect();
    },
    analyser,
  };
}
