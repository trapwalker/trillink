import { useEffect, useRef } from 'preact/hooks';
import type { TrilinkMessage } from '@trillink/protocol';
import { WebAudioAdapter, DtmfFskCodec } from '@trillink/audio-web';
import { TrilinkSender, TrilinkReceiver } from '@trillink/sdk';
import type { ReceiverEvent } from '@trillink/sdk';
import {
  addEntry, nextEntryId, isListening, audioLevel, signalDetected,
  isSending, modal, closeModal, pttEnabled,
} from './store/index.js';
import { Toolbar }          from './components/Toolbar.js';
import { Journal }          from './components/Journal.js';
import { StatusBar }        from './components/StatusBar.js';
import { WaterfallPanel }   from './components/WaterfallPanel.js';
import { GeoSendModal }     from './components/modals/GeoSendModal.js';
import { GeoDetailModal }   from './components/modals/GeoDetailModal.js';
import { ContactSendModal } from './components/modals/ContactSendModal.js';
import { TextSendModal }    from './components/modals/TextSendModal.js';
import { TimeSendModal }    from './components/modals/TimeSendModal.js';

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
      analyserRef.current = adapter.analyser ?? null;

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
              ts: new Date(),
              continuations: [],
            });
          }
        },
      });
      rxRef.current = rx;
      await rx.start();
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
          if (e.type === 'transmission-complete' || e.type === 'aborted') {
            isSending.value = false;
            senderRef.current = null;
          }
        },
      });
      senderRef.current = sender;
      await sender.send([{ message }]);
    } catch {
      isSending.value = false;
    }
  }

  // Keyboard: Escape closes modal
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeModal();
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        // Cmd/Ctrl+Enter — handled inside modals themselves
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
      <StatusBar onStartListening={startListening} onStopListening={stopListening} />
      <Journal onSelectEntry={(entry) => {
        if (entry.message.type === 'GEO') {
          import('./store/index.js').then(({ openModal }) =>
            openModal({ type: 'geo-detail', entry })
          );
        }
      }} />

      {m.type === 'geo-send'     && <GeoSendModal onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'geo-detail'   && <GeoDetailModal entry={m.entry} onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'contact-send' && <ContactSendModal onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'text-send'    && <TextSendModal onSend={sendMessage} onClose={closeModal} />}
      {m.type === 'time-send'    && <TimeSendModal onSend={sendMessage} onClose={closeModal} />}
    </div>
  );
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
} as const;
