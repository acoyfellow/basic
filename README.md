# Basic

A conformance suite for agent chat. The behaviors every chat app must keep, written as Gherkin, with a browser runner that checks a real deployment.

- `contract/chat.feature`: 52 scenarios. 42 are tagged `@must`: the floor.
- `run.mjs`: runs the scenarios against `BASE` in Chromium and writes `reports/<app>.md`.
- `adapters/<app>.mjs`: how one app is driven. A check is a function, an `n/a` reason string, or a `MISSING:` string that counts as a fail.
- `POST.md`: the draft post that explains where each scenario comes from.

## Run

```sh
BASE=https://your.app node run.mjs --floor --app=skin
```

Exit code 0 means every floor scenario passed or has a written reason it does not apply.

## Apps held to it

| App | Floor | Report |
| --- | --- | --- |
| skin | 37 pass, 0 fail, 5 n/a | `reports/skin.md` |
