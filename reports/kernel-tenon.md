# kernel: tenon

Static probes read `tenon/src` (1 files). Generated 2026-10-19T04:43:31.888Z.
A probe hit is evidence to read, not proof. "has" means at least one strong probe hit; "partial" means only weak probes hit.

| Invariant | Verdict | Evidence |
|---|---|---|
| T1 Every non-public request has a verified owner | ✅ has | `tenon/src/index.ts:89`<br>`tenon/src/index.ts:49`<br>`tenon/src/index.ts:126`<br>`tenon/src/index.ts:12` |
| T2 State lives in a Durable Object keyed by that owner | ✅ has | `tenon/src/index.ts:133`<br>`tenon/src/index.ts:148`<br>`tenon/src/index.ts:133` |
| T3 The payer is explicit, and a user payer never falls back to host inference | ✅ has | `tenon/src/index.ts:13` |
| T4 Secrets and grant tokens never reach the browser or a log | ✅ has | `tenon/src/index.ts:121`<br>`tenon/src/index.ts:157`<br>`tenon/src/index.ts:121` |
| T5 Writes must come from the app origin | ✅ has | `tenon/src/index.ts:130`<br>`tenon/src/index.ts:121` |
| T6 Agent-written code runs in an isolate with no ambient network or secrets | ✅ has | `tenon/src/index.ts:180`<br>`tenon/src/index.ts:176` |
| T7 A run is visible, truthful, and stoppable | ✅ has | `tenon/src/index.ts:315`<br>`tenon/src/index.ts:158` |
| T8 Changes the agent makes are versioned, gated, and append-only | ✅ has | `tenon/src/index.ts:151`<br>`tenon/src/index.ts:245` |
| T9 Public pages are served before the gate; nothing else is | ✅ has | `tenon/src/index.ts:25`<br>`tenon/src/index.ts:28`<br>`tenon/src/index.ts:27` |
