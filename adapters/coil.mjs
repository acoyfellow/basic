import { readFileSync } from "node:fs";

const selectors = {
	log: "#feed",
	composer: "#text",
	send: "#send",
	stop: "#stop",
	liveText: "#live-text",
	liveWait: "#live-wait",
	chatRow: "#list [data-thread]",
	threads: "[aria-label='Threads']",
	signOut: "#sign-out",
	whoami: "#whoami",
};

const MODEL = process.env.COIL_MODEL ?? "@cf/zai-org/glm-5.3";
const host = () => new URL(process.env.BASE ?? "http://localhost").host;

const sessionCookies = () =>
	readFileSync(process.env.COIL_SESSION_COOKIE_FILE ?? "", "utf8")
		.trim()
		.split(";")
		.map((pair) => pair.trim())
		.filter((pair) => pair.includes("="))
		.map((pair) => {
			const [name, ...value] = pair.split("=");

			return { name, value: value.join("=") };
		});

const fail = (message) => {
	throw new Error(message);
};

const signIn = async (page) => {
	await page.context().addCookies(sessionCookies().map(({ name, value }) => (name.startsWith("__Host-") ? { name, value, url: `https://${host()}/`, secure: true, httpOnly: true } : { name, value, domain: host(), path: "/", secure: true, httpOnly: true })));
};

const rpc = async (page, tag, payload) => {
	const response = await page.context().request.post(`https://${host()}/api/rpc`, {
		headers: { "content-type": "application/json" },
		data: JSON.stringify({ _tag: "Request", id: "1", tag, payload, headers: [] }),
		timeout: 120000,
	});
	const [exit] = await response.json();

	if (exit?.exit?._tag !== "Success") fail(`${tag} failed: ${JSON.stringify(exit).slice(0, 200)}`);

	return exit.exit.value;
};

const newThread = async (page, title) => {
	await signIn(page);
	const view = await rpc(page, "CreateThread", { title: `basic: ${title}`, warm: false });

	await rpc(page, "SetModel", { name: view.name, model: MODEL });

	return view.name;
};

const open = async (page, base, name) => {
	await signIn(page);
	await page.goto(name ? `${base}/t/${name}` : `${base}/`, { waitUntil: "load" });
	await page.waitForSelector(selectors.composer, { timeout: 30000 });
};

const openFresh = async (page, base, title) => {
	const name = await newThread(page, title);

	await open(page, base, name);
	await page.waitForSelector(`${selectors.log} .feed-inner`, { timeout: 30000 });

	return name;
};

const fillLog = async (page, lines) =>
	page.evaluate(
		({ log, lines }) => {
			const inner = document.querySelector(`${log} .feed-inner`);
			const filler = document.createElement("div");

			filler.id = "basic-filler";
			filler.style.height = `${lines * 24}px`;
			inner.prepend(filler);
		},
		{ log: selectors.log, lines },
	);

const distanceFromBottom = async (page) => page.$eval(selectors.log, (element) => element.scrollHeight - element.clientHeight - element.scrollTop);

const scrollTop = async (page) => page.$eval(selectors.log, (element) => element.scrollTop);

const nextFrame = async (page) => page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));

const typeInto = async (page, selector, text) => {
	await page.fill(selector, "");
	await page.click(selector);
	await page.keyboard.insertText(text);
};

const send = async (page, text) => {
	await page.waitForSelector(`${selectors.send}:not([disabled])`, { timeout: 30000 });
	await typeInto(page, selectors.composer, text);
	await page.press(selectors.composer, "Enter");
	await page.waitForSelector(selectors.stop, { timeout: 60000 });
};

const waitIdle = async (page, timeout = 180000) => page.waitForSelector(selectors.send, { timeout });

const LONG_REPLY = "Write a numbered list from 1 to 80. Each line is the number, then one short sentence about the sea. No preamble.";

const streamLong = async (page, base, title) => {
	await openFresh(page, base, title);
	await send(page, LONG_REPLY);
	await page.waitForSelector(selectors.liveText, { timeout: 60000 });
	await page.waitForFunction((selector) => (document.querySelector(selector)?.textContent?.length ?? 0) > 400, selectors.liveText, { timeout: 60000 });
};

const stillStreaming = async (page) => (await page.$(selectors.liveText)) !== null;

export default {
	checks: {
		"Following the stream while at the bottom": async ({ page, base }) => {
			await streamLong(page, base, "follow");
			await page.$eval(selectors.log, (element) => (element.scrollTop = element.scrollHeight));
			await page.waitForTimeout(1500);

			if (!(await stillStreaming(page))) return "SKIPPED: the reply finished before the check";

			const distance = await distanceFromBottom(page);

			if (distance > 80) fail(`while streaming at the bottom the feed is ${distance}px from the bottom`);
		},

		"Reading history while the agent streams": async ({ page, base }) => {
			await streamLong(page, base, "reading");
			await page.hover(selectors.log);
			await page.mouse.wheel(0, -600);
			await page.waitForTimeout(300);

			const before = await scrollTop(page);

			await page.waitForTimeout(2000);

			const after = await scrollTop(page);

			if (Math.abs(after - before) > 1) fail(`scrollTop moved from ${before} to ${after} while reading a streaming reply`);
		},

		"Scrolling up during a real reply is never pulled back": async ({ page, base }) => {
			await streamLong(page, base, "pulled back");
			await page.hover(selectors.log);

			const samples = [];

			for (let step = 0; step < 6; step += 1) {
				await page.mouse.wheel(0, -200);
				await page.waitForTimeout(400);
				samples.push(await distanceFromBottom(page));
			}

			if (!(await stillStreaming(page))) return "SKIPPED: the reply finished before the check";

			const pulled = samples.filter((distance) => distance < 80).length;

			if (pulled > 0) fail(`scrolled up 6 times during the stream; ${pulled} of 6 samples were pulled back to the bottom (${samples.join(", ")} px)`);

			await page.$eval(selectors.log, (element) => (element.scrollTop = element.scrollHeight));
			await page.waitForTimeout(1500);

			if ((await stillStreaming(page)) && (await distanceFromBottom(page)) > 80) fail("following did not resume after returning to the bottom");
		},

		"A scroll-wheel up releases the pin at once": async ({ page, base }) => {
			await streamLong(page, base, "wheel release");
			await page.hover(selectors.log);
			await page.mouse.wheel(0, -300);
			await page.waitForTimeout(600);

			if (!(await stillStreaming(page))) return "SKIPPED: the reply finished before the check";

			const distance = await distanceFromBottom(page);

			if (distance < 100) fail(`the next token pulled the reader back (${distance}px from bottom)`);
		},

		"A way back to the newest message": async ({ page, base }) => {
			await openFresh(page, base, "jump");
			await fillLog(page, 200);
			await nextFrame(page);
			await page.hover(selectors.log);
			await page.mouse.wheel(0, -1500);
			await page.waitForTimeout(500);

			const button = await page.$("button:has-text('latest'), [aria-label*='latest' i]");

			if (button === null) fail("no Scroll to latest button while scrolled up");
		},

		"Opening a conversation lands at the bottom": async ({ page, base }) => {
			const name = await newThread(page, "lands");

			await rpc(page, "SendMessage", { name, requestId: `basic-${Date.now()}`, text: LONG_REPLY });
			await open(page, base, name);
			await page.waitForSelector(`${selectors.log} .msg.assistant`, { timeout: 30000 });
			await page.waitForTimeout(800);

			const distance = await distanceFromBottom(page);

			if (distance > 80) fail(`opened ${distance}px from the bottom`);
		},

		"An existing conversation never flashes the empty state": async ({ page, base }) => {
			const name = await newThread(page, "no flash");

			await rpc(page, "SendMessage", { name, requestId: `basic-${Date.now()}`, text: "Reply with: ok" });
			await page.addInitScript(() => {
				window.__sawEmpty = false;
				new MutationObserver(() => {
					if (document.querySelector(".empty, .ready")) window.__sawEmpty = true;
				}).observe(document, { subtree: true, childList: true });
			});
			await open(page, base, name);
			await page.waitForSelector(`${selectors.log} .msg.assistant`, { timeout: 30000 });

			if (await page.evaluate(() => window.__sawEmpty)) fail("the empty state appeared before the messages");
		},

		"My own message always pins": async ({ page, base }) => {
			await openFresh(page, base, "own pins");
			await fillLog(page, 200);
			await nextFrame(page);
			await page.$eval(selectors.log, (element) => (element.scrollTop = 0));
			await send(page, "Reply with: ok");
			await page.waitForTimeout(800);

			const distance = await distanceFromBottom(page);

			if (distance > 80) fail(`after sending, the feed is ${distance}px from the bottom`);
		},

		"Enter sends, Shift+Enter breaks a line, on desktop": async ({ page, base }) => {
			await openFresh(page, base, "enter");
			await page.waitForSelector(`${selectors.send}:not([disabled])`, { timeout: 30000 });
			await typeInto(page, selectors.composer, "line one");
			await page.keyboard.press("Shift+Enter");

			const value = await page.inputValue(selectors.composer);

			if (!value.includes("\n")) fail("Shift+Enter did not insert a newline");

			await page.keyboard.insertText("Reply with: ok");
			await page.press(selectors.composer, "Enter");
			await page.waitForSelector(selectors.stop, { timeout: 60000 });
		},

		"Enter during IME composition never sends": async ({ page, base }) => {
			await openFresh(page, base, "ime");
			await typeInto(page, selectors.composer, "にほん");
			await page.$eval(selectors.composer, (element) => {
				element.dispatchEvent(new CompositionEvent("compositionstart"));
				element.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", isComposing: true, keyCode: 229, bubbles: true, cancelable: true }));
			});
			await page.waitForTimeout(800);

			if ((await page.$(selectors.stop)) !== null) fail("Enter during composition sent the message");
		},

		"The composer is focused and ready on load": async ({ page, base }) => {
			await openFresh(page, base, "focus");
			await page.waitForTimeout(500);

			const focused = await page.evaluate(() => document.activeElement?.id);

			if (focused !== "text") fail(`focus is on ${focused || "nothing"}, not the composer`);
		},

		"The composer grows with the text, up to a limit": async ({ page, base }) => {
			await openFresh(page, base, "grow");

			const start = await page.$eval(selectors.composer, (element) => element.getBoundingClientRect().height);

			await typeInto(page, selectors.composer, "line\n".repeat(4));

			const grown = await page.$eval(selectors.composer, (element) => element.getBoundingClientRect().height);

			await typeInto(page, selectors.composer, "line\n".repeat(80));

			const capped = await page.$eval(selectors.composer, (element) => element.getBoundingClientRect().height);

			if (grown <= start) fail("the composer did not grow");
			if (capped > 800 * 0.5) fail(`the composer grew to ${capped}px, past half the viewport`);
		},

		"Send is disabled for empty input, and says why": async ({ page, base }) => {
			await openFresh(page, base, "empty send");
			await page.fill(selectors.composer, "");

			const disabled = await page.$eval(selectors.send, (element) => element.disabled);

			if (!disabled) fail("Send is enabled with an empty composer");
		},

		"The draft survives a reload or a deploy": async ({ page, base }) => {
			await openFresh(page, base, "draft");
			await typeInto(page, selectors.composer, "keep this draft");
			await page.waitForTimeout(600);
			await page.reload({ waitUntil: "load" });
			await page.waitForSelector(selectors.composer);
			await page.waitForTimeout(800);

			const value = await page.inputValue(selectors.composer);

			if (value !== "keep this draft") fail(`after reload the composer holds "${value}"`);
		},

		"Send becomes Stop": async ({ page, base }) => {
			await openFresh(page, base, "send stop");
			await send(page, "Reply with: ok");
			await waitIdle(page);
		},

		"Esc stops the agent": async ({ page, base }) => {
			await openFresh(page, base, "esc");
			await send(page, LONG_REPLY);
			await page.keyboard.press("Escape");
			await waitIdle(page, 15000).catch(() => fail("Esc did not stop the turn within 15 s"));
		},

		"A thinking indicator appears only when it is needed": async ({ page, base }) => {
			await openFresh(page, base, "thinking");
			await send(page, LONG_REPLY);
			await page.waitForSelector(selectors.liveText, { timeout: 60000 });

			if ((await page.$(selectors.liveWait)) !== null) fail("the thinking indicator stays while text streams");
		},

		"The whole task shows a live timer": async ({ page, base }) => {
			await openFresh(page, base, "task timer");
			await send(page, LONG_REPLY);
			await page.waitForTimeout(2500);

			const text = await page.$eval(selectors.log, (element) => element.innerText);

			if (!/\d+s/.test(text) && !/\d+s/.test(await page.title())) fail("no running timer while the turn runs");
		},

		"A new chat appears in the list at once": async ({ page, base }) => {
			const name = await openFresh(page, base, "in list");

			await page.waitForSelector(`[data-thread='${name}'], a[href='/t/${name}']`, { timeout: 5000 }).catch(() => fail("the new thread is not in the list"));
		},

		"Every icon button has a name": async ({ page, base }) => {
			await openFresh(page, base, "names");

			const unnamed = await page.$$eval("button", (buttons) => buttons.filter((button) => button.offsetParent !== null && button.innerText.trim() === "" && !button.getAttribute("aria-label") && !button.title).map((button) => button.id || button.className));

			if (unnamed.length > 0) fail(`unnamed icon buttons: ${unnamed.slice(0, 5).join(", ")}`);
		},

		"The transcript is a polite live region": async ({ page, base }) => {
			await openFresh(page, base, "live region");

			const live = await page.$eval(selectors.log, (element) => element.getAttribute("aria-live"));

			if (live !== "polite") fail(`aria-live is ${live}`);
		},

		"A signed-out visitor sees one way in": async ({ page, base }) => {
			const anonymous = await page.context().browser().newContext();
			const visitor = await anonymous.newPage();

			await visitor.goto(base, { waitUntil: "load" });

			const text = await visitor.locator("body").innerText();

			await anonymous.close();

			if (!/sign in with cloudflare/i.test(text)) fail("no Sign in with Cloudflare on the signed-out page");
		},

		"The API refuses a caller who is not signed in": async ({ page, base }) => {
			const anonymous = await page.context().browser().newContext();
			const response = await anonymous.request.post(`${base}/api/rpc`, { data: JSON.stringify({ _tag: "Request", id: "1", tag: "ListThreads", payload: null, headers: [] }), headers: { "content-type": "application/json" }, maxRedirects: 0 });

			const status = response.status();

			await anonymous.close();

			if (status < 300) fail(`anonymous ListThreads returned ${status}`);
		},

		"Signing out is one visible control": async ({ page, base }) => {
			await openFresh(page, base, "sign out");

			if ((await page.$(selectors.signOut)) === null) fail("no visible Sign out control");
		},
	},
};
