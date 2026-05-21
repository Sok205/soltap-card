import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import bs58 from 'bs58';
import toml from '@iarna/toml';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { generateSigner, keypairIdentity, publicKey } from '@metaplex-foundation/umi';
import { create, fetchCollection } from '@metaplex-foundation/mpl-core';

function expandEnv(s: string): string {
  return s.replace(/\$\{([A-Z_][A-Z0-9_]*)\}/g, (_, name) => {
    const v = process.env[name];
    if (v === undefined) throw new Error(`env var ${name} not set`);
    return v;
  });
}

async function main() {
  const recipient = process.argv[2];
  if (!recipient) {
    console.error('Usage: pnpm tsx scripts/mint-handshake.ts <RECIPIENT_PUBKEY>');
    process.exit(1);
  }

  const cfgPath = path.resolve('config.toml');
  const cfg = toml.parse(fs.readFileSync(cfgPath, 'utf8')) as Record<string, Record<string, string>>;

  const rpcUrl = expandEnv(cfg.chain.rpc_url);
  const umi = createUmi(rpcUrl);

  // Load fee payer keypair
  const feePayerSecretB58 = process.env.FEE_PAYER_KEYPAIR_B58;
  if (!feePayerSecretB58) throw new Error('FEE_PAYER_KEYPAIR_B58 not set');
  const feePayerSecret = bs58.decode(feePayerSecretB58);
  const feePayerKeypair = umi.eddsa.createKeypairFromSecretKey(feePayerSecret);
  const feePayerSigner = umi.eddsa.createKeypairFromSecretKey(feePayerSecret);

  // Load owner/update-authority keypair (needed to authorize adding asset to collection)
  const ownerSecretB58 = process.env.OWNER_UPDATE_AUTHORITY_KEYPAIR_B58;
  if (!ownerSecretB58) throw new Error('OWNER_UPDATE_AUTHORITY_KEYPAIR_B58 not set');
  const ownerSecret = bs58.decode(ownerSecretB58);
  const ownerKeypair = umi.eddsa.createKeypairFromSecretKey(ownerSecret);

  // Use fee payer as umi identity (pays for tx)
  umi.use(keypairIdentity(feePayerKeypair));

  // Fetch the live collection account
  const collectionAddress = cfg.collection.collection_address;
  if (!collectionAddress) throw new Error('collection_address not set in config.toml');
  console.log('Fetching collection:', collectionAddress);
  const collection = await fetchCollection(umi, publicKey(collectionAddress));

  // Build owner signer for collection authority
  const { createSignerFromKeypair } = await import('@metaplex-foundation/umi');
  const ownerSigner = createSignerFromKeypair(umi, ownerKeypair);

  // Generate a new asset keypair for this handshake NFT
  const asset = generateSigner(umi);
  console.log('Minting handshake NFT...');
  console.log('  asset pubkey:', asset.publicKey.toString());
  console.log('  recipient:', recipient);

  const result = await create(umi, {
    asset,
    collection,
    authority: ownerSigner,
    name: 'Handshake with Sok — #1',
    uri: 'https://example.com/h.json',
    owner: publicKey(recipient),
  }).sendAndConfirm(umi);

  const sig = Buffer.from(result.signature).toString('base64');
  console.log('\nMint successful!');
  console.log('  asset pubkey:', asset.publicKey.toString());
  console.log('  tx signature (base64):', sig);

  // Also print as bs58 for solana CLI
  const sigBs58 = bs58.encode(result.signature);
  console.log('  tx signature (bs58):', sigBs58);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
