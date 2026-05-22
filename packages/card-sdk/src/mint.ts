import { TransactionBuilder, publicKey, createNoopSigner, Umi } from "@metaplex-foundation/umi";
import { create } from "@metaplex-foundation/mpl-core";
import type { BuildMintArgs } from "./types";

export async function buildHandshakeMintIx(
  umi: Umi,
  args: BuildMintArgs
): Promise<TransactionBuilder> {
  const { ownerInfo, recipient, collection, asset, edition, event } = args;
  const name = `Handshake with ${ownerInfo.name} — #${edition} @ ${event}`;
  const assetSigner = createNoopSigner(publicKey(asset));
  // Provide a noop identity/payer so callers don't need to set one just for building.
  const ctx = { ...umi, identity: assetSigner, payer: assetSigner };
  return create(ctx, {
    asset: assetSigner,
    collection: { publicKey: publicKey(collection) },
    name,
    uri: args.metadataUri,
    owner: publicKey(recipient),
  });
}
