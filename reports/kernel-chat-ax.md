# kernel: chat-ax

Static probes read `chat-ax/src` (70 files). Comments are ignored.
A probe hit is evidence to read, not proof. "has" means at least one strong probe hit; "partial" means only weak probes hit.

| Invariant | Verdict | Evidence |
|---|---|---|
| T1 Every non-public request has a verified owner | ✅ has | `chat-ax/src/auth.ts:123`<br>`chat-ax/src/agent-capability.ts:60`<br>`chat-ax/src/auth.ts:172` |
| T2 State lives in a Durable Object keyed by that owner | ✅ has | `chat-ax/src/connector-vault.ts:264`<br>`chat-ax/src/pi/durable/do-sqlite-database.ts:13`<br>`chat-ax/src/agent-do.ts:1137` |
| T3 The payer is explicit, and a user payer never falls back to host inference | 🟡 partial | `chat-ax/src/agent-do.ts:326` |
| T4 Secrets and grant tokens never reach the browser or a log | ✅ has | `chat-ax/src/activity-log.ts:26` |
| T5 Writes must come from the app origin | ❌ missing | no probe hit |
| T6 Agent-written code runs in an isolate with no ambient network or secrets | ❌ missing | no probe hit |
| T7 A run is visible, truthful, and stoppable | ✅ has | `chat-ax/src/pi/durable/turn-runtime.ts:41`<br>`chat-ax/src/agent-do.ts:2184` |
| T8 Changes the agent makes are versioned, gated, and append-only | ❌ missing | no probe hit |
| T9 Public pages are served before the gate; nothing else is | ❌ missing | no probe hit |

## Unconfirmed

The code check did not find these, but a live check exists and has not failed. Run it before writing a fix:

`BASE=<url> node basic/kernel/live.mjs --app=chat-ax`

- T5 Writes must come from the app origin
- T6 Agent-written code runs in an isolate with no ambient network or secrets
- T9 Public pages are served before the gate; nothing else is

## Fix tasks

### T3 The payer is explicit, and a user payer never falls back to host inference

- Why this is a task: no live check for this rule; treat the code finding as the gap
- Change: Declare the payer in config; when the payer is user and no grant exists, fail instead of calling env.AI.
- Where: `chat-ax/src/agent-do.ts:326`
- Copy from: `tenon/src/index.ts:95`
- Proof: `node basic/kernel/run.mjs --app=chat-ax && node -e "const r=require('./basic/reports/kernel-chat-ax.json').rows.find(x=>x.id==='T3');process.exit(r.verdict==='has'?0:1)"`

### T8 Changes the agent makes are versioned, gated, and append-only

- Why this is a task: no live check for this rule; treat the code finding as the gap
- Change: Store versions in an append-only table; gate before live; rollback inserts a new row.
- Where: `chat-ax/src`
- Copy from: `tenon/src/index.ts:249`
- Proof: `node basic/kernel/run.mjs --app=chat-ax && node -e "const r=require('./basic/reports/kernel-chat-ax.json').rows.find(x=>x.id==='T8');process.exit(r.verdict==='has'?0:1)"`
