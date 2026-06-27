export interface PlayHandle {
  promise: Promise<void>;
  stop(): void;
}

/** Play an AudioBuffer. Returns a handle to await completion or stop early. */
export function playBuffer(ctx: AudioContext, buffer: AudioBuffer): PlayHandle {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);

  let done = false;
  let resolve_!: () => void;
  const promise = new Promise<void>((r) => { resolve_ = r; });
  source.onended = () => {
    done = true;
    resolve_();
  };
  source.start();

  return {
    promise,
    stop() {
      if (!done) {
        done = true;
        try { source.stop(0); } catch {}
      }
    },
  };
}
