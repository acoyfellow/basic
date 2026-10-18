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

const MODEL = process.env.COIL_MODEL ?? "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
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

const ANSWER_MODEL = process.env.COIL_ANSWER_MODEL ?? "@cf/moonshotai/kimi-k2.6";

const newThread = async (page, title, model = MODEL) => {
	await signIn(page);
	const view = await rpc(page, "CreateThread", { title: `basic: ${title}`, warm: false });

	await rpc(page, "SetModel", { name: view.name, model });

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

const waitReady = async (page) =>
	page.waitForFunction((send) => document.querySelector(send) !== null && document.querySelector("#feed .feed-inner .skeleton") === null, selectors.send, { timeout: 30000 });

const send = async (page, text) => {
	await waitReady(page);
	await typeInto(page, selectors.composer, text);
	await page.press(selectors.composer, "Enter");
	await page.waitForSelector(selectors.stop, { timeout: 60000 });
};

const waitIdle = async (page, timeout = 180000) => page.waitForSelector(selectors.send, { timeout });

const LONG_REPLY = "Write a numbered list from 1 to 150. Each line is the number, then one full sentence of about fifteen words about the sea. No preamble.";

const installStreamDriver = async (page) =>
	page.addInitScript(() => {
		window.__basicSources = [];
		window.EventSource = class extends EventTarget {
			constructor(url) {
				super();
				this.url = url;
				this.readyState = 1;
				this.onmessage = null;
				this.onerror = null;
				window.__basicSources.push(this);
			}

			close() {
				this.readyState = 2;
			}
		};
		window.EventSource.CLOSED = 2;
		window.__basicEmit = (event) => {
			for (const source of window.__basicSources) {
				const message = new MessageEvent("message", { data: JSON.stringify(event) });

				source.onmessage?.(message);
				source.dispatchEvent(message);
			}
		};
	});

const streamTokens = async (page, count) => {
	for (let index = 0; index < count; index += 1) {
		await page.evaluate((line) => window.__basicEmit({ _tag: "text", delta: `\n${line}. The sea keeps moving under a long grey sky, and the gulls ride home.` }), index);
		await page.waitForTimeout(20);
	}
};

const streamLong = async (page, base, title) => {
	await installStreamDriver(page);
	await openFresh(page, base, title);
	await waitReady(page);
	await streamTokens(page, 80);
	await page.waitForSelector(selectors.liveText, { timeout: 10000 });
};


export default {
	checks: {
		"Older history pages in without a jump": "coil loads the whole conversation (up to 500 entries) in one view; there is no paged older history to load.",
		"A send that cannot go out keeps the draft": "Covered by the client story test 'a failed send puts the text back and says why' (client/src/story.test.ts).",
		"Typing hides the starter prompts": "coil has no starter prompts; the empty thread shows one line about the computer instead.",
		"Locked features say why they are locked": "coil has no plan tiers or locked features; every signed-in user has the same features on their own account.",
		"A stuck tool row never runs forever": "Covered by the server: every agent command runs under a 120 s timeout (src/shell.ts RUN_LIMIT_SECONDS) and Stop ends it within 5 s (test/stop.test.ts).",
		"Reasoning is folded": "coil does not render model reasoning; only the reply text and tool rows are shown.",
		"Tool rows keep their open or closed state while streaming": "Tool rows are keyed by call id (client/src/view/feed.ts), so a row keeps its open state across renders; no runner check yet.",
		"Each chat shows whether it is working": "The sidebar groups threads into Working, Running, and Paused with a coloured dot (client/src/view/side.ts); no runner check yet.",
		"Each chat shows working, idle, or failed at a glance": "MISSING: the sidebar shows working, running, and paused, but a thread whose last turn failed looks the same as an idle one.",
		"The list is grouped by time and searchable": "MISSING: the list is grouped by state, not by time; search is in the Cmd-K palette, not in the list.",
		"Pin, archive, and rename from the row": "MISSING: archive and rename are in the thread menu and palette, not on the row; there is no pin.",
		"Delete asks first": "Delete runs through a confirm dialog before the RPC (client/src/command.ts RunOp Delete); no runner check yet.",
		"Retry, edit, and branch": "Edit and Retry are on every user message and Fork branches a thread; covered by the client story test 'edit puts the text back; retry sends it again'.",
		"Code is highlighted without blocking the first token": "Chat code blocks are not syntax highlighted; only /docs uses the highlighter.",
		"A stale close cannot undo a good connection": "Each event stream carries an epoch in the model, and a close only reconnects the current epoch (client/src/update.ts StreamClosed); no runner check yet.",
		"A backgrounded tab catches up when it returns": "The thread view reloads on every event stream reconnect and on a 10 s refresh tick; no runner check yet.",
		"A turn interrupted by a restart resumes": "Pi Durable keeps the turn in the Durable Object; a restarted thread continues it (test/thread.test.ts). Not reproducible from a browser.",
		"Errors sit in the transcript in order": "A failed model call is written into the transcript as the agent's message, in order (src/agent.ts entriesToMessages).",
		"A side panel can be hidden and shown again": "The threads sidebar and computer panel collapse with buttons and Cmd-B / Cmd-J (client/src/layout.ts); no runner check yet.",
		"A side panel can be resized on desktop": "Both side columns resize by dragging their edge (client/src/layout.ts); no runner check yet.",
		"Panel sizes and visibility survive a reload": "Widths and visibility persist in localStorage (client/src/layout.ts); no runner check yet.",
		"What is inside a panel adapts to its width": "Panels use container queries (src/ui/style.ts); no runner check yet.",
		"On a phone, side panels open over the conversation": "On phones the side columns are hidden and open as drawers over the chat; no runner check yet.",
		"Each panel toggle has a keyboard shortcut": "Cmd-B toggles the threads sidebar and Cmd-J the computer panel (client/src/layout.ts).",
		"A double click on the drag edge restores the default width": "A double click on a drag handle restores its default width (client/src/layout.ts dblclick).",
		"The first sign-in asks only what it needs, then lands somewhere useful": "Needs a brand-new Cloudflare identity; coil asks for 7 scopes, then sends a first sign-in to the gateway picker and then home (src/auth/cloudflare.ts).",
		"After signing out, nothing private is reachable": "Covered by 'The API refuses a caller who is not signed in' and the sign-out route clearing the session cookie (src/auth/cloudflare.ts logout).",
		"Signing out revokes what the app was granted": "Sign out revokes the refresh token at Cloudflare and drops the stored grant (src/auth/cloudflare.ts logout). A browser cannot observe the provider-side revocation.",
		"No text sits on top of other text": "No overlap check in this adapter yet; the myax adapter's overlap check needs coil selectors.",
		"The empty state offers starters": "MISSING: an empty thread shows one line about its computer, not starter prompts.",
		"Starters belong to the owner": "coil has no starter prompts, so there are none to own.",
		"The copy names the outcome, not the feature": "Copy review is a human judgement; not checked by this runner.",
		"Following the stream while at the bottom": async ({ page, base }) => {
			await streamLong(page, base, "follow");
			await streamTokens(page, 10);

			const distance = await distanceFromBottom(page);

			if (distance > 80) fail(`while streaming at the bottom the feed is ${distance}px from the bottom`);
		},

		"Reading history while the agent streams": async ({ page, base }) => {
			await streamLong(page, base, "reading");
			await page.hover(selectors.log);
			await page.mouse.wheel(0, -600);
			await page.waitForTimeout(300);

			const before = await scrollTop(page);

			await streamTokens(page, 20);

			const after = await scrollTop(page);

			if (Math.abs(after - before) > 1) fail(`scrollTop moved from ${before} to ${after} while reading a streaming reply`);
		},

		"Scrolling up during a real reply is never pulled back": async ({ page, base }) => {
			await streamLong(page, base, "pulled back");
			await page.hover(selectors.log);

			const samples = [];

			for (let step = 0; step < 6; step += 1) {
				await page.mouse.wheel(0, -200);
				await streamTokens(page, 5);
				samples.push(await distanceFromBottom(page));
			}

			const pulled = samples.filter((distance) => distance < 80).length;

			if (pulled > 0) fail(`scrolled up 6 times during the stream; ${pulled} of 6 samples were pulled back to the bottom (${samples.join(", ")} px)`);

			await page.$eval(selectors.log, (element) => (element.scrollTop = element.scrollHeight));
			await streamTokens(page, 10);

			if ((await distanceFromBottom(page)) > 80) fail("following did not resume after returning to the bottom");
		},

		"A scroll-wheel up releases the pin at once": async ({ page, base }) => {
			await streamLong(page, base, "wheel release");
			await page.hover(selectors.log);
			await page.mouse.wheel(0, -300);
			await streamTokens(page, 3);

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
			await waitReady(page);
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
			await page.waitForFunction(() => document.activeElement?.id === "text", null, { timeout: 5000 }).catch(async () => fail(`focus is on ${(await page.evaluate(() => document.activeElement?.id)) || "nothing"}, not the composer`));
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

			const { disabled, why } = await page.$eval(selectors.send, (element) => ({ disabled: element.disabled, why: element.getAttribute("data-tip") || element.title }));

			if (!disabled) fail("Send is enabled with an empty composer");
			if (!why) fail("Send is disabled but nothing says why");
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
			await installStreamDriver(page);
			await openFresh(page, base, "thinking");
			await send(page, "Reply with: ok");

			if ((await page.$(selectors.liveWait)) === null) fail("no thinking indicator while waiting for the first token");

			await streamTokens(page, 3);
			await page.waitForSelector(selectors.liveText, { timeout: 10000 });

			if ((await page.$(selectors.liveWait)) !== null) fail("the thinking indicator stays while text streams");
		},

		"The whole task shows a live timer": async ({ page, base }) => {
			await openFresh(page, base, "task timer");
			await send(page, LONG_REPLY);
			await page.waitForSelector("#turn-timer", { timeout: 15000 }).catch(() => fail("no running timer while the turn runs"));

			const first = await page.$eval("#turn-timer", (element) => element.textContent);

			await page.waitForTimeout(2200);

			const later = await page.$eval("#turn-timer", (element) => element.textContent).catch(() => first);

			if (first === later && (await page.$(selectors.stop)) !== null) fail(`the timer did not advance (${first})`);
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

		"On a phone, Enter is a newline": async ({ base, page }) => {
			const phone = await page.context().browser().newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
			const mobile = await phone.newPage();

			await openFresh(mobile, base, "phone enter");
			await waitReady(mobile);
			await mobile.fill(selectors.composer, "first line");
			await mobile.focus(selectors.composer);
			await mobile.keyboard.press("End");
			await mobile.keyboard.press("Enter");
			await mobile.waitForTimeout(500);

			const value = await mobile.inputValue(selectors.composer);
			const sent = (await mobile.$(selectors.stop)) !== null;

			await phone.close();

			if (sent) fail("Enter sent the message on a phone");
			if (!value.includes("\n")) fail("Enter did not insert a newline on a phone");
		},

		"The shortcut is written down": async ({ page, base }) => {
			await openFresh(page, base, "shortcut hint");
			await waitReady(page);

			const text = await page.locator("#composer").innerText();

			if (!/enter/i.test(text) || !/shift/i.test(text)) fail(`the composer does not say what Enter and Shift+Enter do: "${text.slice(0, 120)}"`);
		},

		"Copy a message": async ({ page, base }) => {
			const name = await newThread(page, "copy message", ANSWER_MODEL);

			await rpc(page, "SendMessage", { name, requestId: `basic-${Date.now()}`, text: "Reply with exactly: the tide is high" });
			await open(page, base, name);
			await page.waitForSelector(`${selectors.log} .msg.assistant`, { timeout: 90000 });

			const last = page.locator(`${selectors.log} .msg.assistant`).last();

			await last.hover();
			await last.locator(".copy").click();
			await page.waitForTimeout(300);

			const copied = await page.evaluate(() => navigator.clipboard.readText());

			if (!copied.toLowerCase().includes("tide")) fail(`the clipboard holds "${copied.slice(0, 80)}"`);
		},

		"Copy a code block": async ({ page, base }) => {
			await installStreamDriver(page);
			await openFresh(page, base, "copy code");
			await waitReady(page);
			await page.evaluate(() => window.__basicEmit({ _tag: "text", delta: "Here:\n```js\nconsole.log('sea')\n```\ndone" }));
			await page.waitForSelector(`${selectors.liveText} pre.code`, { timeout: 10000 });
			await page.hover(`${selectors.liveText} pre.code`);
			await page.click(`${selectors.liveText} pre.code .code-copy`);
			await page.waitForTimeout(300);

			const copied = await page.evaluate(() => navigator.clipboard.readText());

			if (copied.trim() !== "console.log('sea')") fail(`the clipboard holds "${copied.slice(0, 80)}"`);
		},

		"Motion respects the system setting": async ({ page, base }) => {
			await page.emulateMedia({ reducedMotion: "reduce" });
			await openFresh(page, base, "reduced motion");
			await waitReady(page);

			const moving = await page.evaluate(() =>
				[...document.querySelectorAll("*")]
					.map((element) => getComputedStyle(element))
					.filter((style) => parseFloat(style.animationDuration) > 0.05 || parseFloat(style.transitionDuration) > 0.05).length,
			);

			if (moving > 0) fail(`${moving} elements still animate with reduced motion on`);
		},

		"Who I am is always one click away": async ({ page, base }) => {
			await openFresh(page, base, "whoami");
			await page.waitForFunction(() => {
				const text = document.querySelector("#whoami")?.textContent ?? "";

				return text !== "" && text !== "Signed in with Cloudflare";
			}, null, { timeout: 15000 }).catch(() => fail("the sidebar does not name the signed-in account"));
		},

		"Paste an image": async ({ page, base }) => {
			await openFresh(page, base, "paste image");
			await waitReady(page);

			const uploads = [];

			page.on("request", (request) => {
				if (request.method() !== "GET" && request.url().includes("/api/")) uploads.push(request.postData()?.slice(0, 200) ?? "");
			});
			await page.focus(selectors.composer);
			await page.evaluate(() => {
				const data = new DataTransfer();
				const pixel = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

				data.items.add(new File([pixel], "dot.png", { type: "image/png" }));
				document.querySelector("#text").dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
			});
			await page.waitForFunction(() => (document.querySelector("#text")?.value ?? "").includes("Attached:"), null, { timeout: 30000 }).catch(() => fail("pasting an image did not attach it"));
		},

		"Each tool call shows a live timer": async ({ page, base }) => {
			await installStreamDriver(page);
			await openFresh(page, base, "tool timer");
			await waitReady(page);
			await page.evaluate(() => window.__basicEmit({ _tag: "tool_start", id: "basic-1", name: "run", args: "{\"command\":\"sleep 30\"}" }));
			await page.waitForSelector("details.tool .tool-time", { timeout: 10000 }).catch(() => fail("a running tool row shows no timer"));
		},

		"A long error is summarised, with detail on demand": async ({ page, base }) => {
			const name = await newThread(page, "long error", "@cf/meta/llama-3.3-70b-instruct-fp8-fast");

			await rpc(page, "SendMessage", { name, requestId: `basic-${Date.now()}`, text: "Write 120 numbered lines about the sea into list.txt with your write tool, then summarise it." }).catch(() => undefined);
			await open(page, base, name);

			const found = await page.waitForSelector(".msg.error", { timeout: 60000 }).catch(() => null);

			if (found === null) return "SKIPPED: the model did not fail on this run, so there was no long error to fold";

			const summary = await page.$eval(".msg.error .error-summary", (element) => element.textContent ?? "");

			if (summary.length > 260) fail(`the error summary is ${summary.length} characters`);
			if ((await page.$(".msg.error details.error-detail")) === null) fail("the long error has no folded detail");
		},

		"Notifications have a keyboard shortcut": async ({ page, base }) => {
			await openFresh(page, base, "notify shortcut");

			const shortcut = await page.$eval("#notify", (element) => element.getAttribute("aria-keyshortcuts")).catch(() => null);

			if (!shortcut) fail("the notifications control declares no keyboard shortcut");
		},

		"A turn that ends with nothing visible says so": async ({ page, base }) => {
			const name = await newThread(page, "silent turn");

			await page.route("**/api/rpc", async (route) => {
				const body = route.request().postData() ?? "";

				if (!body.includes('"ViewThread"')) return route.continue();

				const response = await route.fetch();
				const exits = await response.json();
				const view = exits[0]?.exit?.value;

				if (view === undefined) return route.fulfill({ response });

				view.busy = false;
				view.messages = [
					{ id: "u1", role: "user", kind: "pi.user", text: "do it quietly" },
					{ id: "t1:c1", role: "tool", kind: "pi.assistant", text: "", tool: { id: "c1", name: "run", args: "{}" } },
					{ id: "r1", role: "toolResult", kind: "pi.tool-result", text: "ok", toolCallId: "c1" },
				];
				view.turns = [{ seq: 1, at: 1, ended: 2, tools: 1, prompt: "do it quietly", stat: "", diff: "" }];

				return route.fulfill({ response, json: exits });
			});
			await open(page, base, name);
			await page.waitForSelector("[data-turn='1']", { timeout: 20000 });

			if ((await page.$("[data-note='no-reply']")) === null) fail("a turn with no reply has no note saying so");
		},

		"A cancelled or failed sign-in says why": async ({ page, base }) => {
			const anonymous = await page.context().browser().newContext();
			const visitor = await anonymous.newPage();

			await visitor.goto(`${base}/oauth/callback?error=access_denied&error_description=The+user+cancelled`, { waitUntil: "load" });

			const text = await visitor.locator("body").innerText();

			await anonymous.close();

			if (!/did not sign you in/i.test(text) || !/cancelled/i.test(text)) fail(`a cancelled sign-in shows: "${text.slice(0, 160)}"`);
		},

		"An expired session sends me to sign in, keeping my place": async ({ page, base }) => {
			const anonymous = await page.context().browser().newContext();
			const visitor = await anonymous.newPage();

			await visitor.goto(`${base}/t/some-thread-1a2b3c`, { waitUntil: "load" });

			const href = await visitor.$eval("#sign-in", (element) => element.getAttribute("href")).catch(() => null);

			await anonymous.close();

			if (href !== "/oauth/login?return=%2Ft%2Fsome-thread-1a2b3c") fail(`the sign-in link on an expired thread page is ${href}`);
		},

		"Reconnecting is shown, then gives up honestly": async ({ page, base }) => {
			await page.addInitScript(() => {
				window.EventSource = class extends EventTarget {
					constructor() {
						super();
						this.readyState = 0;
						setTimeout(() => {
							this.readyState = 2;
							this.onerror?.(new Event("error"));
						}, 50);
					}

					close() {
						this.readyState = 2;
					}
				};
				window.EventSource.CLOSED = 2;
			});
			await openFresh(page, base, "reconnect");
			await page.waitForSelector("#connection", { timeout: 15000 }).catch(() => fail("a dropped stream shows no reconnecting notice"));
			await page.waitForSelector("#connection.lost", { timeout: 60000 }).catch(() => fail("coil never says it gave up reconnecting"));

			if ((await page.$("#connection.lost button")) === null) fail("the gave-up notice has no way to reconnect");
		},

		"Signing out is one visible control": async ({ page, base }) => {
			await openFresh(page, base, "sign out");
			await page.waitForSelector(selectors.signOut, { state: "visible", timeout: 15000 }).catch(() => fail("no visible Sign out control"));
		},
	},
};
