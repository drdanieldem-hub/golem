import { LAMPORTS_PER_SOL } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { planBuyback } from "../src/planner.js";
import type { Params } from "../src/policy.js";

const params: Params = {
  buybackShareBps: 1000,
  maxSolPerRun: 0.5,
  minIntervalMinutes: 240,
  slippageBps: 150,
  reserveSol: 0.1,
};
const now = new Date("2026-10-05T12:00:00Z");
const sol = (n: number) => Math.round(n * LAMPORTS_PER_SOL);

describe("planBuyback", () => {
  it("spends the share of balance above the reserve", () => {
    expect(planBuyback(sol(2.1), params, null, now)).toEqual({ action: "buyback", lamports: sol(0.2) });
  });
  it("caps at maxSolPerRun", () => {
    expect(planBuyback(sol(100), params, null, now)).toEqual({ action: "buyback", lamports: sol(0.5) });
  });
  it("respects the cooldown", () => {
    const plan = planBuyback(sol(10), params, "2026-10-05T10:00:00Z", now);
    expect(plan.action).toBe("skip");
    expect(planBuyback(sol(10), params, "2026-10-05T08:00:00Z", now).action).toBe("buyback");
  });
  it("never touches the reserve", () => {
    expect(planBuyback(sol(0.1), params, null, now).action).toBe("skip");
  });
  it("skips dust", () => {
    expect(planBuyback(sol(0.12), params, null, now)).toMatchObject({ action: "skip" });
  });
});
