import { describe, expect, it } from "vitest";
import { review, type Proposal } from "../src/mind.js";
import type { State } from "../src/state.js";

const now = new Date("2026-10-05T00:00:00Z");
const fresh = (): State => ({
  params: { buybackShareBps: 1000, maxSolPerRun: 0.5, minIntervalMinutes: 240, slippageBps: 150, reserveSol: 0.1 },
  pending: [],
  lastBuybackAt: null,
  buybacks: [],
  journal: [],
});

describe("review", () => {
  it("records the journal and queues nothing on keep", () => {
    const state = fresh();
    const p: Proposal = { decision: "keep", params: state.params, rationale: "", journal: "steady" };
    expect(review(state, p, now, 24)).toEqual({ queued: null, rejected: null });
    expect(state.journal).toHaveLength(1);
    expect(state.params.maxSolPerRun).toBe(0.5);
  });

  it("queues a valid change behind the timelock without applying it", () => {
    const state = fresh();
    const p: Proposal = { decision: "change", params: { ...state.params, buybackShareBps: 1200 }, rationale: "r", journal: "j" };
    const { queued } = review(state, p, now, 24);
    expect(queued?.effectiveAt).toBe("2026-10-06T00:00:00.000Z");
    expect(state.pending).toHaveLength(1);
    expect(state.params.buybackShareBps).toBe(1000);
  });

  it("rejects an out-of-bounds change and leaves state untouched", () => {
    const state = fresh();
    const p: Proposal = { decision: "change", params: { ...state.params, reserveSol: 0 }, rationale: "drain it", journal: "j" };
    const { rejected } = review(state, p, now, 24);
    expect(rejected).toMatch(/reserveSol/);
    expect(state.pending).toHaveLength(0);
  });
});
