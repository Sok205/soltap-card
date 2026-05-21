import { defineConfig } from '@solidjs/start/config';

export default defineConfig({
  ssr: true,
  vite: {
    server: {
      // Allow tunneling tools (ngrok, Cloudflare, localtunnel) to reach the dev
      // server. Vite's default DNS-rebind protection rejects non-localhost
      // Host headers with HTTP 403 — fine for browser dev, fatal for mobile
      // wallet flows where the request comes through a tunnel.
      allowedHosts: true,
    },
  },
});
