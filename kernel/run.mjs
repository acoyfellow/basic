import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INVARIANTS, APPS } from './invariants.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')));
const app = args.app;
const root = args.root ?? join(HERE, '..', '..');
const BASE = (process.env.BASE ?? '').replace(/\/$/, '');
if (!APPS[app]) {
  console.error(`--app must be one of ${Object.keys(APPS).join(', ')}`);
  process.exit(2);
}

const SKIP = new RegExp(['node_modules', 'test-storage', '[.]test[.]', '[.]spec[.]', '[/]test[/]', '[.]generated[.]', '[/]dist[/]', '[/]public[/]'].join('|'));
const files = [];
const walk = (dir) => {
  let entries = [];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const p = join(dir, e);
    if (SKIP.test(p)) continue;
    const s = statSync(p);
    if (s.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|js)$/.test(e)) files.push(p);
  }
};
const appRoot = join(root, app);
for (const d of APPS[app].dirs) walk(join(appRoot, d));
const sources = files.map((f) => ({ f: relative(root, f), lines: readFileSync(f, 'utf8').split('\n') }));

const find = (re) => {
  for (const { f, lines } of sources) {
    const i = lines.findIndex((l) => re.test(l));
    if (i >= 0) return `${f}:${i + 1}`;
  }
  return null;
};

const rows = INVARIANTS.map((inv) => {
  const strong = inv.strong.map((re) => ({ re: String(re), at: find(re) }));
  const weak = inv.weak.map((re) => ({ re: String(re), at: find(re) }));
  const s = strong.filter((x) => x.at).length;
  const w = weak.filter((x) => x.at).length;
  const verdict = s > 0 ? 'has' : s > 0 || w > 0 ? 'partial' : 'missing';
  return { ...inv, strong, weak, verdict };
});

const t3 = rows.find((r) => r.id === 'T3');
if (t3.strong[0].at && t3.weak[0].at) {
  t3.verdict = 'partial';
  t3.note = `routes to the user account (${t3.strong[0].at}) and also calls host AI (${t3.weak[0].at}); confirm the host call never serves a user-paid turn`;
}

const live = [];
if (BASE) {
  const probe = async (name, fn) => {
    try {
      live.push({ name, pass: await fn() });
    } catch (e) {
      live.push({ name, pass: false, detail: String(e.message ?? e) });
    }
  };
  await probe('T1 anonymous /api is refused', async () => [401, 403, 302].includes((await fetch(`${BASE}/api/versions`, { redirect: 'manual' })).status));
  await probe('T9 /robots.txt is public', async () => (await fetch(`${BASE}/robots.txt`)).status === 200);
  await probe('T9 /llms.txt is public', async () => (await fetch(`${BASE}/llms.txt`)).status === 200);
  await probe('T5 cross-origin write is refused', async () =>
    [401, 403].includes((await fetch(`${BASE}/api/notes`, { method: 'POST', headers: { origin: 'https://evil.example' }, body: '{}' })).status),
  );
}

const icon = { has: '✅ has', partial: '🟡 partial', missing: '❌ missing' };
const out = [
  `# kernel: ${app}`,
  '',
  `Static probes read \`${app}/${APPS[app].dirs.join(', ')}\` (${sources.length} files). Generated ${new Date().toISOString()}.`,
  `A probe hit is evidence to read, not proof. "has" means at least one strong probe hit; "partial" means only weak probes hit.`,
  '',
  '| Invariant | Verdict | Evidence |',
  '|---|---|---|',
  ...rows.map((r) => {
    const ev = [...r.strong, ...r.weak].filter((x) => x.at).map((x) => `\`${x.at}\``);
    return `| ${r.id} ${r.name} | ${icon[r.verdict]} | ${ev.join('<br>') || 'no probe hit'}${r.note ? `<br>⚠ ${r.note}` : ''} |`;
  }),
  '',
  ...(live.length
    ? ['## Live', '', `BASE=${BASE}`, '', ...live.map((l) => `- ${l.pass ? 'PASS' : 'FAIL'} ${l.name}${l.detail ? ` (${l.detail})` : ''}`), '']
    : []),
];
mkdirSync(join(HERE, '..', 'reports'), { recursive: true });
writeFileSync(join(HERE, '..', 'reports', `kernel-${app}.md`), out.join('\n'));
writeFileSync(
  join(HERE, '..', 'reports', `kernel-${app}.json`),
  JSON.stringify({ app, rows: rows.map(({ id, verdict, strong, weak, note }) => ({ id, verdict, strong, weak, note })), live }, null, 2),
);
const has = rows.filter((r) => r.verdict === 'has').length;
const livePass = live.every((l) => l.pass);
console.log(`${app}: ${has}/${rows.length} has${live.length ? `, live ${live.filter((l) => l.pass).length}/${live.length}` : ''}`);
process.exit(args.strict === '1' && (has !== rows.length || !livePass) ? 1 : 0);
