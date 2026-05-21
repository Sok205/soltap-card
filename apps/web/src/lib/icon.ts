import { loadConfig } from './config';

function escapeXml(s: string): string {
  return s.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]!);
}

export function ownerIconDataUri(): string {
  const cfg = loadConfig();
  const name = escapeXml(cfg.owner.name);
  const role = escapeXml(cfg.owner.role);
  const event = escapeXml(cfg.event.name);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <defs>
      <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#9945FF"/>
        <stop offset="100%" stop-color="#14F195"/>
      </linearGradient>
    </defs>
    <rect width="512" height="512" rx="48" fill="url(#g)"/>
    <g font-family="system-ui, -apple-system, sans-serif" fill="#0E0F11" text-anchor="middle">
      <text x="256" y="160" font-size="48" font-weight="700">SolTap</text>
      <text x="256" y="260" font-size="56" font-weight="800">${name}</text>
      <text x="256" y="310" font-size="28" font-weight="500" opacity="0.85">${role}</text>
      <text x="256" y="430" font-size="20" font-weight="500" opacity="0.75">${event}</text>
    </g>
  </svg>`;
  const b64 = Buffer.from(svg).toString('base64');
  return `data:image/svg+xml;base64,${b64}`;
}
