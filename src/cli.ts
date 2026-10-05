// Entry point: `status`, `keeper [--loop]`, `mind`, `propose <params.json> <rationale>`, `cancel <id>`.

import { readFileSync } from "node:fs";
import Anthropic from "@anthropic-ai/sdk";
import { Connection, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { config } from "./config.js";
import { loadKeypair } from "./chain.js";
import { tick } from "./keeper.js";
import { review, think } from "./mind.js";
import { queueChange, type Params } from "./policy.js";
import { loadState, saveState } from "./state.js";

async function treasurySol(): Promise<number | null> {
  try {
    const conn = new Connection(config.rpcUrl(), "confirmed");
    const lamports = await conn.getBalance(loadKeypair(config.treasuryKeypairPath()).publicKey);
    return lamports / LAMPORTS_PER_SOL;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  const now = new Date();

  switch (cmd) {
    case "status": {
      const state = loadState(config.stateFile, config.policyFile);
      console.log(JSON.stringify({ dryRun: config.dryRun, treasurySol: await treasurySol(), ...state }, null, 2));
      return;
    }
    case "keeper": {
      if (!args.includes("--loop")) {
        await tick();
        return;
      }
      const everyMs = 5 * 60_000;
      for (;;) {
        try {
          await tick();
        } catch (e) {
          console.error(`tick failed: ${(e as Error).message}`);
        }
        await new Promise((r) => setTimeout(r, everyMs));
      }
    }
    case "mind": {
      const state = loadState(config.stateFile, config.policyFile);
      const proposal = await think(new Anthropic(), config.mindModel, state, await treasurySol(), now);
      const result = review(state, proposal, now, config.timelockHours);
      saveState(config.stateFile, state);
      console.log(`journal: ${proposal.journal}`);
      if (result.queued) console.log(`queued ${result.queued.id}, effective ${result.queued.effectiveAt}`);
      else if (result.rejected) console.log(`proposal rejected: ${result.rejected}`);
      else console.log("decision: keep current params");
      return;
    }
    case "propose": {
      const [file, ...why] = args;
      if (!file || why.length === 0) throw new Error("usage: propose <params.json> <rationale>");
      const state = loadState(config.stateFile, config.policyFile);
      const params = JSON.parse(readFileSync(file, "utf8")) as Params;
      const change = queueChange(
        state.params,
        state.pending,
        { source: "operator", params, rationale: why.join(" ") },
        now,
        config.timelockHours,
      );
      state.pending.push(change);
      saveState(config.stateFile, state);
      console.log(`queued ${change.id}, effective ${change.effectiveAt}`);
      return;
    }
    case "cancel": {
      const state = loadState(config.stateFile, config.policyFile);
      const idx = state.pending.findIndex((c) => c.id === args[0]);
      if (idx < 0) throw new Error(`no pending change ${args[0]}`);
      // Later changes were validated against this one, so they go too.
      const dropped = state.pending.splice(idx);
      saveState(config.stateFile, state);
      console.log(`cancelled ${dropped.map((c) => c.id).join(", ")}`);
      return;
    }
    default:
      console.log("usage: tsx src/cli.ts <status | keeper [--loop] | mind | propose <file> <why> | cancel <id>>");
      process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exitCode = 1;
});
