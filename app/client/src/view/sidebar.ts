import type { Html } from "foldkit/html";
import { formatSeconds, traceOf } from "../engine.ts";
import { Message } from "../message.ts";
import type { Chat, Detail, Model } from "../model.ts";
import { chatFailed, chatRunning, currentChat, turnClock } from "../update.ts";
import { type H, ICONS, icon, iconButton, relativeGroup } from "./ui.ts";

const GROUPS = ["Pinned", "Today", "Yesterday", "Last 7 days", "Older"] as const;

const statusDot = (h: H, model: Model, chat: Chat): Html => {
	const running = chatRunning(chat, model);
	const failed = !running && chatFailed(chat, model);
	const label = running ? "Response in progress" : failed ? "Last turn failed" : "Idle";
	return h.span(
		[h.Class(`size-2 shrink-0 rounded-full ${running ? "animate-pulse bg-brand" : failed ? "bg-bad" : "bg-ok"}`), h.Role("img"), h.AriaLabel(label), h.Title(label), h.DataAttribute("status", running ? "working" : failed ? "failed" : "idle")],
		[],
	);
};

const chatRow = (h: H, model: Model, chat: Chat): Html => {
	const active = chat.id === model.currentChat;
	const renaming = model.renaming?.id === chat.id;
	const running = chatRunning(chat, model);
	return h.li(
		[h.Key(chat.id), h.DataAttribute("conversation", chat.id), h.DataAttribute("working", running ? "true" : "false"), h.Class(`group/row relative flex min-h-9 items-center gap-2 rounded-lg px-2 py-1.5 ${active ? "bg-brand-soft" : "bg-panel hover:bg-raised"}`)],
		[
			statusDot(h, model, chat),
			renaming
				? h.input([
						h.Type("text"),
						h.Value(model.renaming?.value ?? ""),
						h.AriaLabel("Rename conversation"),
						h.Autofocus(true),
						h.Class("min-w-0 flex-1 rounded border border-brand bg-bg px-1.5 py-0.5 text-[13.5px] outline-none"),
						h.OnInput((value) => Message.EditedRename({ value })),
						h.OnBlur(Message.FinishedRename()),
						h.OnKeyDown((key) => (key === "Enter" ? Message.FinishedRename() : key === "Escape" ? Message.CancelledRename() : Message.CompletedEffect())),
					])
				: h.button(
						[h.Type("button"), h.Class("flex min-w-0 flex-1 flex-col text-left leading-tight"), h.AriaCurrent(active ? "page" : "false"), h.Title(`${chat.title}. Double-click to rename.`), h.OnClick(Message.OpenedChat({ id: chat.id })), h.OnDoubleClick(Message.StartedRename({ id: chat.id }))],
						[h.span([h.Class("truncate text-[13.5px]"), h.DataAttribute("title", "")], [chat.title]), ...(running ? [h.span([h.Class("truncate text-[11px] text-brand"), h.DataAttribute("in-progress", "")], ["Response in progress"])] : [])],
					),
			h.div(
				[h.Class("absolute inset-y-0 right-1 flex items-center rounded-lg bg-inherit pl-2 opacity-0 transition-opacity group-focus-within/row:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:static [@media(hover:none)]:opacity-100"), h.DataAttribute("row-actions", "")],
				[
					iconButton(h, chat.pinned ? "Unpin" : "Pin", ICONS.pin, Message.ClickedPin({ id: chat.id }), { className: "size-7", pressed: chat.pinned }),
					iconButton(h, chat.archived ? "Unarchive" : "Archive", ICONS.archive, Message.ClickedArchive({ id: chat.id }), { className: "size-7" }),
					iconButton(h, "Delete", ICONS.trash, Message.ClickedDelete({ id: chat.id }), { className: "size-7" }),
				],
			),
		],
	);
};

export const chatList = (h: H, model: Model): Html => {
	const query = model.search.trim().toLowerCase();
	const visible = model.chats.filter((chat) => !chat.archived && (query === "" || chat.title.toLowerCase().includes(query)));
	const grouped = GROUPS.map((group) => ({ group, chats: visible.filter((chat) => (chat.pinned ? "Pinned" : relativeGroup(chat.updatedAt, model.now)) === group).sort((a, b) => b.updatedAt - a.updatedAt) })).filter((each) => each.chats.length > 0);
	const archived = model.chats.filter((chat) => chat.archived);
	return h.nav(
		[h.AriaLabel("Conversations"), h.Class("flex min-h-0 flex-1 flex-col")],
		[
			h.div(
				[h.Class("px-3 pb-2")],
				[
					h.label([h.For("search"), h.Class("sr-only")], ["Search conversations"]),
					h.input([h.Id("search"), h.Type("search"), h.Placeholder("Search conversations"), h.Value(model.search), h.Class("w-full rounded-lg border border-line bg-bg px-3 py-1.5 text-[13.5px] outline-none placeholder:text-faint focus:border-brand"), h.OnInput((value) => Message.EditedSearch({ value }))]),
				],
			),
			h.div(
				[h.Class("min-h-0 flex-1 overflow-y-auto px-2 pb-3")],
				[
					...(grouped.length === 0 ? [h.p([h.Class("px-2 py-6 text-center text-[13px] text-faint")], [query === "" ? "No conversations yet." : "No conversation matches that search."])] : []),
					...grouped.map(({ group, chats }) => h.section([h.Key(group), h.Class("mb-3"), h.DataAttribute("group", group)], [h.h3([h.Class("px-2 pb-1 text-[11.5px] font-medium tracking-wide text-faint uppercase")], [group]), h.ul([h.Class("space-y-0.5")], chats.map((chat) => chatRow(h, model, chat)))])),
					...(archived.length === 0 ? [] : [h.details([h.Class("mt-2 px-2 text-[12.5px] text-faint")], [h.summary([h.Class("cursor-pointer")], [`Archived (${archived.length})`]), h.ul([h.Class("mt-1 space-y-0.5")], archived.map((chat) => chatRow(h, model, chat)))])]),
				],
			),
		],
	);
};

export const identity = (h: H, model: Model): Html =>
	model.auth._tag === "SignedIn"
		? h.div(
				[h.Class("flex items-center gap-2 overflow-hidden border-t border-line px-3 py-2.5")],
				[
					h.span([h.Class("grid size-7 shrink-0 place-items-center rounded-full border border-brand-line bg-brand-soft text-[12px] font-semibold text-brand"), h.AriaHidden(true)], [model.auth.email.slice(0, 1).toUpperCase()]),
					h.div([h.Class("min-w-0 flex-1 overflow-hidden leading-tight")], [h.p([h.Id("who"), h.Class("truncate text-[13px] font-medium"), h.Title(model.auth.email)], [model.auth.email]), h.p([h.Class("truncate text-[11.5px] text-faint")], [model.auth.account])]),
					iconButton(h, "Open the test lab", ICONS.right, Message.OpenedDetail({ detail: { _tag: "Lab" } }), { id: "open-lab" }),
					iconButton(h, "Settings", ICONS.settings, Message.OpenedSettings(), { id: "open-settings" }),
					h.form([h.Id("sign-out"), h.Attribute("method", "post"), h.Attribute("action", "/auth/sign-out"), h.OnSubmit(Message.ClickedSignOut())], [h.button([h.Type("submit"), h.Title(`Sign out ${model.auth.email}`), h.Class("inline-flex h-8 items-center gap-1.5 rounded-lg px-2 text-[12.5px] font-medium text-dim hover:bg-raised hover:text-ink")], [icon(h, ICONS.signout, 14), "Sign out"])]),
				],
			)
		: h.div([], []);

const SCRIPT_PROMPTS: ReadonlyArray<readonly [string, string]> = [
	["tools", "Run the tests and fix what fails"],
	["subagents", "Plan a schema change with subagents"],
	["html", "Show a latency chart as inline HTML"],
	["code", "Show greeting code in three languages"],
	["long", "Run the long check that takes minutes"],
	["error", "Run the statement workflow and show the error"],
	["empty", "Reply with nothing visible"],
	["stuck", "Deploy a preview that gets stuck"],
	["restart", "Run migrations through a restart and resume"],
	["slow", "Count slowly from 1 to 30"],
	["fast", "Reply with the single word: ok"],
];

const traceView = (h: H, model: Model, turnId: string): Html => {
	const turn = currentChat(model)?.entries.find((entry) => entry._tag === "Agent" && entry.id === turnId);
	if (turn === undefined || turn._tag !== "Agent" || turn.receivedAt === null) return h.p([h.Class("px-3 py-4 text-[13px] text-faint")], ["This turn is not in the open conversation."]);
	const clock = turnClock(turn, turn.stoppedAt ?? model.now) * model.settings.speed;
	const events = traceOf(turn.script, clock);
	return h.ol(
		[h.Class("space-y-1 px-3 py-3 font-mono text-[12px]"), h.DataAttribute("trace", turn.script.name)],
		[
			h.li([h.Class("text-faint")], [`script ${turn.script.name} · ${events.length} steps · sent ${turn.sentAt === null ? "?" : new Date(turn.sentAt).toLocaleTimeString()}`]),
			...events.map((event, index) => h.li([h.Key(`${index}`), h.Class("grid grid-cols-[52px_1fr] gap-2")], [h.span([h.Class("text-faint tabular-nums")], [`+${formatSeconds(event.atMs)}`]), h.span([h.Class("min-w-0 break-words")], [h.span([h.Class("text-brand")], [event.label]), ` ${event.detail}`])])),
		],
	);
};

const scriptsTab = (h: H): Html =>
	h.ul(
		[h.Class("space-y-1 px-3 py-3")],
		SCRIPT_PROMPTS.map(([name, prompt]) =>
			h.li([h.Key(name)], [h.button([h.Type("button"), h.Class("w-full rounded-lg border border-line px-2.5 py-1.5 text-left text-[12.5px] hover:border-brand hover:bg-brand-soft"), h.DataAttribute("script-prompt", name), h.OnClick(Message.ClickedStarter({ text: prompt }))], [h.span([h.Class("font-mono text-brand")], [name]), h.span([h.Class("block text-dim")], [prompt])])]),
		),
	);

const faultsTab = (h: H, model: Model): Html =>
	h.div(
		[h.Class("space-y-2 px-3 py-3 text-[12.5px]")],
		[
			h.p([h.Class("text-faint")], ["Break things on purpose. Each fault is what the contract says the app must survive."]),
			h.button([h.Type("button"), h.Id("fault-drop"), h.Class("w-full rounded-lg border border-line px-2.5 py-1.5 text-left hover:border-brand"), h.OnClick(Message.ClickedDropConnection())], ["Drop the socket once"]),
			h.button([h.Type("button"), h.Id("fault-block"), h.Class("w-full rounded-lg border border-line px-2.5 py-1.5 text-left hover:border-brand"), h.OnClick(Message.ClickedBlockConnection())], ["Drop the socket and refuse reconnects"]),
			h.button([h.Type("button"), h.Id("fault-late-close"), h.Class("w-full rounded-lg border border-line px-2.5 py-1.5 text-left hover:border-brand"), h.OnClick(Message.ClickedLateClose())], ["Deliver a stale close event"]),
			h.button([h.Type("button"), h.Id("fault-expire"), h.Class("w-full rounded-lg border border-line px-2.5 py-1.5 text-left hover:border-brand"), h.OnClick(Message.ClickedExpireSession())], ["Expire my session on the server"]),
			h.label(
				[h.Class("block pt-2 text-faint")],
				[
					"Playback speed",
					h.select(
						[h.Id("speed"), h.Class("mt-1 block w-full rounded-lg border border-line bg-bg px-2 py-1 text-ink"), h.OnChange((value) => Message.PickedSpeed({ speed: Number(value) }))],
						[1, 2, 4].map((speed) => h.option([h.Value(String(speed)), h.Attribute("selected", model.settings.speed === speed ? "selected" : "")], [`${speed}×`])),
					),
				],
			),
			h.p([h.Class("pt-1 font-mono text-faint"), h.DataAttribute("connection-state", model.connection)], [`socket ${model.connection} · epoch ${model.socketEpoch}`]),
		],
	);

const labView = (h: H, model: Model): Html =>
	h.div(
		[h.Class("min-h-0 flex-1 overflow-y-auto")],
		[h.h3([h.Class("px-3 pt-2 text-[12px] font-semibold uppercase tracking-wide text-faint")], ["Scripts"]), scriptsTab(h), h.h3([h.Class("px-3 pt-2 text-[12px] font-semibold uppercase tracking-wide text-faint")], ["Faults"]), faultsTab(h, model)],
	);

export const detailTitle = (detail: Detail): string => (detail._tag === "Trace" ? "Trace" : "Test lab");

export const detailPane = (h: H, model: Model, detail: Detail): Html =>
	h.div([h.Class("flex min-h-0 flex-1 flex-col overflow-y-auto"), h.DataAttribute("detail", detail._tag.toLowerCase())], [detail._tag === "Trace" ? traceView(h, model, detail.turnId) : labView(h, model)]);
