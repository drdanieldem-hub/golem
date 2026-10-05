// The keeper's tunable parameters, the hard bounds the agent can never leave,
// and the timelock that every change waits out before it takes effect.

export interface Params {
  /** Share of spendable treasury SOL (balance minus reserve) spent per buyback, in basis points. */
  buybackShareBps: number;
  /** Ceiling on SOL spent in a single buyback. */
  maxSolPerRun: number;
  /** Minimum minutes between buybacks. */
  minIntervalMinutes: number;
  /** Max slippage accepted on the Jupiter swap, in basis points. */
  slippageBps: number;
  /** SOL always left in the treasury for fees and rent. */
  reserveSol: number;
}

export type ParamKey = keyof Params;

/** Hard limits. These live in code on purpose: changing them is a reviewed commit, not an agent decision. */
export const BOUNDS: Record<ParamKey, { min: number; max: number }> = {
  buybackShareBps: { min: 100, max: 5000 },
  maxSolPerRun: { min: 0.01, max: 10 },
  minIntervalMinutes: { min: 30, max: 1440 },
  slippageBps: { min: 50, max: 300 },
  reserveSol: { min: 0.05, max: 5 },
};

/** A single proposal may move each parameter by at most this factor up or down. */
export const MAX_STEP_FACTOR = 1.5;

/** Changes can never take effect sooner than this, whatever the env says. */
export const MIN_TIMELOCK_HOURS = 6;

export const PARAM_KEYS = Object.keys(BOUNDS) as ParamKey[];

export interface PendingChange {
  id: string;
  source: "mind" | "operator";
  proposedAt: string;
  effectiveAt: string;
  params: Params;
  rationale: string;
}

/** Returns a list of human-readable problems; empty means the params are within bounds. */
export function checkBounds(p: Params): string[] {
  const errors: string[] = [];
  for (const key of PARAM_KEYS) {
    const v = p[key];
    const { min, max } = BOUNDS[key];
    if (typeof v !== "number" || !Number.isFinite(v)) errors.push(`${key} is not a number`);
    else if (v < min || v > max) errors.push(`${key}=${v} outside [${min}, ${max}]`);
  }
  if (!Number.isInteger(p.buybackShareBps)) errors.push("buybackShareBps must be an integer");
  if (!Number.isInteger(p.slippageBps)) errors.push("slippageBps must be an integer");
  if (!Number.isInteger(p.minIntervalMinutes)) errors.push("minIntervalMinutes must be an integer");
  return errors;
}

/** Problems with moving from `current` to `next`: bounds plus the per-proposal step limit. */
export function checkChange(current: Params, next: Params): string[] {
  const errors = checkBounds(next);
  for (const key of PARAM_KEYS) {
    const from = current[key];
    const to = next[key];
    if (to > from * MAX_STEP_FACTOR || to < from / MAX_STEP_FACTOR) {
      errors.push(`${key} ${from} -> ${to} moves more than ${MAX_STEP_FACTOR}x in one step`);
    }
  }
  return errors;
}

export function timelockMs(hours: number): number {
  return Math.max(hours, MIN_TIMELOCK_HOURS) * 3_600_000;
}

/**
 * Queue a change after validating it against the params that will be in force
 * when it lands (the latest pending change, or the current params).
 */
export function queueChange(
  current: Params,
  pending: PendingChange[],
  change: Omit<PendingChange, "id" | "effectiveAt" | "proposedAt">,
  now: Date,
  timelockHours: number,
): PendingChange {
  const base = pending.length ? pending[pending.length - 1].params : current;
  const errors = checkChange(base, change.params);
  if (errors.length) throw new Error(`rejected change: ${errors.join("; ")}`);
  return {
    ...change,
    id: `chg-${now.getTime()}`,
    proposedAt: now.toISOString(),
    effectiveAt: new Date(now.getTime() + timelockMs(timelockHours)).toISOString(),
  };
}

/** Apply every pending change whose timelock has expired, oldest first. */
export function applyDue(
  current: Params,
  pending: PendingChange[],
  now: Date,
): { params: Params; pending: PendingChange[]; applied: PendingChange[] } {
  const applied: PendingChange[] = [];
  const remaining: PendingChange[] = [];
  let params = current;
  for (const change of pending) {
    if (new Date(change.effectiveAt).getTime() <= now.getTime() && remaining.length === 0) {
      params = change.params;
      applied.push(change);
    } else {
      remaining.push(change);
    }
  }
  return { params, pending: remaining, applied };
}
