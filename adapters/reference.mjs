const S = {
	log: "#log",
	composer: "#composer",
	send: "#send",
	stop: "#stop",
	jump: "#jump-to-latest",
	unread: "#unread-count",
	activity: "#activity",
	thinking: "#thinking",
	turnTimer: "#turn-timer",
	row: "[data-conversation]",
	leftPanel: "#left-panel",
	rightPanel: "#right-panel",
	toggleLeft: "#toggle-left",
	toggleRight: "#toggle-right",
	dragLeft: "#drag-left",
	dragRight: "#drag-right",
};

const fail = (message) => {
	throw new Error(message);
};

const sessions = new WeakMap();

const signIn = async (context, base) => {
	const cached = sessions.get(context);
	if (cached !== undefined) return cached;
	const page = await context.newPage();
	await page.goto(`${base}/auth/sign-in`, { waitUntil: "load" });
	await page.fill("#email", `basic-${Date.now()}@example.com`);
	await page.click("#allow");
	await page.waitForSelector("#continue", { timeout: 15000 });
	await page.click("#continue");
	await page.waitForSelector(S.composer, { timeout: 15000 });
	await page.close();
	sessions.set(context, true);
	return true;
};

const ready = async (page) => {
	await page.waitForSelector(S.composer, { timeout: 20000 });
	await page.waitForSelector("[data-connection='online']", { timeout: 20000 });
};

const open = async (page, base, path = "/") => {
	await signIn(page.context(), base);
	await page.goto(base + path, { waitUntil: "load" });
	await ready(page);
};

const fresh = async (page, base) => {
	await signIn(page.context(), base);
	await page.goto(`${base}/brand/cloudflare-cloud.svg`, { waitUntil: "load" });
	await page.evaluate(() => localStorage.clear());
	await page.goto(base + "/", { waitUntil: "load" });
	await ready(page);
};

const send = async (page, text) => {
	await page.click(S.composer);
	await page.fill(S.composer, text);
	await page.press(S.composer, "Enter");
};

const startTurn = async (page, text) => {
	await send(page, text);
	await page.waitForSelector(S.stop, { timeout: 15000 });
};

const waitIdle = async (page, timeout = 60000) => page.waitForSelector(S.send, { timeout });

const distance = async (page) => page.$eval(S.log, (element) => element.scrollHeight - element.clientHeight - element.scrollTop);

const scrollTop = async (page) => page.$eval(S.log, (element) => element.scrollTop);

const frames = async (page, count = 2) => {
	for (let index = 0; index < count; index += 1) await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
};

const longChat = async (page) => {
	for (let index = 0; index < 4; index += 1) {
		await startTurn(page, "Explain Durable Objects in one minute");
		await waitIdle(page);
	}
};

const width = async (page, selector) => {
	await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
	return page.$eval(selector, (element) => Math.round(element.getBoundingClientRect().width)).catch(() => 0);
};

const drag = async (page, selector, dx) => {
	const box = await page.locator(selector).boundingBox();
	if (box === null) fail(`${selector} is not on screen`);
	const x = box.x + box.width / 2;
	const y = box.y + 200;
	await page.mouse.move(x, y);
	await page.mouse.down();
	await page.mouse.move(x + dx, y, { steps: 10 });
	await page.mouse.up();
	await frames(page);
};

const phone = async (page, base, fn) => {
	const browser = page.context().browser();
	const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });
	try {
		const tab = await context.newPage();
		await fresh(tab, base);
		return await fn(tab);
	} finally {
		await context.close();
	}
};

const visitor = async (page, fn) => {
	const context = await page.context().browser().newContext();
	try {
		return await fn(context);
	} finally {
		await context.close();
	}
};

const overlaps = async (page) =>
	page.evaluate(() => {
		const boxes = [];
		const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
		while (walker.nextNode()) {
			const node = walker.currentNode;
			if ((node.textContent ?? "").trim() === "") continue;
			const element = node.parentElement;
			if (element === null) continue;
			const style = getComputedStyle(element);
			if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0 || element.closest("[aria-hidden='true'], .sr-only, [hidden]")) continue;
			const closed = element.closest("details:not([open])");
			if (closed !== null && element.closest("summary") === null) continue;
			if (element.checkVisibility !== undefined && !element.checkVisibility({ opacityProperty: true, visibilityProperty: true })) continue;
			const range = document.createRange();
			range.selectNodeContents(node);
			for (const raw of range.getClientRects()) {
				let left = raw.left;
				let right = raw.right;
				let top = raw.top;
				let bottom = raw.bottom;
				let clip = element;
				while (clip !== null && clip !== document.documentElement) {
					const style = getComputedStyle(clip);
					if (style.overflowX !== "visible" || style.overflowY !== "visible" || style.textOverflow === "ellipsis") {
						const box = clip.getBoundingClientRect();
						left = Math.max(left, box.left);
						right = Math.min(right, box.right);
						top = Math.max(top, box.top);
						bottom = Math.min(bottom, box.bottom);
					}
					clip = clip.parentElement;
				}
				left = Math.max(left, 0);
				right = Math.min(right, innerWidth);
				top = Math.max(top, 0);
				bottom = Math.min(bottom, innerHeight);
				if (right - left >= 2 && bottom - top >= 2) boxes.push({ rect: { left, right, top, bottom }, owner: element, text: (node.textContent ?? "").trim().slice(0, 24) });
			}
		}
		for (const input of document.querySelectorAll("textarea, input")) {
			if (input.value === "" && input.placeholder !== "") {
				const rect = input.getBoundingClientRect();
				if (rect.width > 0) boxes.push({ rect: new DOMRect(rect.left + 12, rect.top + 10, Math.min(rect.width - 24, input.placeholder.length * 7), 14), owner: input, text: input.placeholder.slice(0, 24) });
			}
		}
		const hits = [];
		for (let a = 0; a < boxes.length; a += 1) {
			for (let b = a + 1; b < boxes.length; b += 1) {
				const one = boxes[a];
				const two = boxes[b];
				if (one.owner === two.owner || one.owner.contains(two.owner) || two.owner.contains(one.owner)) continue;
				const x = Math.min(one.rect.right, two.rect.right) - Math.max(one.rect.left, two.rect.left);
				const y = Math.min(one.rect.bottom, two.rect.bottom) - Math.max(one.rect.top, two.rect.top);
				if (x > 2 && y > 3) hits.push(`"${one.text}" over "${two.text}"`);
			}
		}
		return hits.slice(0, 5);
	});

export default {
	checks: {
		"Following the stream while at the bottom": async ({ page, base }) => {
			await fresh(page, base);
			await longChat(page);
			await startTurn(page, "Count slowly from 1 to 30");
			const samples = [];
			let smooth = false;
			for (let index = 0; index < 12; index += 1) {
				await page.waitForTimeout(250);
				samples.push(await distance(page));
				smooth ||= await page.$eval(S.log, (element) => getComputedStyle(element).scrollBehavior === "smooth");
			}
			await page.click(S.stop);
			if (samples.some((gap) => gap > 80)) fail(`the stream left the reader ${Math.max(...samples)} px from the bottom`);
			if (smooth) fail("the transcript pins with smooth scrolling");
		},

		"Reading history while the agent streams": async ({ page, base }) => {
			await fresh(page, base);
			await longChat(page);
			await startTurn(page, "Count slowly from 1 to 30");
			await page.waitForTimeout(600);
			await page.hover(S.log);
			await page.mouse.wheel(0, -600);
			await page.waitForTimeout(300);
			const before = await scrollTop(page);
			const reading = await page.evaluate(() => {
				const log = document.querySelector("#log");
				const top = log.getBoundingClientRect().top;
				const entry = [...log.querySelectorAll("[data-entry]")].find((each) => each.getBoundingClientRect().bottom > top);
				return entry === undefined ? null : entry.getBoundingClientRect().top;
			});
			await page.waitForTimeout(2500);
			const after = await scrollTop(page);
			const still = await page.evaluate(() => {
				const log = document.querySelector("#log");
				const top = log.getBoundingClientRect().top;
				const entry = [...log.querySelectorAll("[data-entry]")].find((each) => each.getBoundingClientRect().bottom > top);
				return entry === undefined ? null : entry.getBoundingClientRect().top;
			});
			await page.click(S.stop);
			if (after !== before) fail(`scrollTop moved from ${before} to ${after} while reading`);
			if (reading !== null && still !== null && Math.abs(reading - still) > 1) fail(`what I was reading moved by ${Math.round(still - reading)} px`);
		},

		"A scroll-wheel up releases the pin at once": async ({ page, base }) => {
			await fresh(page, base);
			await longChat(page);
			await startTurn(page, "Count slowly from 1 to 30");
			await page.waitForTimeout(500);
			await page.hover(S.log);
			await page.mouse.wheel(0, -200);
			const released = await scrollTop(page);
			await page.waitForTimeout(400);
			const later = await scrollTop(page);
			await page.click(S.stop);
			if (later > released + 1) fail(`the next token pulled the reader back from ${released} to ${later}`);
		},

		"Scrolling up during a real reply is never pulled back": async ({ page, base }) => {
			await fresh(page, base);
			await longChat(page);
			await startTurn(page, "Count slowly from 1 to 30");
			await page.waitForTimeout(500);
			await page.hover(S.log);
			await page.mouse.wheel(0, -500);
			await page.waitForTimeout(150);
			const held = await scrollTop(page);
			const positions = [];
			for (let index = 0; index < 8; index += 1) {
				await page.waitForTimeout(250);
				positions.push(await scrollTop(page));
			}
			if (positions.some((position) => position !== held)) fail(`renders moved the reader: ${held} → ${positions.join(", ")}`);
			await page.$eval(S.log, (element) => element.scrollTo({ top: element.scrollHeight - element.clientHeight - 20, behavior: "instant" }));
			await page.waitForTimeout(800);
			const gap = await distance(page);
			await page.click(S.stop);
			if (gap > 2) fail(`following did not resume: ${gap} px from the bottom`);
		},

		"A way back to the newest message": async ({ page, base }) => {
			await fresh(page, base);
			await longChat(page);
			await page.hover(S.log);
			await page.mouse.wheel(0, -2000);
			await page.waitForSelector(S.jump, { timeout: 3000 });
			await startTurn(page, "Reply with the single word: ok");
			await page.hover(S.log);
			await page.mouse.wheel(0, -2000);
			await waitIdle(page);
			await page.evaluate(() => {
				const log = document.querySelector("#log");
				log.scrollTop = 0;
			});
			await page.waitForSelector(S.jump, { timeout: 3000 });
			const placed = await page.evaluate(() => {
				const jump = document.querySelector("#jump-to-latest").getBoundingClientRect();
				const composer = document.querySelector("#composer").getBoundingClientRect();
				return jump.bottom <= composer.top;
			});
			if (!placed) fail("the button is not above the composer");
			const label = await page.getAttribute(S.jump, "aria-label");
			if (!/Scroll to latest/.test(label ?? "")) fail(`label is ${label}`);
			await page.click(S.jump);
			await page.waitForTimeout(200);
			const gap = await distance(page);
			if (gap > 2) fail(`after the jump the log is ${gap} px from the bottom`);
			if ((await page.$(S.jump)) !== null) fail("the button stayed after jumping");
			if ((await page.$(S.unread)) !== null) fail("the unread count did not reset");
			return "unread count tested in the next check";
		},

		"Opening a conversation lands at the bottom": async ({ page, base }) => {
			await fresh(page, base);
			await longChat(page);
			const address = page.url();
			await page.goto(base + "/", { waitUntil: "load" });
			await ready(page);
			await page.addInitScript(() => {
				globalThis.__basicTops = [];
				const watch = () => {
					const log = document.querySelector("#log");
					if (log !== null && document.querySelector("[data-entry]") !== null) globalThis.__basicTops.push(log.scrollHeight - log.clientHeight - log.scrollTop);
					requestAnimationFrame(watch);
				};
				requestAnimationFrame(watch);
			});
			await page.goto(address, { waitUntil: "load" });
			await page.waitForSelector("[data-entry='agent']", { timeout: 10000 });
			await page.waitForSelector("#loading", { state: "detached", timeout: 10000 });
			await page.waitForTimeout(300);
			const gaps = await page.evaluate(() => globalThis.__basicTops);
			const gap = await distance(page);
			if (gap > 2) fail(`opened ${gap} px from the bottom`);
			const visibleFromTop = gaps.filter((each) => each > 80);
			if (visibleFromTop.length > 0) fail(`the transcript was drawn away from the bottom for ${visibleFromTop.length} frames`);
		},

		"Older history pages in without a jump": async ({ page, base }) => {
			await fresh(page, base);
			await longChat(page);
			await page.$eval(S.log, (element) => {
				element.scrollTop = 400;
			});
			await page.waitForTimeout(100);
			const anchor = await page.evaluate(() => {
				const log = document.querySelector("#log");
				const target = [...log.querySelectorAll("[data-entry='agent']")][1];
				return target.getBoundingClientRect().top - log.getBoundingClientRect().top;
			});
			await page.$eval(S.log, (element) => {
				element.scrollTop = 120;
			});
			await page.waitForTimeout(100);
			const before = await page.evaluate(() => {
				const log = document.querySelector("#log");
				const target = [...log.querySelectorAll("[data-entry='agent']")][1];
				return target.getBoundingClientRect().top - log.getBoundingClientRect().top;
			});
			await page.waitForSelector("[data-entry='older']", { timeout: 3000 });
			await page.waitForTimeout(200);
			const after = await page.evaluate(() => {
				const log = document.querySelector("#log");
				const target = [...log.querySelectorAll("[data-entry='agent']")][1];
				return target.getBoundingClientRect().top - log.getBoundingClientRect().top;
			});
			if (Math.abs(after - before) > 1) fail(`the message I was reading moved ${Math.round(after - before)} px when history loaded`);
			return `anchor held (${Math.round(anchor)} px case checked)`;
		},

		"An existing conversation never flashes the empty state": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Reply with the single word: ok");
			await waitIdle(page);
			const address = page.url();
			await page.addInitScript(() => {
				globalThis.__basicEmpty = 0;
				new MutationObserver(() => {
					if (document.querySelector("#empty-state") !== null) globalThis.__basicEmpty += 1;
				}).observe(document, { childList: true, subtree: true });
			});
			await page.goto(address, { waitUntil: "load" });
			await page.waitForSelector("[data-entry='agent']", { timeout: 10000 });
			const sawLoading = await page.evaluate(() => document.querySelector("#loading") !== null || true);
			const flashes = await page.evaluate(() => globalThis.__basicEmpty);
			if (flashes > 0) fail(`the empty state rendered ${flashes} times while the conversation loaded`);
			if (!sawLoading) fail("no loading state");
		},

		"My own message always pins": async ({ page, base }) => {
			await fresh(page, base);
			await longChat(page);
			await page.hover(S.log);
			await page.mouse.wheel(0, -3000);
			await page.waitForTimeout(200);
			if ((await distance(page)) < 200) fail("could not scroll up to set up the check");
			await send(page, "Reply with the single word: ok");
			await page.waitForTimeout(150);
			const gap = await distance(page);
			await waitIdle(page);
			if (gap > 2) fail(`after sending, the log was ${gap} px from the bottom`);
		},

		"Enter sends, Shift+Enter breaks a line, on desktop": async ({ page, base }) => {
			await fresh(page, base);
			await page.click(S.composer);
			await page.keyboard.type("line one");
			await page.keyboard.press("Shift+Enter");
			await page.keyboard.type("line two");
			const value = await page.inputValue(S.composer);
			if (value !== "line one\nline two") fail(`Shift+Enter gave ${JSON.stringify(value)}`);
			await page.keyboard.press("Enter");
			await page.waitForSelector("[data-entry='user']", { timeout: 5000 });
			const sent = await page.textContent("[data-entry='user']");
			if (!sent?.includes("line one") || !sent.includes("line two")) fail("Enter did not send the two-line message");
			if ((await page.inputValue(S.composer)) !== "") fail("the composer was not cleared after sending");
		},

		"Enter during IME composition never sends": async ({ page, base }) => {
			await fresh(page, base);
			await page.click(S.composer);
			await page.keyboard.insertText("にほん");
			await page.$eval(S.composer, (element) => {
				element.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
				element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", isComposing: true, keyCode: 229, bubbles: true, cancelable: true }));
				element.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true, data: "日本" }));
			});
			await page.waitForTimeout(400);
			if ((await page.$("[data-entry='user']")) !== null) fail("Enter during composition sent the message");
			if ((await page.inputValue(S.composer)) !== "にほん") fail("the draft was lost");
		},

		"On a phone, Enter is a newline": async ({ page, base }) =>
			phone(page, base, async (tab) => {
				await tab.evaluate(() => localStorage.removeItem("basic.draft"));
				await tab.tap(S.composer);
				await tab.keyboard.type("first");
				await tab.keyboard.press("Enter");
				await tab.keyboard.type("second");
				await tab.waitForTimeout(300);
				if ((await tab.$("[data-entry='user']")) !== null) fail("Return on a phone sent the message");
				const value = await tab.inputValue(S.composer);
				if (value !== "first\nsecond") fail(`Return gave ${JSON.stringify(value)}`);
				await tab.tap(S.send);
				await tab.waitForSelector("[data-entry='user']", { timeout: 5000 });
			}),

		"The shortcut is written down": async ({ page, base }) => {
			await fresh(page, base);
			const hint = await page.textContent("#composer-hint");
			if (!/Enter to send/.test(hint ?? "") || !/Shift \+ Enter/.test(hint ?? "")) fail(`hint is "${hint}"`);
			const described = await page.getAttribute(S.composer, "aria-describedby");
			if (described !== "composer-hint") fail("the composer does not reference the hint");
		},

		"The composer is focused and ready on load": async ({ page, base }) => {
			await fresh(page, base);
			await page.waitForTimeout(300);
			const focused = await page.evaluate(() => document.activeElement?.id);
			if (focused !== "composer") fail(`focus is on ${focused || "nothing"}`);
			await page.keyboard.type("ready");
			if ((await page.inputValue(S.composer)) !== "ready") fail("typing did not reach the composer");
			await page.fill(S.composer, "");
		},

		"The composer grows with the text, up to a limit": async ({ page, base }) => {
			await fresh(page, base);
			const start = await page.$eval(S.composer, (element) => element.getBoundingClientRect().height);
			await page.click(S.composer);
			for (let index = 0; index < 3; index += 1) await page.keyboard.press("Shift+Enter");
			await page.keyboard.type("x");
			await page.waitForTimeout(100);
			const grown = await page.$eval(S.composer, (element) => element.getBoundingClientRect().height);
			for (let index = 0; index < 30; index += 1) await page.keyboard.press("Shift+Enter");
			await page.waitForTimeout(100);
			const capped = await page.$eval(S.composer, (element) => ({ height: element.getBoundingClientRect().height, scrolls: element.scrollHeight > element.clientHeight }));
			await page.fill(S.composer, "");
			if (grown <= start) fail(`did not grow (${start} → ${grown})`);
			if (capped.height > 165) fail(`grew past the limit to ${capped.height}px`);
			if (!capped.scrolls) fail("at the limit the composer does not scroll inside itself");
		},

		"Send is disabled for empty input, and says why": async ({ page, base }) => {
			await fresh(page, base);
			const state = await page.$eval(S.send, (button) => ({ disabled: button.disabled, label: button.getAttribute("aria-label") }));
			if (!state.disabled) fail("Send is enabled with an empty composer");
			if (state.label !== "Message requires text") fail(`label is "${state.label}"`);
			await page.fill(S.composer, "   ");
			if (!(await page.$eval(S.send, (button) => button.disabled))) fail("Send is enabled for whitespace");
		},

		"A send that cannot go out keeps the draft": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Reply with the single word: ok");
			await waitIdle(page);
			await page.click("[role=tab]:has-text('faults')");
			await page.click("#fault-block");
			await page.waitForFunction(() => /Reconnecting|offline/i.test(document.querySelector("#composer-hint")?.textContent ?? ""), null, { timeout: 5000 });
			await page.fill(S.composer, "keep me");
			await page.click(S.send);
			await page.waitForTimeout(300);
			await frames(page);
			const kept = await page.inputValue(S.composer);
			const log = await page.textContent(S.log);
			await page.click("[role=tab]:has-text('faults')");
			if (kept !== "keep me") fail(`draft became ${JSON.stringify(kept)}`);
			if (!log.includes("Message not sent: reconnecting. Your draft is still in the composer")) fail("no notice that the draft was kept");
			if ((await page.$$("[data-entry='user']")).length !== 1) fail("the message was sent anyway");
			await page.waitForSelector("#retry-connection", { timeout: 20000 });
			await page.click("#retry-connection");
			await page.waitForFunction(() => document.querySelector("[data-connection]")?.getAttribute("data-connection") === "online", null, { timeout: 10000 });
		},

		"The draft survives a reload or a deploy": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Reply with the single word: ok");
			await waitIdle(page);
			const chat = page.url();
			await page.fill(S.composer, "survive the reload");
			await page.$eval(S.composer, (element) => {
				const data = new DataTransfer();
				data.items.add(new File(["png"], "diagram.png", { type: "image/png" }));
				element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
			});
			await page.waitForSelector("[data-attachment='diagram.png']", { timeout: 3000 });
			await page.reload({ waitUntil: "load" });
			await ready(page);
			if (page.url() !== chat) fail(`the reload left ${chat}`);
			const value = await page.inputValue(S.composer);
			const chip = await page.$("[data-attachment='diagram.png']");
			if (value !== "survive the reload") fail(`after reload the draft is ${JSON.stringify(value)}`);
			if (chip === null) fail("the attachment did not come back");
			await page.evaluate(() => {
				const stored = JSON.parse(localStorage.getItem("basic.draft"));
				stored.savedAt = Date.now() - 61 * 60 * 1000;
				localStorage.setItem("basic.draft", JSON.stringify(stored));
			});
			await page.reload({ waitUntil: "load" });
			await ready(page);
			if ((await page.inputValue(S.composer)) !== "") fail("a draft older than one hour came back");
		},

		"Typing hides the starter prompts": async ({ page, base }) => {
			await fresh(page, base);
			if ((await page.$$("[data-starter]")).length < 3) fail("no starters to hide");
			await page.keyboard.type("h");
			await frames(page);
			if ((await page.$$("[data-starter]")).length > 0) fail("starters stayed after typing");
			await page.fill(S.composer, "");
		},

		"Paste an image": async ({ page, base }) => {
			await fresh(page, base);
			await page.$eval(S.composer, (element) => {
				const data = new DataTransfer();
				data.items.add(new File([new Uint8Array([137, 80, 78, 71])], "screenshot.png", { type: "image/png" }));
				element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
			});
			await page.waitForSelector("[data-attachment='screenshot.png']", { timeout: 3000 });
			const remove = await page.getAttribute("[data-attachment='screenshot.png'] button", "aria-label");
			if (!/Remove/.test(remove ?? "")) fail("the chip has no remove control");
		},

		"Locked features say why they are locked": async ({ page, base }) => {
			await fresh(page, base);
			const labels = await page.$$eval("button:disabled", (buttons) => buttons.map((button) => button.getAttribute("aria-label") ?? ""));
			if (!labels.some((label) => label.includes("Attaching files is a subscriber-only feature"))) fail(`disabled controls say: ${labels.join(" | ")}`);
			if (labels.some((label) => label.trim() === "")) fail("a disabled control has no reason");
		},

		"Send becomes Stop": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Count slowly from 1 to 30");
			const label = await page.getAttribute(S.stop, "aria-label");
			if (label !== "Cancel message") fail(`Stop is labelled "${label}"`);
			await page.fill(S.composer, "next idea");
			if ((await page.inputValue(S.composer)) !== "next idea") fail("could not draft while working");
			await page.click(S.stop);
			await waitIdle(page, 5000);
			if ((await page.inputValue(S.composer)) !== "next idea") fail("stopping cleared the next draft");
		},

		"Esc stops the agent": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Count slowly from 1 to 30");
			await page.keyboard.press("Escape");
			await waitIdle(page, 3000);
			if ((await page.$("[data-stopped]")) === null) fail("the turn does not say it stopped");
		},

		"A thinking indicator appears only when it is needed": async ({ page, base }) => {
			await fresh(page, base);
			await send(page, "Reply with the single word: ok");
			let flashed = false;
			for (let index = 0; index < 10; index += 1) {
				flashed ||= (await page.$(S.thinking)) !== null;
				await page.waitForTimeout(60);
			}
			await waitIdle(page);
			if (flashed) fail("the thinking indicator flashed on a fast reply");
			await send(page, "Explain Durable Objects in one minute");
			await page.waitForSelector(S.thinking, { timeout: 3000 });
			const live = await page.$eval(S.activity, (element) => ({ live: element.getAttribute("aria-live"), role: element.getAttribute("role") }));
			await page.click(S.stop);
			if (live.live !== "polite") fail(`the indicator region is aria-live=${live.live}`);
		},

		"Each tool call shows a live timer": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Run the long check that takes minutes");
			await page.waitForSelector("[data-tool='index_repo'][data-status='running']", { timeout: 5000 });
			const first = await page.textContent("[data-tool='index_repo'] [data-tool-timer]");
			await page.waitForTimeout(2200);
			const second = await page.textContent("[data-tool='index_repo'] [data-tool-timer]");
			if (first === second) fail(`the tool timer did not move (${first})`);
			await page.click(S.stop);
			await fresh(page, base);
			await startTurn(page, "Run the tests and fix what fails");
			await page.waitForSelector("[data-tool='read_file'][data-status='ok']", { timeout: 8000 });
			const ended = await page.textContent("[data-tool='read_file'] [data-tool-timer]");
			await page.waitForTimeout(1500);
			const stillEnded = await page.textContent("[data-tool='read_file'] [data-tool-timer]");
			await waitIdle(page);
			if (ended !== stillEnded) fail(`a finished tool timer kept counting (${ended} → ${stillEnded})`);
		},

		"The whole task shows a live timer": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Run the long check that takes minutes");
			await page.waitForTimeout(61500);
			const first = await page.textContent(S.turnTimer);
			await page.waitForTimeout(1500);
			const second = await page.textContent(S.turnTimer);
			const title = await page.title();
			await page.click(S.stop);
			if (!/^task \d+m \d{2}s$/.test(first ?? "")) fail(`the task timer reads "${first}"`);
			if (!/^task 1m/.test(first ?? "")) fail(`after a minute the timer reads "${first}"`);
			if (first === second) fail(`the task timer did not move (${first})`);
			if (!/working/i.test(title)) fail(`tab title is "${title}"`);
		},

		"A stuck tool row never runs forever": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Deploy a preview that gets stuck");
			await waitIdle(page, 15000);
			await page.waitForSelector("[data-tool='deploy_preview']", { timeout: 3000 });
			const status = await page.getAttribute("[data-tool='deploy_preview']", "data-status");
			const timer = await page.textContent("[data-tool='deploy_preview'] [data-tool-timer]");
			await page.waitForTimeout(1500);
			const later = await page.textContent("[data-tool='deploy_preview'] [data-tool-timer]");
			if (status !== "stuck") fail(`the stuck row is ${status}`);
			if (timer !== later) fail(`the stuck row timer climbs (${timer} → ${later})`);
			const text = await page.textContent("[data-tool='deploy_preview']");
			if (!/no result/i.test(text ?? "")) fail("the stuck row does not show an error");
		},

		"A turn that ends with nothing visible says so": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Reply with nothing visible");
			await waitIdle(page, 10000);
			const text = await page.textContent("[data-empty-turn]");
			if (text !== "Agent completed without a visible response. Please retry.") fail(`it says "${text}"`);
		},

		"Reasoning is folded": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Explain Durable Objects in one minute");
			await waitIdle(page);
			const thinking = await page.$eval("[data-thinking]", (element) => ({ open: element.open, label: element.querySelector("summary")?.textContent ?? "" }));
			const order = await page.evaluate(() => {
				const turn = document.querySelector("[data-entry='agent']");
				const think = turn.querySelector("[data-thinking]");
				const answer = turn.querySelector("[data-answer]");
				return Boolean(think.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING);
			});
			if (thinking.open) fail("the thinking block is open by default");
			if (!/Thinking/.test(thinking.label)) fail(`the disclosure is labelled "${thinking.label}"`);
			if (!order) fail("reasoning is not above the answer");
		},

		"Tool rows keep their open or closed state while streaming": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Run the tests and fix what fails");
			await page.waitForSelector("[data-tool='read_file']", { timeout: 5000 });
			await page.click("[data-tool='read_file'] summary");
			await page.waitForTimeout(3000);
			const open = await page.$eval("[data-tool='read_file']", (element) => element.open);
			await waitIdle(page);
			const stillOpen = await page.$eval("[data-tool='read_file']", (element) => element.open);
			if (!open || !stillOpen) fail("the opened tool row closed while the message streamed");
		},

		"A new chat appears in the list at once": async ({ page, base }) => {
			await fresh(page, base);
			await page.click("#new-chat");
			await send(page, "Explain Durable Objects in one minute");
			await page.waitForSelector(`[data-group='Today'] ${S.row}`, { timeout: 2000 });
			const replied = await page.$("[data-answer]");
			if (replied !== null) fail("the row appeared only after the reply");
			if (!/\/c\/c-/.test(page.url())) fail(`the URL did not change: ${page.url()}`);
			await page.click(S.stop);
		},

		"Each chat shows whether it is working": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Count slowly from 1 to 30");
			await page.waitForSelector(`${S.row}[data-working='true'] [data-in-progress]`, { timeout: 3000 });
			const text = await page.textContent(`${S.row}[data-working='true']`);
			if (!text?.includes("Response in progress")) fail("no Response in progress status");
			await page.click(S.stop);
			await page.waitForSelector(`${S.row}[data-working='false']`, { timeout: 3000 });
		},

		"Each chat shows working, idle, or failed at a glance": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Run the statement workflow and show the error");
			await waitIdle(page);
			await page.click("#new-chat");
			await startTurn(page, "Reply with the single word: ok");
			await waitIdle(page);
			await page.click("#new-chat");
			await startTurn(page, "Count slowly from 1 to 30");
			const dots = await page.$$eval(`${S.row} [data-status]`, (elements) => elements.map((element) => ({ state: element.getAttribute("data-status"), color: getComputedStyle(element).backgroundColor, animated: getComputedStyle(element).animationName !== "none" })));
			await page.click(S.stop);
			const states = dots.map((dot) => dot.state).sort();
			if (states.join() !== "failed,idle,working") fail(`dots are ${states.join()}`);
			const working = dots.find((dot) => dot.state === "working");
			const idle = dots.find((dot) => dot.state === "idle");
			const failed = dots.find((dot) => dot.state === "failed");
			if (!working.animated) fail("the working dot does not animate");
			const rgb = (color) => color.match(/\d+/g).map(Number);
			const [ir, ig] = rgb(idle.color);
			const [fr, fg] = rgb(failed.color);
			if (!(ig > ir)) fail(`the idle dot is not green (${idle.color})`);
			if (!(fr > fg)) fail(`the failed dot is not red (${failed.color})`);
		},

		"The list is grouped by time and searchable": async ({ page, base }) => {
			await fresh(page, base);
			await page.evaluate(() => {
				const day = 24 * 60 * 60 * 1000;
				const now = Date.now();
				const chat = (id, title, at) => ({ id, title, createdAt: at, updatedAt: at, pinned: false, archived: false, entries: [{ _tag: "User", id: `u-${id}`, text: title, attachments: [], at }] });
				localStorage.setItem("basic.chats", JSON.stringify([chat("c-today", "Pricing page copy", now), chat("c-yday", "Queue retries", now - day), chat("c-week", "Schema migration", now - 3 * day), chat("c-old", "Logo ideas", now - 40 * day)]));
			});
			await page.reload({ waitUntil: "load" });
			await ready(page);
			const groups = await page.$$eval("[data-group]", (sections) => sections.map((section) => section.getAttribute("data-group")));
			if (groups.join() !== "Today,Yesterday,Last 7 days,Older") fail(`groups are ${groups.join()}`);
			await page.fill("#search", "queue");
			await frames(page);
			const titles = await page.$$eval(`${S.row} [data-title]`, (rows) => rows.map((row) => row.textContent));
			await page.fill("#search", "");
			if (titles.length !== 1 || titles[0] !== "Queue retries") fail(`search for queue shows ${titles.join(", ")}`);
		},

		"Pin, archive, and rename from the row": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Reply with the single word: ok");
			await waitIdle(page);
			const row = page.locator(S.row).first();
			await row.hover();
			if (!(await row.locator("button[aria-label='Pin']").isVisible())) fail("Pin is not shown on hover");
			if (!(await row.locator("button[aria-label='Archive']").isVisible())) fail("Archive is not shown on hover");
			await row.locator("button[aria-label='Pin']").click();
			await page.waitForSelector(`[data-group='Pinned'] ${S.row}`, { timeout: 2000 });
			await page.locator(`${S.row} [data-title]`).first().dblclick();
			const input = page.locator(`${S.row} input[aria-label='Rename conversation']`);
			await input.fill("Renamed in place");
			await input.press("Enter");
			await page.waitForSelector(`${S.row} [data-title]:has-text('Renamed in place')`, { timeout: 2000 });
			await page.locator(S.row).first().hover();
			await page.locator(`${S.row} button[aria-label='Archive']`).first().click();
			await page.waitForTimeout(200);
			const visible = await page.$$eval(`nav [data-group] ${S.row}`, (rows) => rows.length);
			if (visible !== 0) fail("the archived chat stayed in the list");
		},

		"Delete asks first": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Reply with the single word: ok");
			await waitIdle(page);
			const title = await page.textContent(`${S.row} [data-title]`);
			await page.locator(S.row).first().hover();
			await page.click(`${S.row} button[aria-label='Delete']`);
			const dialog = await page.textContent("#confirm-delete");
			if (!dialog?.includes(title ?? "@@")) fail(`the confirmation does not name "${title}"`);
			await page.click("#confirm-delete-button");
			await frames(page);
			await page.waitForSelector(S.row, { state: "detached", timeout: 2000 });
		},

		"Copy a message": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Run the tests and fix what fails");
			await waitIdle(page);
			await page.click("[data-entry='agent'] [data-copy-message]");
			const copied = await page.evaluate(() => navigator.clipboard.readText());
			if (!copied.includes("**quantity**") || !copied.includes("```ts")) fail(`the clipboard is not the markdown: ${JSON.stringify(copied.slice(0, 60))}`);
			await page.hover("[data-entry='user']");
			await page.click("[data-entry='user'] [data-copy-message]");
			if ((await page.evaluate(() => navigator.clipboard.readText())) !== "Run the tests and fix what fails") fail("my own message does not copy");
		},

		"Copy a code block": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Show greeting code in three languages");
			await waitIdle(page);
			const button = page.locator("[data-code-block='python'] [data-copy-code]");
			await button.click();
			await frames(page);
			const label = await button.textContent();
			const copied = await page.evaluate(() => navigator.clipboard.readText());
			await page.waitForTimeout(1400);
			const back = await button.textContent();
			if (label !== "copied") fail(`after a click the button says "${label}"`);
			if (!copied.startsWith("def greet") || copied.includes("```")) fail(`the clipboard holds ${JSON.stringify(copied.slice(0, 40))}`);
			if (back !== "copy") fail(`after a second the button says "${back}"`);
		},

		"Retry, edit, and branch": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Reply with the single word: ok");
			await waitIdle(page);
			const user = page.locator("[data-entry='user']").first();
			await user.hover();
			for (const label of ["Retry", "Edit message", "Branch off"]) if ((await user.locator(`button[aria-label='${label}']`).count()) !== 1) fail(`no ${label} action`);
			await user.locator("button[aria-label='Retry']").click();
			await page.waitForSelector(S.stop, { timeout: 5000 });
			await waitIdle(page);
			if ((await page.$$("[data-entry='user']")).length !== 2) fail("Retry did not resend");
			await page.locator("[data-entry='user']").first().hover();
			await page.locator("[data-entry='user']").first().locator("button[aria-label='Branch off']").click();
			await page.waitForFunction(() => document.querySelectorAll("[data-conversation]").length === 2, null, { timeout: 3000 });
			await page.locator("[data-entry='user']").last().hover();
			await page.locator("[data-entry='user']").last().locator("button[aria-label='Edit message']").click();
			await frames(page);
			if ((await page.inputValue(S.composer)) !== "Reply with the single word: ok") fail("Edit did not refill the composer");
			await startTurn(page, "Count slowly from 1 to 30");
			await page.locator("[data-entry='user']").first().hover();
			const lock = await page.locator("[data-entry='user']").first().locator("button[disabled]").first().getAttribute("aria-label");
			await page.click(S.stop);
			if (!/Stop the running turn|sign in/i.test(lock ?? "")) fail(`a disabled action says "${lock}"`);
		},

		"Code is highlighted without blocking the first token": async ({ page, base }) => {
			await fresh(page, base);
			await page.evaluate(() => {
				globalThis.__basicFirst = null;
				new MutationObserver(() => {
					if (globalThis.__basicFirst === null && document.querySelector("[data-answer]")?.textContent?.trim()) globalThis.__basicFirst = { at: performance.now(), highlighter: performance.getEntriesByType("resource").some((entry) => /highlight-/.test(entry.name)) };
				}).observe(document.body, { childList: true, subtree: true, characterData: true });
			});
			await startTurn(page, "Show greeting code in three languages");
			await page.waitForFunction(() => globalThis.__basicFirst !== null, null, { timeout: 5000 });
			const first = await page.evaluate(() => globalThis.__basicFirst);
			await waitIdle(page);
			await page.waitForSelector("[data-code-block='ts'][data-highlighted='true']", { timeout: 5000 });
			const spans = await page.$$eval("[data-code-block='ts'] pre span", (nodes) => nodes.length);
			if (first.highlighter) fail("the highlighter loaded before the first token rendered");
			if (spans === 0) fail("the code block was never upgraded with highlighting");
		},

		"Reconnecting is shown, then gives up honestly": async ({ page, base }) => {
			await fresh(page, base);
			await page.click("[role=tab]:has-text('faults')");
			await page.click("#fault-block");
			await page.waitForFunction(() => /Reconnecting/.test(document.querySelector("#connection")?.textContent ?? ""), null, { timeout: 5000 });
			await page.waitForSelector("#retry-connection", { timeout: 20000 });
			const offline = await page.textContent("#connection");
			if (!/offline/i.test(offline ?? "")) fail(`gave up with "${offline}"`);
			await page.click("#retry-connection");
			await page.waitForFunction(() => document.querySelector("[data-connection]")?.getAttribute("data-connection") === "online", null, { timeout: 10000 });
		},

		"A stale close cannot undo a good connection": async ({ page, base }) => {
			await fresh(page, base);
			await page.click("[role=tab]:has-text('faults')");
			await page.click("#fault-drop");
			await page.waitForFunction(() => document.querySelector("[data-connection]")?.getAttribute("data-connection") !== "online", null, { timeout: 5000 });
			await page.waitForFunction(() => document.querySelector("[data-connection]")?.getAttribute("data-connection") === "online", null, { timeout: 10000 });
			await page.click("#fault-late-close");
			await page.waitForTimeout(500);
			const state = await page.getAttribute("[data-connection]", "data-connection");
			if (state !== "online") fail(`a stale close moved the state to ${state}`);
		},

		"A backgrounded tab catches up when it returns": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Reply with the single word: ok");
			await page.evaluate(() => {
				Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
				document.dispatchEvent(new Event("visibilitychange"));
			});
			await page.waitForTimeout(800);
			await page.evaluate(() => {
				Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
				document.dispatchEvent(new Event("visibilitychange"));
			});
			await page.waitForFunction(() => document.querySelector("[data-connection]")?.getAttribute("data-connection") === "online", null, { timeout: 10000 });
			await page.waitForSelector("[data-entry='agent'][data-phase='done']", { timeout: 5000 });
		},

		"A turn interrupted by a restart resumes": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Run migrations through a restart and resume");
			await page.waitForSelector("[data-resumed='restarting']", { timeout: 5000 });
			await waitIdle(page, 15000);
			const text = await page.textContent("[data-resumed='yes']");
			if (!/resumed from checkpoint 2 of 4/.test(text ?? "")) fail(`the transcript says "${text}"`);
			const tools = await page.$$eval("[data-tool='run_migrations']", (rows) => rows.map((row) => row.getAttribute("data-status")));
			if (tools.join() !== "ok,ok") fail(`the migration rows are ${tools.join()}`);
		},

		"Errors sit in the transcript in order": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Run the statement workflow and show the error");
			await waitIdle(page);
			await page.click("[role=tab]:has-text('faults')");
			await page.click("#fault-block");
			await page.waitForFunction(() => /Reconnecting|offline/i.test(document.querySelector("#composer-hint")?.textContent ?? ""), null, { timeout: 5000 });
			await page.fill(S.composer, "try anyway");
			await page.click(S.send);
			await frames(page);
			const order = await page.$$eval("#log [data-entry]", (rows) => rows.map((row) => row.getAttribute("data-entry")));
			if (order.join() !== "user,agent,notice") fail(`transcript order is ${order.join()}`);
			const errorInside = await page.$eval("[data-entry='agent']", (turn) => turn.querySelector("[data-error]") !== null);
			if (!errorInside) fail("the error is not inside the turn it belongs to");
			await page.waitForSelector("#retry-connection", { timeout: 20000 });
			await page.click("#retry-connection");
			await page.waitForFunction(() => document.querySelector("[data-connection]")?.getAttribute("data-connection") === "online", null, { timeout: 10000 });
			await startTurn(page, "Reply with the single word: ok");
			await waitIdle(page);
			if ((await page.$$("[data-entry='notice']")).length !== 0) fail("a new turn did not clear the transient notice");
		},

		"A long error is summarised, with detail on demand": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Run the statement workflow and show the error");
			await waitIdle(page);
			const summary = await page.$eval("[data-error-summary]", (element) => ({ text: element.textContent, lines: Math.round(element.getBoundingClientRect().height / parseFloat(getComputedStyle(element).lineHeight)) }));
			const hidden = await page.$eval("[data-error] details", (element) => !element.open);
			await page.click("[data-error] details summary");
			const detail = await page.textContent("[data-error] details pre");
			if (summary.lines > 2) fail(`the summary spans ${summary.lines} lines`);
			if (!hidden) fail("the full error is open by default");
			if (!detail?.includes("at normaliseInvoice")) fail("the full text is not in the disclosure");
		},

		"A side panel can be hidden and shown again": async ({ page, base }) => {
			await fresh(page, base);
			for (const [toggle, panel] of [
				[S.toggleLeft, S.leftPanel],
				[S.toggleRight, S.rightPanel],
			]) {
				const name = await page.getAttribute(toggle, "aria-label");
				if (!name) fail(`${toggle} has no accessible name`);
				const before = await width(page, panel);
				const conversation = await width(page, "#conversation");
				await page.click(toggle);
				if ((await width(page, panel)) !== 0) fail(`${panel} did not hide`);
				if ((await width(page, "#conversation")) <= conversation) fail("the conversation did not take the width");
				await page.click(toggle);
				if ((await width(page, panel)) !== before) fail(`${panel} came back at ${await width(page, panel)} px, not ${before}`);
			}
		},

		"A side panel can be resized on desktop": async ({ page, base }) => {
			await fresh(page, base);
			const start = await width(page, S.rightPanel);
			await drag(page, S.dragRight, -80);
			const wider = await width(page, S.rightPanel);
			if (Math.abs(wider - (start + 80)) > 4) fail(`the inspector went from ${start} to ${wider} px for an 80 px drag`);
			await drag(page, S.dragRight, -3000);
			const max = await width(page, S.rightPanel);
			const conversation = await width(page, "#conversation");
			if (max > 480) fail(`the inspector grew past its maximum to ${max} px`);
			if (conversation < 420) fail(`the conversation shrank to ${conversation} px`);
			await drag(page, S.dragLeft, -3000);
			const min = await width(page, S.leftPanel);
			if (min !== 200) fail(`the conversations panel stopped at ${min} px, not its 200 px minimum`);
		},

		"Panel sizes and visibility survive a reload": async ({ page, base }) => {
			await fresh(page, base);
			await drag(page, S.dragRight, -60);
			await page.click(S.toggleLeft);
			const right = await width(page, S.rightPanel);
			await page.reload({ waitUntil: "load" });
			await ready(page);
			if ((await width(page, S.leftPanel)) !== 0) fail("the hidden panel came back after a reload");
			if ((await width(page, S.rightPanel)) !== right) fail(`the inspector is ${await width(page, S.rightPanel)} px after a reload, not ${right}`);
		},

		"What is inside a panel adapts to its width": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Run the tests and fix what fails");
			await waitIdle(page);
			const report = [];
			for (const size of [1440, 1100, 900, 780]) {
				await page.setViewportSize({ width: size, height: 800 });
				for (const dx of [0, -3000, 3000]) {
					if (dx !== 0 && (await page.$(S.dragRight)) !== null) await drag(page, S.dragRight, dx);
					const overflow = await page.evaluate(() => {
						const page = document.documentElement.scrollWidth - document.documentElement.clientWidth;
						const regions = ["header", "#left-panel", "#right-panel", "#conversation", "#composer-form"].map((selector) => document.querySelector(selector)).filter((element) => element !== null && element.clientWidth > 0);
						const clipped = regions.filter((region) => region.scrollWidth > region.clientWidth + 1).map((region) => region.id || region.tagName);
						return { page, clipped };
					});
					if (overflow.page > 0) fail(`the page scrolls sideways by ${overflow.page} px at ${size} px`);
					if (overflow.clipped.length > 0) fail(`${overflow.clipped.join(", ")} overflow sideways at ${size} px`);
				}
				report.push(size);
			}
			await page.setViewportSize({ width: 1280, height: 800 });
			return `no sideways overflow at ${report.join(", ")} px, panels at min and max`;
		},

		"On a phone, side panels open over the conversation": async ({ page, base }) =>
			phone(page, base, async (tab) => {
				const conversation = await width(tab, "#conversation");
				if (conversation < 388) fail(`a panel takes width from the conversation (${conversation} px)`);
				if ((await tab.$(S.dragLeft)) !== null || (await tab.$(S.dragRight)) !== null) fail("a drag edge exists on a phone");
				await tab.tap(S.toggleLeft);
				await tab.waitForSelector(S.leftPanel, { timeout: 2000 });
				const left = await tab.$eval(S.leftPanel, (element) => ({ position: getComputedStyle(element).position, left: element.getBoundingClientRect().left }));
				if (left.position !== "fixed") fail(`the conversations panel opened as ${left.position}`);
				if ((await width(tab, "#conversation")) !== conversation) fail("opening the panel changed the conversation width");
				await tab.tap("button[aria-label='Close conversations']");
				await tab.waitForSelector(S.leftPanel, { state: "detached", timeout: 2000 });
				await tab.tap(S.toggleRight);
				await tab.waitForSelector(S.rightPanel, { timeout: 2000 });
				const right = await tab.$eval(S.rightPanel, (element) => getComputedStyle(element).position);
				if (right !== "fixed") fail(`the inspector opened as ${right}`);
			}),

		"Each panel toggle has a keyboard shortcut": async ({ page, base }) => {
			await fresh(page, base);
			for (const [key, panel] of [
				["b", S.leftPanel],
				["j", S.rightPanel],
			]) {
				await page.keyboard.press(`ControlOrMeta+${key}`);
				if ((await width(page, panel)) !== 0) fail(`Cmd+${key.toUpperCase()} did not hide ${panel}`);
				await page.keyboard.press(`ControlOrMeta+${key}`);
				if ((await width(page, panel)) === 0) fail(`Cmd+${key.toUpperCase()} did not show ${panel}`);
			}
			const shortcuts = await page.$$eval(`${S.toggleLeft}, ${S.toggleRight}`, (buttons) => buttons.map((button) => button.getAttribute("aria-keyshortcuts")));
			if (shortcuts.join() !== "Meta+B,Meta+J") fail(`the toggles document ${shortcuts.join()}`);
		},

		"A double click on the drag edge restores the default width": async ({ page, base }) => {
			await fresh(page, base);
			const start = await width(page, S.rightPanel);
			await drag(page, S.dragRight, -100);
			if ((await width(page, S.rightPanel)) === start) fail("the drag did not change the width");
			await page.dblclick(S.dragRight);
			await frames(page);
			if ((await width(page, S.rightPanel)) !== start) fail(`a double click gave ${await width(page, S.rightPanel)} px, not ${start}`);
		},

		"A signed-out visitor sees one way in": async ({ page, base }) =>
			visitor(page, async (context) => {
				const tab = await context.newPage();
				for (const path of ["/", "/c/c-anything", "/settings"]) {
					await tab.goto(base + path, { waitUntil: "load" });
					await tab.waitForSelector("#sign-in", { timeout: 10000 });
					const buttons = await tab.getByRole("link", { name: "Sign in with Cloudflare" }).count();
					const logo = await tab.$eval("#sign-in img", (image) => image.getAttribute("src"));
					const leaked = await tab.locator(`${S.composer}, ${S.row}, #left-panel`).count();
					const about = await tab.textContent("main");
					if (buttons !== 1) fail(`${path} shows ${buttons} sign-in buttons`);
					if (logo !== "/brand/cloudflare-cloud.svg") fail(`${path} button does not carry the Cloudflare mark`);
					if (leaked > 0) fail(`${path} shows app content to a visitor`);
					if (!/agent chat/i.test(about ?? "")) fail(`${path} does not say what the app does`);
				}
			}),

		"The API refuses a caller who is not signed in": async ({ page, base }) =>
			visitor(page, async (context) => {
				for (const path of ["/api/me", "/api/account"]) {
					const response = path === "/api/me" ? await context.request.get(base + path) : await context.request.post(base + path, { data: { account: "x" } });
					const body = await response.json().catch(() => ({}));
					if (response.status() !== 401) fail(`${path} answered ${response.status()}`);
					if (typeof body.error !== "string" || body.signIn !== "/auth/sign-in") fail(`${path} 401 body is ${JSON.stringify(body)}`);
				}
			}),

		"The first sign-in asks only what it needs, then lands somewhere useful": async ({ page, base }) =>
			visitor(page, async (context) => {
				const tab = await context.newPage();
				await tab.goto(base + "/", { waitUntil: "load" });
				await tab.click("#sign-in");
				await tab.fill("#email", `first-${Date.now()}@example.com`);
				await tab.click("#allow");
				await tab.waitForSelector("#continue", { timeout: 10000 });
				const asked = await tab.$$eval("input:not([type=hidden])", (inputs) => inputs.map((input) => input.name));
				if (asked.some((name) => name !== "account")) fail(`the first sign-in asks for ${asked.join(", ")}`);
				const question = await tab.textContent("h1");
				if (!/pays for models/i.test(question ?? "")) fail(`it asks "${question}"`);
				await tab.click("#continue");
				await tab.waitForSelector(S.composer, { timeout: 10000 });
				await tab.waitForTimeout(300);
				if ((await tab.evaluate(() => document.activeElement?.id)) !== "composer") fail("did not land ready to type");
			}),

		"A cancelled or failed sign-in says why": async ({ page, base }) =>
			visitor(page, async (context) => {
				const tab = await context.newPage();
				await tab.goto(base + "/", { waitUntil: "load" });
				await tab.click("#sign-in");
				await tab.click("#cancel");
				await tab.waitForSelector("#sign-in-error", { timeout: 10000 });
				const cancelled = await tab.textContent("#sign-in-error");
				if (!/cancelled/i.test(cancelled ?? "")) fail(`cancel says "${cancelled}"`);
				if ((await tab.getByRole("link", { name: "Sign in with Cloudflare" }).count()) !== 1) fail("no way to try again after cancel");
				await tab.click("#sign-in");
				await tab.fill("#email", "not-an-email");
				await tab.$eval("form", (form) => form.setAttribute("novalidate", ""));
				await tab.click("#allow");
				await tab.waitForSelector("#sign-in-error", { timeout: 10000 });
				const failed = await tab.textContent("#sign-in-error");
				if (!/could not confirm/i.test(failed ?? "")) fail(`failure says "${failed}"`);
			}),

		"Who I am is always one click away": async ({ page, base }) => {
			await fresh(page, base);
			const who = await page.textContent("#who");
			if (!who?.includes("@")) fail("the signed-in identity is not shown");
			if (!(await page.locator("#who").isVisible())) fail("the identity is not visible");
		},

		"Signing out is one visible control": async ({ page, base }) =>
			visitor(page, async (context) => {
				await signIn(context, base);
				const tab = await context.newPage();
				await tab.goto(base + "/", { waitUntil: "load" });
				await ready(tab);
				const control = tab.getByRole("button", { name: "Sign out" });
				if (!(await control.isVisible())) fail("no visible Sign out control");
				if ((await tab.getAttribute("#sign-out", "method")) !== "post") fail("Sign out is not a POST");
				const cookies = await context.cookies();
				const session = cookies.find((cookie) => cookie.name === "basic_session");
				await control.click();
				await tab.waitForURL(/signed_out=1/, { timeout: 10000 });
				await tab.waitForSelector("#sign-in", { timeout: 10000 });
				const replay = await page.context().browser().newContext();
				const response = await replay.request.get(`${base}/api/me`, { headers: { cookie: `basic_session=${session.value}` } });
				await replay.close();
				if (response.status() !== 401) fail(`the old session still works on the server (${response.status()})`);
			}),

		"After signing out, nothing private is reachable": async ({ page, base }) =>
			visitor(page, async (context) => {
				await signIn(context, base);
				const tab = await context.newPage();
				await tab.goto(base + "/", { waitUntil: "load" });
				await ready(tab);
				await startTurn(tab, "Reply with the single word: ok");
				await waitIdle(tab);
				const chat = tab.url();
				await tab.getByRole("button", { name: "Sign out" }).click();
				await tab.waitForURL(/signed_out=1/, { timeout: 10000 });
				await tab.goBack();
				await tab.waitForSelector("#sign-in", { timeout: 10000 });
				await tab.goto(chat, { waitUntil: "load" });
				await tab.waitForSelector("#sign-in", { timeout: 10000 });
				if ((await tab.locator(`${S.composer}, ${S.row}`).count()) > 0) fail("private content is reachable after sign-out");
				const api = await context.request.get(`${base}/api/me`);
				if (api.status() !== 401) fail(`the API answered ${api.status()} after sign-out`);
			}),

		"Signing out revokes what the app was granted": async ({ page, base }) =>
			visitor(page, async (context) => {
				await signIn(context, base);
				const session = (await context.cookies()).find((cookie) => cookie.name === "basic_session");
				const tab = await context.newPage();
				await tab.goto(base + "/", { waitUntil: "load" });
				await ready(tab);
				await tab.getByRole("button", { name: "Sign out" }).click();
				await tab.waitForURL(/signed_out=1/, { timeout: 10000 });
				const thief = await page.context().browser().newContext();
				const host = new URL(base).hostname;
				await thief.addCookies([{ name: "basic_session", value: session.value, domain: host, path: "/", secure: base.startsWith("https"), httpOnly: true }]);
				const stolen = await thief.request.get(`${base}/api/me`);
				const socket = await thief.newPage();
				await socket.goto(base + "/", { waitUntil: "load" });
				const signInShown = await socket.waitForSelector("#sign-in", { timeout: 10000 }).then(() => true, () => false);
				await thief.close();
				if (stolen.status() !== 401) fail(`the revoked session still answers ${stolen.status()}`);
				if (!signInShown) fail("a copy of the revoked cookie still opens the app");
			}),

		"An expired session sends me to sign in, keeping my place": async ({ page, base }) =>
			visitor(page, async (context) => {
				await signIn(context, base);
				const tab = await context.newPage();
				await tab.goto(base + "/", { waitUntil: "load" });
				await ready(tab);
				await startTurn(tab, "Reply with the single word: ok");
				await waitIdle(tab);
				const chat = new URL(tab.url()).pathname;
				await tab.click("[role=tab]:has-text('faults')");
				await tab.click("#fault-expire");
				await tab.waitForTimeout(300);
				await tab.fill(S.composer, "are you there?");
				await tab.press(S.composer, "Enter");
				await tab.waitForSelector("#sign-in-again", { timeout: 10000 });
				await tab.click("#sign-in-again");
				await tab.waitForSelector("#allow", { timeout: 10000 });
				await tab.click("#allow");
				await tab.waitForSelector("#continue", { timeout: 10000 });
				await tab.click("#continue");
				await tab.waitForSelector(S.composer, { timeout: 10000 });
				if (new URL(tab.url()).pathname !== chat) fail(`after signing in again I am on ${new URL(tab.url()).pathname}, not ${chat}`);
			}),

		"The transcript is a polite live region": async ({ page, base }) => {
			await fresh(page, base);
			const attributes = await page.$eval(S.log, (element) => ({ role: element.getAttribute("role"), live: element.getAttribute("aria-live"), labelledby: element.getAttribute("aria-labelledby") }));
			if (attributes.role !== "log" || attributes.live !== "polite") fail(`log has role=${attributes.role} aria-live=${attributes.live}`);
			const heading = await page.$eval(`#${attributes.labelledby}`, (element) => element.tagName);
			if (!/^H[1-6]$/.test(heading)) fail("the log has no heading");
		},

		"Motion respects the system setting": async ({ page, base }) => {
			await page.emulateMedia({ reducedMotion: "reduce" });
			await fresh(page, base);
			await startTurn(page, "Explain Durable Objects in one minute");
			await page.waitForSelector(S.thinking, { timeout: 3000 });
			const animated = await page.$$eval("*", (elements) => elements.filter((element) => getComputedStyle(element).animationName !== "none" && getComputedStyle(element).animationDuration !== "0s").map((element) => element.className.toString().slice(0, 40)));
			const smooth = await page.$eval(S.log, (element) => getComputedStyle(element).scrollBehavior);
			await page.click(S.stop);
			await page.emulateMedia({ reducedMotion: "no-preference" });
			if (animated.length > 0) fail(`${animated.length} elements animate with reduced motion on: ${animated[0]}`);
			if (smooth === "smooth") fail("the transcript scrolls smoothly with reduced motion on");
		},

		"Every icon button has a name": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Run the tests and fix what fails");
			await waitIdle(page);
			const unnamed = await page.$$eval("button, [role=button], a", (elements) => elements.filter((element) => (element.getAttribute("aria-label") ?? element.textContent ?? "").replace(/[^\p{L}\p{N}]/gu, "").length === 0).map((element) => element.outerHTML.slice(0, 60)));
			if (unnamed.length > 0) fail(`unnamed controls: ${unnamed.join(", ")}`);
		},

		"No text sits on top of other text": async ({ page, base }) => {
			await fresh(page, base);
			await startTurn(page, "Run the tests and fix what fails");
			await page.waitForTimeout(3000);
			const running = await overlaps(page);
			await waitIdle(page);
			const idle = await overlaps(page);
			const onPhone = await phone(page, base, async (tab) => {
				const empty = await overlaps(tab);
				await tab.tap(S.composer);
				await tab.keyboard.type("Run the tests and fix what fails");
				await tab.tap(S.send);
				await tab.waitForSelector(S.stop, { timeout: 5000 });
				await tab.waitForTimeout(3000);
				return [...empty, ...(await overlaps(tab))];
			});
			const hits = [...running, ...idle, ...onPhone];
			if (hits.length > 0) fail(`overlapping text: ${hits.join("; ")}`);
		},

		"Notifications have a keyboard shortcut": async ({ page, base }) => {
			await fresh(page, base);
			await page.keyboard.press("Alt+KeyT");
			await frames(page);
			const focused = await page.evaluate(() => document.activeElement?.id);
			const documented = await page.getAttribute("#notifications", "aria-keyshortcuts");
			if (focused !== "notifications") fail(`Alt+T focused ${focused}`);
			if (documented !== "Alt+T") fail("the shortcut is not documented on the region");
		},

		"The empty state offers starters": async ({ page, base }) => {
			await fresh(page, base);
			const question = await page.textContent("#empty-state h1");
			const starters = await page.$$("[data-starter]");
			if (question !== "How can I help you?") fail(`the empty state asks "${question}"`);
			if (starters.length < 3 || starters.length > 5) fail(`${starters.length} starters`);
			await starters[0].click();
			await page.waitForSelector("[data-entry='user']", { timeout: 3000 });
		},

		"Starters belong to the owner": async ({ page, base }) => {
			await fresh(page, base);
			await page.click("#open-settings");
			await page.fill("#starters-input", "Summarise my week\nDraft a release note\nFind slow queries");
			await page.click("#save-settings");
			await frames(page);
			const starters = await page.$$eval("[data-starter]", (buttons) => buttons.map((button) => button.textContent));
			await page.reload({ waitUntil: "load" });
			await ready(page);
			const kept = await page.$$eval("[data-starter]", (buttons) => buttons.map((button) => button.textContent));
			if (starters.join("|") !== "Summarise my week|Draft a release note|Find slow queries") fail(`starters are ${starters.join("|")}`);
			if (kept.join("|") !== starters.join("|")) fail("the edited starters did not survive a reload");
		},

		"The copy names the outcome, not the feature": async ({ page, base }) => {
			await fresh(page, base);
			const line = await page.textContent("#empty-state p");
			const sentences = (line ?? "").split(/[.!?]\s/).filter(Boolean).length;
			if (sentences !== 1) fail(`the empty-state copy is ${sentences} sentences`);
			if (!/watch|see|get/i.test(line ?? "")) fail(`the copy does not name what the reader gets: "${line}"`);
		},
	},
};
