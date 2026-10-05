// On-chain actions: SOL -> GOLEM swap through Jupiter, then burn what was bought.

import { readFileSync } from "node:fs";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createBurnCheckedInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
} from "@solana/spl-token";

export const WSOL_MINT = "So11111111111111111111111111111111111111112";

export function loadKeypair(path: string): Keypair {
  const secret = JSON.parse(readFileSync(path, "utf8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(secret));
}

/** Hooked mints are Token-2022, but read the owner rather than assume it. */
export async function tokenProgramFor(conn: Connection, mint: PublicKey): Promise<PublicKey> {
  const info = await conn.getAccountInfo(mint);
  if (!info) throw new Error(`mint ${mint.toBase58()} not found`);
  if (info.owner.equals(TOKEN_2022_PROGRAM_ID)) return TOKEN_2022_PROGRAM_ID;
  if (info.owner.equals(TOKEN_PROGRAM_ID)) return TOKEN_PROGRAM_ID;
  throw new Error(`mint owned by unexpected program ${info.owner.toBase58()}`);
}

export async function tokenBalance(
  conn: Connection,
  owner: PublicKey,
  mint: PublicKey,
  programId: PublicKey,
): Promise<bigint> {
  const ata = getAssociatedTokenAddressSync(mint, owner, false, programId);
  try {
    return (await getAccount(conn, ata, "confirmed", programId)).amount;
  } catch {
    return 0n; // account not created yet
  }
}

export interface JupiterOptions {
  apiBase: string;
  apiKey?: string;
}

function jupHeaders(opts: JupiterOptions): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (opts.apiKey) h["x-api-key"] = opts.apiKey;
  return h;
}

export async function jupiterQuote(
  opts: JupiterOptions,
  outputMint: string,
  lamports: number,
  slippageBps: number,
): Promise<Record<string, unknown>> {
  const url = new URL(`${opts.apiBase}/quote`);
  url.searchParams.set("inputMint", WSOL_MINT);
  url.searchParams.set("outputMint", outputMint);
  url.searchParams.set("amount", String(lamports));
  url.searchParams.set("slippageBps", String(slippageBps));
  url.searchParams.set("restrictIntermediateTokens", "true");
  const res = await fetch(url, { headers: jupHeaders(opts) });
  if (!res.ok) throw new Error(`jupiter quote ${res.status}: ${await res.text()}`);
  return (await res.json()) as Record<string, unknown>;
}

export async function jupiterSwap(
  conn: Connection,
  opts: JupiterOptions,
  signer: Keypair,
  quote: Record<string, unknown>,
): Promise<string> {
  const res = await fetch(`${opts.apiBase}/swap`, {
    method: "POST",
    headers: jupHeaders(opts),
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: signer.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: "auto",
    }),
  });
  if (!res.ok) throw new Error(`jupiter swap ${res.status}: ${await res.text()}`);
  const { swapTransaction } = (await res.json()) as { swapTransaction: string };
  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, "base64"));
  tx.sign([signer]);
  const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  const latest = await conn.getLatestBlockhash("confirmed");
  const result = await conn.confirmTransaction({ signature: sig, ...latest }, "confirmed");
  if (result.value.err) throw new Error(`swap ${sig} failed: ${JSON.stringify(result.value.err)}`);
  return sig;
}

export async function burn(
  conn: Connection,
  signer: Keypair,
  mint: PublicKey,
  programId: PublicKey,
  amount: bigint,
): Promise<string> {
  const { decimals } = await getMint(conn, mint, "confirmed", programId);
  const ata = getAssociatedTokenAddressSync(mint, signer.publicKey, false, programId);
  const tx = new Transaction().add(
    createBurnCheckedInstruction(ata, mint, signer.publicKey, amount, decimals, [], programId),
  );
  const latest = await conn.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.feePayer = signer.publicKey;
  tx.sign(signer);
  const sig = await conn.sendRawTransaction(tx.serialize(), { maxRetries: 3 });
  const result = await conn.confirmTransaction({ signature: sig, ...latest }, "confirmed");
  if (result.value.err) throw new Error(`burn ${sig} failed: ${JSON.stringify(result.value.err)}`);
  return sig;
}
