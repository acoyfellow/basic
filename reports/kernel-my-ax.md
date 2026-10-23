# kernel: my-ax

Static probes read `my-ax/src` (301 files). Comments are ignored.
A probe hit is evidence to read, not proof. "has" means at least one strong probe hit; "partial" means only weak probes hit.

| Invariant | Verdict | Evidence |
|---|---|---|
| T1 Every non-public request has a verified owner | ✅ has | `my-ax/src/auth.ts:108` |
| T2 State lives in a Durable Object keyed by that owner | ✅ has | `my-ax/src/index.tsx:238`<br>`my-ax/src/agent.ts:159`<br>`my-ax/src/computer-workspace.ts:67` |
| T3 The payer is explicit, and a user payer never falls back to host inference | 🟡 partial | `my-ax/src/routes/browser.ts:6`<br>`my-ax/src/index.tsx:149`<br>⚠ routes to the user account (my-ax/src/routes/browser.ts:6) and also calls host AI (my-ax/src/index.tsx:149); confirm the host call never serves a user-paid turn |
| T4 Secrets and grant tokens never reach the browser or a log | ✅ has | `my-ax/src/cmux-observer.ts:37`<br>`my-ax/src/routes/theme.ts:36` |
| T5 Writes must come from the app origin | ✅ has | `my-ax/src/routes/attention.ts:165`<br>`my-ax/src/routes/theme.ts:36` |
| T6 Agent-written code runs in an isolate with no ambient network or secrets | ✅ has | `my-ax/src/mcp-code-mode.ts:89`<br>`my-ax/src/disk-sandbox.ts:15` |
| T7 A run is visible, truthful, and stoppable | ✅ has | `my-ax/src/routes/runs.tsx:257`<br>`my-ax/src/agent.ts:140`<br>`my-ax/src/browser-tools.ts:57` |
| T8 Changes the agent makes are versioned, gated, and append-only | ✅ has | `my-ax/src/disk-sandbox.ts:31`<br>`my-ax/src/artifacts.ts:7` |
| T9 Public pages are served before the gate; nothing else is | ⚪ n/a | no probe hit<br>⚠ Access-only app: every route, including landing, sits behind Cloudflare Access by design. |

## Fix tasks

### T3 The payer is explicit, and a user payer never falls back to host inference

- Why this is a task: no live check for this rule; treat the code finding as the gap
- Change: Declare the payer in config; when the payer is user and no grant exists, fail instead of calling env.AI.
- Where: `my-ax/src/routes/browser.ts:6`
- Copy from: `tenon/src/index.ts:95`
- Proof: `node basic/kernel/run.mjs --app=my-ax && node -e "const r=require('./basic/reports/kernel-my-ax.json').rows.find(x=>x.id==='T3');process.exit(r.verdict==='has'?0:1)"`
