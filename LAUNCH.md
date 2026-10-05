# Launching GOLEM on Hooked

## 1. Before launch
- [ ] Create a dedicated treasury wallet: `solana-keygen new -o treasury.keypair.json`.
- [ ] Fund it with the SOL committed to buybacks, plus `reserveSol`.
- [ ] Decide the funding policy (see README) and the starting `config/policy.json`.
- [ ] Prepare the token's metadata: name `GOLEM`, ticker `GOLEM`, image, description, links.
- [ ] Check the name and ticker aren't already used by a live Solana token you'd be confused with.

## 2. Launch on Hooked
1. Go to Hooked's launch page and connect the creator wallet (not the treasury).
2. Fill in the metadata.
3. Pick the transfer-hook rule. Suggested: **max wallet 1–2% of supply**, which
   slows down snipers and whales during the curve. Avoid "wallet-to-wallet only"
   style rules that block normal trading.
4. Confirm both transactions: the first creates the token and its Meteora pool,
   the second turns the rule on. The rule can't be turned off before graduation.
5. Record the mint address and put it in `.env` as `GOLEM_MINT`.

Things to know:
- Curve trades pay a 1% fee to Hooked's platform, not to you.
- The rule only holds during the bonding curve. At graduation Meteora removes the
  hook and migrates to a normal DAMM v2 pool.

## 3. After graduation
1. Confirm the pool is live and Jupiter routes GOLEM (`npm run keeper` in dry run
   should print a quote).
2. Run a few dry-run ticks and check the quotes look sane.
3. Set `DRY_RUN=false` and start `npm run keeper:loop` under a process manager
   (systemd, pm2, or similar).
4. Run `npm run mind` on a schedule (daily is plenty). Publish its journal.

## 4. Going public
- Publish the treasury address, the bounds in `src/policy.ts`, and the timelock.
- Explain plainly what the mind can and can't do. "An AI changes the rules"
  sounds like a rug pull unless the limits are visible.
