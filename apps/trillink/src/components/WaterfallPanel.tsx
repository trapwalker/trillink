import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import { showWaterfall, isListening } from '../store/index.js';

const W = 512;
const H = 120;

interface Props {
  analyserRef: RefObject<AnalyserNode | null>;
}

export function WaterfallPanel({ analyserRef }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef    = useRef<number>(0);

  useEffect(() => {
    if (!showWaterfall.value || !isListening.value) {
      cancelAnimationFrame(rafRef.current);
      const cv = canvasRef.current;
      if (cv) cv.getContext('2d')?.clearRect(0, 0, W, H);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, W, H);

    function draw() {
      rafRef.current = requestAnimationFrame(draw);
      const analyser = analyserRef.current;
      if (!analyser || !canvas || !ctx) return;

      const bufLen = analyser.frequencyBinCount;
      const data = new Uint8Array(bufLen);
      analyser.getByteFrequencyData(data);

      const maxBin = Math.min(bufLen, 256);

      const existing = ctx.getImageData(0, 0, W, H - 1);
      ctx.putImageData(existing, 0, 1);

      for (let x = 0; x < W; x++) {
        const binIdx = Math.floor(x * maxBin / W);
        const val = (data[binIdx] ?? 0) / 255;
        const r = Math.floor(val < 0.5 ? 0 : (val - 0.5) * 2 * 255);
        const g = Math.floor(val < 0.25 ? val * 4 * 180 : val < 0.75 ? 180 : 180 + (val - 0.75) * 4 * 75);
        const b = Math.floor(val < 0.25 ? 80 + val * 4 * 175 : Math.max(0, 255 - (val - 0.25) * (255 / 0.75)));
        ctx.fillStyle = `rgb(${r},${g},${b})`;
        ctx.fillRect(x, 0, 1, 1);
      }
    }

    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [showWaterfall.value, isListening.value]);

  if (!showWaterfall.value) return null;

  return (
    <div style={s.container}>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        style={s.canvas}
      />
      <div style={s.labels}>
        <span style={s.lbl}>0 Hz</span>
        <span style={s.lbl}>~5 kHz</span>
      </div>
    </div>
  );
}

const s = {
  container: { flexShrink: 0, borderBottom: '1px solid var(--border)', background: '#0a0a0a' },
  canvas: {
    width: '100%',
    height: `${H}px`,
    imageRendering: 'pixelated' as const,
    display: 'block',
  },
  labels: { display: 'flex', justifyContent: 'space-between', padding: '2px 8px' },
  lbl: { fontSize: '10px', color: 'var(--muted)' },
} as const;
