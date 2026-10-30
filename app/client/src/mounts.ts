import { Effect, Queue, Stream } from "effect";
import { Mount } from "foldkit";
import { Message } from "./message.ts";

type LogMessage = typeof Message.ScrolledLog.Type | typeof Message.WheeledUp.Type;
type PasteMessage = typeof Message.PastedFile.Type;
type DragMessage = typeof Message.MovedDrag.Type | typeof Message.EndedDrag.Type;

const FOLLOW_PX = 80;

type LogState = { pinned: boolean; anchor: { element: Element; top: number } | null; pinRequest: number };

const states = new WeakMap<Element, LogState>();

const distance = (element: Element) => element.scrollHeight - element.clientHeight - element.scrollTop;

const pinToBottom = (element: Element) => {
	element.scrollTop = element.scrollHeight;
};

const firstVisible = (element: Element) => {
	const top = element.getBoundingClientRect().top;
	for (const child of element.querySelectorAll("[data-entry]")) {
		const box = child.getBoundingClientRect();
		if (box.bottom > top) return { element: child, top: box.top - top };
	}
	return null;
};

const logState = (element: Element): LogState => {
	const existing = states.get(element);
	if (existing !== undefined) return existing;
	const fresh: LogState = { pinned: true, anchor: null, pinRequest: Number(element.getAttribute("data-pin-request") ?? "0") };
	states.set(element, fresh);
	return fresh;
};

const settle = (element: Element) => {
	const state = logState(element);
	const request = Number(element.getAttribute("data-pin-request") ?? "0");
	if (request !== state.pinRequest) {
		state.pinRequest = request;
		state.pinned = true;
		state.anchor = null;
	}
	if (state.pinned) {
		if (distance(element) > 0.5) pinToBottom(element);
		return;
	}
	if (state.anchor === null || !state.anchor.element.isConnected) return;
	const drift = state.anchor.element.getBoundingClientRect().top - element.getBoundingClientRect().top - state.anchor.top;
	if (Math.abs(drift) >= 1) element.scrollTop += drift;
};

const release = (element: Element) => {
	const state = logState(element);
	state.pinned = false;
	state.anchor = firstVisible(element);
};

export const FollowLog = Mount.defineStream("FollowLog", {
	messages: [Message.ScrolledLog, Message.WheeledUp],
	execute: ({ element }) =>
		Stream.callback<LogMessage>((queue) =>
			Effect.acquireRelease(
				Effect.sync(() => {
					const offer = (message: LogMessage) => {
						Queue.offerUnsafe(queue, message);
					};
					const state = logState(element);
					pinToBottom(element);
					let reported = { atBottom: true, nearTop: false };
					const onScroll = () => {
						const atBottom = distance(element) <= FOLLOW_PX;
						if (atBottom) {
							state.pinned = true;
							state.anchor = null;
						} else if (!state.pinned) state.anchor = firstVisible(element);
						else release(element);
						const nearTop = element.scrollTop < 200 && element.scrollHeight > element.clientHeight;
						if (atBottom === reported.atBottom && nearTop === reported.nearTop) return;
						reported = { atBottom, nearTop };
						offer(Message.ScrolledLog({ atBottom, nearTop }));
					};
					const onWheel = (event: Event) => {
						if (!(event instanceof WheelEvent) || event.deltaY >= 0) return;
						release(element);
						offer(Message.WheeledUp());
					};
					const onPointer = (event: Event) => {
						if (!(event instanceof PointerEvent) || event.target !== element) return;
						release(element);
					};
					const onKey = (event: Event) => {
						if (!(event instanceof KeyboardEvent) || !["PageUp", "ArrowUp", "Home"].includes(event.key)) return;
						release(element);
						offer(Message.WheeledUp());
					};
					const resize = new ResizeObserver(() => settle(element));
					const content = element.firstElementChild;
					if (content !== null) resize.observe(content);
					resize.observe(element);
					const mutations = new MutationObserver((records) => {
						if (records.some((record) => record.type !== "attributes" || record.attributeName === "data-pin-request")) settle(element);
					});
					mutations.observe(element, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["data-pin-request"] });
					element.addEventListener("scroll", onScroll, { passive: true });
					element.addEventListener("wheel", onWheel, { passive: true });
					element.addEventListener("pointerdown", onPointer);
					element.addEventListener("keydown", onKey);
					return () => {
						resize.disconnect();
						mutations.disconnect();
						element.removeEventListener("scroll", onScroll);
						element.removeEventListener("wheel", onWheel);
						element.removeEventListener("pointerdown", onPointer);
						element.removeEventListener("keydown", onKey);
					};
				}),
				(cleanup) => Effect.sync(cleanup),
			),
		),
});

export const ComposerBehaviour = Mount.defineStream("ComposerBehaviour", {
	messages: [Message.PastedFile],
	execute: ({ element }) =>
		Stream.callback<PasteMessage>((queue) =>
			Effect.acquireRelease(
				Effect.sync(() => {
					let lastValue: string | null = null;
					const grow = () => {
						if (!(element instanceof HTMLTextAreaElement)) return;
						element.style.height = "auto";
						element.style.height = `${Math.min(element.scrollHeight, 160)}px`;
						lastValue = element.value;
					};
					const check = () => {
						if (element instanceof HTMLTextAreaElement && element.value !== lastValue) grow();
					};
					const onPaste = (event: Event) => {
						if (!(event instanceof ClipboardEvent)) return;
						const files = [...(event.clipboardData?.files ?? [])];
						if (files.length === 0) return;
						event.preventDefault();
						for (const file of files) {
							const reader = new FileReader();
							reader.addEventListener("load", () => {
								const preview = typeof reader.result === "string" && reader.result.length < 400_000 ? reader.result : "";
								Queue.offerUnsafe(queue, Message.PastedFile({ attachment: { id: `a-${Date.now().toString(36)}-${file.name.length}`, name: file.name || "pasted image", kind: file.type, size: file.size, preview } }));
							});
							reader.readAsDataURL(file);
						}
					};
					grow();
					element.addEventListener("input", grow);
					element.addEventListener("paste", onPaste);
					const timer = globalThis.setInterval(check, 120);
					return () => {
						element.removeEventListener("input", grow);
						element.removeEventListener("paste", onPaste);
						globalThis.clearInterval(timer);
					};
				}),
				(cleanup) => Effect.sync(cleanup),
			),
		),
});

export const DragEdge = Mount.defineStream("DragEdge", {
	messages: [Message.MovedDrag, Message.EndedDrag],
	execute: () =>
		Stream.callback<DragMessage>((queue) =>
			Effect.acquireRelease(
				Effect.sync(() => {
					const onMove = (event: PointerEvent) => {
						Queue.offerUnsafe(queue, Message.MovedDrag({ x: event.clientX }));
					};
					const onUp = () => {
						Queue.offerUnsafe(queue, Message.EndedDrag());
					};
					globalThis.addEventListener("pointermove", onMove);
					globalThis.addEventListener("pointerup", onUp);
					return () => {
						globalThis.removeEventListener("pointermove", onMove);
						globalThis.removeEventListener("pointerup", onUp);
					};
				}),
				(cleanup) => Effect.sync(cleanup),
			),
		),
});
