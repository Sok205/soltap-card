import bs58 from 'bs58';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import {
  keypairIdentity,
  createSignerFromKeypair,
  type Umi,
  type Keypair,
  type KeypairSigner,
} from '@metaplex-foundation/umi';
import { loadConfig } from './config';

function decodeKeypair(umi: Umi, b58: string): Keypair {
  return umi.eddsa.createKeypairFromSecretKey(bs58.decode(b58));
}

export type UmiContext = {
  umi: Umi;
  feePayer: KeypairSigner;
  ownerAuthority: KeypairSigner;
};

export function umiWithFeePayer(): UmiContext {
  const cfg = loadConfig();
  const umi = createUmi(cfg.chain.rpc_url);

  const feePayerB58 = process.env.FEE_PAYER_KEYPAIR_B58;
  if (!feePayerB58) throw new Error('FEE_PAYER_KEYPAIR_B58 not set');
  const feeKp = decodeKeypair(umi, feePayerB58);

  const ownerB58 = process.env.OWNER_UPDATE_AUTHORITY_KEYPAIR_B58;
  if (!ownerB58) throw new Error('OWNER_UPDATE_AUTHORITY_KEYPAIR_B58 not set');
  const ownerKp = decodeKeypair(umi, ownerB58);

  const feePayer = createSignerFromKeypair(umi, feeKp);
  const ownerAuthority = createSignerFromKeypair(umi, ownerKp);

  umi.use(keypairIdentity(feeKp));

  return { umi, feePayer, ownerAuthority };
}
