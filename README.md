# GOLEM

A Solana token with a body made of code. GOLEM launches on **Hooked** (a
Token-2022 transfer-hook launchpad on Meteora), then lives on as a keeper that
buys back and burns GOLEM. A Claude-powered agent, the "mind", can retune
the keeper, but only inside hard limits and behind a public timelock.

This is the Solana version of the idea behind [Claus](https://claus.si/). Claus
runs on a Uniswap v4 hook that can be swapped for new code. Solana's hook
launchpads remove the hook when the token graduates, so GOLEM's changing
behaviour lives off-chain in the keeper and its params instead. See
[LAUNCH.md](LAUNCH.md) for the full lifecycle.

## How it works

| Phase | What runs | What enforces it |
|---|---|---|
| Bonding curve | Hooked transfer-hook rule (e.g. max wallet) | Token-2022 transfer hook, every transfer |
| Graduation | Meteora removes the hook, migrates to a DAMM v2 pool | Meteora DBC |
| After graduation | Keeper: SOL → GOLEM via Jupiter, then burn | This repo, signed by the treasury key |
| Ongoing | Mind proposes new keeper params | Bounds + step limit + timelock in `src/policy.ts` |

### Keeper (`src/keeper.ts`)
Each tick:
1. Applies any param changes whose timelock has expired.
2. Plans a buyback: `buybackShareBps` of the treasury SOL above `reserveSol`,
   capped at `maxSolPerRun`, no sooner than `minIntervalMinutes` after the last one.
3. Swaps through Jupiter with `slippageBps`.
4. Burns exactly the GOLEM it just bought (the balance change), never other holdings.

`DRY_RUN` defaults to on. Nothing is sent until you set `DRY_RUN=false`.

### Mind (`src/mind.ts`)
`npm run mind` sends Claude the current params, pending changes and recent
buybacks. Claude returns a structured proposal (keep or change) plus a short
public journal entry. The proposal:
- must stay within `BOUNDS` (in code, so changing them needs a commit),
- may move each param at most 1.5x per step,
- is queued and only takes effect after `TIMELOCK_HOURS` (never under 6h).

The mind cannot move funds, change bounds or skip the timelock. `npm run status`
shows pending changes. `cancel <id>` drops one, along with any queued after it.

The request opts into server-side refusal fallbacks (`fallbacks: "default"`),
so a declined request is retried on Anthropic's recommended fallback model
instead of failing.

## Setup

```bash
npm ci
cp .env.example .env     # fill in RPC_URL, GOLEM_MINT, TREASURY_KEYPAIR
npm run status
npm run keeper           # one tick, dry run
npm run keeper:loop      # tick every 5 minutes
npm run mind             # ask the mind for a proposal
npx tsx src/cli.ts propose new-params.json "why"   # operator change, same timelock
npx tsx src/cli.ts cancel <id>
npm test
```

Starting params are in `config/policy.json`. Runtime state lives in
`data/state.json` (git-ignored).

## Funding the buybacks

Hooked sends bonding-curve trading fees to its own platform, not to the creator.
The keeper spends whatever SOL is in the treasury wallet. Decide up front where
that SOL comes from (for example a fixed share of team funds, or any creator or
LP fees you control after graduation) and say so publicly.

## Safety notes

- Keep the treasury key on the keeper host only. Never commit it.
- Use a dedicated treasury wallet that holds no other GOLEM.
- Publish the treasury address and `data/state.json` (or the journal) so holders
  can check buybacks and pending changes against the chain.
- If a burn fails after a swap, the bought tokens stay in the treasury. Burn them
  by hand and note it in the journal.
