# kernel: coil

Static probes read `coil/src, shared` (54 files). Comments are ignored.
A probe hit is evidence to read, not proof. "has" means at least one strong probe hit; "partial" means only weak probes hit.

| Invariant | Verdict | Evidence |
|---|---|---|
| T1 Every non-public request has a verified owner | ✅ has | `coil/src/auth/access.ts:19`<br>`coil/src/auth/cloudflare.ts:118`<br>`coil/src/auth/access-jwt.ts:114`<br>`coil/src/auth/cloudflare.ts:266`<br>`coil/src/auth/cloudflare.ts:37` |
| T2 State lives in a Durable Object keyed by that owner | ✅ has | `coil/src/run.ts:42`<br>`coil/src/directory.ts:109`<br>`coil/src/auth/cloudflare.ts:108` |
| T3 The payer is explicit, and a user payer never falls back to host inference | 🟡 partial | `coil/src/auth/oauth.ts:205`<br>`coil/src/auth/gate.ts:7`<br>`coil/src/thread.ts:299`<br>`coil/src/auth/cloudflare.ts:207`<br>⚠ routes to the user account (coil/src/auth/oauth.ts:205) and also calls host AI (coil/src/thread.ts:299); confirm the host call never serves a user-paid turn |
| T4 Secrets and grant tokens never reach the browser or a log | ✅ has | `coil/src/auth/session.ts:82`<br>`coil/src/auth/session.ts:26` |
| T5 Writes must come from the app origin | ✅ has | `coil/src/index.ts:130`<br>`coil/src/auth/session.ts:82` |
| T6 Agent-written code runs in an isolate with no ambient network or secrets | ✅ has | `coil/src/run.ts:58`<br>`coil/src/run.ts:54`<br>`coil/src/browser.ts:111` |
| T7 A run is visible, truthful, and stoppable | ✅ has | `coil/src/rpc.ts:123`<br>`coil/src/agent.ts:197`<br>`coil/src/agent.ts:744` |
| T8 Changes the agent makes are versioned, gated, and append-only | ✅ has | `coil/src/computer.ts:130` |
| T9 Public pages are served before the gate; nothing else is | 🟡 partial | `coil/src/index.ts:232`<br>`coil/src/auth/cloudflare.ts:62` |

## Unconfirmed

The code check did not find these, but a live check exists and has not failed. Run it before writing a fix:

`BASE=<url> node basic/kernel/live.mjs --app=coil`

- T9 Public pages are served before the gate; nothing else is

## Fix tasks

### T3 The payer is explicit, and a user payer never falls back to host inference

- Why this is a task: no live check for this rule; treat the code finding as the gap
- Change: Declare the payer in config; when the payer is user and no grant exists, fail instead of calling env.AI.
- Where: `coil/src/auth/oauth.ts:205`
- Copy from: `tenon/src/index.ts:95`
- Proof: `node basic/kernel/run.mjs --app=coil && node -e "const r=require('./basic/reports/kernel-coil.json').rows.find(x=>x.id==='T3');process.exit(r.verdict==='has'?0:1)"`
