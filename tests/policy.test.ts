import { describe, expect, it } from "vitest";
import { applyDue, checkBounds, checkChange, queueChange, timelockMs, type Params } from "../src/policy.js";

const base: Params = {
  buybackShareBps: 1000,
  maxSolPerRun: 0.5,
  minIntervalMinutes: 240,
  slippageBps: 150,
  reserveSol: 0.1,
};
const t0 = new Date("2026-10-05T00:00:00Z");

describe("bounds", () => {
  it("accepts the shipped defaults", () => {
    expect(checkBounds(base)).toEqual([]);
  });
  it("rejects out-of-range and non-integer values", () => {
    expect(checkBounds({ ...base, slippageBps: 1000 })).toHaveLength(1);
    expect(checkBounds({ ...base, reserveSol: 0 })).toHaveLength(1);
    expect(checkBounds({ ...base, buybackShareBps: 1000.5 })).toHaveLength(1);
  });
  it("limits how far one change can move a param", () => {
    expect(checkChange(base, { ...base, maxSolPerRun: 0.75 })).toEqual([]);
    expect(checkChange(base, { ...base, maxSolPerRun: 0.76 })).toHaveLength(1);
    expect(checkChange(base, { ...base, minIntervalMinutes: 150 })).toHaveLength(1);
  });
});

describe("timelock", () => {
  it("never goes below the hard floor", () => {
    expect(timelockMs(0)).toBe(6 * 3_600_000);
    expect(timelockMs(24)).toBe(24 * 3_600_000);
  });

  it("queues, then applies only once due", () => {
    const c = queueChange(base, [], { source: "mind", params: { ...base, slippageBps: 120 }, rationale: "x" }, t0, 24);
    expect(c.effectiveAt).toBe("2026-10-06T00:00:00.000Z");

    const early = applyDue(base, [c], new Date("2026-10-05T23:59:59Z"));
    expect(early.params).toBe(base);
    expect(early.pending).toHaveLength(1);

    const due = applyDue(base, [c], new Date("2026-10-06T00:00:00Z"));
    expect(due.params.slippageBps).toBe(120);
    expect(due.pending).toHaveLength(0);
  });

  it("validates a new change against the last pending one, not current params", () => {
    const first = queueChange(base, [], { source: "operator", params: { ...base, maxSolPerRun: 0.75 }, rationale: "a" }, t0, 24);
    // 1.0 is within 1.5x of the pending 0.75 but not of the current 0.5.
    const second = queueChange(base, [first], { source: "operator", params: { ...base, maxSolPerRun: 1.0 }, rationale: "b" }, t0, 24);
    expect(second.params.maxSolPerRun).toBe(1.0);
  });

  it("throws on an invalid change", () => {
    expect(() =>
      queueChange(base, [], { source: "mind", params: { ...base, slippageBps: 5000 }, rationale: "x" }, t0, 24),
    ).toThrow(/rejected change/);
  });
});
