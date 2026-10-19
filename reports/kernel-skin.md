# kernel: skin

Static probes read `skin/kernel, shared` (35 files). Generated 2026-10-19T03:19:29.513Z.
A probe hit is evidence to read, not proof. "has" means at least one strong probe hit; "partial" means only weak probes hit.

| Invariant | Verdict | Evidence |
|---|---|---|
| T1 Every non-public request has a verified owner | ✅ has | `skin/kernel/auth/cloudflare.ts:177`<br>`skin/kernel/auth/session.ts:76`<br>`skin/kernel/auth/cloudflare.ts:348`<br>`skin/kernel/auth/cloudflare.ts:39` |
| T2 State lives in a Durable Object keyed by that owner | ✅ has | `skin/kernel/files.ts:55`<br>`skin/kernel/code-tools.ts:22`<br>`skin/kernel/auth/directory.ts:40`<br>`skin/kernel/agent.ts:93` |
| T3 The payer is explicit, and a user payer never falls back to host inference | ✅ has | `skin/kernel/auth/oauth.ts:227`<br>`skin/kernel/auth/cloudflare.ts:279` |
| T4 Secrets and grant tokens never reach the browser or a log | ✅ has | `skin/kernel/auth/session.ts:105`<br>`skin/kernel/auth/session.ts:33` |
| T5 Writes must come from the app origin | 🟡 partial | `skin/kernel/auth/session.ts:105` |
| T6 Agent-written code runs in an isolate with no ambient network or secrets | ✅ has | `skin/kernel/agent.ts:82`<br>`skin/kernel/agent.ts:77` |
| T7 A run is visible, truthful, and stoppable | ✅ has | `skin/kernel/conversation.ts:14`<br>`skin/kernel/body.ts:54`<br>`skin/kernel/body.ts:672` |
| T8 Changes the agent makes are versioned, gated, and append-only | ✅ has | `skin/kernel/body.ts:258`<br>`skin/kernel/index.ts:221`<br>`skin/kernel/body.ts:615` |
| T9 Public pages are served before the gate; nothing else is | ✅ has | `skin/kernel/index.ts:258`<br>`skin/kernel/index.ts:273` |
