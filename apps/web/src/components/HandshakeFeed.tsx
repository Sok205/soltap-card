import { For } from 'solid-js';
import type { HandshakeEvent } from '../lib/indexer';

function short(pk: string) {
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function relTime(ts: number, now = Date.now() / 1000): string {
  const s = Math.max(0, Math.floor(now - ts));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function HandshakeFeed(props: { items: () => HandshakeEvent[] }) {
  return (
    <ul style={{ 'list-style': 'none', padding: '0', margin: '0' }}>
      <For each={props.items()}>
        {(ev) => (
          <li
            style={{
              padding: '0.75rem 0',
              'border-bottom': '1px solid rgba(0,0,0,0.06)',
              display: 'flex',
              'justify-content': 'space-between',
              'font-family': 'ui-monospace, monospace',
              'font-size': '0.875rem',
            }}
          >
            <span>
              <strong>#{ev.edition}</strong> → {short(ev.recipient)}
            </span>
            <span style={{ opacity: '0.6' }}>{relTime(ev.ts)}</span>
          </li>
        )}
      </For>
    </ul>
  );
}
