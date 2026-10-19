# kernel: hark

Static probes read `hark/src, shared` (53 files). Generated 2026-10-19T04:43:27.970Z.
A probe hit is evidence to read, not proof. "has" means at least one strong probe hit; "partial" means only weak probes hit.

| Invariant | Verdict | Evidence |
|---|---|---|
| T1 Every non-public request has a verified owner | ✅ has | `hark/src/auth/cloudflare.ts:74`<br>`hark/src/auth/session.ts:54`<br>`hark/src/auth/cloudflare.ts:205`<br>`hark/src/auth/cloudflare.ts:36` |
| T2 State lives in a Durable Object keyed by that owner | ✅ has | `hark/src/workbench.ts:26`<br>`hark/src/directory.ts:30`<br>`hark/src/auth/cloudflare.ts:64` |
| T3 The payer is explicit, and a user payer never falls back to host inference | ✅ has | `hark/src/upstream.ts:48`<br>`hark/src/auth/cloudflare.ts:152` |
| T4 Secrets and grant tokens never reach the browser or a log | ✅ has | `hark/src/auth/session.ts:83`<br>`hark/src/auth/session.ts:27` |
| T5 Writes must come from the app origin | ✅ has | `hark/src/index.ts:43`<br>`hark/src/auth/session.ts:83` |
| T6 Agent-written code runs in an isolate with no ambient network or secrets | ✅ has | `hark/src/workbench.ts:94`<br>`hark/src/workbench.ts:90`<br>`hark/src/computer.ts:67` |
| T7 A run is visible, truthful, and stoppable | ✅ has | `hark/src/hark.ts:935`<br>`hark/src/hark.ts:715` |
| T8 Changes the agent makes are versioned, gated, and append-only | 🟡 partial | `hark/src/auth/every-scope.ts:101` |
| T9 Public pages are served before the gate; nothing else is | ✅ has | `hark/src/index.ts:20` |

## Fix tasks

### T8 Changes the agent makes are versioned, gated, and append-only

- Change: Store versions in an append-only table; gate before live; rollback inserts a new row.
- Where: `hark/src/auth/every-scope.ts:101`
- Copy from: `tenon/src/index.ts:249`
- Proof: `node basic/kernel/run.mjs --app=hark && node -e "const r=require('./basic/reports/kernel-hark.json').rows.find(x=>x.id==='T8');process.exit(r.verdict==='has'?0:1)"`
