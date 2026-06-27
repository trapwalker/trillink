import type { TrilinkMessage } from '@trillink/protocol';
import { WebAudioAdapter } from '@trillink/audio-web';
import { TrilinkReceiver } from '@trillink/sdk';
import type { ReceiverEvent } from '@trillink/sdk';

/**
 * <trillink-receiver> Web Component
 *
 * Attributes:
 *   mode        — "fast" | "balanced" | "robust"  (default: "balanced"); affects TX only, RX auto-detects
 *   auto-start  — start listening on connect (requires user gesture first on iOS)
 *
 * Events dispatched on the element (bubbles, composed):
 *   trillink:signal    — GGWave sync detected
 *   trillink:fragment  — detail: { msgType, segIdx, segTotal }
 *   trillink:message   — detail: TrilinkMessage
 *   trillink:error     — detail: { reason: string }
 */
export class TrilinkReceiverElement extends HTMLElement {
  private _receiver: TrilinkReceiver | null = null;
  private _listening = false;

  static get observedAttributes() {
    return ['mode', 'auto-start'];
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.render();

    if (this.hasAttribute('auto-start')) {
      this.startListening().catch(() => {
        // Auto-start blocked (iOS gesture restriction) — UI shows tap-to-start
      });
    }
  }

  disconnectedCallback() {
    void this.stopListening();
  }

  async startListening(): Promise<void> {
    if (this._listening) return;

    const adapter = new WebAudioAdapter();
    this._receiver = new TrilinkReceiver({
      audio: adapter,
      onEvent: (e: ReceiverEvent) => this.handleEvent(e),
    });

    await this._receiver.start();
    this._listening = true;
    this.updateStatus('Listening…', true);
  }

  async stopListening(): Promise<void> {
    if (!this._receiver) return;
    await this._receiver.stop();
    this._receiver = null;
    this._listening = false;
    this.updateStatus('Stopped.', false);
  }

  reset() {
    this._receiver?.reset();
  }

  private handleEvent(e: ReceiverEvent) {
    switch (e.type) {
      case 'signal-detected':
        this.dispatchEvent(new CustomEvent('trillink:signal', { bubbles: true, composed: true }));
        this.updateStatus('Signal detected…', true);
        break;
      case 'fragment-received':
        this.dispatchEvent(new CustomEvent('trillink:fragment', {
          bubbles: true, composed: true,
          detail: { msgType: e.msgType, segIdx: e.segIdx, segTotal: e.segTotal },
        }));
        this.updateStatus(`Fragment ${e.segIdx + 1}/${e.segTotal}…`, true);
        break;
      case 'message-ready':
        this.dispatchEvent(new CustomEvent('trillink:message', {
          bubbles: true, composed: true,
          detail: e.message,
        }));
        this.appendMessage(e.message, e.isCont);
        this.updateStatus('Listening…', true);
        break;
      case 'frame-error':
        this.dispatchEvent(new CustomEvent('trillink:error', {
          bubbles: true, composed: true,
          detail: { reason: e.reason },
        }));
        break;
    }
  }

  private updateStatus(text: string, active: boolean) {
    const root = this.shadowRoot;
    if (!root) return;
    const el = root.querySelector('#status');
    if (el) el.textContent = text;
    const dot = root.querySelector('#dot');
    if (dot) (dot as HTMLElement).style.background = active ? '#3ddc84' : '#444';
  }

  private appendMessage(msg: TrilinkMessage, isCont: boolean) {
    const root = this.shadowRoot;
    if (!root) return;
    const log = root.querySelector('#log');
    if (!log) return;

    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-type">${msg.type}${isCont ? ' <span class="cont">+cont</span>' : ''}</div>
      <div class="card-body">${formatMessage(msg)}</div>
    `;
    log.prepend(card);
  }

  private render() {
    const root = this.shadowRoot!;
    root.innerHTML = `
      <style>
        :host { display: block; font-family: system-ui, sans-serif; }
        .toolbar { display: flex; gap: 8px; align-items: center; margin-bottom: 12px; }
        button { padding: 8px 14px; border: 1px solid #333; border-radius: 6px; background: #1a1d2e; color: #e2e4f0; cursor: pointer; font-size: 14px; }
        button.active { background: #4f8ef7; border-color: #4f8ef7; }
        .status-row { display: flex; align-items: center; gap: 6px; font-size: 13px; color: #888; margin-bottom: 12px; }
        #dot { width: 8px; height: 8px; border-radius: 50%; background: #444; flex-shrink: 0; }
        #log { display: flex; flex-direction: column; gap: 6px; }
        .card { background: #1a1d2e; border: 1px solid #2d3055; border-radius: 6px; overflow: hidden; }
        .card-type { padding: 6px 10px; font-size: 11px; color: #4f8ef7; font-weight: 700; border-bottom: 1px solid #2d3055; text-transform: uppercase; }
        .card-body { padding: 8px 10px; font-size: 13px; color: #e2e4f0; white-space: pre-wrap; }
        .cont { color: #888; font-weight: 400; }
      </style>
      <div class="toolbar">
        <button id="toggle">◉ Start</button>
        <button id="clear">Clear</button>
      </div>
      <div class="status-row">
        <span id="dot"></span>
        <span id="status">Press Start to begin listening.</span>
      </div>
      <div id="log"></div>
    `;

    const toggleBtn = root.querySelector('#toggle') as HTMLButtonElement;
    root.querySelector('#clear')!.addEventListener('click', () => {
      root.querySelector('#log')!.innerHTML = '';
    });

    toggleBtn.addEventListener('click', async () => {
      if (this._listening) {
        await this.stopListening();
        toggleBtn.textContent = '◉ Start';
        toggleBtn.classList.remove('active');
      } else {
        toggleBtn.textContent = '■ Stop';
        toggleBtn.classList.add('active');
        await this.startListening();
      }
    });
  }
}

function formatMessage(msg: TrilinkMessage): string {
  switch (msg.type) {
    case 'GEO':    return `lat: ${msg.lat.toFixed(6)}\nlon: ${msg.lon.toFixed(6)}${msg.alt !== undefined ? `\nalt: ${msg.alt}m` : ''}`;
    case 'CONTACT': return `${msg.contactType}: ${msg.value}`;
    case 'TEXT':   return msg.text;
    case 'TIME':   return new Date(msg.unixTs * 1000).toISOString();
    default:       return JSON.stringify(msg, null, 2);
  }
}

customElements.define('trillink-receiver', TrilinkReceiverElement);
