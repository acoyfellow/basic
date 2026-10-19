# kernel: coil

Static probes read `coil/src, shared` (54 files). Generated 2026-10-19T03:19:29.285Z.
A probe hit is evidence to read, not proof. "has" means at least one strong probe hit; "partial" means only weak probes hit.

| Invariant | Verdict | Evidence |
|---|---|---|
| T1 Every non-public request has a verified owner | ✅ has | `coil/src/auth/access.ts:19`<br>`coil/src/auth/cloudflare.ts:118`<br>`coil/src/auth/access-jwt.ts:114`<br>`coil/src/auth/cloudflare.ts:264`<br>`coil/src/auth/cloudflare.ts:37` |
| T2 State lives in a Durable Object keyed by that owner | ✅ has | `coil/src/run.ts:42`<br>`coil/src/directory.ts:95`<br>`coil/src/auth/cloudflare.ts:108` |
| T3 The payer is explicit, and a user payer never falls back to host inference | 🟡 partial | `coil/src/auth/oauth.ts:197`<br>`coil/src/auth/gate.ts:7`<br>`coil/src/thread.ts:299`<br>`coil/src/auth/cloudflare.ts:207`<br>⚠ routes to the user account (coil/src/auth/oauth.ts:197) and also calls host AI (coil/src/thread.ts:299); confirm the host call never serves a user-paid turn |
| T4 Secrets and grant tokens never reach the browser or a log | ✅ has | `coil/src/auth/session.ts:82`<br>`coil/src/auth/session.ts:26` |
| T5 Writes must come from the app origin | ✅ has | `coil/src/index.ts:127`<br>`coil/src/auth/session.ts:82` |
| T6 Agent-written code runs in an isolate with no ambient network or secrets | ✅ has | `coil/src/run.ts:58`<br>`coil/src/run.ts:54`<br>`coil/src/browser.ts:111` |
| T7 A run is visible, truthful, and stoppable | ✅ has | `coil/src/rpc.ts:123`<br>`coil/src/agent.ts:197`<br>`coil/src/agent.ts:744` |
| T8 Changes the agent makes are versioned, gated, and append-only | ✅ has | `coil/src/computer.ts:130` |
| T9 Public pages are served before the gate; nothing else is | 🟡 partial | `coil/src/index.ts:231`<br>`coil/src/auth/cloudflare.ts:62` |
