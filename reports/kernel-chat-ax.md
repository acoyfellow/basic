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

## Fix tasks

### T3 The payer is explicit, and a user payer never falls back to host inference

- Change: Declare the payer in config; when the payer is user and no grant exists, fail instead of calling env.AI.
- Where: `chat-ax/src/agent-do.ts:326`
- Copy from: `tenon/src/index.ts:95`
- Proof: `node basic/kernel/run.mjs --app=chat-ax && node -e "const r=require('./basic/reports/kernel-chat-ax.json').rows.find(x=>x.id==='T3');process.exit(r.verdict==='has'?0:1)"`

### T5 Writes must come from the app origin

- Change: Refuse non-GET requests whose Origin header is not the app origin.
- Where: `chat-ax/src`
- Copy from: `tenon/src/index.ts:130`
- Proof: `node basic/kernel/run.mjs --app=chat-ax && node -e "const r=require('./basic/reports/kernel-chat-ax.json').rows.find(x=>x.id==='T5');process.exit(r.verdict==='has'?0:1)"`

### T6 Agent-written code runs in an isolate with no ambient network or secrets

- Change: Load agent code with Worker Loader and globalOutbound: null; pass only the bindings it needs.
- Where: `chat-ax/src`
- Copy from: `tenon/src/index.ts:180`
- Proof: `node basic/kernel/run.mjs --app=chat-ax && node -e "const r=require('./basic/reports/kernel-chat-ax.json').rows.find(x=>x.id==='T6');process.exit(r.verdict==='has'?0:1)"`

### T8 Changes the agent makes are versioned, gated, and append-only

- Change: Store versions in an append-only table; gate before live; rollback inserts a new row.
- Where: `chat-ax/src`
- Copy from: `tenon/src/index.ts:249`
- Proof: `node basic/kernel/run.mjs --app=chat-ax && node -e "const r=require('./basic/reports/kernel-chat-ax.json').rows.find(x=>x.id==='T8');process.exit(r.verdict==='has'?0:1)"`

### T9 Public pages are served before the gate; nothing else is

- Change: Keep one PUBLIC set served before the identity check; everything else goes through it.
- Where: `chat-ax/src`
- Copy from: `tenon/src/index.ts:25`
- Proof: `node basic/kernel/run.mjs --app=chat-ax && node -e "const r=require('./basic/reports/kernel-chat-ax.json').rows.find(x=>x.id==='T9');process.exit(r.verdict==='has'?0:1)"`
