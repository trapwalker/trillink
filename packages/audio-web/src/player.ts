/** Play an AudioBuffer and resolve when playback finishes. */
export function playBuffer(ctx: AudioContext, buffer: AudioBuffer): Promise<void> {
  return new Promise((resolve) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(ctx.destination);
    source.onended = () => resolve();
    source.start();
  });
}
