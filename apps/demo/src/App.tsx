import { useState } from 'preact/hooks';
import { SendView } from './components/SendView.js';
import { ReceiveView } from './components/ReceiveView.js';

type Tab = 'send' | 'receive';

export function App() {
  const [tab, setTab] = useState<Tab>('send');

  return (
    <div style={styles.root}>
      <header style={styles.header}>
        <div style={styles.logo}>
          <span style={styles.logoMark}>▶◀</span>
          <span style={styles.logoText}>trillink</span>
        </div>
        <nav style={styles.nav}>
          <button
            style={{ ...styles.tab, ...(tab === 'send' ? styles.tabActive : {}) }}
            onClick={() => setTab('send')}
          >
            Send
          </button>
          <button
            style={{ ...styles.tab, ...(tab === 'receive' ? styles.tabActive : {}) }}
            onClick={() => setTab('receive')}
          >
            Receive
          </button>
        </nav>
      </header>

      <main style={styles.main}>
        {tab === 'send' ? <SendView /> : <ReceiveView />}
      </main>

      <footer style={styles.footer}>
        <a href="https://github.com/trillink/trillink" style={styles.link}>
          Protocol v1 · Open source
        </a>
      </footer>
    </div>
  );
}

const styles = {
  root: {
    display: 'flex',
    flexDirection: 'column' as const,
    minHeight: '100dvh',
    maxWidth: '600px',
    margin: '0 auto',
    padding: '0 16px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '16px 0',
    borderBottom: '1px solid var(--border)',
  },
  logo: { display: 'flex', alignItems: 'center', gap: '8px' },
  logoMark: { color: 'var(--accent)', fontSize: '18px', letterSpacing: '-2px' },
  logoText: { fontFamily: 'var(--font)', fontWeight: 700, fontSize: '18px', letterSpacing: '2px' },
  nav: { display: 'flex', gap: '4px' },
  tab: {
    background: 'transparent',
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    color: 'var(--muted)',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '6px 16px',
    transition: 'all 0.15s',
  },
  tabActive: {
    background: 'var(--accent-dim)',
    borderColor: 'var(--accent)',
    color: 'var(--text)',
  },
  main: { flex: 1, padding: '24px 0' },
  footer: {
    padding: '16px 0',
    borderTop: '1px solid var(--border)',
    textAlign: 'center' as const,
  },
  link: { color: 'var(--muted)', fontSize: '12px', textDecoration: 'none' },
} as const;
