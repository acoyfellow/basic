# Basic

A conformance suite for agent chat. The behaviors every chat app must keep, written as Gherkin, with a browser runner that checks a real deployment.

- `contract/chat.feature`: 70 scenarios. 57 are tagged `@must`: the floor.
- `run.mjs`: runs the scenarios against `BASE` in Chromium and writes `reports/<app>.md`. `--rule=<words>` runs one rule and leaves the report alone.
- `adapters/<app>.mjs`: how one app is driven. A check is a function, an `n/a` reason string, or a `MISSING:` string that counts as a fail. A check that returns `SKIPPED: <reason>` is reported as n/a with that reason.
- `POST.md`: the draft post that explains where each scenario comes from.

## Diagrams

`node diagram.mjs` turns the Gherkin into SVG:

- `diagrams/contract.svg`: every rule and scenario on one page, coloured by tag.
- `diagrams/rules/NN-<rule>.svg`: one page per rule. Each scenario is a row: Given → When → Then.

`node diagram.mjs --app=skin` colours the same map by `reports/skin.md`: pass, fail, n/a, or not run.

![The contract](diagrams/contract.svg)

### skin, scored

![skin results](diagrams/skin.svg)

### 1. Scroll follows the reader, never the stream

![Rule 1](diagrams/rules/01-scroll-follows-the-reader-never-the-stream.svg)

### 2. The composer keeps what I type

![Rule 2](diagrams/rules/02-the-composer-keeps-what-i-type.svg)

### 3. A running turn is visible, timed, and stoppable

![Rule 3](diagrams/rules/03-a-running-turn-is-visible-timed-and-stoppable.svg)

### 4. The conversation list tells me what needs me

![Rule 4](diagrams/rules/04-the-conversation-list-tells-me-what-needs-me.svg)

### 5. Messages have actions where I need them

![Rule 5](diagrams/rules/05-messages-have-actions-where-i-need-them.svg)

### 6. Connection state is truthful

![Rule 6](diagrams/rules/06-connection-state-is-truthful.svg)

### 7. Notices are placed in time, not pinned on top

![Rule 7](diagrams/rules/07-notices-are-placed-in-time-not-pinned-on-top.svg)

### 8. Side panels fit the reader's screen

![Rule 8](diagrams/rules/08-side-panels-fit-the-readers-screen.svg)

### 9. Signing in and out is plain and complete

![Rule 9](diagrams/rules/09-signing-in-and-out-is-plain-and-complete.svg)

### 10. The page works for everyone

![Rule 10](diagrams/rules/10-the-page-works-for-everyone.svg)

### 11. The first screen invites a first message

![Rule 11](diagrams/rules/11-the-first-screen-invites-a-first-message.svg)

## Run

```sh
BASE=https://your.app node run.mjs --floor --app=skin
```

Exit code 0 means every floor scenario passed or has a written reason it does not apply.

## Apps held to it

| App | Floor | Report |
| --- | --- | --- |
| skin | 37 pass, 0 fail, 5 n/a | `reports/skin.md` |
