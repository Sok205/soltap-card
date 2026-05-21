import type { APIEvent } from '@solidjs/start/server';
import { loadConfig } from '../../lib/config';
import { ownerIconDataUri } from '../../lib/icon';

// Solana Pay tx-request GET: returns metadata shown to the user in their wallet
// before they tap "approve".
export async function GET(_event: APIEvent) {
  const cfg = loadConfig();
  const body = {
    label: `Handshake with ${cfg.owner.name}`,
    icon: ownerIconDataUri(),
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}
