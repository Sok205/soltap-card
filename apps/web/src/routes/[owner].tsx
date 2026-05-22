import { createSignal, onMount, onCleanup, Show } from 'solid-js';
import { createAsync, type RouteDefinition } from '@solidjs/router';
import { loadConfig } from '~/lib/config';
import {
  fetchStats,
  fetchHistory,
  indexerSseUrl,
  type HandshakeEvent,
  type Stats,
} from '~/lib/indexer';
import HandshakeCounter from '~/components/HandshakeCounter';
import HandshakeFeed from '~/components/HandshakeFeed';

type InitialData = {
  owner: {
    name: string;
    role: string;
    bio?: string;
    x?: string;
    github?: string;
    email?: string;
    wallet: string;
  };
  event: { name: string };
  stats: Stats;
  history: HandshakeEvent[];
};

async function loadInitial(): Promise<InitialData> {
  'use server';
  const cfg = loadConfig();
  const [stats, history] = await Promise.all([fetchStats(), fetchHistory(20)]);
  return { owner: cfg.owner, event: cfg.event, stats, history };
}

export const route = {
  preload() {
    void loadInitial();
  },
} satisfies RouteDefinition;

export default function ProfilePage() {
  const data = createAsync(() => loadInitial());

  const [liveCount, setLiveCount] = createSignal<number | null>(null);
  const [liveItems, setLiveItems] = createSignal<HandshakeEvent[] | null>(null);

  onMount(() => {
    if (typeof window === 'undefined' || typeof EventSource === 'undefined') return;
    const es = new EventSource(indexerSseUrl());
    es.addEventListener('handshake', (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as HandshakeEvent;
        const current = liveItems() ?? data()?.history ?? [];
        const merged = [ev, ...current.filter((x) => x.signature !== ev.signature)].slice(0, 20);
        setLiveItems(merged);
        setLiveCount((c) => (c ?? data()?.stats.count ?? 0) + 1);
      } catch (err) {
        console.warn('bad sse payload', err);
      }
    });
    es.onerror = (err) => console.warn('sse error', err);
    onCleanup(() => es.close());
  });

  return (
    <Show when={data()} fallback={<p style={{ padding: '4rem' }}>Loading…</p>}>
      {(d) => {
        const owner = () => d().owner;
        const ev = () => d().event;
        const count = () => liveCount() ?? d().stats.count;
        const items = () => liveItems() ?? d().history;
        return (
          <main
            style={{
              padding: '3rem 1.5rem',
              'font-family': 'system-ui, sans-serif',
              'max-width': '720px',
              margin: '0 auto',
              color: '#0E0F11',
            }}
          >
            <header
              style={{
                padding: '2rem',
                'border-radius': '1rem',
                background: 'linear-gradient(135deg, #9945FF, #14F195)',
                color: '#0E0F11',
                'margin-bottom': '2rem',
              }}
            >
              <h1 style={{ margin: '0 0 0.25rem 0', 'font-size': '2rem' }}>{owner().name}</h1>
              <p style={{ margin: '0 0 1rem 0', opacity: '0.85' }}>{owner().role}</p>
              <HandshakeCounter initial={d().stats.count} live={count} />
              <p style={{ margin: '1rem 0 0 0', opacity: '0.75', 'font-size': '0.875rem' }}>
                at {ev().name}
              </p>
            </header>

            <section style={{ 'margin-bottom': '2rem' }}>
              <h2 style={{ 'font-size': '1.125rem', 'margin-bottom': '0.5rem' }}>About</h2>
              <p style={{ margin: '0 0 0.75rem 0', opacity: '0.85' }}>{owner().bio ?? ''}</p>
              <p style={{ margin: '0', 'font-size': '0.875rem' }}>
                <Show when={owner().github}>
                  <a href={`https://github.com/${owner().github}`}>github</a>{' · '}
                </Show>
                <Show when={owner().x}>
                  <a href={`https://x.com/${owner().x?.replace(/^@/, '')}`}>x</a>{' · '}
                </Show>
                <Show when={owner().email}>
                  <a href={`mailto:${owner().email}`}>email</a>
                </Show>
              </p>
            </section>

            <section>
              <h2 style={{ 'font-size': '1.125rem', 'margin-bottom': '0.5rem' }}>
                Recent handshakes
              </h2>
              <Show
                when={items().length > 0}
                fallback={<p style={{ opacity: '0.6' }}>None yet — be the first to tap.</p>}
              >
                <HandshakeFeed items={items} />
              </Show>
            </section>
          </main>
        );
      }}
    </Show>
  );
}
