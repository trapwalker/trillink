import type { TrilinkMessage } from '@trillink/protocol';
import { ContactType } from '@trillink/protocol';
import { WebAudioAdapter, type AudioChannel } from '@trillink/audio-web';
import { TrilinkSender } from '@trillink/sdk';

/**
 * <trillink-sender> Web Component
 *
 * Attributes:
 *   channel   — "direct" | "voip" | "gsm" | "ptt"   (default: "voip")
 *   cycles    — number of transmission cycles          (default: 3)
 *   preamble  — preamble duration ms for PTT           (default: 700 for ptt, 0 otherwise)
 *
 * Events dispatched on the element:
 *   trillink:sent    — detail: { messages: TrilinkMessage[] }
 *   trillink:error   — detail: { reason: string }
 *
 * Programmatic use:
 *   element.sendMessages([{ message: { type: 'GEO', lat, lon } }])
 */
export class TrilinkSenderElement extends HTMLElement {
  private _sender: TrilinkSender | null = null;

  static get observedAttributes() {
    return ['channel', 'cycles', 'preamble'];
  }

  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: 'open' });
    this.render();
  }

  private get channel(): AudioChannel {
    return (this.getAttribute('channel') ?? 'voip') as AudioChannel;
  }

  private get cycles(): number {
    return parseInt(this.getAttribute('cycles') ?? '3', 10);
  }

  private get preambleMs(): number {
    const attr = this.getAttribute('preamble');
    if (attr !== null) return parseInt(attr, 10);
    return this.channel === 'ptt' ? 700 : 0;
  }

  async sendMessages(messages: { message: TrilinkMessage; cont?: boolean }[]): Promise<void> {
    const adapter = new WebAudioAdapter({ channel: this.channel });
    this._sender = new TrilinkSender({
      audio: adapter,
      cycles: this.cycles,
      preambleDurationMs: this.preambleMs,
    });

    try {
      await this._sender.send(messages);
      this.dispatchEvent(new CustomEvent('trillink:sent', {
        bubbles: true,
        composed: true,
        detail: { messages: messages.map((m) => m.message) },
      }));
    } catch (err) {
      this.dispatchEvent(new CustomEvent('trillink:error', {
        bubbles: true,
        composed: true,
        detail: { reason: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  abort() {
    this._sender?.abort();
  }

  private render() {
    const root = this.shadowRoot!;
    root.innerHTML = `
      <style>
        :host { display: block; font-family: system-ui, sans-serif; }
        form { display: flex; flex-direction: column; gap: 12px; }
        label { font-size: 12px; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
        input, select, textarea {
          width: 100%; padding: 8px 10px; border: 1px solid #333; border-radius: 6px;
          background: #1a1d2e; color: #e2e4f0; font-size: 14px; outline: none;
          box-sizing: border-box;
        }
        button {
          padding: 10px; background: #4f8ef7; border: none; border-radius: 6px;
          color: #fff; font-size: 15px; font-weight: 600; cursor: pointer;
        }
        button:disabled { opacity: 0.5; cursor: not-allowed; }
        #status { font-size: 13px; min-height: 18px; }
      </style>
      <form id="form">
        <div>
          <label>Type</label>
          <select id="type">
            <option value="GEO">GEO</option>
            <option value="CONTACT">CONTACT</option>
            <option value="TEXT">TEXT</option>
            <option value="TIME">TIME</option>
          </select>
        </div>
        <div id="fields"></div>
        <button type="submit" id="btn">▶ Transmit</button>
        <div id="status"></div>
      </form>
    `;

    const form = root.querySelector('#form')!;
    const typeEl = root.querySelector('#type') as HTMLSelectElement;
    const fieldsEl = root.querySelector('#fields')!;
    const btn = root.querySelector('#btn') as HTMLButtonElement;
    const statusEl = root.querySelector('#status')!;

    const renderFields = () => {
      switch (typeEl.value) {
        case 'GEO':
          fieldsEl.innerHTML = `
            <label>Latitude</label><input id="lat" placeholder="55.7558" required>
            <label>Longitude</label><input id="lon" placeholder="37.6176" required>
          `;
          break;
        case 'CONTACT':
          fieldsEl.innerHTML = `<label>Phone (E.164)</label><input id="val" placeholder="+79161234567" required>`;
          break;
        case 'TEXT':
          fieldsEl.innerHTML = `<label>Text</label><textarea id="txt" rows="3"></textarea>`;
          break;
        case 'TIME':
          fieldsEl.innerHTML = `<p style="color:#888;font-size:13px">Sends current time with timezone.</p>`;
          break;
      }
    };

    typeEl.addEventListener('change', renderFields);
    renderFields();

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      btn.disabled = true;
      statusEl.textContent = 'Transmitting…';

      let message: TrilinkMessage | null = null;
      const type = typeEl.value;

      if (type === 'GEO') {
        const lat = parseFloat((root.querySelector('#lat') as HTMLInputElement).value);
        const lon = parseFloat((root.querySelector('#lon') as HTMLInputElement).value);
        if (!isNaN(lat) && !isNaN(lon)) message = { type: 'GEO', lat, lon };
      } else if (type === 'CONTACT') {
        const val = (root.querySelector('#val') as HTMLInputElement).value.trim();
        if (val) message = { type: 'CONTACT', contactType: ContactType.PHONE, value: val };
      } else if (type === 'TEXT') {
        const txt = (root.querySelector('#txt') as HTMLTextAreaElement).value.trim();
        if (txt) message = { type: 'TEXT', text: txt };
      } else if (type === 'TIME') {
        message = { type: 'TIME', unixTs: Math.floor(Date.now() / 1000), tzOffsetMin: -new Date().getTimezoneOffset() };
      }

      if (!message) {
        statusEl.textContent = '✗ Fill in all fields';
        btn.disabled = false;
        return;
      }

      await this.sendMessages([{ message }]);
      statusEl.textContent = '✓ Done';
      btn.disabled = false;
    });
  }
}

customElements.define('trillink-sender', TrilinkSenderElement);
