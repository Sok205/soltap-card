import { describe, it, expect } from "vitest";
import { Keypair } from "@solana/web3.js";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { fromWeb3JsKeypair } from "@metaplex-foundation/umi-web3js-adapters";
import { buildHandshakeMintIx } from "../src/mint";

describe("buildHandshakeMintIx", () => {
  it("produces a CreateV1 instruction for the recipient with edition in name", async () => {
    const umi = createUmi("https://api.devnet.solana.com");
    const owner = Keypair.generate();
    const recipient = Keypair.generate().publicKey.toBase58();
    const collection = Keypair.generate().publicKey.toBase58();
    const asset = Keypair.generate().publicKey.toBase58();

    const tx = await buildHandshakeMintIx(umi, {
      ownerInfo: {
        name: "Sok",
        role: "Rust dev",
        x: "@sok",
        github: "sok205",
        email: "sok@example.com",
        wallet: owner.publicKey.toBase58(),
      },
      recipient,
      collection,
      asset,
      edition: 7,
      event: "Solana Accelerate 2026",
      metadataUri: "https://example.com/metadata/7.json",
    });

    const ix = tx.getInstructions()[0];
    expect(ix.programId.toString()).toBe("CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d");
    // Asset signer must be present
    const signers = tx.items.flatMap((i) => i.signers.map((s) => s.publicKey.toString()));
    expect(signers).toContain(asset);
  });
});
