// Keeper state persisted as JSON on the host (git-ignored under data/).

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { checkBounds, type Params, type PendingChange } from "./policy.js";

export interface BuybackRecord {
  at: string;
  lamportsIn: number;
  tokensBurned: string;
  swapSig: string | null;
  burnSig: string | null;
  dryRun: boolean;
}

export interface JournalEntry {
  at: string;
  text: string;
}

export interface State {
  params: Params;
  pending: PendingChange[];
  lastBuybackAt: string | null;
  buybacks: BuybackRecord[];
  journal: JournalEntry[];
}

export function loadPolicy(path: string): Params {
  const params = JSON.parse(readFileSync(path, "utf8")) as Params;
  const errors = checkBounds(params);
  if (errors.length) throw new Error(`${path} out of bounds: ${errors.join("; ")}`);
  return params;
}

export function loadState(stateFile: string, policyFile: string): State {
  if (!existsSync(stateFile)) {
    return { params: loadPolicy(policyFile), pending: [], lastBuybackAt: null, buybacks: [], journal: [] };
  }
  return JSON.parse(readFileSync(stateFile, "utf8")) as State;
}

/** Write via a temp file so a crash never leaves half-written state. */
export function saveState(stateFile: string, state: State): void {
  mkdirSync(dirname(stateFile), { recursive: true });
  const tmp = `${stateFile}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, stateFile);
}
