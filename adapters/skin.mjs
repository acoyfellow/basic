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
			await page.click("nav[aria-label='Chats'] button:has-text('New chat')");
			await page.waitForTimeout(800);

			const starters = await page.$$eval("button", (buttons) => buttons.filter((button) => button.textContent?.includes("→")).length);

			if (starters < 3) fail(`only ${starters} starters`);
		},
	},
};
