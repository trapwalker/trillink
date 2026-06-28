import { useEffect, useRef, useState } from 'preact/hooks';
import type { TrilinkMessage } from '@trillink/protocol';
import { WebAudioAdapter } from '@trillink/audio-web';
import { TrilinkSender, TrilinkReceiver } from '@trillink/sdk';
import type { ReceiverEvent } from '@trillink/sdk';
import {
  addEntry, nextEntryId, isListening, listenError, audioLevel, signalDetected,
  isSending, sendProgress, modal, closeModal, openModal, pttEnabled,
  journal, journalLoaded, toast, showToast, showWaterfall, showMap,
  type JournalEntry,
} from './store/index.js';
import { Toolbar }              from './components/Toolbar.js';
import { Journal }              from './components/Journal.js';
import { StatusBar }            from './components/StatusBar.js';
import { WaterfallPanel }       from './components/WaterfallPanel.js';
import { MapPanel }             from './components/MapPanel.js';
import { GeoSendModal }         from './components/modals/GeoSendModal.js';
import { GeoDetailModal }       from './components/modals/GeoDetailModal.js';
import { TextDetailModal }      from './components/modals/TextDetailModal.js';
import { ContactDetailModal }   from './components/modals/ContactDetailModal.js';
import { TimeDetailModal }      from './components/modals/TimeDetailModal.js';
import { ContactSendModal }     from './components/modals/ContactSendModal.js';
import { TextSendModal }        from './components/modals/TextSendModal.js';
import { QrModal }              from './components/modals/QrModal.js';

export function App() {
  const rxRef       = useRef<TrilinkReceiver | null>(null);
  const adapterRef  = useRef<WebAudioAdapter | null>(null);
  const senderRef   = useRef<TrilinkSender | null>(null);
  const signalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  const [wfHeight,  setWfHeight]  = useState(120);
  const [mapHeight, setMapHeight] = useState(200);

  // ── Receiver ─────────────────────────────────────────────────────────────────

  async function startListening() {
    listenError.value = '';
    try {
      // AudioContext must be created synchronously inside a user-gesture handler.
      // We prime it here so that even the async getUserMedia flow runs with a
      // 'running' context (avoids Chrome autoplay suspension).
      const ctx = new AudioContext();

      const adapter = new WebAudioAdapter({ ctx });
      adapterRef.current = adapter;

      const rx = new TrilinkReceiver({
        audio: adapter,
        onLevel: (rms) => { audioLevel.value = rms; },
        onEvent(e: ReceiverEvent) {
          if (e.type === 'listening') {
            isListening.value = true;
          } else if (e.type === 'signal-detected') {
            signalDetected.value = true;
            if (signalTimer.current) clearTimeout(signalTimer.current);
            signalTimer.current = setTimeout(() => { signalDetected.value = false; }, 3000);
          } else if (e.type === 'message-ready') {
            addEntry({
              id: nextEntryId(),
              message: e.message,
              direction: 'in',
              sessionId: e.sessionId,
              isCont: e.isCont,
              ts: new Date(),
              continuations: [],
            });
          }
        },
      });
      rxRef.current = rx;
      await rx.start();
      analyserRef.current = adapter.analyser;
    } catch (err) {
      console.error('[startListening]', err);
      isListening.value = false;
      if (err instanceof DOMException) {
        if (err.name === 'NotAllowedError') {
          listenError.value = 'Microphone access denied — check browser and system settings';
        } else if (err.name === 'NotFoundError') {
          listenError.value = 'No microphone found';
        } else {
          listenError.value = `Mic error: ${err.message}`;
        }
      } else {
        listenError.value = `Failed to start: ${String(err)}`;
      }
    }
  }

  async function stopListening() {
    await rxRef.current?.stop();
    rxRef.current       = null;
    adapterRef.current  = null;
    analyserRef.current = null;
    isListening.value   = false;
    audioLevel.value    = 0;
  }

  useEffect(() => {
    // Auto-start; if mic is denied or AudioContext blocked, listenError shows
    // a persistent banner so the user knows to click ◉ to retry.
    void startListening();
    return () => { void rxRef.current?.stop(); };
  }, []);

  // ── Sender ───────────────────────────────────────────────────────────────────

  async function sendMessage(messages: TrilinkMessage[]) {
    closeModal();
    isSending.value = true;

    const now = new Date();
    const [primary, ...extras] = messages;

    // Group all messages from one send action into a single journal entry
    const entry: JournalEntry = {
      id: nextEntryId(),
      message: primary!,
      direction: 'out',
      sessionId: 0,
      isCont: false,
      ts: now,
      continuations: extras.map((message) => ({
        id: nextEntryId(),
        message,
        direction: 'out' as const,
        sessionId: 0,
        isCont: true,
        ts: now,
        continuations: [],
      })),
    };
    addEntry(entry);

    try {
      const adapter = new WebAudioAdapter({ ptt: pttEnabled.value, volume: 60 });
      const sender = new TrilinkSender({
        audio: adapter,
        cycles: 1,
        preambleDurationMs: pttEnabled.value ? 700 : 0,
        onEvent(e) {
          if (e.type === 'cycle-start') {
            sendProgress.value = e.total > 1 ? `Cycle ${e.cycle + 1}/${e.total}` : '';
          } else if (e.type === 'transmission-complete' || e.type === 'aborted') {
            isSending.value    = false;
            sendProgress.value = '';
            senderRef.current  = null;
          }
        },
      });
      senderRef.current = sender;
      // Secondary messages marked cont:true so receiver groups them under the primary
      await sender.send(messages.map((message, i) => ({ message, cont: i > 0 })));
    } catch (err) {
      console.error('[sendMessage]', err);
      isSending.value = false;
    }
  }

  function openEntry(entry: JournalEntry) {
    switch (entry.message.type) {
      case 'GEO':     openModal({ type: 'geo-detail',     entry }); break;
      case 'TEXT':    openModal({ type: 'text-detail',    entry }); break;
      case 'CONTACT': openModal({ type: 'contact-detail', entry }); break;
      case 'TIME':    openModal({ type: 'time-detail',    entry }); break;
    }
  }

  // Keyboard: Escape closes modal; Cmd+C copies last journal entry
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeModal(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        if (window.getSelection()?.toString()) return;
        const top = journal.value[0];
        if (!top) return;
        e.preventDefault();
        const text = formatMessageForClipboard(top.message);
        navigator.clipboard?.writeText(text)
          .then(() => showToast('Copied!'))
          .catch(() => {});
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const m          = modal.value;
  const wfEnabled  = showWaterfall.value;
  const listening  = isListening.value;   // read separately — prevents short-circuit missing subscription
  const wfVis      = wfEnabled && listening;
  const mapVis     = showMap.value;

  return (
    <div style={s.root}>
      <Toolbar />

      {wfVis && (
        <>
          <WaterfallPanel analyserRef={analyserRef} height={wfHeight} />
          <ResizeHandle onDrag={(dy) => setWfHeight((h) => clamp(h + dy, 60, 400))} />
        </>
      )}

      {mapVis && (
        <>
          <MapPanel onSelectEntry={openEntry} height={mapHeight} />
          <ResizeHandle onDrag={(dy) => setMapHeight((h) => clamp(h + dy, 80, 500))} />
        </>
      )}

      <StatusBar onStartListening={startListening} onStopListening={stopListening} />
      <Journal loading={!journalLoaded.value} onSelectEntry={openEntry} />

      {m.type === 'geo-send'      && <GeoSendModal onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'geo-detail'    && <GeoDetailModal entry={m.entry} onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'text-detail'   && <TextDetailModal entry={m.entry} onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'contact-detail' && <ContactDetailModal entry={m.entry} onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'time-detail'   && <TimeDetailModal entry={m.entry} onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'contact-send'  && <ContactSendModal onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'text-send'     && <TextSendModal onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'qr'            && <QrModal onClose={closeModal} />}

      {toast.value && <div style={s.toast}>{toast.value}</div>}
    </div>
  );
}

function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }

function ResizeHandle({ onDrag }: { onDrag: (dy: number) => void }) {
  function onMouseDown(e: MouseEvent) {
    e.preventDefault();
    let lastY = e.clientY;
    function onMove(e: MouseEvent) { const dy = e.clientY - lastY; lastY = e.clientY; onDrag(dy); }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
  function onTouchStart(e: TouchEvent) {
    e.preventDefault();
    let lastY = e.touches[0]!.clientY;
    function onMove(e: TouchEvent) { const dy = e.touches[0]!.clientY - lastY; lastY = e.touches[0]!.clientY; onDrag(dy); }
    function onEnd() { document.removeEventListener('touchmove', onMove as EventListener); document.removeEventListener('touchend', onEnd); }
    document.addEventListener('touchmove', onMove as EventListener, { passive: false });
    document.addEventListener('touchend', onEnd);
  }
  return (
    <div
      style={s.handle}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      title="Drag to resize"
    >
      <span style={s.handleGrip}>⋯</span>
    </div>
  );
}

function formatMessageForClipboard(msg: TrilinkMessage): string {
  switch (msg.type) {
    case 'GEO':     return `${msg.lat.toFixed(6)}, ${msg.lon.toFixed(6)}${msg.alt !== undefined ? ` alt:${msg.alt}m` : ''}`;
    case 'CONTACT': return msg.value;
    case 'TEXT':    return msg.text;
    case 'TIME':    return new Date(msg.unixTs * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    default:        return msg.type;
  }
}

const s = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    height: '100dvh',
    maxWidth: '720px',
    margin: '0 auto',
    overflow: 'hidden',
  },
  handle: {
    height: '6px',
    background: 'var(--border)',
    cursor: 'ns-resize',
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none' as const,
  },
  handleGrip: {
    fontSize: '8px',
    color: 'var(--muted)',
    lineHeight: 1,
    pointerEvents: 'none' as const,
    letterSpacing: '2px',
  },
  toast: {
    position: 'fixed' as const,
    bottom: '24px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '20px',
    color: 'var(--text)',
    fontSize: '13px',
    fontWeight: 500,
    padding: '8px 16px',
    pointerEvents: 'none' as const,
    zIndex: 2000,
    boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
    whiteSpace: 'nowrap' as const,
  },
} as const;
