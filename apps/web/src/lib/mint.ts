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

// SPL Memo v2 program. Used only when chain.sponsor_fees=true to force the
// recipient's signature (since they aren't the fee payer in that mode).
const MEMO_PROGRAM_ID = 'MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr';

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
  const sponsorFees = cfg.chain.sponsor_fees ?? false;

  // The uri is stored as text on-chain. Stay under Solana's 1232-byte legacy
  // tx size limit. Metadata JSON is served by the /m/[edition] route.
  const baseUrl = opts.baseUrl ?? process.env.PUBLIC_BASE_URL ?? 'https://soltap.app';
  const metadataUri = `${baseUrl}/m/${edition}`;

  // Fee-payer model:
  // - sponsor_fees=false (default): recipient signs as the fee payer and pays
  //   ~5000 lamports (~$0.0001). Universal wallet support, drain-attack proof.
  // - sponsor_fees=true: backend pays. Needs the Memo ix to force the recipient's
  //   signature since they aren't the payer. Spotty Phantom/Solflare mobile
  //   support — use at your own risk.
  const txPayer = sponsorFees ? feePayer : recipientNoopSigner;

  const createBuilder = create(umi, {
    asset,
    collection,
    authority: ownerAuthority,
    payer: txPayer,
    name: `Handshake with ${cfg.owner.name} — #${edition}`,
    uri: metadataUri,
    owner: publicKey(recipient),
  });

  let builder = transactionBuilder();
  if (sponsorFees) {
    // Memo ix with recipient as signer — needed only when they aren't the payer.
    const memoData = new TextEncoder().encode(`SolTap handshake #${edition}`);
    builder = builder.add({
      instruction: {
        programId: publicKey(MEMO_PROGRAM_ID),
        keys: [{ pubkey: publicKey(recipient), isSigner: true, isWritable: false }],
        data: memoData,
      },
      signers: [recipientNoopSigner],
      bytesCreatedOnChain: 0,
    });
  }
  builder = builder
    .add(createBuilder)
    // Force legacy tx format for max wallet compatibility.
    .setVersion('legacy')
    // Explicit fee payer override (recipient in default mode).
    .setFeePayer(txPayer);

  // buildAndSign fetches latest blockhash and signs with all known keypair
  // signers (asset + ownerAuthority + feePayer keypair if sponsoring).
  // Noop signers (recipient) leave their slot empty for the wallet to fill.
  const built = await builder.buildAndSign(umi);
  const serialized = umi.transactions.serialize(built);

  // P0.5: Guard against silent wallet rejection due to oversized transactions.
  // Solana legacy transactions are hard-capped at 1232 bytes.
  if (serialized.length > 1232) {
    throw new Error(
      `Built tx is ${serialized.length} bytes, over Solana legacy 1232-byte limit. ` +
      `Shorten owner.name/role/event or remove instructions.`,
    );
  }

  const b64 = Buffer.from(serialized).toString('base64');

  return {
    transaction: b64,
    message: `Handshake with ${cfg.owner.name} at ${cfg.event.name} (edition ${edition})`,
  };
}
