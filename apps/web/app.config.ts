import { defineConfig } from '@solidjs/start/config';

export default defineConfig({
  ssr: true,
  vite: {
    server: {
      // Allow common tunneling tools (ngrok, Cloudflare, localtunnel) to reach
      // the dev server for mobile wallet testing. Using an explicit allowlist
      // instead of `true` keeps DNS-rebind protection active for any host not
      // in this list.
      allowedHosts: [
        'localhost',
        '127.0.0.1',
        '.ngrok-free.dev',
        '.ngrok.io',
        '.trycloudflare.com',
        '.loca.lt',
      ],
    },
  },
});
