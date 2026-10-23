import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const KERNEL = new URL('.', import.meta.url).pathname;
const TENON = new URL('../../tenon/', import.meta.url).pathname;
const ORIGINAL = readFileSync(join(TENON, 'src/index.ts'), 'utf8');

const TARGETS = {
  T2: {
    line: 'const stub = env.OWNER.get(env.OWNER.idFromName(owner));',
    behaviour: "const stub = env.OWNER.get(env.OWNER.idFromName(req.headers.get('x-owner') ?? 'shared'));",
  },
  T5: {
    line: "if (origin !== url.origin) return json({ error: 'cross_origin_write' }, 403);",
    behaviour: "if (origin === 'never') return json({ error: 'cross_origin_write' }, 403);",
  },
  T6: {
    line: 'globalOutbound: null,',
    behaviour: 'globalOutbound: undefined,',
  },
};

const MUTATIONS = {
  behaviour: (target) => target.behaviour,
  'commented-out': (target) => `// ${target.line}`,
  'comment-only': (target) => `${target.behaviour} // ${target.line}`,
};

const verdictFor = (root, id) => {
  execFileSync('node', [join(KERNEL, 'run.mjs'), '--app=tenon', `--root=${root}`], { stdio: 'ignore' });
  const report = JSON.parse(readFileSync(join(KERNEL, '..', 'reports', 'kernel-tenon.json'), 'utf8'));
  return report.rows.find((row) => row.id === id).verdict;
};

const results = [];
const workspace = mkdtempSync(join(tmpdir(), 'tenon-planted-'));
const reportPath = join(KERNEL, '..', 'reports', 'kernel-tenon.json');
const reportMd = join(KERNEL, '..', 'reports', 'kernel-tenon.md');
const savedJson = readFileSync(reportPath, 'utf8');
const savedMd = readFileSync(reportMd, 'utf8');

try {
  for (const [id, target] of Object.entries(TARGETS)) {
    const occurrences = ORIGINAL.split(target.line).length - 1;
    if (occurrences === 0) throw new Error(`${id}: target line not found in tenon/src/index.ts; update TARGETS`);
    for (const [kind, mutate] of Object.entries(MUTATIONS)) {
      const root = join(workspace, `${id}-${kind}`);
      mkdirSync(join(root, 'tenon', 'src'), { recursive: true });
      writeFileSync(join(root, 'tenon', 'src', 'index.ts'), ORIGINAL.replaceAll(target.line, mutate(target)));
      const verdict = verdictFor(root, id);
      results.push({ id, kind, verdict, caught: verdict !== 'has' });
    }
  }
  const helperRoot = join(workspace, 'T5-helper-correct');
  mkdirSync(join(helperRoot, 'tenon', 'src'), { recursive: true });
  const helperSource = ORIGINAL.replace(
    TARGETS.T5.line,
    "if (!isSameOrigin(req, url)) return json({ error: 'cross_origin_write' }, 403);",
  ).replace('export default {', 'const isSameOrigin = (request: Request, at: URL) => request.headers.get(\'origin\') === at.origin;\n\nexport default {');
  if (helperSource === ORIGINAL) throw new Error('T5 helper edit did not apply');
  writeFileSync(join(helperRoot, 'tenon', 'src', 'index.ts'), helperSource);
  const helperVerdict = verdictFor(helperRoot, 'T5');
  results.push({ id: 'T5', kind: 'control (correct, via helper)', verdict: helperVerdict, caught: helperVerdict === 'has' });

  const control = join(workspace, 'control');
  cpSync(join(TENON, 'src'), join(control, 'tenon', 'src'), { recursive: true });
  for (const id of Object.keys(TARGETS)) results.push({ id, kind: 'control (unchanged)', verdict: verdictFor(control, id), caught: verdictFor(control, id) === 'has' });
} finally {
  writeFileSync(reportPath, savedJson);
  writeFileSync(reportMd, savedMd);
  rmSync(workspace, { recursive: true, force: true });
}

for (const r of results) console.log(`${r.caught ? 'PASS' : 'FAIL'} ${r.id} ${r.kind}: ${r.verdict}`);
const planted = results.filter((r) => !r.kind.startsWith('control'));
const caught = planted.filter((r) => r.caught).length;
const controlsOk = results.filter((r) => r.kind.startsWith('control')).every((r) => r.caught);
console.log(`${caught}/${planted.length} planted breaks caught; controls ${controlsOk ? 'pass' : 'FAIL'}`);
process.exit(caught === planted.length && controlsOk ? 0 : 1);
