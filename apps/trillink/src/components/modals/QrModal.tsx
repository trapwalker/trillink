import { useEffect, useRef } from 'preact/hooks';
import QRCode from 'qrcode';
import { Modal } from '../Modal.js';
import { copyToClipboard } from '../../store/index.js';

interface Props {
  onClose: () => void;
}

export function QrModal({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const url = window.location.origin + window.location.pathname;

  useEffect(() => {
    if (!canvasRef.current) return;
    QRCode.toCanvas(canvasRef.current, url, {
      width: 240,
      margin: 2,
      color: { dark: '#ffffff', light: '#111118' },
    }).catch(() => {});
  }, []);

  return (
    <Modal title="⊞ QR code" onClose={onClose}>
      <div style={s.body}>
        <canvas ref={canvasRef} style={s.canvas} />
        <p style={s.hint}>Scan to open Trillink on your phone</p>
        <div style={s.urlRow}>
          <code style={s.url}>{url}</code>
          <button style={s.copyBtn} onClick={() => copyToClipboard(url)} title="Copy URL">📋</button>
        </div>
      </div>
    </Modal>
  );
}

const s = {
  body: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '12px',
    padding: '8px 0',
  },
  canvas: {
    borderRadius: '8px',
    display: 'block',
  },
  hint: { fontSize: '13px', color: 'var(--muted)', margin: 0, textAlign: 'center' as const },
  urlRow: { display: 'flex', alignItems: 'center', gap: '8px', width: '100%' },
  url: {
    flex: 1,
    fontSize: '11px',
    color: 'var(--muted)',
    wordBreak: 'break-all' as const,
    fontFamily: 'var(--font)',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    padding: '6px 8px',
  },
  copyBtn: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 8px',
    flexShrink: 0,
  },
} as const;
