import { Option, Schema } from "effect";
import type { Command } from "foldkit";
import type { Update } from "foldkit";
import { DEFAULT_STARTERS } from "../../shared/script.ts";
import {
	AllowConnection,
	ClearToast,
	CopyText,
	DeliverLateClose,
	DropConnection,
	ExpireSession,
	FetchMe,
	FinishLoading,
	FocusComposer,
	FocusNotifications,
	LoadHighlighter,
	LoadOlder,
	LoadPage,
	Persist,
	PushUrl,
	ReplaceUrl,
	SaveAccount,
	SaveDraft,
	ScheduleReconnect,
	SendTurn,
	SignOut,
	STORAGE,
} from "./command.ts";
import { isRunningPhase, playTurn } from "./engine.ts";
import { Message } from "./message.ts";
import { type AgentTurn, type Chat, DEFAULT_PANELS, type Entry, type Model, PANEL_LIMITS, Panels, PHONE_WIDTH, Settings } from "./model.ts";

type Return = Update.Return<Model, Message>;
type AnyCommand = Command.Command<Message>;

const MAX_RECONNECTS = 4;

const decodePanels = Schema.decodeUnknownOption(Panels);
const decodeSettings = Schema.decodeUnknownOption(Settings);

const CHAT_PATH = /^\/c\/([a-z0-9-]+)\/?$/;

export const chatIdFromPath = (pathname: string): string | null => CHAT_PATH.exec(pathname)?.[1] ?? null;

const newId = (prefix: string, model: Model) => `${prefix}-${model.now.toString(36)}-${(model.seq + 1).toString(36)}`;

const titleFrom = (text: string) => {
	const line = text.trim().split("\n")[0] ?? "";
	return line.length > 48 ? `${line.slice(0, 47)}…` : line || "New chat";
};

export const currentChat = (model: Model): Chat | null => model.chats.find((chat) => chat.id === model.currentChat) ?? null;

export const lastTurn = (chat: Chat | null): AgentTurn | null => {
	const entry = chat?.entries.findLast((each) => each._tag === "Agent");
	return entry?._tag === "Agent" ? entry : null;
};

export const turnClock = (turn: AgentTurn, now: number) => (turn.receivedAt === null ? 0 : now - turn.receivedAt);

export const turnView = (turn: AgentTurn, model: Model) => {
	const awaiting = turn.receivedAt === null;
	const origin = turn.receivedAt ?? turn.sentAt ?? model.now;
	const stoppedMs = turn.stoppedAt === null ? null : Math.max(0, turn.stoppedAt - origin) * model.settings.speed;
	return playTurn(turn.script, turnClock(turn, model.now) * model.settings.speed, stoppedMs, awaiting);
};

export const isTurnRunning = (turn: AgentTurn | null, model: Model) => turn !== null && turn.stoppedAt === null && isRunningPhase(turnView(turn, model).phase);

export const chatRunning = (chat: Chat, model: Model) => isTurnRunning(lastTurn(chat), model);

export const chatFailed = (chat: Chat, model: Model) => {
	const turn = lastTurn(chat);
	if (turn === null) return false;
	const phase = turnView(turn, model).phase;
	return phase === "failed" || phase === "stuck" || phase === "empty";
};

const withChat = (model: Model, id: string, change: (chat: Chat) => Chat): Model => ({ ...model, chats: model.chats.map((chat) => (chat.id === id ? change(chat) : chat)) });

const persistChats = (model: Model): AnyCommand => Persist({ key: STORAGE.chats, value: JSON.stringify(model.chats) });

const persistPanels = (panels: Panels): AnyCommand => Persist({ key: STORAGE.panels, value: JSON.stringify(panels) });

const saveDraft = (model: Model): AnyCommand => SaveDraft({ chatId: model.currentChat ?? "new", text: model.draft, attachments: model.attachments });

const clampWidth = (width: number, other: number, otherOpen: boolean, viewport: number) => {
	const room = viewport - (otherOpen ? other : 0) - PANEL_LIMITS.conversationMin;
	return Math.round(Math.max(PANEL_LIMITS.min, Math.min(PANEL_LIMITS.max, room, width)));
};

const notice = (model: Model, tone: "info" | "warn" | "bad", summary: string, detail = "", transient = true): Model => {
	const id = newId("n", model);
	const entry: Entry = { _tag: "Notice", id, tone, summary, detail, transient, at: model.now };
	return model.currentChat === null
		? { ...model, seq: model.seq + 1, toast: summary }
		: { ...withChat(model, model.currentChat, (chat) => ({ ...chat, entries: [...chat.entries, entry] })), seq: model.seq + 1 };
};

const stopRunning = (model: Model): Model => {
	const chat = currentChat(model);
	const turn = lastTurn(chat);
	if (chat === null || turn === null || !isTurnRunning(turn, model)) return model;
	return withChat(model, chat.id, (each) => ({
		...each,
		entries: each.entries.map((entry) => (entry._tag === "Agent" && entry.id === turn.id ? { ...entry, stoppedAt: model.now } : entry)),
	}));
};

const reconnect = (model: Model): Return => ({ model: { ...model, socketEpoch: model.socketEpoch + 1, connection: "connecting" } });

const send = (model: Model, text: string): Return => {
	const body = text.trim();
	if (body === "" && model.attachments.length === 0) return { model };
	if (model.connection !== "online") {
		const kept = notice(model, "warn", "Message not sent: reconnecting. Your draft is still in the composer.");
		return { model: kept, commands: [persistChats(kept)] };
	}
	const stopped = stopRunning(model);
	const userId = newId("u", stopped);
	const turnId = newId("t", { ...stopped, seq: stopped.seq + 1 });
	const existing = currentChat(stopped);
	const chatId = existing?.id ?? newId("c", { ...stopped, seq: stopped.seq + 2 });
	const userEntry: Entry = { _tag: "User", id: userId, text: body, attachments: model.attachments, at: stopped.now };
	const turnEntry: Entry = { _tag: "Agent", id: turnId, prompt: body, sentAt: null, receivedAt: null, script: { name: "pending", steps: [] }, stoppedAt: null };
	const cleaned = (chat: Chat): Chat => ({ ...chat, updatedAt: stopped.now, entries: [...chat.entries.filter((entry) => !(entry._tag === "Notice" && entry.transient)), userEntry, turnEntry] });
	const chats = existing === null ? [{ id: chatId, title: titleFrom(body), createdAt: stopped.now, updatedAt: stopped.now, pinned: false, archived: false, entries: [userEntry, turnEntry] }, ...stopped.chats] : stopped.chats.map((chat) => (chat.id === chatId ? cleaned(chat) : chat));
	const next: Model = { ...stopped, chats, currentChat: chatId, draft: "", attachments: [], pinned: true, pinRequest: stopped.pinRequest + 1, unread: 0, seq: stopped.seq + 3, loading: false };
	return {
		model: next,
		commands: [SendTurn({ turnId, prompt: body }), persistChats(next), SaveDraft({ chatId, text: "", attachments: [] }), ...(existing === null ? [PushUrl({ url: `/c/${chatId}` })] : []), FocusComposer()],
	};
};

const openChat = (model: Model, id: string | null): Return => {
	if (id === null) return { model: { ...model, currentChat: null, loading: false, pinned: true, unread: 0, mobilePanel: "none", historyPages: 0 }, commands: [FocusComposer()] };
	const exists = model.chats.some((chat) => chat.id === id);
	if (!exists) return { model: { ...model, currentChat: null, loading: false, toast: "That conversation is not on this device." }, commands: [ReplaceUrl({ url: "/" }), ClearToast()] };
	return { model: { ...model, currentChat: id, loading: true, pinned: true, unread: 0, mobilePanel: "none", historyPages: 0, renaming: null }, commands: [FinishLoading({ chatId: id })] };
};

const scriptedFor = (model: Model, turnId: string, change: (turn: AgentTurn) => AgentTurn): Model => ({
	...model,
	chats: model.chats.map((chat) => ({ ...chat, entries: chat.entries.map((entry) => (entry._tag === "Agent" && entry.id === turnId ? change(entry) : entry)) })),
});

const entryAt = (model: Model, id: string) => {
	for (const chat of model.chats) {
		const index = chat.entries.findIndex((entry) => entry.id === id);
		if (index >= 0) return { chat, index, entry: chat.entries[index] };
	}
	return null;
};

const retry = (model: Model, id: string): Return => {
	const found = entryAt(model, id);
	if (found?.entry?._tag !== "User") return { model };
	return send({ ...model, currentChat: found.chat.id, attachments: found.entry.attachments }, found.entry.text);
};

const edit = (model: Model, id: string): Return => {
	const found = entryAt(model, id);
	if (found?.entry?._tag !== "User") return { model };
	const trimmed = withChat(model, found.chat.id, (chat) => ({ ...chat, entries: chat.entries.slice(0, found.index) }));
	const next = { ...trimmed, draft: found.entry.text, attachments: found.entry.attachments };
	return { model: next, commands: [persistChats(next), saveDraft(next), FocusComposer()] };
};

const branch = (model: Model, id: string): Return => {
	const found = entryAt(model, id);
	if (found === null) return { model };
	const chatId = newId("c", model);
	const copy: Chat = { id: chatId, title: `${found.chat.title} (branch)`, createdAt: model.now, updatedAt: model.now, pinned: false, archived: false, entries: found.chat.entries.slice(0, found.index + 1) };
	const next = { ...model, chats: [copy, ...model.chats], seq: model.seq + 1, currentChat: chatId, loading: false, pinned: true };
	return { model: next, commands: [persistChats(next), PushUrl({ url: `/c/${chatId}` })] };
};

const togglePanel = (model: Model, side: "left" | "right"): Return => {
	if (model.viewport < PHONE_WIDTH) return { model: { ...model, mobilePanel: model.mobilePanel === side ? "none" : side } };
	const panels = side === "left" ? { ...model.panels, leftOpen: !model.panels.leftOpen } : { ...model.panels, rightOpen: !model.panels.rightOpen };
	return { model: { ...model, panels }, commands: [persistPanels(panels)] };
};

const globalKey = (model: Model, key: string, meta: boolean, alt: boolean): Return => {
	if (key === "Escape") {
		if (model.confirmDelete !== null) return { model: { ...model, confirmDelete: null } };
		if (model.settingsOpen) return { model: { ...model, settingsOpen: false } };
		if (model.mobilePanel !== "none") return { model: { ...model, mobilePanel: "none" } };
		const stopped = stopRunning(model);
		return stopped === model ? { model } : { model: stopped, commands: [persistChats(stopped)] };
	}
	if (meta && key.toLowerCase() === "b") return togglePanel(model, "left");
	if (meta && key.toLowerCase() === "j") return togglePanel(model, "right");
	if (alt && key.toLowerCase() === "t") return { model, commands: [FocusNotifications()] };
	return { model };
};

const closeSocket = (model: Model, epoch: number): Return => {
	if (epoch !== model.socketEpoch || model.auth._tag !== "SignedIn") return { model };
	if (model.reconnectAttempt >= MAX_RECONNECTS) return { model: { ...model, connection: "offline" } };
	const attempt = model.reconnectAttempt + 1;
	return { model: { ...model, connection: "reconnecting", reconnectAttempt: attempt, socketEpoch: epoch + 1 }, commands: [ScheduleReconnect({ epoch: epoch + 1, delayMs: 400 * 2 ** (attempt - 1) })] };
};

const signedIn = (model: Model, email: string, account: string): Return => ({
	model: { ...model, auth: { _tag: "SignedIn", email, account }, connection: "connecting", socketEpoch: model.socketEpoch + 1, reconnectAttempt: 0 },
	commands: [FocusComposer(), ...(model.loading && model.currentChat !== null ? [FinishLoading({ chatId: model.currentChat })] : [])],
});

const CLOSED_FENCE = /```[\s\S]*?\n```/;

const tick = (model: Model): Return => {
	const turn = lastTurn(currentChat(model));
	const view = turn === null ? null : turnView(turn, model);
	const fresh = turn !== null && view !== null && view.visible && !model.announced.includes(turn.id);
	const counted: Model = fresh ? { ...model, announced: [...model.announced.slice(-50), turn.id], unread: model.pinned ? model.unread : model.unread + 1 } : model;
	const wantsHighlighter = !counted.highlighterRequested && view !== null && view.items.some((item) => item.kind === "say" && CLOSED_FENCE.test(item.text));
	return wantsHighlighter ? { model: { ...counted, highlighterRequested: true }, commands: [LoadHighlighter()] } : { model: counted };
};

export const update = (model: Model, message: Message): Return =>
	Message.match<Return>(message, {
		GotMe: ({ me }) => (me.account === null ? { model: { ...model, auth: { _tag: "ChooseAccount", email: me.email, accounts: me.accounts, choice: me.accounts[0] ?? "" } } } : signedIn(model, me.email, me.account)),
		GotSignedOut: () => {
			const params = new URLSearchParams(location.search);
			const reason = params.get("error");
			const error = reason === "cancelled" ? "Sign-in was cancelled on the Cloudflare page. Nothing was shared." : reason === "failed" ? "Cloudflare could not confirm your email address. Try again." : null;
			return { model: { ...model, auth: { _tag: "SignedOut", error, returnTo: params.get("return") ?? `${location.pathname}` }, connection: "offline" } };
		},
		GotExpired: () => ({ model: { ...model, auth: { _tag: "Expired", returnTo: `${location.pathname}${location.search}` }, connection: "offline" } }),
		PickedAccount: ({ account }) => (model.auth._tag === "ChooseAccount" ? { model: { ...model, auth: { ...model.auth, choice: account } } } : { model }),
		ConfirmedAccount: () => (model.auth._tag === "ChooseAccount" ? { model, commands: [SaveAccount({ account: model.auth.choice })] } : { model }),
		SavedAccount: ({ account }) => (model.auth._tag === "ChooseAccount" ? signedIn(model, model.auth.email, account) : { model }),
		ClickedSignOut: () => ({ model: { ...model, connection: "offline", socketEpoch: model.socketEpoch + 1 }, commands: [SignOut()] }),
		ClickedSignInAgain: () => {
			const returnTo = model.auth._tag === "Expired" || model.auth._tag === "SignedOut" ? model.auth.returnTo : "/";
			return { model, commands: [LoadPage({ url: `/auth/sign-in?return=${encodeURIComponent(returnTo)}` })] };
		},
		ClickedExpireSession: () => ({ model, commands: [ExpireSession()] }),
		CompletedEffect: () => ({ model }),
		SocketOpened: ({ epoch }) => (epoch === model.socketEpoch ? { model: { ...model, connection: "online", reconnectAttempt: 0 } } : { model }),
		SocketClosed: ({ epoch }) => closeSocket(model, epoch),
		SocketExpired: ({ epoch }) => (epoch === model.socketEpoch ? { model: { ...model, auth: { _tag: "Expired", returnTo: `${location.pathname}${location.search}` }, connection: "offline" } } : { model }),
		GotScript: ({ turnId, script, at }) => {
			const next = scriptedFor(model, turnId, (turn) => (turn.stoppedAt !== null ? turn : { ...turn, script, receivedAt: at, sentAt: turn.sentAt ?? at }));
			return { model: next, commands: [persistChats(next)] };
		},
		StampedTurn: ({ turnId, at }) => ({ model: scriptedFor(model, turnId, (turn) => ({ ...turn, sentAt: at })) }),
		ScheduledReconnect: ({ epoch }) => (epoch === model.socketEpoch && model.connection === "reconnecting" ? reconnect(model) : { model }),
		ClickedRetryConnection: () => {
			const next = reconnect({ ...model, reconnectAttempt: 0, connection: "connecting" });
			return { model: next.model, commands: [AllowConnection(), ...(next.commands ?? [])] };
		},
		ClickedDropConnection: () => ({ model, commands: [DropConnection({ block: false })] }),
		ClickedBlockConnection: () => ({ model, commands: [DropConnection({ block: true })] }),
		ClickedLateClose: () => ({ model, commands: [DeliverLateClose()] }),
		Ticked: ({ now }) => tick({ ...model, now }),
		ChangedVisibility: ({ hidden }) => {
			if (hidden || model.auth._tag !== "SignedIn") return { model: { ...model, hidden } };
			const next = reconnect({ ...model, hidden, reconnectAttempt: 0 });
			return { model: next.model, commands: [...(next.commands ?? []), FetchMe()] };
		},
		ChangedViewport: ({ width, touch }) => {
			const panels = { ...model.panels, leftWidth: clampWidth(model.panels.leftWidth, model.panels.rightWidth, model.panels.rightOpen, width), rightWidth: clampWidth(model.panels.rightWidth, model.panels.leftWidth, model.panels.leftOpen, width) };
			return { model: { ...model, viewport: width, touch, panels: width < PHONE_WIDTH ? model.panels : panels, mobilePanel: width < PHONE_WIDTH ? model.mobilePanel : "none" } };
		},
		LoadedChats: ({ chats, draft, draftChat, attachments, panels, settings }) => {
			const savedPanels = Option.getOrElse(decodePanels(panels), () => DEFAULT_PANELS);
			const savedSettings = Option.getOrElse(decodeSettings(settings), () => model.settings);
			const id = chatIdFromPath(location.pathname);
			const sameChat = draftChat === (id ?? "new");
			const restored: Model = { ...model, announced: chats.flatMap((chat) => chat.entries.flatMap((entry) => (entry._tag === "Agent" ? [entry.id] : []))), chats, draft: sameChat ? draft : "", attachments: sameChat ? attachments : [], panels: savedPanels, settings: savedSettings, settingsDraft: savedSettings.starters.join("\n") };
			const opened = openChat(restored, id);
			return { model: opened.model, commands: [...(opened.commands ?? []), FetchMe()] };
		},
		ChangedUrl: ({ url }) => {
			const id = chatIdFromPath(url.pathname);
			return id === model.currentChat ? { model } : openChat(model, id);
		},
		RequestedUrl: ({ url }) => {
			const id = chatIdFromPath(url.pathname);
			if (id === model.currentChat) return { model };
			const opened = openChat(model, id);
			return { model: opened.model, commands: [PushUrl({ url: id === null ? "/" : `/c/${id}` }), ...(opened.commands ?? [])] };
		},
		ClickedLink: ({ href }) => ({ model, commands: [LoadPage({ url: href })] }),
		FinishedLoading: ({ chatId }) =>
			chatId === model.currentChat && model.auth._tag === "SignedIn" ? { model: { ...model, loading: false, pinned: true, pinRequest: model.pinRequest + 1 }, commands: [FocusComposer()] } : { model },
		EditedDraft: ({ value }) => {
			const next = { ...model, draft: value };
			return { model: next, commands: [saveDraft(next)] };
		},
		PressedComposerKey: ({ key, shift }) => (key === "Enter" && !shift && !model.touch ? send(model, model.draft) : { model }),
		ClickedSend: () => send(model, model.draft),
		ClickedStop: () => {
			const stopped = stopRunning(model);
			return { model: stopped, commands: [persistChats(stopped), FocusComposer()] };
		},
		PressedEscape: () => globalKey(model, "Escape", false, false),
		PastedFile: ({ attachment }) => {
			const next = { ...model, attachments: [...model.attachments, attachment] };
			return { model: next, commands: [saveDraft(next)] };
		},
		RemovedAttachment: ({ id }) => {
			const next = { ...model, attachments: model.attachments.filter((each) => each.id !== id) };
			return { model: next, commands: [saveDraft(next)] };
		},
		ClickedStarter: ({ text }) => send(model, text),
		ClickedNewChat: () => {
			const opened = openChat({ ...model, draft: "", attachments: [] }, null);
			return { model: opened.model, commands: [PushUrl({ url: "/" }), ...(opened.commands ?? [])] };
		},
		OpenedChat: ({ id }) => {
			const opened = openChat(model, id);
			return id === model.currentChat ? { model: { ...model, mobilePanel: "none" } } : { model: opened.model, commands: [PushUrl({ url: `/c/${id}` }), ...(opened.commands ?? [])] };
		},
		EditedSearch: ({ value }) => ({ model: { ...model, search: value } }),
		ClickedPin: ({ id }) => {
			const next = withChat(model, id, (chat) => ({ ...chat, pinned: !chat.pinned }));
			return { model: next, commands: [persistChats(next)] };
		},
		ClickedArchive: ({ id }) => {
			const next = withChat(model, id, (chat) => ({ ...chat, archived: !chat.archived }));
			return { model: { ...next, toast: next.chats.find((chat) => chat.id === id)?.archived ? "Conversation archived." : "Conversation restored." }, commands: [persistChats(next), ClearToast()] };
		},
		StartedRename: ({ id }) => ({ model: { ...model, renaming: { id, value: model.chats.find((chat) => chat.id === id)?.title ?? "" } } }),
		EditedRename: ({ value }) => (model.renaming === null ? { model } : { model: { ...model, renaming: { ...model.renaming, value } } }),
		FinishedRename: () => {
			if (model.renaming === null) return { model };
			const { id, value } = model.renaming;
			const next = { ...withChat(model, id, (chat) => ({ ...chat, title: value.trim() || chat.title })), renaming: null };
			return { model: next, commands: [persistChats(next)] };
		},
		CancelledRename: () => ({ model: { ...model, renaming: null } }),
		ClickedDelete: ({ id }) => ({ model: { ...model, confirmDelete: id } }),
		ConfirmedDelete: () => {
			if (model.confirmDelete === null) return { model };
			const id = model.confirmDelete;
			const next: Model = { ...model, chats: model.chats.filter((chat) => chat.id !== id), confirmDelete: null, currentChat: model.currentChat === id ? null : model.currentChat };
			return { model: next, commands: [persistChats(next), ...(model.currentChat === id ? [PushUrl({ url: "/" })] : [])] };
		},
		CancelledDelete: () => ({ model: { ...model, confirmDelete: null } }),
		ScrolledLog: ({ atBottom, nearTop }) => {
			const next = { ...model, pinned: atBottom, unread: atBottom ? 0 : model.unread };
			const chat = currentChat(model);
			const hasHistory = chat !== null && chat.entries.length >= 6;
			return nearTop && !atBottom && hasHistory && model.historyPages < 2 && !model.loading && !model.loadingOlder ? { model: { ...next, loadingOlder: true }, commands: [LoadOlder()] } : { model: next };
		},
		WheeledUp: () => ({ model: { ...model, pinned: false } }),
		ClickedJump: () => ({ model: { ...model, pinned: true, unread: 0, pinRequest: model.pinRequest + 1 } }),
		ToggledRow: ({ id, open }) => ({ model: { ...model, openRows: open ? [...model.openRows.filter((row) => row !== id), id] : model.openRows.filter((row) => row !== id) } }),
		ClickedCopy: ({ id, text }) => ({ model: { ...model, copied: id }, commands: [CopyText({ id, text })] }),
		ClearedCopied: ({ id }) => ({ model: model.copied === id ? { ...model, copied: null } : model }),
		ClickedRetry: ({ id }) => retry(model, id),
		ClickedEdit: ({ id }) => edit(model, id),
		ClickedBranch: ({ id }) => branch(model, id),
		LoadedHighlighter: () => ({ model: { ...model, highlighter: true } }),
		LoadedOlder: () => ({ model: { ...model, historyPages: model.historyPages + 1, loadingOlder: false } }),
		ToggledPanel: ({ side }) => togglePanel(model, side),
		OpenedMobilePanel: ({ side }) => ({ model: { ...model, mobilePanel: side } }),
		ClosedMobilePanel: () => ({ model: { ...model, mobilePanel: "none" } }),
		StartedDrag: ({ side, x }) => (model.viewport < PHONE_WIDTH ? { model } : { model: { ...model, drag: { side, startX: x, startWidth: side === "left" ? model.panels.leftWidth : model.panels.rightWidth } } }),
		MovedDrag: ({ x }) => {
			if (model.drag === null) return { model };
			const delta = model.drag.side === "left" ? x - model.drag.startX : model.drag.startX - x;
			const width = model.drag.side === "left" ? clampWidth(model.drag.startWidth + delta, model.panels.rightWidth, model.panels.rightOpen, model.viewport) : clampWidth(model.drag.startWidth + delta, model.panels.leftWidth, model.panels.leftOpen, model.viewport);
			return { model: { ...model, panels: model.drag.side === "left" ? { ...model.panels, leftWidth: width } : { ...model.panels, rightWidth: width } } };
		},
		EndedDrag: () => (model.drag === null ? { model } : { model: { ...model, drag: null }, commands: [persistPanels(model.panels)] }),
		ResetPanel: ({ side }) => {
			const panels = side === "left" ? { ...model.panels, leftWidth: DEFAULT_PANELS.leftWidth } : { ...model.panels, rightWidth: DEFAULT_PANELS.rightWidth };
			return { model: { ...model, panels, drag: null }, commands: [persistPanels(panels)] };
		},
		OpenedSettings: () => ({ model: { ...model, settingsOpen: true, settingsDraft: model.settings.starters.join("\n") } }),
		ClosedSettings: () => ({ model: { ...model, settingsOpen: false } }),
		EditedStarters: ({ value }) => ({ model: { ...model, settingsDraft: value } }),
		SavedSettings: () => {
			const starters = model.settingsDraft
				.split("\n")
				.map((line) => line.trim())
				.filter((line) => line !== "")
				.slice(0, 5);
			const settings = { ...model.settings, starters: starters.length >= 3 ? starters : [...DEFAULT_STARTERS] };
			return { model: { ...model, settings, settingsOpen: false, toast: "Settings saved." }, commands: [Persist({ key: STORAGE.settings, value: JSON.stringify(settings) }), ClearToast()] };
		},
		PickedSpeed: ({ speed }) => {
			const settings = { ...model.settings, speed };
			return { model: { ...model, settings }, commands: [Persist({ key: STORAGE.settings, value: JSON.stringify(settings) })] };
		},
		PickedTheme: ({ theme }) => {
			const settings = { ...model.settings, theme };
			return { model: { ...model, settings }, commands: [Persist({ key: STORAGE.settings, value: JSON.stringify(settings) })] };
		},
		PickedInspector: ({ tab }) => ({ model: { ...model, inspector: tab } }),
		PressedGlobalKey: ({ key, meta, alt }) => globalKey(model, key, meta, alt),
		DismissedToast: () => ({ model: { ...model, toast: null } }),
	});

export const persistAfter = { chats: persistChats };
