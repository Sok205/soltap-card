import { createSignal, createEffect } from 'solid-js';

export default function HandshakeCounter(props: { initial: number; live?: () => number }) {
  const [count, setCount] = createSignal(props.initial);
  createEffect(() => {
    if (props.live) setCount(props.live());
  });
  return (
    <div style={{ display: 'flex', 'align-items': 'baseline', gap: '0.5rem' }}>
      <span style={{ 'font-size': '4rem', 'font-weight': '800', 'line-height': '1' }}>
        {count()}
      </span>
      <span style={{ 'font-size': '1rem', opacity: '0.7' }}>handshakes</span>
    </div>
  );
}
