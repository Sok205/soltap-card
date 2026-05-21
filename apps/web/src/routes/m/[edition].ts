import type { APIEvent } from '@solidjs/start/server';
import { loadConfig } from '../../lib/config';
import { ownerIconDataUri } from '../../lib/icon';

export async function GET(event: APIEvent) {
  const cfg = loadConfig();
  const edition = event.params.edition;
  const body = {
    name: `Handshake with ${cfg.owner.name} — #${edition}`,
    description: cfg.owner.bio ?? `Met ${cfg.owner.name} at ${cfg.event.name}.`,
    image: ownerIconDataUri(),
    external_url: cfg.owner.github ? `https://github.com/${cfg.owner.github}` : undefined,
    attributes: [
      { trait_type: 'owner_name', value: cfg.owner.name },
      { trait_type: 'owner_role', value: cfg.owner.role },
      { trait_type: 'owner_x', value: cfg.owner.x ?? '' },
      { trait_type: 'owner_github', value: cfg.owner.github ?? '' },
      { trait_type: 'owner_email', value: cfg.owner.email ?? '' },
      { trait_type: 'edition', value: String(edition) },
      { trait_type: 'event', value: cfg.event.name },
    ],
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=300',
      'access-control-allow-origin': '*',
    },
  });
}
