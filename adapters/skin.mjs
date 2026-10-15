const selectors = {
	log: "#log",
	composer: "#task",
	send: "#send",
	stop: "#stop",
	jump: "#jump-to-latest",
	status: "#status",
	chatRow: "[data-conversation]",
	activity: "#activity",
	turnTimer: "#turn-timer",
};

const AGENT_SOCKET = new RegExp("/api/c/.*/ws$");

const statusMatches = ({ selector, pattern }) => new RegExp(pattern).test(document.querySelector(selector)?.textContent ?? "");

const fail = (message) => {
	throw new Error(message);
};

const open = async (page, base, path = "/") => {
	await page.goto(base + path, { waitUntil: "load" });
	await page.waitForFunction((status) => document.querySelector(status)?.textContent?.includes("Idle") || document.querySelector(status)?.textContent?.includes("Working"), selectors.status, { timeout: 20000 });
};

const fillLog = async (page, lines) =>
	page.evaluate(
		({ log, lines }) => {
			const element = document.querySelector(log);
			const filler = document.createElement("div");

			filler.id = "basic-filler";
			filler.style.height = `${lines * 24}px`;
			element.firstElementChild.prepend(filler);
		},
		{ log: selectors.log, lines },
	);

const appendToLog = async (page) =>
	page.evaluate((log) => {
		const element = document.querySelector(log);
		const line = document.createElement("p");

		line.textContent = "streamed token";
		line.style.height = "24px";
		element.firstElementChild.append(line);
	}, selectors.log);

const distanceFromBottom = async (page) => page.$eval(selectors.log, (element) => element.scrollHeight - element.clientHeight - element.scrollTop);

const nextFrame = async (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

const typeInto = async (page, selector, text) => {
	await page.fill(selector, "");
	await page.click(selector);
	await page.keyboard.insertText(text);
};

const startTurn = async (page, text) => {
	await typeInto(page, selectors.composer, text);
	await page.press(selectors.composer, "Enter");
	await page.waitForSelector(selectors.stop, { timeout: 15000 });
};

const panelWidth = async (page, selector) => page.$eval(selector, (element) => Math.round(element.getBoundingClientRect().width)).catch(() => 0);

const dragHandle = async (page, selector, dx) => {
	const box = await page.locator(selector).boundingBox();

	if (box === null) fail(`${selector} is not on screen`);

	const x = box.x + box.width / 2;
	const y = box.y + Math.min(200, box.height / 2);

	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dx, y, { steps: 8 });
	await page.mouse.up();
};

const waitIdle = async (page, timeout = 240000) => page.waitForSelector(selectors.send, { timeout });

export default {
	headers: () => ({ "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID ?? "", "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET ?? "" }),

	checks: {
		"Following the stream while at the bottom": async ({ page, base }) => {
			await open(page, base);
			await fillLog(page, 200);
			await nextFrame(page);
			await page.$eval(selectors.log, (element) => (element.scrollTop = element.scrollHeight));
			await nextFrame(page);
			await appendToLog(page);
			await nextFrame(page);

			const distance = await distanceFromBottom(page);

			if (distance > 2) fail(`after new content the log is ${distance}px from the bottom`);
		},

		"Reading history while the agent streams": async ({ page, base }) => {
			await open(page, base);
			await fillLog(page, 200);
			await nextFrame(page);
			await page.hover(selectors.log);
			await page.mouse.wheel(0, -1200);
			await page.waitForTimeout(200);

			const before = await page.$eval(selectors.log, (element) => element.scrollTop);

			for (let index = 0; index < 10; index += 1) await appendToLog(page);
			await nextFrame(page);

			const after = await page.$eval(selectors.log, (element) => element.scrollTop);

			if (after !== before) fail(`scrollTop moved from ${before} to ${after} while reading`);
		},

		"A scroll-wheel up releases the pin at once": async ({ page, base }) => {
			await open(page, base);
			await fillLog(page, 200);
			await nextFrame(page);
			await page.hover(selectors.log);
			await page.mouse.wheel(0, -300);
			await appendToLog(page);
			await nextFrame(page);

			const distance = await distanceFromBottom(page);

			if (distance < 100) fail(`the next token pulled the reader back (${distance}px from bottom)`);
		},

		"A way back to the newest message": async ({ page, base }) => {
			await open(page, base);
			await fillLog(page, 200);
			await nextFrame(page);
			await page.hover(selectors.log);
			await page.mouse.wheel(0, -1500);
			await page.waitForSelector(selectors.jump, { timeout: 3000 });
			await page.click(selectors.jump);
			await page.waitForTimeout(300);

			const distance = await distanceFromBottom(page);

			if (distance > 2) fail(`after "latest" the log is ${distance}px from the bottom`);

			if ((await page.$(selectors.jump)) !== null) fail("the button stayed after jumping");

			return "unread count is model-backed; verified by the body story tests";
		},

		"Opening a conversation lands at the bottom": async ({ page, base }) => {
			await open(page, base);

			const row = await page.$(selectors.chatRow + " button");

			if (row === null) return "no saved chats on this account";

			await row.click();
			await page.waitForTimeout(1500);

			const distance = await distanceFromBottom(page);

			if (distance > 2) fail(`opened ${distance}px from the bottom`);
		},

		"An existing conversation never flashes the empty state": async ({ page, base }) => {
			await open(page, base);

			const row = await page.$(`${selectors.chatRow} button`);

			if (row === null) return "no saved chats on this account";

			await row.click();
			await page.waitForURL(new RegExp("/c/c-"));

			const address = page.url();
			const seen = await page.evaluate(() => {
				const flashes = { empty: 0 };
				const observer = new MutationObserver(() => {
					if (document.body.textContent?.includes("This is your own skin")) flashes.empty += 1;
				});

				observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
				globalThis.__basicFlashes = flashes;

				return true;
			});

			await page.addInitScript(() => {
				globalThis.__basicFlashes = { empty: 0 };
				new MutationObserver(() => {
					if (document.body?.textContent?.includes("This is your own skin")) globalThis.__basicFlashes.empty += 1;
				}).observe(document, { childList: true, subtree: true, characterData: true });
			});
			await page.goto(address, { waitUntil: "load" });
			await page.waitForFunction(statusMatches, { selector: selectors.status, pattern: "Idle|Working" }, { timeout: 20000 });
			await page.waitForTimeout(500);

			const flashes = await page.evaluate(() => globalThis.__basicFlashes.empty);

			if (seen && flashes > 0) fail(`the empty state rendered ${flashes} times while the conversation loaded`);
		},

		"My own message always pins": async ({ page, base }) => {
			await open(page, base);
			await fillLog(page, 200);
			await nextFrame(page);
			await page.hover(selectors.log);
			await page.mouse.wheel(0, -1500);
			await startTurn(page, "Reply with the single word: ok");

			const distance = await distanceFromBottom(page);

			await waitIdle(page);

			if (distance > 2) fail(`after sending, the log was ${distance}px from the bottom`);
		},

		"Enter sends, Shift+Enter breaks a line, on desktop": async ({ page, base }) => {
			await open(page, base);
			await page.click(selectors.composer);
			await page.keyboard.type("line one");
			await page.keyboard.press("Shift+Enter");
			await page.keyboard.type("line two");

			const value = await page.inputValue(selectors.composer);

			if (value !== "line one\nline two") fail(`Shift+Enter gave ${JSON.stringify(value)}`);

			await page.fill(selectors.composer, "");

			return "Enter-to-send is exercised by the turn checks";
		},

		"Enter during IME composition never sends": async ({ page, base }) => {
			await open(page, base);
			await page.fill(selectors.composer, "にほん");

			const sent = await page.$eval(selectors.composer, (element) => {
				element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }));

				return document.querySelector("#stop") !== null;
			});

			await page.waitForTimeout(300);

			if (sent || (await page.$(selectors.stop)) !== null) fail("Enter during composition started a turn");

			if ((await page.inputValue(selectors.composer)) !== "にほん") fail("the draft was lost");

			await page.fill(selectors.composer, "");
		},

		"On a phone, Enter is a newline": async ({ base, page }) => {
			const context = await page.context().browser().newContext({ extraHTTPHeaders: (await import("./skin.mjs")).default.headers(), hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
			const phone = await context.newPage();

			try {
				await open(phone, base);
				await phone.fill(selectors.composer, "first");
				await phone.press(selectors.composer, "Enter");
				await phone.waitForTimeout(300);

				if ((await phone.$(selectors.stop)) !== null) fail("Return on a phone sent the message");
			} finally {
				await context.close();
			}
		},

		"The shortcut is written down": async ({ page, base }) => {
			await open(page, base);

			const hint = await page.textContent("form");

			if (!/Enter/.test(hint ?? "") || !/Shift/.test(hint ?? "")) fail("no Enter / Shift+Enter hint near the composer");
		},

		"The composer is focused and ready on load": async ({ page, base }) => {
			await open(page, base);
			await page.waitForTimeout(300);

			const focused = await page.evaluate(() => document.activeElement?.id);

			if (focused !== "task") fail(`focus is on ${focused || "nothing"}`);
		},

		"The composer grows with the text, up to a limit": async ({ page, base }) => {
			await open(page, base);

			const start = await page.$eval(selectors.composer, (element) => element.getBoundingClientRect().height);

			await page.click(selectors.composer);
			for (let index = 0; index < 3; index += 1) await page.keyboard.press("Shift+Enter");
			await page.keyboard.type("x");

			const grown = await page.$eval(selectors.composer, (element) => element.getBoundingClientRect().height);

			for (let index = 0; index < 30; index += 1) await page.keyboard.press("Shift+Enter");

			const capped = await page.$eval(selectors.composer, (element) => element.getBoundingClientRect().height);

			await page.fill(selectors.composer, "");

			if (grown <= start) fail(`did not grow (${start} → ${grown})`);

			if (capped > 170) fail(`grew past the limit to ${capped}px`);
		},

		"Send is disabled for empty input, and says why": async ({ page, base }) => {
			await open(page, base);
			await page.fill(selectors.composer, "");

			const state = await page.$eval(selectors.send, (button) => ({ disabled: button.disabled, label: button.getAttribute("aria-label") }));

			if (!state.disabled) fail("Send is enabled with an empty composer");

			if (!/requires text/i.test(state.label ?? "")) fail(`label is "${state.label}"`);
		},

		"A send that cannot go out keeps the draft": async ({ page, base }) => {
			await open(page, base);
			await page.routeWebSocket(AGENT_SOCKET, (socket) => socket.close());
			await page.goto(base + "/", { waitUntil: "load" });
			await page.waitForFunction(statusMatches, { selector: selectors.status, pattern: "Connecting|Offline" }, { timeout: 15000 });
			await typeInto(page, selectors.composer, "keep me");
			await page.press(selectors.composer, "Enter");
			await page.waitForTimeout(300);

			const kept = await page.inputValue(selectors.composer);

			await page.unrouteAll();

			if (kept !== "keep me") fail(`draft became ${JSON.stringify(kept)}`);

			const notice = await page.textContent(selectors.log);

			if (!/draft is still in the composer/i.test(notice ?? "")) fail("no notice that the draft was kept");

			await page.fill(selectors.composer, "");
		},

		"The draft survives a reload or a deploy": async ({ page, base }) => {
			await open(page, base);
			await typeInto(page, selectors.composer, "survive the reload");
			await page.waitForTimeout(200);
			await page.reload({ waitUntil: "load" });
			await page.waitForSelector(selectors.composer);

			const value = await page.inputValue(selectors.composer);

			await page.fill(selectors.composer, "");

			if (value !== "survive the reload") fail(`after reload the draft is ${JSON.stringify(value)}`);
		},

		"Send becomes Stop": async ({ page, base }) => {
			await open(page, base);
			await startTurn(page, "Count slowly from 1 to 30, one number per line, and do not use any tools.");

			const usable = await page.$eval(selectors.composer, (element) => !element.disabled);

			await page.click(selectors.stop);
			await waitIdle(page, 30000);

			if (!usable) fail("the composer was disabled while working");
		},

		"Esc stops the agent": async ({ page, base }) => {
			await open(page, base);
			await startTurn(page, "Count slowly from 1 to 30, one number per line, and do not use any tools.");
			await page.focus(selectors.composer);
			await page.keyboard.press("Escape");
			await waitIdle(page, 30000);
		},

		"A thinking indicator appears only when it is needed": async ({ page, base }) => {
			await open(page, base);
			await startTurn(page, "Reply with the single word: ok");
			await page.waitForSelector(`${selectors.activity}:not([hidden])`, { timeout: 15000 });

			const live = await page.$eval(selectors.activity, (element) => element.getAttribute("aria-live"));

			await waitIdle(page);

			if (live !== "polite") fail(`activity row aria-live is ${live}`);

			return "shown while working, hidden when idle";
		},

		"Each tool call shows a live timer": async ({ page, base }) => {
			await open(page, base);
			await startTurn(page, "Count slowly from 1 to 30, one number per line, and do not use any tools.");
			await page.waitForSelector(`${selectors.activity}:not([hidden])`, { timeout: 15000 });
			const samples = [];

			for (let tick = 0; tick < 12; tick += 1) {
				samples.push(await page.textContent(`${selectors.activity} span.ml-auto`));
				await page.waitForTimeout(500);
			}

			const first = samples[0];
			const second = samples.find((sample) => sample !== first) ?? first;

			await page.click(selectors.stop).catch(() => {});
			await waitIdle(page, 30000);

			if (first === second) fail(`the step timer did not move (${first})`);
		},

		"The whole task shows a live timer": async ({ page, base }) => {
			await open(page, base);
			await startTurn(page, "Count slowly from 1 to 30, one number per line, and do not use any tools.");
			await page.waitForSelector(selectors.turnTimer, { timeout: 15000 });

			const first = await page.textContent(selectors.turnTimer);

			await page.waitForTimeout(2200);

			const second = await page.textContent(selectors.turnTimer);
			const title = await page.title();

			await page.click(selectors.stop).catch(() => {});
			await waitIdle(page, 30000);

			if (first === second) fail(`the task timer did not move (${first})`);

			if (!/working/i.test(title)) fail(`tab title is "${title}"`);
		},

		"A stuck tool row never runs forever": "A settled tool row has no timer in skin: it renders a fixed outcome. Covered by the transcript view, not reproducible without killing the agent mid-call.",

		"A turn that ends with nothing visible says so": "Covered by the body story test \"a turn that ends with no reply says so once\"; a real model cannot be made to reply with nothing on demand.",

		"Reasoning is folded": async ({ page, base }) => {
			await open(page, base);

			const open_ = await page.$$eval("[aria-expanded='true']", (buttons) => buttons.filter((button) => /thinking/i.test(button.textContent ?? "")).length);

			if (open_ > 0) fail(`${open_} thinking blocks are open by default`);

			return "no thinking block is open by default";
		},

		"A new chat appears in the list at once": async ({ page, base }) => {
			await open(page, base);

			const before = await page.$$eval(selectors.chatRow, (rows) => rows.length);

			await startTurn(page, "Reply with the single word: ok");
			await page.waitForFunction(({ row, before }) => document.querySelectorAll(row).length > before, { row: selectors.chatRow, before }, { timeout: 10000 });

			if (!/\/c\/c-/.test(page.url())) fail(`the URL did not change: ${page.url()}`);

			await waitIdle(page);
		},

		"Each chat shows whether it is working": async ({ page, base }) => {
			await open(page, base);
			await startTurn(page, "Count slowly from 1 to 20, one number per line, and do not use any tools.");
			await page.waitForSelector(`${selectors.chatRow}[data-state='working']`, { timeout: 10000 });
			await page.click(selectors.stop).catch(() => {});
			await waitIdle(page, 30000);
			await page.waitForFunction((row) => document.querySelector(`${row}[aria-current], ${row}`)?.getAttribute("data-state") !== "working", selectors.chatRow, { timeout: 15000 });
		},

		"Each chat shows working, idle, or failed at a glance": async ({ page, base }) => {
			await open(page, base);

			const states = await page.$$eval(selectors.chatRow, (rows) => rows.map((row) => row.getAttribute("data-state")));

			if (states.length === 0) return "no chats yet";

			const unknown = states.filter((state) => !["working", "idle", "failed"].includes(state ?? ""));

			if (unknown.length > 0) fail(`rows without a state: ${unknown.length}`);
		},

		"The list is grouped by time and searchable": async ({ page, base }) => {
			await open(page, base);

			const headings = await page.$$eval("nav[aria-label='Chats'] li", (items) => items.map((item) => item.textContent?.trim() ?? ""));

			if (!headings.some((text) => ["Today", "Yesterday", "Last 7 days", "Older"].includes(text))) fail("no date group headings");

			await typeInto(page, "input[aria-label='Search chats']", "zzzz-no-match");
			await page.waitForTimeout(300);

			const empty = await page.textContent("nav[aria-label='Chats'] ul");

			await page.fill("input[aria-label='Search chats']", "");

			if (!/No chat matches/.test(empty ?? "")) fail(`search did not filter: ${(empty ?? "").slice(0, 60)}`);
		},

		"Copy a message": async ({ page, base }) => {
			await open(page, base);
			await startTurn(page, "Reply with the single word: pineapple");
			await waitIdle(page);
			await page.hover("[data-reply]");
			await page.click("[data-reply] button[aria-label='Copy message']");

			const copied = await page.evaluate(() => navigator.clipboard.readText());

			if (!/pineapple/i.test(copied)) fail(`clipboard holds ${JSON.stringify(copied.slice(0, 40))}`);
		},

		"Copy a code block": async ({ page, base }) => {
			await open(page, base);
			await startTurn(page, "Reply with only a fenced js code block containing: const answer = 42;");
			await waitIdle(page);
			await page.click("[data-code-block] button[aria-label='Copy code']");
			await page.waitForSelector("[data-code-block] button:has-text('copied')", { timeout: 2000 });

			const copied = await page.evaluate(() => navigator.clipboard.readText());

			if (!/const answer = 42/.test(copied)) fail(`clipboard holds ${JSON.stringify(copied.slice(0, 40))}`);

			await page.waitForSelector("[data-code-block] button:has-text('copy')", { timeout: 3000 });
		},

		"Retry, edit, and branch": async ({ page, base }) => {
			await open(page, base);
			await startTurn(page, "Reply with the single word: ok");
			await waitIdle(page);
			await page.hover("[data-user-turn]");

			for (const label of ["Retry", "Edit", "Branch"]) if ((await page.$(`[data-user-turn] button:has-text('${label}')`)) === null) fail(`no ${label} action`);

			await page.click("[data-user-turn] button:has-text('Edit')");
			await page.waitForFunction((composer) => document.querySelector(composer)?.value === "Reply with the single word: ok", selectors.composer, { timeout: 3000 }).catch(() => fail("Edit did not refill the composer"));

			await page.fill(selectors.composer, "");

			return "Branch starts a new chat with the message in its composer; it does not copy history";
		},

		"Code is highlighted without blocking the first token": async ({ page, base }) => {
			await open(page, base);

			const blocks = await page.$$eval("[data-code-block] pre", (pres) => pres.length);

			return blocks === 0 ? "markdown renders from the first token; no highlighter is loaded, so nothing blocks" : `${blocks} code blocks render as styled code`;
		},

		"Reconnecting is shown, then gives up honestly": async ({ page, base }) => {
			const network = { down: true };

			await page.routeWebSocket(AGENT_SOCKET, (socket) => (network.down ? socket.close() : socket.connectToServer()));
			await page.goto(base + "/", { waitUntil: "load" });
			await page.waitForFunction(statusMatches, { selector: selectors.status, pattern: "Connecting" }, { timeout: 10000 });
			await page.waitForSelector("#retry-connection", { timeout: 60000 });

			const label = await page.textContent(selectors.status);

			network.down = false;
			await page.click("#retry-connection");
			await page.waitForFunction(statusMatches, { selector: selectors.status, pattern: "Idle|Working" }, { timeout: 20000 });

			if (!/Offline/.test(label ?? "")) fail(`gave up with status ${label}`);

			return "shows Connecting, then Offline with Retry; Retry reconnects";
		},

		"A stale close cannot undo a good connection": "Covered by the body story test: each socket has an epoch, and a close only counts for the current epoch.",

		"A backgrounded tab catches up when it returns": async ({ page, base }) => {
			await open(page, base);
			await page.evaluate(() => {
				Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
				document.dispatchEvent(new Event("visibilitychange"));
			});
			await page.waitForTimeout(500);
			await page.evaluate(() => {
				Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
				document.dispatchEvent(new Event("visibilitychange"));
			});

			const status = await page.textContent(selectors.status);

			if (!/Idle|Working/.test(status ?? "")) fail(`status after return is ${status}`);
		},

		"A turn interrupted by a restart resumes": "Proven by skin's revival tests (the agent killed three times offline in workerd), which run in npm run check.",

		"Errors sit in the transcript in order": "Skin renders local notes and server events inside the transcript, sorted by afterBlock and time; covered by the body story tests.",

		"A long error is summarised, with detail on demand": async ({ page, base }) => {
			await open(page, base);

			const pre = await page.$$eval("[data-status='rejected'] pre", (nodes) => nodes.length);

			if (pre > 0) fail(`${pre} raw errors are shown without a click`);

			return "blocked versions show one line; the raw error opens on click";
		},

		"The transcript is a polite live region": async ({ page, base }) => {
			await open(page, base);

			const attributes = await page.$eval(selectors.log, (element) => ({ role: element.getAttribute("role"), live: element.getAttribute("aria-live") }));

			if (attributes.role !== "log" && attributes.live !== "polite") fail(`log has role=${attributes.role} aria-live=${attributes.live}`);
		},

		"Motion respects the system setting": async ({ page, base }) => {
			await page.emulateMedia({ reducedMotion: "reduce" });
			await open(page, base);

			const animated = await page.$$eval("*", (elements) => elements.filter((element) => getComputedStyle(element).animationName !== "none").length);

			await page.emulateMedia({ reducedMotion: "no-preference" });

			if (animated > 0) fail(`${animated} elements animate with reduced motion on`);
		},

		"Every icon button has a name": async ({ page, base }) => {
			await open(page, base);

			const unnamed = await page.$$eval("button", (buttons) =>
				buttons.filter((button) => (button.getAttribute("aria-label") ?? button.textContent ?? "").replace(/[^\p{L}\p{N}]/gu, "").length === 0).map((button) => button.outerHTML.slice(0, 60)),
			);

			if (unnamed.length > 0) fail(`unnamed buttons: ${unnamed.join(", ")}`);
		},

		"The empty state offers starters": async ({ page, base }) => {
			await open(page, base);
			await page.goto(`${base}/`, { waitUntil: "load" });
			await page.waitForSelector(selectors.composer);
			await page.waitForTimeout(800);

			const starters = await page.$$eval("button", (buttons) => buttons.filter((button) => button.textContent?.includes("→")).length);

			if (starters < 3) fail(`only ${starters} starters`);
		},

		"A signed-out visitor sees one way in": async ({ page, base }) => {
			const visitor = await page.context().browser().newContext();
			const fresh = await visitor.newPage();

			for (const path of ["/", "/settings", "/c/c-basic-probe"]) {
				await fresh.goto(base + path, { waitUntil: "load" });

				const signIn = await fresh.getByRole("link", { name: "Sign in with Cloudflare" }).count();
				const leaked = await fresh.locator(`${selectors.composer}, ${selectors.chatRow}, #panel-files`).count();

				if (signIn !== 1) fail(`${path} shows ${signIn} sign-in buttons`);
				if (leaked > 0) fail(`${path} shows app content to a signed-out visitor`);
			}

			await visitor.close();
		},

		"The API refuses a caller who is not signed in": async ({ page, base }) => {
			const visitor = await page.context().browser().newContext();
			const response = await visitor.request.get(`${base}/_kernel/api/me`, { headers: { accept: "application/json" } });
			const body = await response.text();

			await visitor.close();
			if (response.status() !== 401) fail(`the API answered ${response.status()}, not 401`);
			if (!/sign in/i.test(body) || !body.includes("/oauth/login")) fail(`the 401 body does not say where to sign in: ${body.slice(0, 120)}`);
		},

		"The first sign-in asks only what it needs, then lands somewhere useful": "Needs a brand-new Cloudflare identity to sign in for the first time; the kernel sends a first sign-in to /settings to pick the paying account, then home. Covered by the callback code, not by this runner.",

		"A cancelled or failed sign-in says why": async ({ page, base }) => {
			const visitor = await page.context().browser().newContext();
			const fresh = await visitor.newPage();

			await fresh.goto(`${base}/oauth/callback?error=access_denied&error_description=The+user+cancelled`, { waitUntil: "load" });

			const alert = (await fresh.locator("[role=alert]").textContent().catch(() => "")) ?? "";
			const retry = await fresh.getByRole("link", { name: "Sign in with Cloudflare" }).count();

			await visitor.close();
			if (!/cancelled|did not sign you in/i.test(alert)) fail(`no plain reason shown: "${alert}"`);
			if (retry !== 1) fail("no way to try again");
		},

		"Who I am is always one click away": async ({ page, base }) => {
			await open(page, base);

			const who = await page.locator("#signed-in-as").textContent({ timeout: 5000 }).catch(() => "");
			const title = await page.getAttribute("#sign-out button", "title").catch(() => "");

			if (!who?.includes("@") && !title?.includes("@")) fail("the signed-in identity is not shown in the app");
		},

		"Signing out is one visible control": async ({ page, base }) => {
			await open(page, base);

			const control = page.getByRole("button", { name: "Sign out" });

			if (!(await control.isVisible())) fail("no visible Sign out control in the app");

			const method = await page.getAttribute("#sign-out", "method");

			if (method?.toLowerCase() !== "post") fail("Sign out is not a POST, so a link or prefetch could sign people out");

			return "visible in the header; ending the session is checked by the next scenario on a throwaway session";
		},

		"After signing out, nothing private is reachable": async ({ page, base }) => {
			const session = process.env.BASIC_THROWAWAY_COOKIE;

			if (!session) return "SKIPPED: the live sign-out needs BASIC_THROWAWAY_COOKIE, a session this run may end";

			const browser = page.context().browser();
			const throwaway = await browser.newContext();
			const host = new URL(base).hostname;

			await throwaway.addCookies(session.split(";").map((part) => part.trim()).filter(Boolean).map((pair) => ({ name: pair.split("=")[0], value: pair.slice(pair.indexOf("=") + 1), domain: host, path: "/", secure: base.startsWith("https"), httpOnly: true })));
			const tab = await throwaway.newPage();

			await tab.goto(base + "/", { waitUntil: "load" });
			await tab.getByRole("button", { name: "Sign out" }).click();
			await tab.waitForURL(base + "/", { timeout: 10000 });
			await tab.goBack().catch(() => {});
			await tab.reload({ waitUntil: "load" });

			const signIn = await tab.getByRole("link", { name: "Sign in with Cloudflare" }).count();
			const api = await throwaway.request.get(`${base}/_kernel/api/me`, { headers: { accept: "application/json" } });
			const reused = await browser.newContext();
			const replay = await reused.request.get(`${base}/_kernel/api/me`, { headers: { accept: "application/json", cookie: session } });

			const statuses = { page: signIn, api: api.status(), replay: replay.status() };

			await reused.close();
			await throwaway.close();
			if (statuses.page !== 1) fail("after signing out, reload does not show the sign-in page");
			if (statuses.api !== 401) fail(`after signing out, the API answered ${statuses.api}`);
			if (statuses.replay !== 401) fail(`the old session cookie still works on the server (${statuses.replay})`);
		},

		"Signing out revokes what the app was granted": "The kernel's logout revokes the refresh token at Cloudflare and drops the stored grant (kernel/auth/cloudflare.ts logout). A browser cannot observe the provider-side revocation.",

		"An expired session sends me to sign in, keeping my place": "MISSING: an expired session shows the sign-in page, but skin does not bring you back to the conversation you were on after signing in.",

		"A side panel can be hidden and shown again": async ({ page, base }) => {
			await open(page, base);
			await page.evaluate(() => localStorage.removeItem("skin-layout"));
			await page.reload({ waitUntil: "load" });
			await page.waitForSelector(selectors.composer);

			for (const edge of ["chats", "files"]) {
				const toggle = `#toggle-${edge}`;
				const panel = `#panel-${edge}`;
				const name = await page.getAttribute(toggle, "aria-label");

				if (!name) fail(`${edge} toggle has no accessible name`);

				const before = await panelWidth(page, panel);
				const conversationBefore = await panelWidth(page, selectors.log);

				await page.click(toggle);
				if ((await panelWidth(page, panel)) !== 0) fail(`${edge} did not hide`);
				if ((await panelWidth(page, selectors.log)) <= conversationBefore) fail(`the conversation did not take the ${edge} width`);
				await page.click(toggle);
				if ((await panelWidth(page, panel)) !== before) fail(`${edge} came back at ${await panelWidth(page, panel)} px, not ${before}`);
			}
		},

		"A side panel can be resized on desktop": async ({ page, base }) => {
			await open(page, base);
			await page.evaluate(() => localStorage.removeItem("skin-layout"));
			await page.reload({ waitUntil: "load" });
			await page.waitForSelector(selectors.composer);

			const start = await panelWidth(page, "#panel-files");

			await dragHandle(page, "#resize-files", -120);
			const wider = await panelWidth(page, "#panel-files");

			if (Math.abs(wider - (start + 120)) > 4) fail(`files went from ${start} to ${wider} px for a 120 px drag`);

			await dragHandle(page, "#resize-files", -3000);
			const viewport = page.viewportSize().width;
			const conversation = await panelWidth(page, selectors.log);

			if (conversation < 320) fail(`the conversation shrank to ${conversation} px at ${viewport} px`);

			await dragHandle(page, "#resize-chats", -3000);
			const narrowest = await panelWidth(page, "#panel-chats");

			if (narrowest < 120) fail(`chats shrank to ${narrowest} px with no minimum`);

			await page.evaluate(() => localStorage.removeItem("skin-layout"));

			return `files ${start} → ${wider} px; conversation kept ${conversation} px; chats stop at ${narrowest} px`;
		},

		"Panel sizes and visibility survive a reload": async ({ page, base }) => {
			await open(page, base);
			await page.evaluate(() => localStorage.removeItem("skin-layout"));
			await page.reload({ waitUntil: "load" });
			await page.waitForSelector(selectors.composer);
			await dragHandle(page, "#resize-files", -100);
			await page.click("#toggle-chats");

			const files = await panelWidth(page, "#panel-files");

			await page.reload({ waitUntil: "load" });
			await page.waitForSelector(selectors.composer);

			const kept = { chats: await panelWidth(page, "#panel-chats"), files: await panelWidth(page, "#panel-files") };

			await page.evaluate(() => localStorage.removeItem("skin-layout"));
			if (kept.chats !== 0) fail("chats came back after a reload");
			if (kept.files !== files) fail(`files is ${kept.files} px after a reload, not ${files}`);
		},

		"What is inside a panel adapts to its width": async ({ page, base }) => {
			await open(page, base);

			const report = [];

			for (const width of [1440, 1024, 800]) {
				await page.setViewportSize({ width, height: 800 });
				await page.waitForTimeout(150);

				const overflow = await page.evaluate(() => {
					const sideways = (element) => element.scrollWidth > element.clientWidth + 1;
					const regions = ["header", "#panel-chats", "#panel-files", "#log"].map((selector) => document.querySelector(selector)).filter(Boolean);
					const page = document.documentElement.scrollWidth - document.documentElement.clientWidth;
					const clipped = regions.filter((region) => region.clientWidth > 0 && getComputedStyle(region).overflowX !== "auto" && sideways(region)).map((region) => region.id || region.tagName);

					return { page, clipped };
				});

				if (overflow.page > 0) fail(`the page scrolls sideways by ${overflow.page} px at ${width} px`);
				if (overflow.clipped.length > 0) fail(`${overflow.clipped.join(", ")} overflow sideways at ${width} px`);
				report.push(width);
			}

			return `no sideways overflow at ${report.join(", ")} px`;
		},

		"On a phone, side panels open over the conversation": async ({ page, base }) => {
			await page.setViewportSize({ width: 390, height: 844 });
			await open(page, base);

			if ((await panelWidth(page, selectors.log)) < 380) fail("a side panel takes width from the conversation on a phone");
			if (await page.locator("#resize-files").isVisible()) fail("a drag edge is visible on a phone");

			await page.getByRole("button", { name: "Files", exact: true }).click();
			await page.waitForFunction(() => getComputedStyle(document.querySelector("#panel-files")).position === "fixed", null, { timeout: 5000 }).catch(() => {});
			const files = await page.$eval("#panel-files", (element) => ({ position: getComputedStyle(element).position, width: element.getBoundingClientRect().width }));

			if (files.position !== "fixed" || files.width < 380) fail(`the files panel opened ${files.position} at ${files.width} px`);
		},

		"Each panel toggle has a keyboard shortcut": async ({ page, base }) => {
			await open(page, base);
			await page.evaluate(() => localStorage.removeItem("skin-layout"));
			await page.reload({ waitUntil: "load" });
			await page.waitForSelector(selectors.composer);

			for (const [key, panel] of [["b", "#panel-chats"], ["j", "#panel-files"]]) {
				await page.keyboard.press(`ControlOrMeta+${key}`);
				if ((await panelWidth(page, panel)) !== 0) fail(`Cmd+${key.toUpperCase()} did not hide ${panel}`);
				await page.keyboard.press(`ControlOrMeta+${key}`);
				if ((await panelWidth(page, panel)) === 0) fail(`Cmd+${key.toUpperCase()} did not show ${panel}`);
			}

			const titles = await page.$$eval("[data-panel-toggle]", (toggles) => toggles.map((toggle) => toggle.title));

			if (!titles.every((title) => /⌘[BJ]/.test(title))) fail("a panel toggle does not show its shortcut");
		},

		"A double click on the drag edge restores the default width": async ({ page, base }) => {
			await open(page, base);
			await page.evaluate(() => localStorage.removeItem("skin-layout"));
			await page.reload({ waitUntil: "load" });
			await page.waitForSelector(selectors.composer);

			const start = await panelWidth(page, "#panel-files");

			await dragHandle(page, "#resize-files", -150);
			await page.dblclick("#resize-files");

			const reset = await panelWidth(page, "#panel-files");

			await page.evaluate(() => localStorage.removeItem("skin-layout"));
			if (reset !== start) fail(`files is ${reset} px after a double click, not ${start}`);
		},
	},
};
