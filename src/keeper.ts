// One keeper tick: apply due param changes, decide, buy back, burn exactly what was bought.

import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "./config.js";
import { burn, jupiterQuote, jupiterSwap, loadKeypair, tokenBalance, tokenProgramFor } from "./chain.js";
import { planBuyback } from "./planner.js";
import { applyDue } from "./policy.js";
import { loadState, saveState, type State } from "./state.js";

export async function tick(now = new Date()): Promise<State> {
  const state = loadState(config.stateFile, config.policyFile);

  const due = applyDue(state.params, state.pending, now);
  for (const c of due.applied) console.log(`applied ${c.id} (${c.source}): ${c.rationale}`);
  state.params = due.params;
  state.pending = due.pending;

  const conn = new Connection(config.rpcUrl(), "confirmed");
  const treasury = loadKeypair(config.treasuryKeypairPath());
  const mint = new PublicKey(config.mint());

  const balance = await conn.getBalance(treasury.publicKey, "confirmed");
  const plan = planBuyback(balance, state.params, state.lastBuybackAt, now);
  if (plan.action === "skip") {
    console.log(`skip: ${plan.reason}`);
    saveState(config.stateFile, state);
    return state;
  }

  const jup = { apiBase: config.jupApiBase, apiKey: config.jupApiKey };
  const quote = await jupiterQuote(jup, mint.toBase58(), plan.lamports, state.params.slippageBps);
  console.log(`buyback ${plan.lamports} lamports -> quoted ${String(quote.outAmount)} GOLEM`);

  if (config.dryRun) {
    console.log("DRY_RUN: not sending. Set DRY_RUN=false to trade.");
    state.buybacks.push({
      at: now.toISOString(),
      lamportsIn: plan.lamports,
      tokensBurned: String(quote.outAmount ?? "0"),
      swapSig: null,
      burnSig: null,
      dryRun: true,
    });
    state.lastBuybackAt = now.toISOString(); // simulate the cooldown too
    saveState(config.stateFile, state);
    return state;
  }

  // Burn the balance delta, never the whole account, so GOLEM held for other reasons is untouched.
  const programId = await tokenProgramFor(conn, mint);
  const before = await tokenBalance(conn, treasury.publicKey, mint, programId);
  const swapSig = await jupiterSwap(conn, jup, treasury, quote);
  // Record the swap before burning so a failed burn can't cause a double buy on the next tick.
  state.lastBuybackAt = now.toISOString();
  saveState(config.stateFile, state);

  const bought = (await tokenBalance(conn, treasury.publicKey, mint, programId)) - before;
  const burnSig = bought > 0n ? await burn(conn, treasury, mint, programId, bought) : null;
  console.log(`swap ${swapSig}; burned ${bought} base units in ${burnSig}`);

  state.buybacks.push({
    at: now.toISOString(),
    lamportsIn: plan.lamports,
    tokensBurned: bought.toString(),
    swapSig,
    burnSig,
    dryRun: false,
  });
  saveState(config.stateFile, state);
  return state;
}
