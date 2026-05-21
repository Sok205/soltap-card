export type OwnerInfo = {
  name: string;
  role: string;
  bio?: string;
  x?: string;
  github?: string;
  email?: string;
  wallet: string;
};

export type BuildMintArgs = {
  ownerInfo: OwnerInfo;
  recipient: string;     // base58 pubkey
  collection: string;    // base58 pubkey
  asset: string;         // base58 pubkey of new asset (signer)
  edition: number;
  event: string;
  metadataUri: string;
};
