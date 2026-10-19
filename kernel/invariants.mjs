
export const INVARIANTS = [
  {
    id: 'T1',
    name: 'Every non-public request has a verified owner',
    why: 'All five apps gate on Cloudflare identity: Access JWT or Sign in with Cloudflare.',
    strong: [/cf-access-jwt-assertion/i, /\/oauth\/callback/, /crypto\.subtle\.verify|verifySession|readSession/],
    weak: [/status:\s*401|, 401\)/, /SESSION_SECRET/],
  },
  {
    id: 'T2',
    name: 'State lives in a Durable Object keyed by that owner',
    why: 'Thread/Hark/UserAgent/AgentDO/Body: one durable home per owner or thread, with SQLite.',
    strong: [/(getByName|idFromName)\(\s*(owner|user|email|actor|this\.owner|caller\.owner|identity)/i, /props\.(owner|user)\b/],
    weak: [/ctx\.storage\.sql|storage\.sql\.exec|this\.sql\b/, /idFromName\(|getByName\(/],
  },
  {
    id: 'T3',
    name: 'The payer is explicit, and a user payer never falls back to host inference',
    why: 'coil/hark/skin route model calls to the user account; my-ax/chat-ax use host AI. The rule is: say which, never mix silently.',
    strong: [/accounts\/\$\{[^}]*account/i, /no_user_grant|COIL_AUTH|_PAYER\b/],
    weak: [/env\.AI\b|this\.env\.AI\b/, /accountName/],
  },
  {
    id: 'T4',
    name: 'Secrets and grant tokens never reach the browser or a log',
    why: 'Tokens live in DO storage; responses and logs are redacted.',
    strong: [/redact/i, /HttpOnly/i, /never returned|grant_store/],
    weak: [/__Host-|SameSite/i],
  },
  {
    id: 'T5',
    name: 'Writes must come from the app origin',
    why: 'A signed-in cookie must not let another site write.',
    strong: [/origin\s*!==\s*(new URL|url\.origin)|origin\s*!==\s*null\s*&&\s*origin\s*!==/],
    weak: [/sec-fetch-site|csrf/i, /SameSite=(Strict|Lax)/i],
  },
  {
    id: 'T6',
    name: 'Agent-written code runs in an isolate with no ambient network or secrets',
    why: 'coil/hark/skin load agent code with Worker Loader and globalOutbound: null; containers hold the computer.',
    strong: [/globalOutbound:\s*null/],
    weak: [/LOADER\.(get|load)\(/, /getSandbox|sandboxComputer|Container\b/],
  },
  {
    id: 'T7',
    name: 'A run is visible, truthful, and stoppable',
    why: 'Every app shows a running turn and lets the owner stop it; a stop must stick.',
    strong: [/\/stop\b|stopLoop|STOPPED_BY_OWNER|status = 'stopped'/, /interrupted|aborted/],
    weak: [/AbortController|abort\(/],
  },
  {
    id: 'T8',
    name: 'Changes the agent makes are versioned, gated, and append-only',
    why: 'skin generations, coil snapshot pairs, my-ax artifacts: the agent changes things, so changes need history and a gate.',
    strong: [/CREATE TABLE[^\n]*\b(generations|versions)\b/, /snapshotId\b|snapshotContainer\(/, /\/rollback\b|\/api\/rollback/],
    weak: [/rollback\(/, /artifact/i],
  },
  {
    id: 'T9',
    name: 'Public pages are served before the gate; nothing else is',
    why: 'Landing, /docs, /llms.txt, /robots.txt are public by design (repo shape v2); every other route is not.',
    strong: [/SIGN_IN_PATHS|PUBLIC_PATHS|const PUBLIC\b/],
    weak: [/robots\.txt/, /llms\.txt/],
  },
];

export const APPS = {
  coil: { dirs: ['src', 'shared'] },
  hark: { dirs: ['src', 'shared'] },
  'my-ax': { dirs: ['src'] },
  'chat-ax': { dirs: ['src'] },
  skin: { dirs: ['kernel', 'shared'] },
  tenon: { dirs: ['src'] },
};
