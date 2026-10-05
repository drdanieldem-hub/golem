# Hooked listing: GOLEM

Copy for the Hooked launch form. Fill in every `<…>` before launching.
Hooked's exact field names and character limits weren't checked, so there is a
short and a long description.

**Name:** GOLEM
**Ticker:** GOLEM

## Short description (~180 chars)

> A token with a body made of code. A keeper buys back and burns GOLEM from a public treasury, and an AI mind tunes it, inside hard limits and behind a 24h public timelock.

## Long description

> GOLEM is clay brought to life by code.
>
> On the curve: the token itself enforces a <1>% max wallet on every transfer.
>
> After graduation: a keeper buys GOLEM with SOL from a public treasury and burns every token it buys. GOLEM's mind (Claude) reviews the buybacks and can retune them. It can only do that within limits written in code, by at most 1.5× per step, and after a 24-hour public delay. It can never touch the funds.
>
> Treasury: <treasury address>
> Not financial advice. Memecoin, no promised returns.

## Links

| Field | Value |
|---|---|
| Website | `<your site>`, or the GitHub repo if there is no site |
| X / Twitter | `https://x.com/<handle>` |
| Telegram | `https://t.me/<group>` |
| Treasury | `https://solscan.io/account/<treasury address>` |
| Source code | `https://github.com/drdanieldem-hub/golem` (only once the repo is public) |

## Before launch

- [ ] Set the max wallet % to the rule actually picked in Hooked.
- [ ] Make the repo public, or drop the source-code link.
- [ ] Don't claim trading fees fund buybacks: Hooked keeps the curve fees. If you
      commit to a funding source (e.g. a fixed SOL amount in the treasury), add one
      line saying so; buyers will check it against the treasury address.
- [ ] Keep the numbers here in sync with `config/policy.json` and `TIMELOCK_HOURS`.
