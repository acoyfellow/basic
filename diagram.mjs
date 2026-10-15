import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(fileURLToPath(import.meta.url));
const OUT = join(ROOT, "diagrams");
const appName = process.argv.find((arg) => arg.startsWith("--app="))?.slice(6);

const INK = "#1d1d1f";
const MUTED = "#6e6e73";
const LINE = "#d2d2d7";
const PAPER = "#ffffff";
const FONT = "ui-sans-serif, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

const TAG_COLORS = {
	"@must": { fill: "#fff1e6", stroke: "#f38020", text: "#9a4a00" },
	"@should": { fill: "#eef4ff", stroke: "#4a7bd8", text: "#1f4a99" },
	"@agent": { fill: "#f1ecff", stroke: "#7a5af5", text: "#4b2fc0" },
};

const STATUS_COLORS = {
	pass: { fill: "#e9f7ef", stroke: "#2e9e5b", text: "#1c6b3c" },
	fail: { fill: "#fdecec", stroke: "#d93a3a", text: "#9b1c1c" },
	"n/a": { fill: "#f2f2f4", stroke: "#a1a1a6", text: "#55555a" },
	untested: { fill: "#fff8e1", stroke: "#d9a400", text: "#7a5c00" },
};

const STEP_COLORS = {
	Given: { fill: "#f5f5f7", stroke: "#a1a1a6", text: INK },
	When: { fill: "#fff1e6", stroke: "#f38020", text: INK },
	Then: { fill: "#e9f7ef", stroke: "#2e9e5b", text: INK },
};

const escapeXml = (text) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const slug = (text) => text.replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

const wrap = (text, maxChars) => {
	const lines = [];
	let current = "";

	for (const word of text.split(/\s+/)) {
		if (current && `${current} ${word}`.length > maxChars) {
			lines.push(current);
			current = word;
		} else {
			current = current ? `${current} ${word}` : word;
		}
	}

	if (current) lines.push(current);

	return lines;
};

const parseFeature = (source) => {
	const feature = { title: "", note: "", rules: [] };
	let pendingTags = [];
	let rule = null;
	let scenario = null;
	let lastKeyword = "Given";

	for (const raw of source.split("\n")) {
		const line = raw.trim();

		if (line.startsWith("Feature:")) feature.title = line.slice(8).trim();
		else if (line.startsWith("Tags:")) feature.note = line.slice(5).trim();
		else if (line.startsWith("Rule:")) {
			rule = { title: line.slice(5).trim(), scenarios: [] };
			feature.rules.push(rule);
		} else if (line.startsWith("@")) pendingTags = line.split(/\s+/);
		else if (line.startsWith("Scenario:")) {
			scenario = { title: line.slice(9).trim(), tags: pendingTags, steps: [] };
			pendingTags = [];
			lastKeyword = "Given";
			rule.scenarios.push(scenario);
		} else if (scenario) {
			const step = line.match(/^(Given|When|Then|And|But)\s+(.+)$/);

			if (step) {
				const keyword = step[1] === "And" || step[1] === "But" ? lastKeyword : step[1];
				lastKeyword = keyword;
				scenario.steps.push({ keyword, joiner: step[1], text: step[2] });
			}
		}
	}

	return feature;
};

const parseReport = (source) =>
	new Map(
		[...source.matchAll(/^\| (.+?) \| (@[^|]+) \| (pass|fail|n\/a|untested) \| (.*) \|$/gm)].map((match) => [
			match[1].trim(),
			{ status: match[3], reason: match[4].trim() },
		]),
	);

const svgDocument = (width, height, body, title) =>
	[
		`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXml(title)}">`,
		`<title>${escapeXml(title)}</title>`,
		`<rect width="${width}" height="${height}" fill="${PAPER}"/>`,
		`<g font-family="${FONT}">`,
		body,
		"</g>",
		"</svg>",
		"",
	].join("\n");

const textLines = (lines, x, y, { size, weight = 400, color = INK, lineHeight = size * 1.35, anchor = "start" }) =>
	lines
		.map(
			(line, index) =>
				`<text x="${x}" y="${y + index * lineHeight}" font-size="${size}" font-weight="${weight}" fill="${color}" text-anchor="${anchor}">${escapeXml(line)}</text>`,
		)
		.join("\n");

const pill = (x, y, label, colors) => {
	const width = label.length * 6.6 + 14;

	return {
		width,
		svg: `<rect x="${x}" y="${y}" width="${width}" height="18" rx="9" fill="${colors.fill}" stroke="${colors.stroke}"/>${textLines([label], x + width / 2, y + 13, { size: 11, weight: 600, color: colors.text, anchor: "middle" })}`,
	};
};

const primaryTag = (tags) => (tags.includes("@must") ? "@must" : tags.includes("@should") ? "@should" : tags[0]);

const contractMap = (feature, results) => {
	const columns = 3;
	const cardWidth = 380;
	const gap = 24;
	const margin = 40;
	const chipLineHeight = 16;
	const chipChars = 44;

	const cards = feature.rules.map((rule, index) => {
		const rows = rule.scenarios.map((scenario) => ({ scenario, lines: wrap(scenario.title, chipChars) }));
		const titleLines = wrap(rule.title, 40);
		const height = 38 + titleLines.length * 18 + rows.reduce((sum, row) => sum + row.lines.length * chipLineHeight + 12, 0) + 8;

		return { rule, index, rows, height, titleLines };
	});

	const headerHeight = 150;
	const columnHeights = Array(columns).fill(headerHeight);
	const placed = cards.map((card) => {
		const column = columnHeights.indexOf(Math.min(...columnHeights));
		const x = margin + column * (cardWidth + gap);
		const y = columnHeights[column];
		columnHeights[column] += card.height + gap;

		return { ...card, x, y };
	});

	const width = margin * 2 + columns * cardWidth + (columns - 1) * gap;
	const height = Math.max(...columnHeights) + 20;
	const all = feature.rules.flatMap((rule) => rule.scenarios);
	const count = (tag) => all.filter((scenario) => scenario.tags.includes(tag)).length;

	const legendItems = results
		? Object.entries(STATUS_COLORS).map(([status, colors]) => [status, colors])
		: Object.entries(TAG_COLORS).map(([tag, colors]) => [tag, colors]);

	let legendX = margin;
	const legend = legendItems
		.map(([label, colors]) => {
			const item = pill(legendX, 112, label, colors);
			legendX += item.width + 10;

			return item.svg;
		})
		.join("\n");

	const subtitle = results
		? `${appName}: ${[...results.values()].filter((r) => r.status === "pass").length} pass, ${[...results.values()].filter((r) => r.status === "fail").length} fail, ${[...results.values()].filter((r) => r.status === "n/a").length} n/a. Yellow dashed chips were not run.`
		: `${all.length} scenarios in ${feature.rules.length} rules. ${count("@must")} are @must, the floor. ${count("@should")} @should, ${count("@agent")} @agent.`;

	const header = [
		textLines([results ? `Basic contract: ${appName}` : "Basic: the agent chat contract"], margin, 56, { size: 26, weight: 700 }),
		textLines([subtitle], margin, 86, { size: 14, color: MUTED }),
		legend,
	].join("\n");

	const body = placed
		.map(({ index, rows, height: cardHeight, titleLines, x, y }) => {
			const parts = [
				`<rect x="${x}" y="${y}" width="${cardWidth}" height="${cardHeight}" rx="12" fill="${PAPER}" stroke="${LINE}"/>`,
				`<circle cx="${x + 24}" cy="${y + 26}" r="12" fill="${INK}"/>`,
				textLines([String(index + 1)], x + 24, y + 30, { size: 12, weight: 700, color: PAPER, anchor: "middle" }),
				textLines(titleLines, x + 44, y + 31, { size: 14, weight: 700, lineHeight: 18 }),
			];
			let rowY = y + 32 + titleLines.length * 18;

			for (const { scenario, lines } of rows) {
				const result = results?.get(scenario.title);
				const colors = results ? (result ? STATUS_COLORS[result.status] : STATUS_COLORS.untested) : TAG_COLORS[primaryTag(scenario.tags)];
				const rowHeight = lines.length * chipLineHeight + 8;
				const dashed = results && !result ? ' stroke-dasharray="4 3"' : "";

				parts.push(`<rect x="${x + 14}" y="${rowY}" width="${cardWidth - 28}" height="${rowHeight}" rx="6" fill="${colors.fill}" stroke="${colors.stroke}"${dashed}/>`);
				parts.push(textLines(lines, x + 24, rowY + 16, { size: 12, color: colors.text, lineHeight: chipLineHeight }));

				if (scenario.tags.includes("@agent")) {
					parts.push(textLines(["agent"], x + cardWidth - 22, rowY + 16, { size: 10, weight: 700, color: TAG_COLORS["@agent"].text, anchor: "end" }));
				}

				rowY += rowHeight + 4;
			}

			return parts.join("\n");
		})
		.join("\n");

	return svgDocument(width, height, `${header}\n${body}`, results ? `Basic contract results for ${appName}` : "Basic agent chat contract map");
};

const ruleFlow = (rule, index) => {
	const margin = 40;
		const boxWidth = 300;
	const arrowGap = 36;
	const stepLineHeight = 15;
	const stepChars = 40;
	const keywords = ["Given", "When", "Then"];
	const width = margin * 2 + keywords.length * boxWidth + (keywords.length - 1) * arrowGap;

	const parts = [
		textLines([`Rule ${index + 1}: ${rule.title}`], margin, 52, { size: 22, weight: 700 }),
		textLines(["Each row is one scenario: the situation, what happens, and what must be true after."], margin, 78, { size: 13, color: MUTED }),
	];

	keywords.forEach((keyword, column) => {
		const x = margin + column * (boxWidth + arrowGap);
		parts.push(textLines([keyword.toUpperCase()], x + boxWidth / 2, 112, { size: 11, weight: 700, color: STEP_COLORS[keyword].stroke, anchor: "middle" }));
	});

	let y = 126;

	for (const scenario of rule.scenarios) {
		const groups = keywords.map((keyword) => {
			const steps = scenario.steps.filter((step) => step.keyword === keyword);
			const lines = steps.flatMap((step, stepIndex) => wrap(`${stepIndex === 0 ? "" : `${step.joiner.toLowerCase()} `}${step.text}`, stepChars));

			return { keyword, lines };
		});

		const titleLines = wrap(scenario.title, 90);
		const boxHeight = Math.max(40, ...groups.map((group) => group.lines.length * stepLineHeight + 20));
		const tagColors = TAG_COLORS[primaryTag(scenario.tags)];
		let tagX = margin;

		for (const tag of scenario.tags) {
			const item = pill(tagX, y, tag.slice(1), TAG_COLORS[tag] ?? STATUS_COLORS["n/a"]);
			parts.push(item.svg);
			tagX += item.width + 6;
		}

		parts.push(textLines(titleLines, tagX + 6, y + 14, { size: 14, weight: 600, color: tagColors?.text ?? INK }));
		const boxesY = y + 14 + titleLines.length * 18;

		groups.forEach((group, column) => {
			const x = margin + column * (boxWidth + arrowGap);
			const colors = STEP_COLORS[group.keyword];

			if (group.lines.length === 0) {
				parts.push(`<rect x="${x}" y="${boxesY}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="none" stroke="${LINE}" stroke-dasharray="4 4"/>`);
				parts.push(textLines(["no step"], x + boxWidth / 2, boxesY + boxHeight / 2 + 4, { size: 12, color: MUTED, anchor: "middle" }));
			} else {
				parts.push(`<rect x="${x}" y="${boxesY}" width="${boxWidth}" height="${boxHeight}" rx="8" fill="${colors.fill}" stroke="${colors.stroke}"/>`);
				parts.push(textLines(group.lines, x + 12, boxesY + 22, { size: 12.5, color: colors.text, lineHeight: stepLineHeight }));
			}

			if (column < keywords.length - 1) {
				const ax = x + boxWidth + 6;
				const ay = boxesY + boxHeight / 2;
				parts.push(`<path d="M${ax} ${ay} H${ax + arrowGap - 14}" stroke="${MUTED}" stroke-width="1.5"/>`);
				parts.push(`<path d="M${ax + arrowGap - 14} ${ay - 4} L${ax + arrowGap - 8} ${ay} L${ax + arrowGap - 14} ${ay + 4} Z" fill="${MUTED}"/>`);
			}
		});

		y = boxesY + boxHeight + 30;
	}

	return svgDocument(width, y + 10, parts.join("\n"), `Basic rule ${index + 1}: ${rule.title}`);
};

const feature = parseFeature(readFileSync(join(ROOT, "contract", "chat.feature"), "utf8"));
const reportPath = appName ? join(ROOT, "reports", `${appName}.md`) : null;

if (reportPath && !existsSync(reportPath)) {
	console.error(`no report at reports/${appName}.md; run run.mjs --app=${appName} first`);
	process.exit(2);
}

mkdirSync(join(OUT, "rules"), { recursive: true });

if (appName) {
	const results = parseReport(readFileSync(reportPath, "utf8"));
	writeFileSync(join(OUT, `${appName}.svg`), contractMap(feature, results));
	console.log(`diagrams/${appName}.svg`);
} else {
	writeFileSync(join(OUT, "contract.svg"), contractMap(feature, null));
	console.log("diagrams/contract.svg");

	feature.rules.forEach((rule, index) => {
		const file = `${String(index + 1).padStart(2, "0")}-${slug(rule.title)}.svg`;
		writeFileSync(join(OUT, "rules", file), ruleFlow(rule, index));
		console.log(`diagrams/rules/${file}`);
	});
}
