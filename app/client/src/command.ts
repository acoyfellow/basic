import { Effect, Schema } from "effect";
import { Command, Navigation } from "foldkit";
import { Me } from "../../shared/protocol.ts";
import { loadHighlighter } from "./highlighter.ts";
import { Message } from "./message.ts";
import { Attachment, Chat } from "./model.ts";

const decodeMe = Schema.decodeUnknownOption(Me);

export const STORAGE = { chats: "basic.chats", draft: "basic.draft", panels: "basic.panels", settings: "basic.settings" } as const;

const DRAFT_TTL_MS = 60 * 60 * 1000;

const StoredDraft = Schema.Struct({ chatId: Schema.String, text: Schema.String, attachments: Schema.Array(Attachment), savedAt: Schema.Number });

const decodeDraft = Schema.decodeUnknownOption(Schema.fromJsonString(StoredDraft));
const decodeChats = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Array(Chat)));
const decodeJson = Schema.decodeUnknownOption(Schema.fromJsonString(Schema.Unknown));

type Live = { socket: WebSocket | null; refuse: boolean; epoch: number };

export const live: Live = { socket: null, refuse: false, epoch: 0 };

export const FetchMe = Command.define("FetchMe", {
	messages: [Message.GotMe, Message.GotSignedOut, Message.GotExpired],
	execute: Effect.promise(async () => {
		const response = await fetch("/api/me", { credentials: "same-origin", cache: "no-store" }).catch(() => null);
		if (response === null) return Message.GotSignedOut();
		if (response.status === 401) {
			const body = await response.json().catch(() => ({}));
			return /expired/i.test(JSON.stringify(body)) ? Message.GotExpired() : Message.GotSignedOut();
		}
		const me = decodeMe(await response.json().catch(() => null));
		return me._tag === "Some" ? Message.GotMe({ me: me.value }) : Message.GotSignedOut();
	}),
});

export const SaveAccount = Command.define("SaveAccount", {
	args: { account: Schema.String },
	messages: [Message.SavedAccount, Message.GotSignedOut],
	execute: ({ account }) =>
		Effect.promise(async () => {
			const response = await fetch("/api/account", { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify({ account }) }).catch(() => null);
			return response?.ok ? Message.SavedAccount({ account }) : Message.GotSignedOut();
		}),
});

export const ExpireSession = Command.define("ExpireSession", {
	messages: [Message.CompletedEffect],
	execute: Effect.promise(async () => {
		await fetch("/api/debug/expire", { method: "POST", credentials: "same-origin" }).catch(() => null);
		return Message.CompletedEffect();
	}),
});

export const SendTurn = Command.define("SendTurn", {
	args: { turnId: Schema.String, prompt: Schema.String },
	messages: [Message.StampedTurn],
	execute: ({ turnId, prompt }) =>
		Effect.sync(() => {
			if (live.socket?.readyState === WebSocket.OPEN) live.socket.send(JSON.stringify({ _tag: "Turn", turnId, prompt }));
			return Message.StampedTurn({ turnId, at: Date.now() });
		}),
});

export const DeliverLateClose = Command.define("DeliverLateClose", {
	messages: [Message.SocketClosed],
	execute: Effect.sync(() => Message.SocketClosed({ epoch: live.epoch - 1 })),
});

export const DropConnection = Command.define("DropConnection", {
	args: { block: Schema.Boolean },
	messages: [Message.CompletedEffect],
	execute: ({ block }) =>
		Effect.sync(() => {
			live.refuse = block;
			live.socket?.close();
			return Message.CompletedEffect();
		}),
});

export const AllowConnection = Command.define("AllowConnection", {
	messages: [Message.CompletedEffect],
	execute: Effect.sync(() => {
		live.refuse = false;
		return Message.CompletedEffect();
	}),
});

export const ScheduleReconnect = Command.define("ScheduleReconnect", {
	args: { epoch: Schema.Number, delayMs: Schema.Number },
	messages: [Message.ScheduledReconnect],
	execute: ({ epoch, delayMs }) => Effect.sleep(delayMs).pipe(Effect.as(Message.ScheduledReconnect({ epoch }))),
});

export const LoadState = Command.define("LoadState", {
	messages: [Message.LoadedChats],
	execute: Effect.sync(() => {
		const chats = decodeChats(localStorage.getItem(STORAGE.chats) ?? "");
		const draft = decodeDraft(localStorage.getItem(STORAGE.draft) ?? "");
		const fresh = draft._tag === "Some" && Date.now() - draft.value.savedAt < DRAFT_TTL_MS ? draft.value : null;
		if (draft._tag === "Some" && fresh === null) localStorage.removeItem(STORAGE.draft);
		const panels = decodeJson(localStorage.getItem(STORAGE.panels) ?? "");
		const settings = decodeJson(localStorage.getItem(STORAGE.settings) ?? "");
		return Message.LoadedChats({
			chats: chats._tag === "Some" ? chats.value : [],
			draft: fresh?.text ?? "",
			draftChat: fresh?.chatId ?? "",
			attachments: fresh?.attachments ?? [],
			panels: panels._tag === "Some" ? panels.value : null,
			settings: settings._tag === "Some" ? settings.value : null,
		});
	}),
});

export const Persist = Command.define("Persist", {
	args: { key: Schema.String, value: Schema.String },
	messages: [Message.CompletedEffect],
	execute: ({ key, value }) =>
		Effect.sync(() => {
			try {
				localStorage.setItem(key, value);
			} catch {
				localStorage.removeItem(STORAGE.chats);
			}
			return Message.CompletedEffect();
		}),
});

export const SaveDraft = Command.define("SaveDraft", {
	args: { chatId: Schema.String, text: Schema.String, attachments: Schema.Array(Attachment) },
	messages: [Message.CompletedEffect],
	execute: ({ chatId, text, attachments }) =>
		Effect.sync(() => {
			if (text === "" && attachments.length === 0) localStorage.removeItem(STORAGE.draft);
			else localStorage.setItem(STORAGE.draft, JSON.stringify({ chatId, text, attachments, savedAt: Date.now() }));
			return Message.CompletedEffect();
		}),
});

export const PushUrl = Command.define("PushUrl", {
	args: { url: Schema.String },
	messages: [Message.CompletedEffect],
	execute: ({ url }) => Navigation.pushUrl(url).pipe(Effect.as(Message.CompletedEffect())),
});

export const ReplaceUrl = Command.define("ReplaceUrl", {
	args: { url: Schema.String },
	messages: [Message.CompletedEffect],
	execute: ({ url }) => Navigation.replaceUrl(url).pipe(Effect.as(Message.CompletedEffect())),
});

export const LoadPage = Command.define("LoadPage", {
	args: { url: Schema.String },
	messages: [Message.CompletedEffect],
	execute: ({ url }) => Navigation.load(url).pipe(Effect.as(Message.CompletedEffect())),
});

export const SignOut = Command.define("SignOut", {
	messages: [Message.CompletedEffect],
	execute: Effect.sync(() => {
		live.socket?.close();
		localStorage.removeItem(STORAGE.draft);
		const form = document.createElement("form");
		form.method = "post";
		form.action = "/auth/sign-out";
		document.body.append(form);
		form.submit();
		return Message.CompletedEffect();
	}),
});

export const FinishLoading = Command.define("FinishLoading", {
	args: { chatId: Schema.String },
	messages: [Message.FinishedLoading],
	execute: ({ chatId }) => Effect.sleep(260).pipe(Effect.as(Message.FinishedLoading({ chatId }))),
});

export const CopyText = Command.define("CopyText", {
	args: { id: Schema.String, text: Schema.String },
	messages: [Message.ClearedCopied],
	execute: ({ id, text }) =>
		Effect.promise(() => navigator.clipboard.writeText(text).catch(() => undefined)).pipe(
			Effect.andThen(Effect.sleep(1000)),
			Effect.as(Message.ClearedCopied({ id })),
		),
});

export const LoadHighlighter = Command.define("LoadHighlighter", {
	messages: [Message.LoadedHighlighter],
	execute: Effect.promise(loadHighlighter).pipe(Effect.as(Message.LoadedHighlighter())),
});

export const LoadOlder = Command.define("LoadOlder", {
	messages: [Message.LoadedOlder],
	execute: Effect.sleep(300).pipe(Effect.as(Message.LoadedOlder())),
});

export const ClearToast = Command.define("ClearToast", {
	messages: [Message.DismissedToast],
	execute: Effect.sleep(4000).pipe(Effect.as(Message.DismissedToast())),
});

export const FocusComposer = Command.define("FocusComposer", {
	messages: [Message.CompletedEffect],
	execute: Effect.sync(() => {
		globalThis.requestAnimationFrame(() => document.getElementById("composer")?.focus());
		return Message.CompletedEffect();
	}),
});

export const FocusNotifications = Command.define("FocusNotifications", {
	messages: [Message.CompletedEffect],
	execute: Effect.sync(() => {
		document.getElementById("notifications")?.focus();
		return Message.CompletedEffect();
	}),
});
