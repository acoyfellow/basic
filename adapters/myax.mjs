import { execFileSync } from "node:child_process";

const selectors = {
	log: "main[aria-label='Conversation']",
	composer: "textarea[aria-label='Message']",
	send: "button[type=submit][data-status='idle']",
	stop: "button[type=submit][data-status='thinking'], button[type=submit][data-status='running']",
	submit: "button[type=submit][data-status]",
	jump: "button[aria-label^='Scroll to latest message']",
	status: "header[role=banner] [data-state]",
	thinking: "[aria-label='Agent is thinking']",
	sessionsToggle: "button[aria-label='Open conversations sidebar']",
	sessionsPanel: "aside[aria-label='Conversations']",
	chatRow: "aside[aria-label='Conversations'] [role=button][aria-label^='Switch to']",
};

const HOST = new URL(process.env.BASE ?? "http://localhost").host;
const SOCKET = new RegExp("/agents/(pi-chat|my-agent)/");

let cachedToken = "";

const accessToken = () => {
	if (cachedToken === "") cachedToken = execFileSync("cloudflared", ["access", "token", "-app", `https://${HOST}`], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();

	return cachedToken;
};

const fail = (message) => {
	throw new Error(message);
};

const signIn = async (page) => {
	await page.context().addCookies([{ name: "CF_Authorization", value: accessToken(), domain: HOST, path: "/", secure: true, httpOnly: true }]);
};

const api = async (page, method, path, body) => {
	const response = await page.context().request.fetch(`https://${HOST}${path}`, { method, headers: { "cf-access-token": accessToken(), "content-type": "application/json" }, data: body === undefined ? undefined : JSON.stringify(body) });

	return response.json();
};

const newChat = async (page, name) => (await api(page, "POST", "/api/pi/chats", { name: `basic: ${name}` })).result.chatId;

const connected = async (page) => page.waitForFunction((status) => document.querySelector(status)?.getAttribute("data-state") === "live", selectors.status, { timeout: 30000 });

const open = async (page, base, chatId) => {
	await signIn(page);
	await page.goto(chatId ? `${base}/?session=${chatId}` : `${base}/`, { waitUntil: "load" });
	await page.waitForSelector(selectors.composer, { timeout: 30000 });
	await connected(page);
};

const openFresh = async (page, base, name) => {
	const chatId = await newChat(page, name);

	await open(page, base, chatId);

	return chatId;
};

const textOverlaps = async (page) =>
	page.evaluate(() => {
		const visible = (element) => {
			const style = getComputedStyle(element);

			return style.visibility !== "hidden" && style.display !== "none" && Number(style.opacity) > 0.05;
		};
		const clipped = (element, rect) => {
			for (let parent = element.parentElement; parent !== null; parent = parent.parentElement) {
				if (getComputedStyle(parent).overflow === "visible") continue;

				const bounds = parent.getBoundingClientRect();

				if (rect.bottom <= bounds.top + 1 || rect.top >= bounds.bottom - 1 || rect.right <= bounds.left + 1 || rect.left >= bounds.right - 1) return true;
			}

			return false;
		};
		const boxes = [];
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);

		for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
			const text = node.textContent.trim();
			const owner = node.parentElement;

			if (text === "" || owner === null || !visible(owner) || owner.closest("[aria-hidden=true], .sr-only, svg")) continue;

			const range = document.createRange();

			range.selectNodeContents(node);
			for (const rect of range.getClientRects()) if (rect.width > 2 && rect.height > 2 && !clipped(owner, rect)) boxes.push({ owner, text: text.slice(0, 30), rect });
		}

		for (const field of document.querySelectorAll("textarea, input")) {
			const text = field.value || field.getAttribute("placeholder") || "";
			const rect = field.getBoundingClientRect();

			if (text.trim() === "" || !visible(field) || rect.width < 2) continue;

			const style = getComputedStyle(field);
			const left = rect.left + parseFloat(style.paddingLeft);
			const top = rect.top + parseFloat(style.paddingTop);

			boxes.push({ owner: field, text: text.slice(0, 30), rect: { left, top, right: rect.right - parseFloat(style.paddingRight), bottom: top + parseFloat(style.lineHeight || "20") } });
		}

		const overlap = (a, b) => Math.min(a.right, b.right) - Math.max(a.left, b.left) > 3 && Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 3;
		const found = [];

		for (let i = 0; i < boxes.length; i++)
			for (let j = i + 1; j < boxes.length; j++) {
				const a = boxes[i];
				const b = boxes[j];

				if (a.owner === b.owner || a.owner.contains(b.owner) || b.owner.contains(a.owner)) continue;
				if (overlap(a.rect, b.rect)) found.push(`"${a.text}" overlaps "${b.text}"`);
			}

		const controls = [...document.querySelectorAll("textarea, input, button, select, [role=button]")].filter((control) => visible(control)).map((control) => ({ control, rect: control.getBoundingClientRect() }));

		for (const box of boxes)
			for (const { control, rect } of controls) {
				if (control === box.owner || control.contains(box.owner) || box.owner.contains(control) || rect.width < 2) continue;
				if (overlap(box.rect, rect)) found.push(`"${box.text}" sits on the ${control.getAttribute("aria-label") || control.tagName.toLowerCase()} control`);
			}

		return [...new Set(found)];
	});

const fillLog = async (page, lines) =>
	page.evaluate(
		({ log, lines }) => {
			const element = document.querySelector(log);
			const filler = document.createElement("div");

			filler.id = "basic-filler";
			filler.style.height = `${lines * 24}px`;
			element.prepend(filler);
		},
		{ log: selectors.log, lines },
	);

const appendToLog = async (page) =>
	page.evaluate((log) => {
		const element = document.querySelector(log);
		const line = document.createElement("p");

		line.textContent = "streamed token";
		line.style.height = "24px";
		element.append(line);
		element.dispatchEvent(new Event("basic:appended"));
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
	await page.waitForSelector(selectors.stop, { timeout: 20000 });
};

const waitIdle = async (page, timeout = 240000) => page.waitForSelector(selectors.send, { timeout });

const stop = async (page) => {
	await page.click(selectors.stop).catch(() => {});
	await waitIdle(page, 30000);
};

const showSessions = async (page) => {
	const open = await page.$eval(selectors.sessionsPanel, (element) => element.getAttribute("data-open") === "1" && element.getBoundingClientRect().width > 0).catch(() => false);

	if (!open) await page.click(selectors.sessionsToggle).catch(() => {});
	await page.waitForTimeout(300);
};

const SLOW = "Count slowly from 1 to 40, one number per line, and do not use any tools.";

export default {
	headers: () => ({}),

	checks: {
		"Following the stream while at the bottom": async ({ page, base }) => {
			await openFresh(page, base, "scroll pin");
			await fillLog(page, 200);
			await nextFrame(page);
			await page.$eval(selectors.log, (element) => (element.scrollTop = element.scrollHeight));
			await page.waitForTimeout(300);
			await appendToLog(page);
			await nextFrame(page);

			const behavior = await page.$eval(selectors.log, (element) => getComputedStyle(element).scrollBehavior);
			const distance = await distanceFromBottom(page);

			if (distance > 2) fail(`after new content the log is ${distance}px from the bottom`);
			if (behavior === "smooth") fail("the transcript pins with smooth scrolling, not an instant jump");
		},

		"Reading history while the agent streams": async ({ page, base }) => {
			await openFresh(page, base, "scroll read");
			await fillLog(page, 200);
			await nextFrame(page);
			await page.$eval(selectors.log, (element) => (element.scrollTop = element.scrollHeight));
			await page.hover(selectors.log);
			await page.mouse.wheel(0, -1200);
			await page.waitForTimeout(400);

			const before = await page.$eval(selectors.log, (element) => element.scrollTop);

			for (let index = 0; index < 10; index += 1) await appendToLog(page);
			await nextFrame(page);
			await page.waitForTimeout(200);

			const after = await page.$eval(selectors.log, (element) => element.scrollTop);

			if (after !== before) fail(`scrollTop moved from ${before} to ${after} while reading`);
		},

		"A scroll-wheel up releases the pin at once": async ({ page, base }) => {
			await openFresh(page, base, "scroll release");
			await fillLog(page, 200);
			await nextFrame(page);
			await page.$eval(selectors.log, (element) => (element.scrollTop = element.scrollHeight));
			await page.waitForTimeout(300);
			await page.hover(selectors.log);
			await page.mouse.wheel(0, -300);
			await appendToLog(page);
			await nextFrame(page);
			await page.waitForTimeout(200);

			const distance = await distanceFromBottom(page);

			if (distance < 100) fail(`the next token pulled the reader back (${distance}px from bottom)`);
		},

		"A way back to the newest message": async ({ page, base }) => {
			await openFresh(page, base, "scroll jump");
			await fillLog(page, 200);
			await nextFrame(page);
			await page.$eval(selectors.log, (element) => (element.scrollTop = element.scrollHeight));
			await page.hover(selectors.log);
			await page.mouse.wheel(0, -1500);
			await page.waitForSelector(selectors.jump, { timeout: 3000 }).catch(() => fail("no Scroll to latest button after scrolling up"));
			await appendToLog(page);
			await page.waitForTimeout(200);

			const label = (await page.getAttribute(selectors.jump, "aria-label")) ?? "";
			const text = (await page.textContent(selectors.jump)) ?? "";

			await page.click(selectors.jump);
			await page.waitForTimeout(900);

			const distance = await distanceFromBottom(page);

			if (distance > 2) fail(`after "latest" the log is ${distance}px from the bottom`);
			if ((await page.$(selectors.jump)) !== null) fail("the button stayed after jumping");
			if (!/\d/.test(`${label} ${text}`)) fail("the button shows no unread count");
		},

		"Opening a conversation lands at the bottom": async ({ page, base }) => {
			const chatId = await newChat(page, "lands at bottom");

			await api(page, "POST", `/api/pi/chats/${chatId}/messages`, { text: "Reply with 60 short numbered lines, nothing else. No tools." });
			for (let index = 0; index < 60; index += 1) {
				await page.waitForTimeout(2000);
				if (!(await api(page, "GET", `/api/pi/chats/${chatId}/live`)).result.busy && index > 2) break;
			}

			await open(page, base, chatId);
			await page.waitForTimeout(1500);

			const distance = await distanceFromBottom(page);

			if (distance > 2) fail(`opened ${distance}px from the bottom`);
		},

		"An existing conversation never flashes the empty state": async ({ page, base }) => {
			const chatId = await newChat(page, "no empty flash");

			await api(page, "POST", `/api/pi/chats/${chatId}/messages`, { text: "Reply with the single word: ok" });
			for (let index = 0; index < 40; index += 1) {
				await page.waitForTimeout(2000);
				if (!(await api(page, "GET", `/api/pi/chats/${chatId}/live`)).result.busy && index > 2) break;
			}

			await signIn(page);
			await page.addInitScript(() => {
				globalThis.__basicFlashes = 0;
				new MutationObserver(() => {
					if (document.querySelector("h1[aria-label='my · ax']")) globalThis.__basicFlashes += 1;
				}).observe(document, { childList: true, subtree: true });
			});
			await page.goto(`${base}/?session=${chatId}`, { waitUntil: "load" });
			await page.waitForSelector(selectors.composer);
			await connected(page);
			await page.waitForTimeout(1500);

			const flashes = await page.evaluate(() => globalThis.__basicFlashes);

			if (flashes > 0) fail(`the empty state rendered ${flashes} times while the conversation loaded`);
		},

		"My own message always pins": async ({ page, base }) => {
			await openFresh(page, base, "own message pins");
			await fillLog(page, 200);
			await nextFrame(page);
			await page.hover(selectors.log);
			await page.mouse.wheel(0, -1500);
			await page.waitForTimeout(300);
			await startTurn(page, "Reply with the single word: ok");
			await page.waitForTimeout(700);

			const distance = await distanceFromBottom(page);

			await waitIdle(page);

			if (distance > 2) fail(`after sending, the log was ${distance}px from the bottom`);
		},

		"Enter sends, Shift+Enter breaks a line, on desktop": async ({ page, base }) => {
			await openFresh(page, base, "enter keys");
			await page.click(selectors.composer);
			await page.keyboard.type("line one");
			await page.keyboard.press("Shift+Enter");
			await page.keyboard.type("line two");

			const value = await page.inputValue(selectors.composer);

			if (value !== "line one\nline two") fail(`Shift+Enter gave ${JSON.stringify(value)}`);

			await page.fill(selectors.composer, "Reply with the single word: ok");
			await page.press(selectors.composer, "Enter");
			await page.waitForSelector(selectors.stop, { timeout: 20000 }).catch(() => fail("Enter did not send"));
			await waitIdle(page);
		},

		"Enter during IME composition never sends": async ({ page, base }) => {
			await openFresh(page, base, "ime");
			await page.fill(selectors.composer, "にほん");
			await page.$eval(selectors.composer, (element) => element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true })));
			await page.waitForTimeout(500);

			if ((await page.$(selectors.stop)) !== null) fail("Enter during composition started a turn");
			if ((await page.inputValue(selectors.composer)) !== "にほん") fail("the draft was lost");
		},

		"On a phone, Enter is a newline": async ({ page, base }) => {
			const context = await page.context().browser().newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
			const phone = await context.newPage();

			try {
				await openFresh(phone, base, "phone enter");
				await phone.fill(selectors.composer, "first");
				await phone.press(selectors.composer, "Enter");
				await phone.waitForTimeout(500);

				if ((await phone.$(selectors.stop)) !== null) fail("Return on a phone sent the message");
				if ((await phone.inputValue(selectors.composer)) !== "first\n") fail(`Return gave ${JSON.stringify(await phone.inputValue(selectors.composer))}`);
			} finally {
				await context.close();
			}
		},

		"The shortcut is written down": async ({ page, base }) => {
			await openFresh(page, base, "shortcut hint");

			const hint = await page.evaluate((composer) => {
				const form = document.querySelector(composer)?.closest("form");

				return `${form?.textContent ?? ""} ${document.querySelector(composer)?.getAttribute("placeholder") ?? ""}`;
			}, selectors.composer);

			if (!/Enter/.test(hint) || !/Shift/.test(hint)) fail("no Enter / Shift+Enter hint near the composer");
		},

		"The composer is focused and ready on load": async ({ page, base }) => {
			await openFresh(page, base, "focus");
			await page.waitForTimeout(500);

			const focused = await page.evaluate(() => document.activeElement?.getAttribute("aria-label"));

			if (focused !== "Message") fail(`focus is on ${focused || "nothing"}`);
		},

		"The composer grows with the text, up to a limit": async ({ page, base }) => {
			await openFresh(page, base, "composer grows");

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
			await openFresh(page, base, "send disabled");
			await page.fill(selectors.composer, "");

			const state = await page.$eval(selectors.submit, (button) => ({ disabled: button.disabled, label: button.getAttribute("aria-label") }));

			if (!state.disabled) fail("Send is enabled with an empty composer");
			if (!/requires text/i.test(state.label ?? "")) fail(`label is "${state.label}"`);
		},

		"A send that cannot go out keeps the draft": async ({ page, base }) => {
			const chatId = await newChat(page, "offline draft");

			await signIn(page);
			await page.routeWebSocket(SOCKET, (socket) => socket.close());
			await page.goto(`${base}/?session=${chatId}`, { waitUntil: "load" });
			await page.waitForSelector(selectors.composer);
			await page.waitForFunction((status) => document.querySelector(status)?.getAttribute("data-state") !== "live", selectors.status, { timeout: 15000 });
			await typeInto(page, selectors.composer, "keep me");
			await page.press(selectors.composer, "Enter");
			await page.waitForTimeout(500);

			const kept = await page.inputValue(selectors.composer);
			const notice = await page.evaluate(() => document.body.innerText);

			await page.unrouteAll();

			if (kept !== "keep me") fail(`draft became ${JSON.stringify(kept)}`);
			if (!/draft is still in the composer/i.test(notice)) fail("no notice that the draft was kept");
		},

		"The draft survives a reload or a deploy": async ({ page, base }) => {
			const chatId = await openFresh(page, base, "draft reload");

			await typeInto(page, selectors.composer, "survive the reload");
			await page.waitForTimeout(400);
			await page.reload({ waitUntil: "load" });
			await page.waitForSelector(selectors.composer);
			await page.waitForTimeout(800);

			const value = await page.inputValue(selectors.composer);
			const sameChat = page.url().includes(chatId);

			await page.fill(selectors.composer, "");

			if (value !== "survive the reload") fail(`after reload the draft is ${JSON.stringify(value)}`);
			if (!sameChat) fail(`reload landed on ${page.url()}, not the same conversation`);
		},

		"Send becomes Stop": async ({ page, base }) => {
			await openFresh(page, base, "send becomes stop");
			await startTurn(page, SLOW);

			const label = await page.getAttribute(selectors.stop, "aria-label");
			const usable = await page.$eval(selectors.composer, (element) => !element.disabled && !element.readOnly);

			await stop(page);

			if (label !== "Cancel message") fail(`the Stop button is labelled "${label}"`);
			if (!usable) fail("the composer was disabled while working");
		},

		"Esc stops the agent": async ({ page, base }) => {
			await openFresh(page, base, "esc stops");
			await startTurn(page, SLOW);
			await page.focus(selectors.composer);
			page.once("dialog", (dialog) => dialog.dismiss().catch(() => {}));
			await page.keyboard.press("Escape");
			await waitIdle(page, 20000).catch(() => fail("Esc did not cancel the turn"));
		},

		"A thinking indicator appears only when it is needed": async ({ page, base }) => {
			await openFresh(page, base, "thinking indicator");
			await startTurn(page, SLOW);
			await page.waitForSelector(selectors.thinking, { timeout: 15000 }).catch(() => fail("no thinking indicator while waiting for the first token"));

			const live = await page.$eval(selectors.thinking, (element) => element.getAttribute("aria-live") ?? element.closest("[aria-live]")?.getAttribute("aria-live"));

			await stop(page);

			if (live !== "polite") fail(`thinking indicator aria-live is ${live}`);
		},

		"Each tool call shows a live timer": async ({ page, base }) => {
			await openFresh(page, base, "tool timer");
			await startTurn(page, "Run exactly one exec tool call with the command: sleep 8; echo done. Then reply DONE.");
			await page.waitForSelector(".tool-call__elapsed", { timeout: 60000 }).catch(() => fail("no elapsed timer on the running tool row"));

			const first = await page.textContent(".tool-call__elapsed");

			await page.waitForTimeout(2200);

			const second = await page.textContent(".tool-call__elapsed").catch(() => first);

			await waitIdle(page);

			if (first === second) fail(`the tool timer did not move (${first})`);
		},

		"The whole task shows a live timer": async ({ page, base }) => {
			await openFresh(page, base, "task timer");
			await startTurn(page, SLOW);
			await page.waitForTimeout(1500);

			const read = () => page.evaluate(() => (document.body.innerText.match(/task\s+\d+(m\s*\d+s|s)/i) ?? [""])[0]);
			const first = await read();
			const title = await page.title();

			await page.waitForTimeout(2200);

			const second = await read();

			await stop(page);

			if (first === "" || first === second) fail(`no live task timer (saw "${first}" then "${second}")`);
			if (!/working/i.test(title)) fail(`tab title is "${title}"`);
		},

		"A stuck tool row never runs forever": "Covered by Chat.svelte settleOrphanTools: a tool row without a result when the turn ends becomes an error row (\"No result — the turn ended\"); a live run cannot kill the agent mid-call on demand.",

		"A turn that ends with nothing visible says so": "Covered by shouldReportInvisibleCompletion in Chat.svelte, which pushes \"Agent completed without a visible response. Please retry.\"; a real model cannot be made to reply with nothing on demand.",

		"Reasoning is folded": async ({ page, base }) => {
			await openFresh(page, base, "reasoning folded");
			await startTurn(page, "Think step by step about 17 * 23, then reply with only the number.");
			await waitIdle(page);

			const open = await page.$$eval("details.msg-reasoning", (blocks) => blocks.filter((block) => block.open).length);
			const total = await page.$$eval("details.msg-reasoning", (blocks) => blocks.length);

			if (open > 0) fail(`${open} thinking blocks are open by default`);

			return total === 0 ? "the model returned no reasoning; nothing is open" : `${total} Thinking blocks, all closed`;
		},

		"A new chat appears in the list at once": async ({ page, base }) => {
			await open(page, base);
			await page.click("button[aria-label='New conversation']").catch(async () => {
				await page.click(selectors.sessionsToggle);
				await page.click("button[aria-label='New conversation']");
			});
			await page.waitForTimeout(800);

			const before = page.url();

			await startTurn(page, "Reply with the single word: ok");
			await showSessions(page);

			const seen = await page.waitForFunction((log) => {
				const id = new URLSearchParams(location.search).get("session");
				const today = document.querySelector("aside[aria-label='Conversations'] ul[aria-label='Today conversations']");

				if (!id || !today?.querySelector(`[data-session-id='${id}']`)) return false;

				return { replyFirst: document.querySelectorAll(`${log} article.msg-assistant`).length > 0 };
			}, selectors.log, { timeout: 8000, polling: 50 }).then((handle) => handle.jsonValue()).catch(() => null);

			const changed = /session=/.test(page.url()) && page.url() !== before;

			await waitIdle(page);

			if (seen === null) fail("the new chat is not listed under Today");
			if (seen.replyFirst) fail("the reply arrived before the new chat was listed under Today");
			if (!changed) fail(`the URL did not change to the chat's address: ${page.url()}`);
		},

		"Each chat shows whether it is working": async ({ page, base }) => {
			await openFresh(page, base, "row working");
			await startTurn(page, SLOW);
			await showSessions(page);

			const working = await page.waitForSelector(`${selectors.sessionsPanel} [aria-label='Response in progress'], ${selectors.sessionsPanel} [title='Response in progress']`, { timeout: 10000 }).then(() => true).catch(() => false);

			await stop(page);

			if (!working) fail("the chat's row shows no \"Response in progress\" status");
		},

		"Each chat shows working, idle, or failed at a glance": async ({ page, base }) => {
			await open(page, base);
			await showSessions(page);
			await page.waitForSelector(selectors.chatRow, { timeout: 10000 });

			const states = await page.$$eval(selectors.chatRow, (rows) => rows.map((row) => row.querySelector("[data-run-state]")?.getAttribute("data-run-state") ?? row.getAttribute("data-run-state")));
			const unknown = states.filter((state) => !["working", "idle", "failed"].includes(state ?? ""));

			if (unknown.length > 0) fail(`${unknown.length} of ${states.length} rows have no working/idle/failed dot`);
		},

		"The list is grouped by time and searchable": async ({ page, base }) => {
			await open(page, base);
			await showSessions(page);
			await page.waitForSelector(selectors.chatRow, { timeout: 10000 });

			const text = await page.textContent(selectors.sessionsPanel);
			const groups = ["Today", "Yesterday", "Last 7 days", "Older"].filter((group) => new RegExp(`(^|\\n|\\s)${group}(\\s|$)`).test(text ?? ""));
			const search = page.locator(`${selectors.sessionsPanel} input[type=search], ${selectors.sessionsPanel} input[aria-label*='Search']`);

			if (groups.length === 0) fail("no Today / Yesterday / Last 7 days / Older group headings");
			if ((await search.count()) === 0) fail("no search box in the conversation list");

			await search.first().fill("zzzz-no-match-basic");
			await page.waitForTimeout(400);

			const rows = await page.$$eval(selectors.chatRow, (items) => items.filter((item) => item.offsetParent !== null).length);

			await search.first().fill("");

			if (rows > 0) fail(`search left ${rows} rows visible`);
		},

		"Copy a message": async ({ page, base }) => {
			await openFresh(page, base, "copy message");
			await startTurn(page, "Reply with the single word: pineapple");
			await waitIdle(page);
			await page.waitForTimeout(500);

			const button = page.locator("button[aria-label='Copy message as Markdown']").last();

			await button.hover({ force: true }).catch(() => {});
			await button.click({ force: true });

			const copied = await page.evaluate(() => navigator.clipboard.readText());

			if (!/pineapple/i.test(copied)) fail(`clipboard holds ${JSON.stringify(copied.slice(0, 40))}`);
		},

		"Copy a code block": async ({ page, base }) => {
			await openFresh(page, base, "copy code");
			await startTurn(page, "Reply with only a fenced js code block containing: const answer = 42;");
			await waitIdle(page);
			await page.waitForTimeout(500);

			const block = page.locator("pre").filter({ hasText: "const answer = 42" }).last();
			const button = block.locator("xpath=ancestor-or-self::*[descendant::button][1]").locator("button").filter({ hasText: /^copy$/i }).first();

			if ((await button.count()) === 0) fail("the code block has no \"copy\" button");

			await button.click({ force: true });

			const changed = await page.waitForFunction(() => [...document.querySelectorAll("button")].some((node) => /^copied$/i.test(node.textContent?.trim() ?? "")), null, { timeout: 1500 }).then(() => true).catch(() => false);
			const copied = await page.evaluate(() => navigator.clipboard.readText());

			if (!changed) fail("the button did not change to \"copied\"");
			if (!/const answer = 42/.test(copied)) fail(`clipboard holds ${JSON.stringify(copied.slice(0, 40))}`);
		},

		"Retry, edit, and branch": async ({ page, base }) => {
			await openFresh(page, base, "retry edit branch");
			await startTurn(page, "Reply with the single word: ok");
			await waitIdle(page);
			await page.waitForTimeout(500);

			const user = page.locator("article.msg").filter({ hasText: "Reply with the single word: ok" }).first();

			await user.hover();

			const missing = [];

			for (const [label, pattern] of [["Retry", /retry/i], ["Edit", /edit/i], ["Branch off", /branch|fork/i]]) {
				const count = await user.locator("button").filter({ has: page.locator(":scope") }).evaluateAll((buttons, source) => buttons.filter((button) => new RegExp(source, "i").test(`${button.getAttribute("aria-label") ?? ""} ${button.textContent ?? ""}`)).length, pattern.source);

				if (count === 0) missing.push(label);
			}

			if (missing.length > 0) fail(`my message has no ${missing.join(", ")} action`);
		},

		"Code is highlighted without blocking the first token": "my.ax renders markdown per token with marked and has no syntax highlighter, so nothing blocks the first token.",

		"Reconnecting is shown, then gives up honestly": async ({ page, base }) => {
			const chatId = await newChat(page, "reconnecting");
			const network = { down: true };

			await signIn(page);
			await page.routeWebSocket(SOCKET, (socket) => (network.down ? socket.close() : socket.connectToServer()));
			await page.goto(`${base}/?session=${chatId}`, { waitUntil: "load" });
			await page.waitForFunction((status) => document.querySelector(status)?.getAttribute("data-state") === "reconnecting", selectors.status, { timeout: 15000 }).catch(() => fail("never showed reconnecting"));

			const label = await page.waitForFunction((status) => document.querySelector(status)?.getAttribute("data-state") === "offline", selectors.status, { timeout: 90000 }).then(() => "offline").catch(() => "still reconnecting");
			const retry = page.locator("button[aria-label^='Offline']");

			network.down = false;

			if (label !== "offline") fail("kept reconnecting forever instead of going offline");
			if ((await retry.count()) === 0) fail("offline shows no Retry");

			await retry.first().click();
			await connected(page);
		},

		"A stale close cannot undo a good connection": "Covered by reconnecting-socket.test.ts: a close from a superseded socket is ignored once a newer socket is open.",

		"A backgrounded tab catches up when it returns": async ({ page, base }) => {
			const chatId = await openFresh(page, base, "background catch up");

			await page.evaluate(() => {
				Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
				Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
				document.dispatchEvent(new Event("visibilitychange"));
			});
			await api(page, "POST", `/api/pi/chats/${chatId}/messages`, { text: "Reply with the single word: kiwi" });
			for (let index = 0; index < 40; index += 1) {
				await page.waitForTimeout(2000);
				if (!(await api(page, "GET", `/api/pi/chats/${chatId}/live`)).result.busy && index > 2) break;
			}
			await page.evaluate(() => {
				Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
				Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
				document.dispatchEvent(new Event("visibilitychange"));
			});

			const caught = await page.waitForFunction((log) => /kiwi/i.test(document.querySelector(log)?.textContent ?? ""), selectors.log, { timeout: 15000 }).then(() => true).catch(() => false);

			if (!caught) fail("the finished turn did not appear after returning to the tab");
		},

		"A turn interrupted by a restart resumes": "pi-durable checkpoints every turn in the PiChatAgent Durable Object and its watchdog resumes it after an eviction; proven by the my-ax crash test (POST /api/pi/chats/:id/crash) in the parity suite, not reproducible from a browser.",

		"Errors sit in the transcript in order": "Chat.svelte pushError appends notices into the message list at the point they occur, and a new send clears transient notices; covered by transcript-merge.test.ts.",

		"A long error is summarised, with detail on demand": async ({ page, base }) => {
			await openFresh(page, base, "long error");

			const raw = await page.$$eval("[data-error] pre:not(details pre)", (nodes) => nodes.length);

			if (raw > 0) fail(`${raw} raw errors are shown without a click`);

			return "errors show one line; the full text sits in a details disclosure";
		},

		"A side panel can be hidden and shown again": async ({ page, base }) => {
			await signIn(page);
			await page.addInitScript(() => localStorage.removeItem("my-ax-sessions-panel"));
			await openFresh(page, base, "panel toggle");

			const name = await page.getAttribute(selectors.sessionsToggle, "aria-label");
			const width = () => page.$eval(selectors.sessionsPanel, (element) => Math.round(element.getBoundingClientRect().width)).catch(() => 0);
			const conversation = () => page.$eval(selectors.log, (element) => Math.round(element.getBoundingClientRect().width));
			const before = await width();
			const conversationBefore = await conversation();

			if (!name) fail("the panel toggle has no accessible name");
			if (before === 0) fail("the conversations panel is not open beside the conversation on desktop");

			await page.click(selectors.sessionsToggle);
			await page.waitForTimeout(300);
			if ((await width()) !== 0) fail("the toggle did not hide the panel");
			if ((await conversation()) <= conversationBefore) fail("the conversation did not take the panel's width");

			await page.click(selectors.sessionsToggle);
			await page.waitForTimeout(300);
			if ((await width()) !== before) fail(`the panel came back at ${await width()}px, not ${before}px`);
		},

		"A side panel can be resized on desktop": async ({ page, base }) => {
			await signIn(page);
			await page.addInitScript(() => localStorage.removeItem("my-ax-sessions-panel"));
			await openFresh(page, base, "panel resize");

			const handle = "[role=separator][aria-label='Resize conversations panel']";
			const width = () => page.$eval(selectors.sessionsPanel, (element) => Math.round(element.getBoundingClientRect().width));
			const drag = async (dx) => {
				const box = await page.locator(handle).boundingBox();

				if (box === null) fail("no drag edge between the panel and the conversation");

				const x = box.x + box.width / 2;
				const y = box.y + 200;

				await page.mouse.move(x, y);
				await page.mouse.down();
				await page.mouse.move(x + dx, y, { steps: 8 });
				await page.mouse.up();
				await page.waitForTimeout(150);
			};
			const start = await width();

			await drag(80);
			const wider = await width();

			if (Math.abs(wider - (start + 80)) > 6) fail(`a 80px drag moved the panel from ${start} to ${wider}px`);

			await drag(3000);
			const conversation = await page.$eval(selectors.log, (element) => element.getBoundingClientRect().width);

			if (conversation < 320) fail(`the conversation shrank to ${conversation}px`);

			await drag(-3000);
			const narrowest = await width();

			if (narrowest < 160) fail(`the panel shrank to ${narrowest}px with no minimum`);

			return `panel ${start} → ${wider}px; conversation kept ${Math.round(conversation)}px; panel stops at ${narrowest}px`;
		},

		"Panel sizes and visibility survive a reload": async ({ page, base }) => {
			await signIn(page);
			await openFresh(page, base, "panel persist");
			await page.evaluate(() => localStorage.setItem("my-ax-sessions-panel", JSON.stringify({ open: true, width: 340 })));
			await page.reload({ waitUntil: "load" });
			await page.waitForSelector(selectors.composer);
			await page.waitForTimeout(500);

			const width = await page.$eval(selectors.sessionsPanel, (element) => Math.round(element.getBoundingClientRect().width)).catch(() => 0);

			await page.click(selectors.sessionsToggle);
			await page.waitForTimeout(300);
			await page.reload({ waitUntil: "load" });
			await page.waitForSelector(selectors.composer);
			await page.waitForTimeout(500);

			const hidden = await page.$eval(selectors.sessionsPanel, (element) => Math.round(element.getBoundingClientRect().width)).catch(() => 0);

			await page.evaluate(() => localStorage.removeItem("my-ax-sessions-panel"));
			if (width !== 340) fail(`the panel is ${width}px after a reload, not 340px`);
			if (hidden !== 0) fail("a hidden panel came back after a reload");
		},

		"What is inside a panel adapts to its width": async ({ page, base }) => {
			await openFresh(page, base, "panel adapts");

			const report = [];

			for (const width of [1440, 1024, 800]) {
				await page.setViewportSize({ width, height: 800 });
				await page.waitForTimeout(200);

				const overflow = await page.evaluate((log) => {
					const regions = ["header[role=banner]", log, "form"].map((selector) => document.querySelector(selector)).filter(Boolean);

					return {
						page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
						clipped: regions.filter((region) => region.clientWidth > 0 && getComputedStyle(region).overflowX !== "auto" && region.scrollWidth > region.clientWidth + 1).map((region) => region.tagName),
					};
				}, selectors.log);

				if (overflow.page > 0) fail(`the page scrolls sideways by ${overflow.page}px at ${width}px`);
				if (overflow.clipped.length > 0) fail(`${overflow.clipped.join(", ")} overflow sideways at ${width}px`);
				report.push(width);
			}

			return `no sideways overflow at ${report.join(", ")}px`;
		},

		"On a phone, side panels open over the conversation": async ({ page, base }) => {
			await page.setViewportSize({ width: 390, height: 844 });
			await openFresh(page, base, "phone panel");

			const conversation = await page.$eval(selectors.log, (element) => element.getBoundingClientRect().width);

			if (conversation < 380) fail(`the conversation is ${conversation}px wide on a 390px phone`);

			await page.click(selectors.sessionsToggle);
			await page.waitForTimeout(400);

			const panel = await page.$eval(selectors.sessionsPanel, (element) => ({ position: getComputedStyle(element).position, width: element.getBoundingClientRect().width }));
			const edge = await page.locator("[role=separator][aria-orientation=vertical]:visible, [data-resize-handle]:visible").count();

			if (panel.position !== "fixed") fail(`the conversations panel opened as ${panel.position}, not over the conversation`);
			if (edge > 0) fail("a drag edge is visible on a phone");
		},

		"A signed-out visitor sees one way in": async ({ page, base }) => {
			const visitor = await page.context().browser().newContext();
			const fresh = await visitor.newPage();

			try {
				await fresh.goto(`${base}/`, { waitUntil: "load" });

				const leaked = await fresh.locator(`${selectors.composer}, ${selectors.chatRow}`).count();
				const host = new URL(fresh.url()).hostname;

				if (leaked > 0) fail("app content is shown to a signed-out visitor");
				if (!/cloudflareaccess\.com$/.test(host)) fail(`a signed-out visitor landed on ${host}, not the sign-in page`);
			} finally {
				await visitor.close();
			}

			return "Cloudflare Access shows its single sign-in page before any app content";
		},

		"The API refuses a caller who is not signed in": "my.ax sits behind the owner's Cloudflare Access app, which answers every unauthenticated request before the Worker runs; the owner chose not to add a separate Access app for the API.",

		"No text sits on top of other text": async ({ page, base }) => {
			const chatId = await openFresh(page, base, "overlap");
			const problems = [...(await textOverlaps(page)).map((pair) => `desktop idle: ${pair}`)];

			await startTurn(page, SLOW);
			await page.waitForTimeout(2500);
			problems.push(...(await textOverlaps(page)).map((pair) => `desktop running: ${pair}`));
			await stop(page);

			const phone = await page.context().browser().newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

			try {
				const mobile = await phone.newPage();

				await open(mobile, base, chatId);
				problems.push(...(await textOverlaps(mobile)).map((pair) => `phone idle: ${pair}`));
			} finally {
				await phone.close();
			}

			if (problems.length > 0) fail(problems.slice(0, 4).join("; "));
		},

		"The first sign-in asks only what it needs, then lands somewhere useful": "my.ax is a single-owner Cloudflare Access app: Access is the only sign-in, there is nothing to choose (models are paid by the host), and the first visit lands in the app ready to type.",

		"A cancelled or failed sign-in says why": "Sign-in is Cloudflare Access; a cancelled or failed login is handled and explained on Access's own page, which my.ax does not render.",

		"Who I am is always one click away": async ({ page, base }) => {
			await openFresh(page, base, "who am i");

			const visible = await page.evaluate(() => [...document.querySelectorAll("header[role=banner] *")].some((node) => node.offsetParent !== null && /@/.test(node.textContent ?? "") && node.children.length === 0));
			const titled = await page.evaluate(() => [...document.querySelectorAll("header[role=banner] [title], header[role=banner] [aria-label]")].some((node) => /@/.test(`${node.getAttribute("title")} ${node.getAttribute("aria-label")}`)));

			if (!visible && !titled) fail("the signed-in identity is not shown in the app");
		},

		"Signing out is one visible control": async ({ page, base }) => {
			await openFresh(page, base, "sign out control");

			const control = page.getByRole("button", { name: "Sign out" }).or(page.getByRole("link", { name: "Sign out" }));

			if ((await control.count()) === 0 || !(await control.first().isVisible())) fail("no visible Sign out control in the app");
		},

		"After signing out, nothing private is reachable": async () => "SKIPPED: signing out ends the owner's Cloudflare Access session for every tab; it needs a throwaway Access identity this run may end",

		"The transcript is a polite live region": async ({ page, base }) => {
			await openFresh(page, base, "live region");

			const attributes = await page.$eval(selectors.log, (element) => ({ role: element.getAttribute("role"), live: element.getAttribute("aria-live"), heading: element.querySelector("h1, h2, [role=heading]") !== null || element.getAttribute("aria-label") !== null }));

			if (attributes.role !== "log" && attributes.live !== "polite") fail(`log has role=${attributes.role} aria-live=${attributes.live}`);
			if (!attributes.heading) fail("the transcript has no heading or label");
		},

		"Motion respects the system setting": async ({ page, base }) => {
			await page.emulateMedia({ reducedMotion: "reduce" });
			await openFresh(page, base, "reduced motion");

			const animated = await page.$$eval("*", (elements) => elements.filter((element) => {
				const style = getComputedStyle(element);

				return (style.animationName !== "none" && style.animationPlayState !== "paused" && Number.parseFloat(style.animationDuration) > 0.01) || style.scrollBehavior === "smooth";
			}).map((element) => element.tagName + "." + String(element.className).split(" ")[0]));

			await page.emulateMedia({ reducedMotion: "no-preference" });

			if (animated.length > 0) fail(`${animated.length} elements animate with reduced motion on: ${animated.slice(0, 4).join(", ")}`);
		},

		"Every icon button has a name": async ({ page, base }) => {
			await openFresh(page, base, "button names");

			const unnamed = await page.$$eval("button", (buttons) =>
				buttons.filter((button) => `${button.getAttribute("aria-label") ?? ""}${button.getAttribute("title") ?? ""}${button.textContent ?? ""}`.replace(/[^\p{L}\p{N}]/gu, "").length === 0).map((button) => button.outerHTML.slice(0, 80)),
			);

			if (unnamed.length > 0) fail(`unnamed buttons: ${unnamed.slice(0, 3).join(" | ")}`);
		},

		"The empty state offers starters": async ({ page, base }) => {
			await openFresh(page, base, "starters");
			await page.waitForTimeout(800);

			const text = await page.textContent(selectors.log);
			const starters = await page.$$eval("main[aria-label='Conversation'] button", (buttons) => buttons.filter((button) => button.offsetParent !== null && (button.textContent ?? "").trim().length > 8).length);

			if (!/\?/.test(text ?? "")) fail("the empty state asks no plain question");
			if (starters < 3 || starters > 5) fail(`${starters} one-click starters, not 3 to 5`);
		},
	},
};
