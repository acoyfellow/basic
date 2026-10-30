import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT_REPO = join(dirname(ROOT), "port");
const BASIC = process.env.BASIC_URL ?? "https://basic.customer0.dev";
const PORT = process.env.PORT_URL ?? "https://port.customer0.dev";
const SCENARIOS = 70;

const PALETTE = new Set(["30,20,70", "228,220,255", "165,147,255", "124,92,255", "141,122,217", "179,165,236", "196,184,245", "20,12,50", "255,255,255", "0,0,0"]);

const results = [];

const record = (name, ok, detail) => {
	results.push({ name, ok, detail });
	console.log(`${ok ? "ok  " : "FAIL"} ${name}: ${detail}`);
};

const conformance = () => {
	const skip = process.argv.includes("--skip-conformance");
	if (skip) {
		const report = readFileSync(join(ROOT, "reports", "reference.md"), "utf8");
		const line = report.split("\n").find((each) => each.startsWith("pass ")) ?? "";
		const counts = Object.fromEntries([...line.matchAll(/(pass|fail|n\/a|untested) (\d+)/g)].map((match) => [match[1], Number(match[2])]));
		const live = report.includes("basic.customer0.dev") || process.env.BASIC_URL === undefined;
		record("conformance (from report)", counts.pass === SCENARIOS && counts.fail === 0 && counts["n/a"] === 0 && counts.untested === 0 && live, line);
		return;
	}
	const run = spawnSync("node", ["run.mjs", "--app=reference"], { cwd: ROOT, env: { ...process.env, BASE: BASIC }, encoding: "utf8", maxBuffer: 1 << 24, stdio: ["ignore", "pipe", "inherit"] });
	process.stdout.write(run.stdout ?? "");
	const summary = (run.stdout ?? "").split("\n").find((line) => line.startsWith("pass ")) ?? "no summary";
	const counts = Object.fromEntries([...summary.matchAll(/(pass|fail|n\/a|untested) (\d+)/g)].map((match) => [match[1], Number(match[2])]));
	const ok = counts.pass === SCENARIOS && counts.fail === 0 && counts["n/a"] === 0 && counts.untested === 0;
	record(`conformance against ${BASIC}`, ok, summary);
	if (!ok) for (const line of (run.stdout ?? "").split("\n").filter((each) => /^fail|^untested/.test(each))) console.log(`     ${line}`);
};

const thumbnails = async (page) => {
	await page.goto(PORT, { waitUntil: "load" });
	const cards = await page.$$eval("a.card.entry", (links) => links.map((link) => ({ slug: link.getAttribute("data-entry"), svg: link.querySelector("[data-thumb] svg") !== null })));
	const missing = cards.filter((card) => !card.svg).map((card) => card.slug);
	record("port directory thumbnails", cards.length > 0 && missing.length === 0, `${cards.length - missing.length}/${cards.length} cards have an SVG thumbnail${missing.length > 0 ? `; missing ${missing.join(", ")}` : ""}`);
};

const logos = async (page) => {
	const sites = [
		{ name: "port", url: PORT, selector: "a[data-sign-in='cloudflare']" },
		{ name: "port sign-in page", url: `${PORT}/sign-in`, selector: "a[data-sign-in='cloudflare']" },
		{ name: "basic", url: BASIC, selector: "a[data-sign-in='cloudflare']" },
	];
	for (const site of sites) {
		await page.goto(site.url, { waitUntil: "load" });
		await page.waitForSelector(site.selector, { timeout: 15000 }).catch(() => {});
		const image = await page.$eval(`${site.selector} img`, (img) => ({ src: img.getAttribute("src") ?? "", loaded: img.complete && img.naturalWidth > 0 })).catch(() => null);
		if (image === null) {
			record(`${site.name} Cloudflare mark`, false, "no sign-in button with an image");
			continue;
		}
		const svg = await page.request.get(new URL(image.src, site.url).toString());
		const body = await svg.text();
		const official = svg.ok() && body.includes("<svg") && body.includes("#ff9910") && body.includes("M53.12 13.125");
		record(`${site.name} Cloudflare mark`, official && image.loaded, `${image.src} ${official ? "is the official cloud mark" : "is not the official cloud mark"}${image.loaded ? "" : ", not loaded"}`);
	}
};

const palette = async (page) => {
	await page.goto(PORT, { waitUntil: "load" });
	const colors = await page.$$eval(".blueprint, .blueprint *", (elements) => {
		const found = new Set();
		const take = (value) => {
			for (const match of value.matchAll(/rgba?\(([^)]+)\)/g)) {
				const parts = match[1].split(/[ ,/]+/).filter(Boolean).map(Number);
				if (parts.length >= 4 && parts[3] === 0) continue;
				found.add(parts.slice(0, 3).join(","));
			}
		};
		for (const element of elements) {
			const style = getComputedStyle(element);
			for (const property of ["color", "backgroundColor", "borderTopColor", "fill", "stroke", "backgroundImage"]) take(style[property]);
		}
		return [...found];
	});
	const off = colors.filter((color) => !PALETTE.has(color));
	record("How it works panel palette", colors.length > 0 && off.length === 0, off.length === 0 ? `${colors.length} colours, all brand violet` : `off-palette: ${off.join(" | ")}`);
};

const portTests = () => {
	const run = spawnSync("npx", ["vitest", "run"], { cwd: PORT_REPO, encoding: "utf8" });
	const line = `${run.stdout}${run.stderr}`.split("\n").find((each) => /Tests\s+\d/.test(each))?.trim() ?? "no summary";
	record("port vitest", run.status === 0, line);
};

conformance();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
await thumbnails(page);
await logos(page);
await palette(page);
await browser.close();
portTests();

const failed = results.filter((result) => !result.ok);
console.log(`\ngate: ${failed.length === 0 ? "PASS" : `FAIL (${failed.length})`}`);
console.log(`basic commit ${execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim()}`);
process.exit(failed.length === 0 ? 0 : 1);
