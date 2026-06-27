import { useEffect, useRef } from 'preact/hooks';
import type { RefObject } from 'preact';
import { showWaterfall, isListening } from '../store/index.js';

// DTMF-FSK tone range for overlay markers
const SYNC_HZ      = 500;
const DATA_LO_HZ   = 700;
const DATA_HI_HZ   = 2200;

const W = 512;
const H = 120;

// Show 0–6000 Hz in the waterfall (covers full FSK band + margin)
const MAX_DISPLAY_HZ = 6000;

interface Props {
  analyserRef: RefObject<AnalyserNode | null>;
}

export function WaterfallPanel({ analyserRef }: Props) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);

  // Draw static overlay: FSK band markers (drawn once on mount)
  useEffect(() => {
    const ov = overlayRef.current;
    const oc = ov?.getContext('2d');
    if (!ov || !oc) return;
    oc.clearRect(0, 0, W, 20);

    function hzToX(hz: number) { return Math.round(hz / MAX_DISPLAY_HZ * W); }

    // FSK data band tint
    oc.fillStyle = 'rgba(79, 142, 247, 0.10)';
    oc.fillRect(hzToX(DATA_LO_HZ), 0, hzToX(DATA_HI_HZ) - hzToX(DATA_LO_HZ), 20);

    // Sync tone marker
    const sx = hzToX(SYNC_HZ);
    oc.strokeStyle = 'rgba(61, 220, 132, 0.6)';
    oc.lineWidth = 1;
    oc.setLineDash([2, 3]);
    oc.beginPath(); oc.moveTo(sx, 0); oc.lineTo(sx, 20); oc.stroke();

    // Data band edges
    oc.strokeStyle = 'rgba(79, 142, 247, 0.5)';
    oc.setLineDash([2, 3]);
    for (const hz of [DATA_LO_HZ, DATA_HI_HZ]) {
      const x = hzToX(hz);
      oc.beginPath(); oc.moveTo(x, 0); oc.lineTo(x, 20); oc.stroke();
    }
  }, []);

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

      const sampleRate = analyser.context.sampleRate;
      const hzPerBin   = sampleRate / (analyser.fftSize);
      // How many bins to show MAX_DISPLAY_HZ
      const maxBin = Math.min(analyser.frequencyBinCount, Math.ceil(MAX_DISPLAY_HZ / hzPerBin));

      const data = new Uint8Array(analyser.frequencyBinCount);
      analyser.getByteFrequencyData(data);

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

  function hzToPercent(hz: number) { return `${(hz / MAX_DISPLAY_HZ * 100).toFixed(1)}%`; }

  return (
    <div style={s.container}>
      <canvas ref={canvasRef} width={W} height={H} style={s.canvas} />
      {/* Frequency axis with FSK band markers */}
      <div style={s.axis}>
        <canvas ref={overlayRef} width={W} height={20} style={s.overlay} />
        <span style={{ ...s.lbl, left: '0' }}>0</span>
        <span style={{ ...s.lbl, left: hzToPercent(SYNC_HZ) }} title="SYNC 500 Hz">↑S</span>
        <span style={{ ...s.lbl, left: hzToPercent(DATA_LO_HZ) }} title="Data 700–2200 Hz">↑D</span>
        <span style={{ ...s.lbl, left: hzToPercent(DATA_HI_HZ) }} title="Data end 2200 Hz">↑</span>
        <span style={{ ...s.lbl, left: hzToPercent(3000) }}>3k</span>
        <span style={{ ...s.lbl, right: '0' }}>6k Hz</span>
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
  axis: {
    position: 'relative' as const,
    height: '20px',
    overflow: 'hidden',
  },
  overlay: {
    position: 'absolute' as const,
    top: 0, left: 0,
    width: '100%',
    height: '20px',
    imageRendering: 'pixelated' as const,
  },
  lbl: {
    position: 'absolute' as const,
    fontSize: '9px',
    color: 'var(--muted)',
    top: '4px',
    transform: 'translateX(-50%)',
    userSelect: 'none' as const,
  },
} as const;
