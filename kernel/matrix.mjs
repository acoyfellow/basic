import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { INVARIANTS } from './invariants.mjs';

const APPS = ['coil', 'hark', 'my-ax', 'chat-ax', 'skin'];
const REPORTS = new URL('../reports/', import.meta.url);
const OUT = new URL('../diagrams/kernel-matrix.svg', import.meta.url);

const COLORS = {
  has: { fill: '#d6f5dd', stroke: '#2f9e44', label: 'has' },
  partial: { fill: '#fff3bf', stroke: '#e8a200', label: 'partial' },
  missing: { fill: '#ffe3e3', stroke: '#e03131', label: 'missing' },
  'n/a': { fill: '#f1f3f5', stroke: '#adb5bd', label: 'n/a' },
};

const escapeXml = (text) => String(text).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

const verdictsFor = (app) => {
  const report = JSON.parse(readFileSync(new URL(`kernel-${app}.json`, REPORTS), 'utf8'));
  return Object.fromEntries(report.rows.map((row) => [row.id, row]));
};

const reports = Object.fromEntries(APPS.map((app) => [app, verdictsFor(app)]));

const LEFT = 560;
const TOP = 120;
const CELL_W = 112;
const CELL_H = 40;
const width = LEFT + CELL_W * APPS.length + 32;
const height = TOP + CELL_H * INVARIANTS.length + 80;

const header = APPS.map((app, column) => {
  const x = LEFT + column * CELL_W + CELL_W / 2;
  const score = INVARIANTS.filter((inv) => ['has', 'n/a'].includes(reports[app][inv.id].verdict)).length;
  return `<text x="${x}" y="${TOP - 34}" class="app">${escapeXml(app)}</text><text x="${x}" y="${TOP - 14}" class="score">${score}/9</text>`;
}).join('');

const rows = INVARIANTS.map((inv, rowIndex) => {
  const y = TOP + rowIndex * CELL_H;
  const label = `<text x="24" y="${y + CELL_H / 2 + 5}" class="rule"><tspan class="id">${inv.id}</tspan> ${escapeXml(inv.name)}</text>`;
  const cells = APPS.map((app, column) => {
    const row = reports[app][inv.id];
    const color = COLORS[row.verdict];
    const x = LEFT + column * CELL_W;
    const title = `${app} ${inv.id}: ${row.verdict}${row.note ? ` (${row.note})` : ''}`;
    return `<g class="cell" data-app="${app}" data-id="${inv.id}" data-verdict="${row.verdict}"><title>${escapeXml(title)}</title><rect x="${x + 4}" y="${y + 4}" width="${CELL_W - 8}" height="${CELL_H - 8}" rx="6" fill="${color.fill}" stroke="${color.stroke}"/><text x="${x + CELL_W / 2}" y="${y + CELL_H / 2 + 5}" class="verdict">${color.label}</text></g>`;
  }).join('');
  return label + cells;
}).join('');

const legend = Object.values(COLORS).map((color, index) => {
  const x = 24 + index * 120;
  const y = height - 36;
  return `<rect x="${x}" y="${y - 12}" width="16" height="16" rx="3" fill="${color.fill}" stroke="${color.stroke}"/><text x="${x + 24}" y="${y + 1}" class="legend">${color.label}</text>`;
}).join('');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, -apple-system, sans-serif">
<style>.title{font-size:20px;font-weight:700;fill:#1d1d1f}.sub{font-size:13px;fill:#6e6e73}.app{font-size:14px;font-weight:600;text-anchor:middle;fill:#1d1d1f}.score{font-size:12px;text-anchor:middle;fill:#6e6e73}.rule{font-size:13px;fill:#1d1d1f}.id{font-weight:700}.verdict{font-size:12px;text-anchor:middle;fill:#1d1d1f}.legend{font-size:12px;fill:#495057}</style>
<rect width="100%" height="100%" fill="#ffffff"/>
<text x="24" y="32" class="title">tenon: nine rules, five apps</text>
<text x="24" y="52" class="sub">Static probes from basic/kernel. A cell is a place to read, not proof. Generated ${new Date().toISOString().slice(0, 10)}.</text>
${header}${rows}${legend}
</svg>
`;

mkdirSync(new URL('../diagrams/', import.meta.url), { recursive: true });
writeFileSync(OUT, svg);
console.log(`wrote diagrams/kernel-matrix.svg (${APPS.length * INVARIANTS.length} cells)`);
