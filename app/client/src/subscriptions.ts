import { Effect, Queue, Schema, Stream } from "effect";
import { Subscription } from "foldkit";
import { ServerFrame } from "../../shared/protocol.ts";
import { live } from "./command.ts";
import { Message } from "./message.ts";
import type { Model } from "./model.ts";
import { PHONE_WIDTH } from "./model.ts";
import { chatRunning } from "./update.ts";

const listen = <E extends Event>(target: EventTarget, type: string, toMessage: (event: E) => Message | null, guard: (event: Event) => event is E) =>
	Stream.callback<Message>((queue) =>
		Effect.acquireRelease(
			Effect.sync(() => {
				const handler = (event: Event) => {
					if (!guard(event)) return;
					const message = toMessage(event);
					if (message !== null) Queue.offerUnsafe(queue, message);
				};
				target.addEventListener(type, handler);
				return handler;
			}),
			(handler) => Effect.sync(() => target.removeEventListener(type, handler)),
		),
	);

const decodeFrame = Schema.decodeUnknownOption(Schema.fromJsonString(ServerFrame));

const socketStream = (epoch: number) =>
	Stream.callback<Message>((queue) =>
		Effect.acquireRelease(
			Effect.sync(() => {
				const offer = (message: Message) => {
					Queue.offerUnsafe(queue, message);
				};
				live.epoch = epoch;
				if (live.refuse) {
					const timer = globalThis.setTimeout(() => offer(Message.SocketClosed({ epoch })), 80);
					return () => globalThis.clearTimeout(timer);
				}
				const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/api/ws`);
				live.socket = socket;
				socket.addEventListener("open", () => offer(Message.SocketOpened({ epoch })));
				socket.addEventListener("close", (event) => offer(event.code === 4001 ? Message.SocketExpired({ epoch }) : Message.SocketClosed({ epoch })));
				socket.addEventListener("message", (event) => {
					const frame = decodeFrame(typeof event.data === "string" ? event.data : "");
					if (frame._tag === "None") return;
					if (frame.value._tag === "Scripted") offer(Message.GotScript({ turnId: frame.value.turnId, script: frame.value.script, at: Date.now() }));
					if (frame.value._tag === "Expired") offer(Message.SocketExpired({ epoch }));
				});
				return () => {
					if (live.socket === socket) live.socket = null;
					socket.close();
				};
			}),
			(cleanup) => Effect.sync(cleanup),
		),
	);

const isKeyboard = (event: Event): event is KeyboardEvent => event instanceof KeyboardEvent;
const isAny = (event: Event): event is Event => event instanceof Event;

const viewport = () => Message.ChangedViewport({ width: globalThis.innerWidth, touch: globalThis.matchMedia("(pointer: coarse)").matches && globalThis.innerWidth < PHONE_WIDTH });

const anyRunning = (model: Model) => model.chats.some((chat) => chatRunning(chat, model));

export const subscriptions = Subscription.make<Model, Message>()((entry) => ({
	socket: entry(
		{ epoch: Schema.Number, wanted: Schema.Boolean },
		{
			modelToDependencies: (model) => ({ epoch: model.socketEpoch, wanted: model.auth._tag === "SignedIn" && (model.connection === "connecting" || model.connection === "online") }),
			dependenciesToStream: ({ epoch, wanted }) => (wanted ? socketStream(epoch) : Stream.empty),
		},
	),
	clock: entry(
		{ fast: Schema.Boolean },
		{
			modelToDependencies: (model) => ({ fast: anyRunning(model) || model.copied !== null }),
			dependenciesToStream: ({ fast }) => Stream.tick(fast ? 100 : 1000).pipe(Stream.map(() => Message.Ticked({ now: Date.now() }))),
		},
	),
	keys: entry(
		{},
		{
			modelToDependencies: () => ({}),
			dependenciesToStream: () =>
				listen(
					globalThis,
					"keydown",
					(event) => {
						const meta = event.metaKey || event.ctrlKey;
						if (event.isComposing) return null;
						if (meta && ["b", "j"].includes(event.key.toLowerCase())) event.preventDefault();
						if (event.key === "Escape" || (meta && ["b", "j"].includes(event.key.toLowerCase())) || (event.altKey && event.code === "KeyT"))
							return Message.PressedGlobalKey({ key: event.altKey && event.code === "KeyT" ? "t" : event.key, meta, alt: event.altKey, shift: event.shiftKey });
						return null;
					},
					isKeyboard,
				),
		},
	),
	visibility: entry(
		{},
		{
			modelToDependencies: () => ({}),
			dependenciesToStream: () => listen(document, "visibilitychange", () => Message.ChangedVisibility({ hidden: document.visibilityState === "hidden" }), isAny),
		},
	),
	resize: entry(
		{},
		{
			modelToDependencies: () => ({}),
			dependenciesToStream: () => Stream.concat(Stream.succeed(viewport()), listen(globalThis, "resize", viewport, isAny)),
		},
	),
}));
