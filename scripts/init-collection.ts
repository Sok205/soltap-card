import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import bs58 from 'bs58';
import toml from '@iarna/toml';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner, keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import { createCollection, create, fetchCollection } from '@metaplex-foundation/mpl-core';

function expandEnv(s: string): string {
  return s.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name) => {
    const v = process.env[name];
    if (v === undefined) throw new Error(`env var ${name} not set`);
    return v;
  });
}

async function main() {
  const cfgPath = path.resolve('config.toml');
  const cfg = toml.parse(fs.readFileSync(cfgPath, 'utf8')) as Record<string, Record<string, string>>;

  if (cfg.collection?.collection_address && cfg.collection?.owner_card_asset) {
    console.log('Already initialized:');
    console.log('  collection:', cfg.collection.collection_address);
    console.log('  owner card:', cfg.collection.owner_card_asset);
    return;
  }

  const rpcUrl = expandEnv(cfg.chain.rpc_url);
  const umi = createUmi(rpcUrl);

  const ownerSecretB58 = process.env.OWNER_UPDATE_AUTHORITY_KEYPAIR_B58;
  if (!ownerSecretB58) throw new Error('OWNER_UPDATE_AUTHORITY_KEYPAIR_B58 not set');
  const ownerSecret = bs58.decode(ownerSecretB58);
  const ownerKeypair = umi.eddsa.createKeypairFromSecretKey(ownerSecret);
  umi.use(keypairIdentity(ownerKeypair));

  let collectionPubkey: string;
  if (cfg.collection?.collection_address) {
    collectionPubkey = cfg.collection.collection_address;
    console.log('Reusing existing collection:', collectionPubkey);
  } else {
    console.log('Creating collection...');
    const collection = generateSigner(umi);
    await createCollection(umi, {
      collection,
      name: `${cfg.owner.name} — Handshakes @ ${cfg.event.name}`,
      uri: cfg.collection?.collection_uri ?? 'https://soltap.app/collection.json',
    }).sendAndConfirm(umi);
    collectionPubkey = collection.publicKey.toString();
    console.log('  collection:', collectionPubkey);
  }

  const collectionAccount = await fetchCollection(umi, publicKey(collectionPubkey));

  console.log('Creating owner card asset...');
  const ownerCard = generateSigner(umi);
  await create(umi, {
    asset: ownerCard,
    collection: collectionAccount,
    name: `${cfg.owner.name} — Card`,
    uri: cfg.collection?.owner_card_uri ?? 'https://soltap.app/owner-card.json',
    plugins: [
      {
        type: 'Attributes',
        attributeList: [
          { key: 'handshake_count', value: '0' },
          { key: 'last_handshake_at', value: '0' },
        ],
      },
    ],
  }).sendAndConfirm(umi);
  console.log('  owner card:', ownerCard.publicKey.toString());

  cfg.collection = cfg.collection ?? {};
  cfg.collection.collection_address = collectionPubkey;
  cfg.collection.owner_card_asset = ownerCard.publicKey.toString();
  fs.writeFileSync(cfgPath, toml.stringify(cfg as Parameters<typeof toml.stringify>[0]));

  console.log('\nInitialized:');
  console.log('  collection:', cfg.collection.collection_address);
  console.log('  owner card:', cfg.collection.owner_card_asset);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
