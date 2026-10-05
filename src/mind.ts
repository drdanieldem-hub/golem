// GOLEM's "mind": Claude reviews how the buybacks are going and may propose new params.
// It can only propose. Every proposal is checked against the hard bounds and the
// per-step limit, then waits out the timelock before the keeper applies it.

import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { BOUNDS, MAX_STEP_FACTOR, queueChange, type PendingChange } from "./policy.js";
import type { State } from "./state.js";

export const Proposal = z.object({
  decision: z.enum(["keep", "change"]),
  params: z.object({
    buybackShareBps: z.number().int(),
    maxSolPerRun: z.number(),
    minIntervalMinutes: z.number().int(),
    slippageBps: z.number().int(),
    reserveSol: z.number(),
  }),
  rationale: z.string(),
  journal: z.string(),
});
export type Proposal = z.infer<typeof Proposal>;

const SYSTEM = `You are GOLEM, the mind of a Solana token. A keeper program buys GOLEM with SOL from a treasury and burns what it buys. You tune how that keeper behaves.

You never move funds yourself. You propose a full set of parameters; code checks them against hard bounds and a per-step limit, then publishes them and waits out a timelock before they take effect. Out-of-bounds or too-large proposals are rejected outright.

Bounds (inclusive): ${JSON.stringify(BOUNDS)}
Each parameter may move by at most ${MAX_STEP_FACTOR}x up or down per proposal.

Aim for steady, predictable buybacks that last: don't drain the treasury in a burst, keep slippage tight enough that swaps aren't easy to sandwich, and prefer "keep" when the data is thin. Your journal entry is public; write it for holders in two or three plain sentences.`;

export function buildPrompt(state: State, treasurySol: number | null, now: Date): string {
  return JSON.stringify(
    {
      now: now.toISOString(),
      treasurySol,
      currentParams: state.params,
      pendingChanges: state.pending,
      recentBuybacks: state.buybacks.slice(-30),
      recentJournal: state.journal.slice(-5),
    },
    null,
    2,
  );
}

export async function think(
  client: Anthropic,
  model: string,
  state: State,
  treasurySol: number | null,
  now: Date,
): Promise<Proposal> {
  const response = await client.beta.messages.parse({
    model,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: betaZodOutputFormat(Proposal) },
    system: SYSTEM,
    messages: [{ role: "user", content: buildPrompt(state, treasurySol, now) }],
  });
  if (response.stop_reason === "refusal") throw new Error("mind declined to propose");
  if (!response.parsed_output) throw new Error(`no parsable proposal (stop_reason=${response.stop_reason})`);
  return response.parsed_output;
}

/** Record the journal entry and, if the proposal passes the checks, queue it behind the timelock. */
export function review(
  state: State,
  proposal: Proposal,
  now: Date,
  timelockHours: number,
): { queued: PendingChange | null; rejected: string | null } {
  state.journal.push({ at: now.toISOString(), text: proposal.journal });
  if (proposal.decision === "keep") return { queued: null, rejected: null };
  try {
    const queued = queueChange(
      state.params,
      state.pending,
      { source: "mind", params: proposal.params, rationale: proposal.rationale },
      now,
      timelockHours,
    );
    state.pending.push(queued);
    return { queued, rejected: null };
  } catch (e) {
    return { queued: null, rejected: (e as Error).message };
  }
}
