import type { Html } from "foldkit/html";
import { formatSeconds, type ItemView, plainText, type SubView, type ToolView, type TurnView } from "../engine.ts";
import { highlighted } from "../highlighter.ts";
import { type Block, type Inline, parseMarkdown } from "../markdown.ts";
import { Message } from "../message.ts";
import type { AgentTurn, Chat, Entry, Model, Notice, UserMessage } from "../model.ts";
import { FollowLog } from "../mounts.ts";
import { turnView } from "../update.ts";
import { type H, ICONS, icon, iconButton } from "./ui.ts";

const inline = (h: H, parts: ReadonlyArray<Inline>): ReadonlyArray<Html | string> =>
	parts.map((part) => {
		switch (part.kind) {
			case "strong":
				return h.strong([h.Class("font-semibold")], [part.text]);
			case "em":
				return h.em([], [part.text]);
			case "code":
				return h.code([h.Class("rounded bg-raised px-1 py-0.5 font-mono text-[0.88em]")], [part.text]);
			case "link":
				return h.a([h.Href(part.href), h.Target("_blank"), h.Rel("noreferrer"), h.Class("text-brand underline underline-offset-2")], [part.text]);
			case "text":
				return part.text;
		}
	});

const TOKEN_CLASS = { plain: "", keyword: "text-brand", string: "text-ok", number: "text-warn", comment: "text-faint italic", fn: "text-ink font-medium" } as const;

const codeBlock = (h: H, model: Model, id: string, block: Extract<Block, { kind: "code" }>): Html => {
	const tokens = block.closed ? highlighted(block.code, block.language) : null;
	const copied = model.copied === id;
	return h.div(
		[h.Class("group/code my-3 overflow-hidden rounded-xl border border-line bg-panel"), h.DataAttribute("code-block", block.language), h.DataAttribute("highlighted", tokens === null ? "false" : "true")],
		[
			h.div(
				[h.Class("flex items-center justify-between border-b border-line px-3 py-1.5 text-[12px] text-faint")],
				[
					h.span([h.Class("font-mono")], [block.language]),
					h.button(
						[h.Type("button"), h.Class("rounded-md px-2 py-0.5 font-medium text-dim hover:bg-raised hover:text-ink"), h.DataAttribute("copy-code", ""), h.AriaLabel(copied ? "Code copied" : "Copy code"), h.OnClick(Message.ClickedCopy({ id, text: block.code }))],
						[copied ? "copied" : "copy"],
					),
				],
			),
			h.pre(
				[h.Class("overflow-x-auto p-3.5 font-mono text-[12.5px] leading-[1.6]")],
				[h.code([], tokens === null ? [block.code] : tokens.map((token) => (token.kind === "plain" ? token.text : h.span([h.Class(TOKEN_CLASS[token.kind])], [token.text]))))],
			),
		],
	);
};

export const markdown = (h: H, model: Model, id: string, text: string): ReadonlyArray<Html> =>
	parseMarkdown(text).map((block, index) => {
		switch (block.kind) {
			case "heading":
				return block.level <= 2 ? h.h3([h.Class("mt-4 mb-2 text-[16px] font-semibold")], inline(h, block.inline)) : h.h4([h.Class("mt-3 mb-1 font-semibold")], inline(h, block.inline));
			case "paragraph":
				return h.p([h.Class("my-2 leading-[1.65]")], inline(h, block.inline));
			case "list":
				return (block.ordered ? h.ol : h.ul)([h.Class(`my-2 space-y-1 pl-5 ${block.ordered ? "list-decimal" : "list-disc"}`)], block.items.map((item) => h.li([], inline(h, item))));
			case "code":
				return codeBlock(h, model, `${id}:code:${index}`, block);
			case "table":
				return h.div(
					[h.Class("my-3 overflow-x-auto rounded-xl border border-line")],
					[
						h.table(
							[h.Class("w-full border-collapse text-[13.5px]")],
							[
								h.thead([], [h.tr([], block.head.map((cell) => h.th([h.Class("border-b border-line bg-panel px-3 py-2 text-left font-semibold")], inline(h, cell))))]),
								h.tbody([], block.rows.map((row) => h.tr([], row.map((cell) => h.td([h.Class("border-b border-line px-3 py-2 last:border-0")], inline(h, cell)))))),
							],
						),
					],
				);
		}
	});

const toolLabel = { running: "running", ok: "done", error: "failed", stuck: "no result: the turn ended before this tool returned", stopped: "stopped" } as const;
const toolTone = { running: "text-brand", ok: "text-ok", error: "text-bad", stuck: "text-bad", stopped: "text-faint" } as const;

const toolRow = (h: H, model: Model, key: string, tool: ToolView): Html => {
	const id = `${key}:${tool.id}`;
	const open = model.openRows.includes(id);
	return h.details(
		[h.Key(id), h.Class("tool-row my-2 rounded-xl border border-line bg-panel"), h.DataAttribute("tool", tool.name), h.DataAttribute("status", tool.status), h.Open(open), h.OnToggle((isOpen) => Message.ToggledRow({ id, open: isOpen }))],
		[
			h.summary(
				[h.Class("flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px]")],
				[
					h.span([h.Class(`size-2 shrink-0 rounded-full ${tool.status === "running" ? "animate-pulse bg-brand" : tool.status === "ok" ? "bg-ok" : tool.status === "stopped" ? "bg-line-strong" : "bg-bad"}`), h.AriaHidden(true)], []),
					h.span([h.Class("font-mono font-medium")], [tool.name]),
					h.span([h.Class(`text-[12px] ${toolTone[tool.status]}`)], [toolLabel[tool.status]]),
					h.span([h.Class("ml-auto font-mono text-[12px] text-faint tabular-nums"), h.DataAttribute("tool-timer", tool.status === "running" ? "live" : "final")], [formatSeconds(tool.elapsedMs)]),
				],
			),
			h.div(
				[h.Class("space-y-2 border-t border-line px-3 py-2.5")],
				[
					h.div([h.Class("text-[11px] font-medium tracking-wide text-faint uppercase")], ["Input"]),
					h.pre([h.Class("overflow-x-auto rounded-lg bg-bg p-2 font-mono text-[12px]")], [tool.input]),
					...(tool.output === "" ? [] : [h.div([h.Class("text-[11px] font-medium tracking-wide text-faint uppercase")], ["Output"]), h.pre([h.Class("max-h-64 overflow-auto rounded-lg bg-bg p-2 font-mono text-[12px] whitespace-pre-wrap")], [tool.output])]),
				],
			),
		],
	);
};

const thinking = (h: H, model: Model, id: string, text: string, done: boolean): Html => {
	const open = model.openRows.includes(id);
	return h.details(
		[h.Key(id), h.Class("my-2 text-[13.5px] text-dim"), h.DataAttribute("thinking", done ? "done" : "live"), h.Open(open), h.OnToggle((isOpen) => Message.ToggledRow({ id, open: isOpen }))],
		[
			h.summary([h.Class("inline-flex cursor-pointer list-none items-center gap-1.5 rounded-md px-1.5 py-0.5 hover:bg-raised")], [icon(h, ICONS.bolt, 14), done ? "Thinking" : "Thinking…"]),
			h.p([h.Class("mt-1 border-l-2 border-brand-line pl-3 leading-[1.6] italic")], [text]),
		],
	);
};

const subItem = (h: H, model: Model, key: string, item: SubView, index: number): Html =>
	item.kind === "tool" ? toolRow(h, model, key, item) : item.kind === "think" ? thinking(h, model, `${key}:think:${index}`, item.text, item.done) : h.div([h.Class("text-[14px]")], markdown(h, model, `${key}:say:${index}`, item.text));

const item = (h: H, model: Model, key: string, view: ItemView, index: number): Html => {
	switch (view.kind) {
		case "think":
			return thinking(h, model, `${key}:think:${index}`, view.text, view.done);
		case "say":
			return h.div([h.Class("answer"), h.DataAttribute("answer", "")], markdown(h, model, `${key}:say:${index}`, view.text));
		case "tool":
			return toolRow(h, model, key, view);
		case "subagent": {
			const id = `${key}:${view.id}`;
			const open = model.openRows.includes(id) || view.running;
			return h.details(
				[h.Key(id), h.Class("my-2 rounded-xl border border-brand-line bg-brand-soft/60"), h.DataAttribute("subagent", view.name), h.Open(open), h.OnToggle((isOpen) => Message.ToggledRow({ id, open: isOpen }))],
				[
					h.summary(
						[h.Class("flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-[13px]")],
						[
							h.span([h.Class("rounded-md bg-brand px-1.5 py-0.5 font-mono text-[11px] text-white")], ["subagent"]),
							h.span([h.Class("font-medium")], [view.name]),
							h.span([h.Class("min-w-0 flex-1 truncate text-dim")], [view.task]),
							h.span([h.Class("font-mono text-[12px] text-faint tabular-nums")], [view.running ? `${formatSeconds(view.elapsedMs)} running` : formatSeconds(view.elapsedMs)]),
						],
					),
					h.div([h.Class("border-t border-brand-line px-3 py-1")], view.items.map((sub, subIndex) => subItem(h, model, id, sub, subIndex))),
				],
			);
		}
		case "html":
			return h.figure(
				[h.Class("my-3 overflow-hidden rounded-xl border border-line"), h.DataAttribute("inline-html", "")],
				[
					h.figcaption([h.Class("border-b border-line bg-panel px-3 py-1.5 text-[12px] text-faint")], [`${view.title} · sandboxed HTML`]),
					h.iframe([h.Attribute("sandbox", ""), h.Attribute("srcdoc", view.html), h.Title(view.title), h.Attribute("loading", "lazy"), h.Class("block h-48 w-full bg-white")], []),
				],
			);
		case "fail":
			return errorNotice(h, model, `${key}:fail`, view.summary, view.detail);
		case "restart":
			return h.p(
				[h.Class("my-2 flex items-center gap-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13px]"), h.DataAttribute("resumed", view.done ? "yes" : "restarting"), h.Role("status")],
				[view.done ? `The server restarted during ${view.tool}. The turn resumed from ${view.checkpoint}.` : `The server is restarting during ${view.tool}…`],
			);
	}
};

const errorNotice = (h: H, model: Model, id: string, summary: string, detail: string): Html =>
	h.div(
		[h.Class("my-2 rounded-xl border border-bad/40 bg-bad/5 px-3 py-2 text-[13.5px]"), h.Role("alert"), h.DataAttribute("error", "")],
		[
			h.p([h.Class("font-medium text-bad"), h.DataAttribute("error-summary", "")], [summary]),
			...(detail === ""
				? []
				: [
						h.details(
							[h.Class("mt-1"), h.Open(model.openRows.includes(id)), h.OnToggle((isOpen) => Message.ToggledRow({ id, open: isOpen }))],
							[h.summary([h.Class("cursor-pointer text-[12.5px] text-dim")], ["Show details"]), h.pre([h.Class("mt-2 max-h-72 overflow-auto rounded-lg bg-bg p-2 font-mono text-[12px] whitespace-pre-wrap")], [detail])],
						),
					]),
		],
	);

const copyButton = (h: H, model: Model, id: string, text: string): Html =>
	h.button(
		[h.Type("button"), h.Class("inline-flex h-7 items-center gap-1 rounded-md px-2 text-[12px] text-dim hover:bg-raised hover:text-ink"), h.AriaLabel(model.copied === id ? "Message copied" : "Copy message"), h.DataAttribute("copy-message", ""), h.OnClick(Message.ClickedCopy({ id, text }))],
		[icon(h, ICONS.copy, 14), model.copied === id ? "Copied" : "Copy"],
	);

const userMessage = (h: H, model: Model, entry: UserMessage, running: boolean): Html => {
	const signedIn = model.auth._tag === "SignedIn";
	const editLabel = signedIn ? (running ? "Stop the running turn to edit messages" : "Edit message") : "You need to sign in to edit messages";
	return h.div(
		[h.Key(entry.id), h.Class("group/msg flex flex-col items-end"), h.DataAttribute("entry", "user"), h.DataAttribute("role", "user")],
		[
			h.div(
				[h.Class("max-w-[85%] rounded-2xl rounded-br-md bg-brand-soft px-4 py-2.5 text-[15px] leading-[1.6] break-words whitespace-pre-wrap text-ink")],
				[...entry.attachments.map((attachment) => h.span([h.Class("mb-1 mr-1 inline-flex items-center gap-1 rounded-md border border-brand-line bg-bg px-2 py-0.5 text-[12px]")], [icon(h, ICONS.paperclip, 12), attachment.name])), entry.text],
			),
			h.div(
				[h.Class("mt-1 flex gap-0.5 opacity-100 transition-opacity sm:opacity-0 sm:group-hover/msg:opacity-100 sm:group-focus-within/msg:opacity-100"), h.DataAttribute("message-actions", "")],
				[
					copyButton(h, model, `${entry.id}:copy`, entry.text),
					iconButton(h, signedIn ? (running ? "Stop the running turn to retry messages" : "Retry") : "You need to sign in to retry messages", ICONS.retry, Message.ClickedRetry({ id: entry.id }), { disabled: !signedIn || running }),
					iconButton(h, editLabel, ICONS.edit, Message.ClickedEdit({ id: entry.id }), { disabled: !signedIn || running }),
					iconButton(h, signedIn ? "Branch off" : "You need to sign in to branch conversations", ICONS.branch, Message.ClickedBranch({ id: entry.id }), { disabled: !signedIn }),
				],
			),
		],
	);
};

const turnStatus = (h: H, view: TurnView): ReadonlyArray<Html> => {
	if (view.phase === "empty") return [h.p([h.Class("my-2 rounded-lg border border-warn/40 bg-warn/10 px-3 py-2 text-[13.5px]"), h.Role("status"), h.DataAttribute("empty-turn", "")], ["Agent completed without a visible response. Please retry."])];
	if (view.phase === "stopped") return [h.p([h.Class("my-1 text-[12.5px] text-faint"), h.DataAttribute("stopped", "")], ["Stopped."])];
	return [];
};

const agentTurn = (h: H, model: Model, turn: AgentTurn): Html => {
	const view = turnView(turn, model);
	const text = plainText(view);
	const finished = view.phase === "done" || view.phase === "failed" || view.phase === "stuck";
	return h.div(
		[h.Key(turn.id), h.Class("agent-turn"), h.DataAttribute("entry", "agent"), h.DataAttribute("role", "assistant"), h.DataAttribute("phase", view.phase), h.DataAttribute("script", turn.script.name)],
		[
			...view.items.map((each, index) => item(h, model, turn.id, each, index)),
			...turnStatus(h, view),
			...(finished && text !== "" ? [h.div([h.Class("mt-1 flex gap-0.5"), h.DataAttribute("message-actions", "")], [copyButton(h, model, `${turn.id}:copy`, text)])] : []),
		],
	);
};

const noticeEntry = (h: H, model: Model, entry: Notice): Html =>
	h.div(
		[h.Key(entry.id), h.DataAttribute("entry", "notice"), h.DataAttribute("notice", entry.tone)],
		[
			entry.tone === "bad"
				? errorNotice(h, model, entry.id, entry.summary, entry.detail)
				: h.p([h.Class(`my-2 rounded-lg border px-3 py-2 text-[13.5px] ${entry.tone === "warn" ? "border-warn/40 bg-warn/10" : "border-line bg-panel"}`), h.Role("status")], [entry.summary]),
		],
	);

const entryView = (h: H, model: Model, chat: Chat, entry: Entry, index: number): Html => {
	switch (entry._tag) {
		case "User": {
			const later = chat.entries.slice(index + 1).find((each) => each._tag === "Agent");
			const running = later?._tag === "Agent" && later.stoppedAt === null && ["awaiting", "waiting", "streaming"].includes(turnView(later, model).phase);
			return userMessage(h, model, entry, running);
		}
		case "Agent":
			return agentTurn(h, model, entry);
		case "Notice":
			return noticeEntry(h, model, entry);
	}
};

const OLDER = ["The project began as a single Worker.", "A Durable Object took over the session state.", "Tests now run in an isolate per change."];

export const transcript = (h: H, model: Model, chat: Chat | null, body: Html): Html =>
	h.div(
		[
			h.Id("log"),
			h.Role("log"),
			h.AriaLive("polite"),
			h.AriaLabelledBy("log-heading"),
			h.AriaBusy(model.loading),
			h.Tabindex(0),
			h.DataAttribute("pin-request", String(model.pinRequest)),
			h.Class("log min-h-0 flex-1 overflow-y-auto overscroll-contain [overflow-anchor:none] focus:outline-none"),
			h.OnMount(FollowLog()),
		],
		[
			h.div(
				[h.Class("mx-auto flex w-full max-w-[760px] flex-col gap-4 px-4 pt-6 pb-4 sm:px-6")],
				[
					h.h2([h.Id("log-heading"), h.Class("sr-only")], [chat === null ? "New conversation" : `Conversation: ${chat.title}`]),
					...(chat !== null && model.historyPages > 0 ? OLDER.slice(0, model.historyPages + 1).map((line, index) => h.p([h.Key(`older-${index}`), h.Class("text-center text-[12px] text-faint"), h.DataAttribute("entry", "older")], [line])) : []),
					body,
				],
			),
		],
	);

export const entries = (h: H, model: Model, chat: Chat): Html => h.div([h.Class("flex flex-col gap-5"), h.DataAttribute("entries", String(chat.entries.length))], chat.entries.map((entry, index) => entryView(h, model, chat, entry, index)));
