import { readFileSync } from 'node:fs';

const SOURCE = new URL('../../tenon/invariants.json', import.meta.url);
const spec = JSON.parse(readFileSync(SOURCE, 'utf8'));

const caseInsensitive = new Set(['T1', 'T2', 'T3', 'T4', 'T5', 'T8']);

export const INVARIANTS = spec.invariants.map((invariant) => {
  const flags = caseInsensitive.has(invariant.id) ? 'i' : '';
  return {
    ...invariant,
    strong: invariant.probes.strong.map((pattern) => new RegExp(pattern, flags)),
    weak: invariant.probes.weak.map((pattern) => new RegExp(pattern, flags)),
  };
});

export const APPS = {
  coil: { dirs: ['src', 'shared'] },
  hark: { dirs: ['src', 'shared'] },
  'my-ax': { dirs: ['src'] },
  'chat-ax': { dirs: ['src'] },
  skin: { dirs: ['kernel', 'shared'] },
  tenon: { dirs: ['src'] },
};
