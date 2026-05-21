import {
  generateSigner,
  publicKey,
  createNoopSigner,
  transactionBuilder,
} from '@metaplex-foundation/umi';
import { create, fetchCollection } from '@metaplex-foundation/mpl-core';
import { loadConfig } from './config';
import { umiWithFeePayer } from './solana';
import { getCurrentEdition } from './counter';

const SYSTEM_PROGRAM_ID = '11111111111111111111111111111111';

export type BuiltHandshake = {
  transaction: string; // base64
  message: string;
};

export type BuildHandshakeOpts = {
  /** Public base URL where /m/[edition].json is served. Defaults to PUBLIC_BASE_URL env. */
  baseUrl?: string;
};

export async function buildHandshakeTx(
  recipient: string,
  opts: BuildHandshakeOpts = {},
): Promise<BuiltHandshake> {
  const cfg = loadConfig();
  const { umi, feePayer, ownerAuthority } = umiWithFeePayer();

  const edition = (await getCurrentEdition()) + 1;
  const collection = await fetchCollection(umi, publicKey(cfg.collection.collection_address));
  const asset = generateSigner(umi);

  const recipientNoopSigner = createNoopSigner(publicKey(recipient));

  // No-op transfer of 0 lamports from recipient → recipient. Forces the wallet
  // to sign the tx (Solana Pay flow requirement).
  // System Program "Transfer" ix: discriminator 2 (4 bytes LE) + amount u64 LE = 0
  const noopTransferIx = {
    instruction: {
      programId: publicKey(SYSTEM_PROGRAM_ID),
      keys: [
        { pubkey: publicKey(recipient), isSigner: true, isWritable: true },
        { pubkey: publicKey(recipient), isSigner: false, isWritable: true },
      ],
      data: new Uint8Array([2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    },
    signers: [recipientNoopSigner],
    bytesCreatedOnChain: 0,
  };

  // The uri is stored as text on-chain. We must stay under Solana's 1232-byte
  // legacy tx size limit. A short HTTPS URL is ~50 bytes; data: URIs blow past
  // the limit fast. Metadata JSON is served by the /m/[edition].json route.
  const baseUrl = opts.baseUrl ?? process.env.PUBLIC_BASE_URL ?? 'https://soltap.app';
  const metadataUri = `${baseUrl}/m/${edition}`;

  const createBuilder = create(umi, {
    asset,
    collection,
    authority: ownerAuthority,
    payer: feePayer,
    name: `Handshake with ${cfg.owner.name} — #${edition}`,
    uri: metadataUri,
    owner: publicKey(recipient),
  });

  const builder = transactionBuilder()
    .add(noopTransferIx)
    .add(createBuilder);

  // buildAndSign fetches latest blockhash, builds the tx, and signs with all
  // known signers (feePayer identity + asset keypair + ownerAuthority from instructions).
  // recipientNoopSigner is a no-op signer — its slot stays empty for the wallet to fill.
  const built = await builder.buildAndSign(umi);
  const serialized = umi.transactions.serialize(built);
  const b64 = Buffer.from(serialized).toString('base64');

  return {
    transaction: b64,
    message: `Handshake with ${cfg.owner.name} at ${cfg.event.name} (edition ${edition})`,
  };
}
