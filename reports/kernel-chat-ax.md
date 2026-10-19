# kernel: chat-ax

Static probes read `chat-ax/src` (70 files). Generated 2026-10-19T03:19:29.470Z.
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
