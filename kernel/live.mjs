import { randomBytes } from 'node:crypto';

const ok = (status) => status >= 200 && status < 300;
const refused = (status) => [401, 403].includes(status) || (status >= 300 && status < 400);

export const runLive = async (base, adapter) => {
  const results = [];
  const record = async (id, name, check) => {
    try {
      const detail = await check();
      results.push({ id, name, pass: detail === true, detail: detail === true ? undefined : String(detail) });
    } catch (error) {
      results.push({ id, name, pass: false, detail: String(error.message ?? error) });
    }
  };
  const call = (cookie, path, init = {}) =>
    fetch(`${base}${path}`, {
      redirect: 'manual',
      ...init,
      headers: { origin: base, 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...(init.headers ?? {}) },
    });
  const send = (cookie, route, payload, headers) =>
    call(cookie, route.path, { method: route.method, body: JSON.stringify(route.body(payload)), headers });

  await record('T9', 'public pages load without sign-in', async () => {
    for (const path of adapter.publicPaths) {
      const status = (await fetch(`${base}${path}`, { redirect: 'manual' })).status;
      if (status !== 200) return `${path} returned ${status}`;
    }
    return true;
  });

  await record('T1', 'no sign-in and forged sign-in are refused', async () => {
    for (const path of adapter.privatePaths) {
      const anonymous = (await call(null, path)).status;
      if (!refused(anonymous)) return `anonymous ${path} returned ${anonymous}`;
      const forged = (await call(adapter.forgedCookie(), path)).status;
      if (!refused(forged)) return `forged ${path} returned ${forged}`;
    }
    return true;
  });

  const alice = await adapter.signIn(base, `live-a-${randomBytes(3).toString('hex')}`);
  const bob = await adapter.signIn(base, `live-b-${randomBytes(3).toString('hex')}`);
  const marker = `marker-${randomBytes(8).toString('hex')}`;

  await record('T2', 'one owner cannot see another owner', async () => {
    const wrote = await send(alice, adapter.write, marker);
    if (!ok(wrote.status)) return `owner A write returned ${wrote.status}`;
    const own = await (await call(alice, adapter.read.path)).text();
    if (!own.includes(marker)) return 'owner A cannot read its own write';
    const other = await (await call(bob, adapter.read.path)).text();
    if (other.includes(marker)) return 'owner B can read owner A data';
    return true;
  });

  await record('T5', 'a write from another site is refused', async () => {
    const foreign = `foreign-${randomBytes(8).toString('hex')}`;
    const response = await send(alice, adapter.write, foreign, { origin: 'https://evil.example' });
    if (ok(response.status)) return `cross-origin write returned ${response.status}`;
    const after = await (await call(alice, adapter.read.path)).text();
    if (after.includes(foreign)) return 'cross-origin write was stored';
    return true;
  });

  if (adapter.run) {
    await record('T6', 'agent code cannot reach the network', async () => {
      const started = await send(alice, adapter.run.start, "return (await fetch('https://example.com')).status;");
      if (!ok(started.status)) return `run start returned ${started.status}`;
      const id = adapter.run.idOf(await started.json());
      for (let attempt = 0; attempt < 60; attempt++) {
        const body = await (await call(alice, adapter.run.status(id))).json();
        if (adapter.run.finished(body)) return adapter.run.failed(body) ? true : `network call succeeded: ${JSON.stringify(body).slice(0, 200)}`;
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return 'run never finished';
    });
  }

  return results;
};

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const args = Object.fromEntries(process.argv.slice(2).map((arg) => arg.replace(/^--/, '').split('=')));
  const base = (process.env.BASE ?? '').replace(/\/$/, '');
  if (!base || !args.app) {
    console.error('usage: BASE=http://… node kernel/live.mjs --app=<adapter>');
    process.exit(2);
  }
  const adapter = (await import(new URL(`./live-adapters/${args.app}.mjs`, import.meta.url))).default;
  const results = await runLive(base, adapter);
  for (const r of results) console.log(`${r.pass ? 'PASS' : 'FAIL'} ${r.id} ${r.name}${r.detail ? ` — ${r.detail}` : ''}`);
  const passed = results.filter((r) => r.pass).length;
  console.log(`${args.app} live: ${passed}/${results.length}`);
  process.exit(passed === results.length ? 0 : 1);
}
