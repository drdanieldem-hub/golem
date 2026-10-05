// Pure decision logic: given the treasury balance and params, how much SOL to spend now.

import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import type { Params } from "./policy.js";

/** Below this a swap isn't worth the fees. */
export const MIN_BUYBACK_LAMPORTS = 5_000_000; // 0.005 SOL

export type Plan =
  | { action: "skip"; reason: string }
  | { action: "buyback"; lamports: number };

export function planBuyback(
  balanceLamports: number,
  params: Params,
  lastBuybackAt: string | null,
  now: Date,
): Plan {
  if (lastBuybackAt) {
    const elapsedMin = (now.getTime() - new Date(lastBuybackAt).getTime()) / 60_000;
    if (elapsedMin < params.minIntervalMinutes) {
      return {
        action: "skip",
        reason: `cooldown: ${Math.floor(elapsedMin)}/${params.minIntervalMinutes} min`,
      };
    }
  }

  const reserve = Math.round(params.reserveSol * LAMPORTS_PER_SOL);
  const spendable = balanceLamports - reserve;
  if (spendable <= 0) return { action: "skip", reason: "treasury at or below reserve" };

  const byShare = Math.floor((spendable * params.buybackShareBps) / 10_000);
  const cap = Math.round(params.maxSolPerRun * LAMPORTS_PER_SOL);
  const lamports = Math.min(byShare, cap);

  if (lamports < MIN_BUYBACK_LAMPORTS) {
    return { action: "skip", reason: `buyback ${lamports} lamports below minimum` };
  }
  return { action: "buyback", lamports };
}
