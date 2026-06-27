import { useEffect, useRef } from 'preact/hooks';
import type { TrilinkMessage } from '@trillink/protocol';
import { WebAudioAdapter } from '@trillink/audio-web';
import { TrilinkSender, TrilinkReceiver } from '@trillink/sdk';
import type { ReceiverEvent } from '@trillink/sdk';
import {
  addEntry, nextEntryId, isListening, audioLevel, signalDetected,
  isSending, sendProgress, modal, closeModal, openModal, pttEnabled,
  journal, journalLoaded, toast, showToast, panelView,
} from './store/index.js';
import { Toolbar }          from './components/Toolbar.js';
import { Journal }          from './components/Journal.js';
import { StatusBar }        from './components/StatusBar.js';
import { WaterfallPanel }   from './components/WaterfallPanel.js';
import { MapPanel }         from './components/MapPanel.js';
import { GeoSendModal }     from './components/modals/GeoSendModal.js';
import { GeoDetailModal }   from './components/modals/GeoDetailModal.js';
import { ContactSendModal } from './components/modals/ContactSendModal.js';
import { TextSendModal }    from './components/modals/TextSendModal.js';
import { TimeSendModal }    from './components/modals/TimeSendModal.js';
import { QrModal }          from './components/modals/QrModal.js';

export function App() {
  const rxRef       = useRef<TrilinkReceiver | null>(null);
  const adapterRef  = useRef<WebAudioAdapter | null>(null);
  const senderRef   = useRef<TrilinkSender | null>(null);
  const signalTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);

  // ── Receiver ────────────────────────────────────────────────────────────────

  async function startListening() {
    try {
      const adapter = new WebAudioAdapter();
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
      // analyser is only available after startListening completes (RxHandle is created inside)
      analyserRef.current = adapter.analyser;
    } catch {
      isListening.value = false;
    }
  }

  async function stopListening() {
    await rxRef.current?.stop();
    rxRef.current      = null;
    adapterRef.current  = null;
    analyserRef.current = null;
    isListening.value   = false;
    audioLevel.value    = 0;
  }

  useEffect(() => {
    void startListening();
    return () => { void rxRef.current?.stop(); };
  }, []);

  // ── Sender ──────────────────────────────────────────────────────────────────

  async function sendMessage(message: TrilinkMessage) {
    closeModal();
    isSending.value = true;

    // Add to journal immediately as outgoing
    addEntry({
      id: nextEntryId(),
      message,
      direction: 'out',
      sessionId: 0,
      isCont: false,
      ts: new Date(),
      continuations: [],
    });

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
      await sender.send([{ message }]);
    } catch {
      isSending.value = false;
    }
  }

  // Keyboard: Escape closes modal; Cmd+C copies last journal entry
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { closeModal(); return; }
      if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
        // Only intercept when nothing is selected
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

  const m = modal.value;

  return (
    <div style={s.root}>
      <Toolbar onSend={sendMessage} />
      <WaterfallPanel analyserRef={analyserRef} />
      {panelView.value === 'map' && (
        <MapPanel onSelectEntry={(entry) => {
          if (entry.message.type === 'GEO') openModal({ type: 'geo-detail', entry });
        }} />
      )}
      <StatusBar onStartListening={startListening} onStopListening={stopListening} />
      <Journal
        loading={!journalLoaded.value}
        onSelectEntry={(entry) => {
          if (entry.message.type === 'GEO') openModal({ type: 'geo-detail', entry });
        }}
      />

      {m.type === 'geo-send'     && <GeoSendModal onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'geo-detail'   && <GeoDetailModal entry={m.entry} onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'contact-send' && <ContactSendModal onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'text-send'    && <TextSendModal onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'time-send'    && <TimeSendModal onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'qr'           && <QrModal onClose={closeModal} />}

      {toast.value && (
        <div style={s.toast}>{toast.value}</div>
      )}
    </div>
  );
}

function formatMessageForClipboard(msg: TrilinkMessage): string {
  switch (msg.type) {
    case 'GEO':
      return `${msg.lat.toFixed(6)}, ${msg.lon.toFixed(6)}${msg.alt !== undefined ? ` alt:${msg.alt}m` : ''}`;
    case 'CONTACT':
      return msg.value;
    case 'TEXT':
      return msg.text;
    case 'TIME':
      return new Date(msg.unixTs * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
    default:
      return msg.type;
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
