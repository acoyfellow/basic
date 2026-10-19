import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runLive } from './live.mjs';
import adapter from './live-adapters/tenon.mjs';

const TENON = new URL('../../tenon/', import.meta.url).pathname;
const TMP = new URL('../.tmp/live-planted/', import.meta.url).pathname;
const ORIGINAL = readFileSync(join(TENON, 'src/index.ts'), 'utf8');

const ORIGIN_CHECK = "if (origin !== url.origin) return json({ error: 'cross_origin_write' }, 403);";
const OWNER_STUB = 'const stub = env.OWNER.get(env.OWNER.idFromName(owner));';

const VARIANTS = [
  { name: 'control (unchanged)', expectFail: null, edit: (s) => s },
  {
    name: 'T6 network block left only in a string',
    expectFail: 'T6',
    edit: (s) => s.replace('globalOutbound: null,', 'globalOutbound: undefined, label: "globalOutbound: null",'),
  },
  {
    name: 'T6 network block in a branch that never runs',
    expectFail: 'T6',
    edit: (s) => s.replace('globalOutbound: null,', '...(Date.now() < 0 ? { globalOutbound: null } : {}),'),
  },
  {
    name: 'T5 origin check moved into an unused function',
    expectFail: 'T5',
    edit: (s) => s.replace(ORIGIN_CHECK, 'const isForeign = () => origin !== url.origin;'),
  },
  {
    name: 'T2 every owner sent to one shared store',
    expectFail: 'T2',
    edit: (s) => s.replace(OWNER_STUB, "const stub = env.OWNER.get(env.OWNER.idFromName(owner ? 'shared' : owner));"),
  },
];

const prepare = (index, source) => {
  const dir = join(TMP, `v${index}`);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'src'), { recursive: true });
  writeFileSync(join(dir, 'src', 'index.ts'), source);
  cpSync(join(TENON, 'wrangler.jsonc'), join(dir, 'wrangler.jsonc'));
  cpSync(join(TENON, 'package.json'), join(dir, 'package.json'));
  symlinkSync(join(TENON, 'node_modules'), join(dir, 'node_modules'));
  return dir;
};

const boot = async (dir, port) => {
  const child = spawn(
    join(TENON, 'node_modules/.bin/wrangler'),
    ['dev', '--port', String(port), '--inspector-port', String(port + 1000), '--ip', '127.0.0.1',
      '--persist-to', join(dir, '.state'),
      '--var', `SESSION_SECRET:${randomBytes(32).toString('hex')}`, '--var', 'TENON_DEV_LOGIN:1', '--var', 'TENON_PAYER:user'],
    { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_LOG_PATH: join(dir, 'logs') } },
  );
  let log = '';
  child.stdout.on('data', (d) => (log += d));
  child.stderr.on('data', (d) => (log += d));
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(`${base}/robots.txt`)).ok) return { child, base };
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  child.kill();
  throw new Error(`wrangler dev did not start in ${dir}:\n${log.slice(-1500)}`);
};

const outcomes = [];
mkdirSync(TMP, { recursive: true });
for (const [index, variant] of VARIANTS.entries()) {
  const edited = variant.edit(ORIGINAL);
  if (variant.expectFail && edited === ORIGINAL) throw new Error(`${variant.name}: edit did not apply; tenon source changed`);
  const dir = prepare(index, edited);
  const { child, base } = await boot(dir, 8720 + index);
  try {
    const results = await runLive(base, adapter);
    const failed = results.filter((r) => !r.pass).map((r) => r.id);
    const caught = variant.expectFail === null ? failed.length === 0 && results.length === 5 : failed.includes(variant.expectFail);
    outcomes.push({ variant: variant.name, caught, failed, results });
    console.log(`${caught ? 'PASS' : 'FAIL'} ${variant.name}: ${results.filter((r) => r.pass).length}/${results.length} rules pass${failed.length ? `, failed ${failed.join(', ')}` : ''}`);
    for (const r of results.filter((r) => !r.pass)) console.log(`     ${r.id}: ${r.detail}`);
  } finally {
    child.kill();
  }
}
rmSync(TMP, { recursive: true, force: true });

const planted = outcomes.filter((o) => !o.variant.startsWith('control'));
const control = outcomes.find((o) => o.variant.startsWith('control'));
console.log(`${planted.filter((o) => o.caught).length}/${planted.length} tricks caught; control ${control.caught ? 'passes 5/5' : 'FAILS'}`);
process.exit(planted.every((o) => o.caught) && control.caught ? 0 : 1);
