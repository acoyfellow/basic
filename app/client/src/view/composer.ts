import { Option } from "effect";
import type { Html } from "foldkit/html";
import { formatSeconds, formatTask } from "../engine.ts";
import { Message } from "../message.ts";
import type { Model } from "../model.ts";
import { ComposerBehaviour } from "../mounts.ts";
import { currentChat, isTurnRunning, lastTurn, turnView } from "../update.ts";
import { type H, ICONS, icon } from "./ui.ts";

const THINKING_DELAY_MS = 600;

export const activity = (h: H, model: Model): Html => {
	const turn = lastTurn(currentChat(model));
	const running = isTurnRunning(turn, model);
	const view = turn === null ? null : turnView(turn, model);
	const waitedMs = turn === null ? 0 : model.now - (turn.sentAt ?? model.now);
	const quiet = view !== null && running && !view.visible && waitedMs >= THINKING_DELAY_MS;
	const taskMs = turn === null ? 0 : model.now - (turn.sentAt ?? model.now);
	const runningTool = view?.items.findLast((each) => each.kind === "tool" && each.status === "running");
	return h.div(
		[h.Id("activity"), h.Role("status"), h.AriaLive("polite"), h.Class("mx-auto flex min-h-6 w-full max-w-[760px] items-center gap-2 px-4 text-[12.5px] text-dim sm:px-6"), h.Hidden(!running)],
		running
			? [
					...(quiet ? [h.span([h.Id("thinking"), h.Class("inline-flex items-center gap-1.5")], [h.span([h.Class("thinking-dots"), h.AriaHidden(true)], [h.span([], []), h.span([], []), h.span([], [])]), "Thinking"])] : []),
					...(view?.restarting ? [h.span([], ["Reconnecting to the agent after a restart…"])] : []),
					...(runningTool?.kind === "tool" ? [h.span([h.Class("font-mono")], [`${runningTool.name} ${formatSeconds(runningTool.elapsedMs)}`])] : []),
					h.span([h.Id("turn-timer"), h.Class("ml-auto font-mono tabular-nums")], [formatTask(taskMs)]),
				]
			: [],
	);
};

const connectionLine = (h: H, model: Model): Html | null => {
	if (model.connection === "reconnecting") return h.span([h.Id("connection"), h.Role("status"), h.Class("text-warn")], [`Reconnecting… (attempt ${model.reconnectAttempt} of 4)`]);
	if (model.connection === "offline")
		return h.span(
			[h.Id("connection"), h.Role("status"), h.Class("inline-flex items-center gap-2 text-bad")],
			["You are offline. The connection gave up after 4 tries.", h.button([h.Type("button"), h.Id("retry-connection"), h.Class("rounded-md border border-bad/40 px-2 py-0.5 font-medium hover:bg-bad/10"), h.OnClick(Message.ClickedRetryConnection())], ["Retry"])],
		);
	if (model.connection === "connecting") return h.span([h.Id("connection"), h.Role("status"), h.Class("text-dim")], ["Connecting…"]);
	return null;
};

export const composer = (h: H, model: Model): Html => {
	const turn = lastTurn(currentChat(model));
	const running = isTurnRunning(turn, model);
	const empty = model.draft.trim() === "" && model.attachments.length === 0;
	const connection = connectionLine(h, model);
	return h.form(
		[h.Id("composer-form"), h.Class("mx-auto w-full max-w-[760px] px-3 pb-3 sm:px-6 sm:pb-4"), h.OnSubmit(Message.ClickedSend())],
		[
			h.div(
				[h.Class("rounded-2xl border border-line-strong bg-bg shadow-[0_1px_3px_rgba(24,24,27,0.06)] focus-within:border-brand")],
				[
					...(model.attachments.length === 0
						? []
						: [
								h.div(
									[h.Class("flex flex-wrap gap-1.5 px-3 pt-3"), h.DataAttribute("attachments", String(model.attachments.length))],
									model.attachments.map((attachment) =>
										h.span(
											[h.Key(attachment.id), h.Class("inline-flex items-center gap-1.5 rounded-lg border border-line bg-panel py-1 pr-1 pl-1.5 text-[12.5px]"), h.DataAttribute("attachment", attachment.name)],
											[
												attachment.preview === "" ? icon(h, ICONS.paperclip, 14) : h.img([h.Src(attachment.preview), h.Alt(""), h.Class("size-6 rounded object-cover")]),
												attachment.name,
												h.button([h.Type("button"), h.AriaLabel(`Remove ${attachment.name}`), h.Class("grid size-5 place-items-center rounded text-faint hover:bg-raised hover:text-ink"), h.OnClick(Message.RemovedAttachment({ id: attachment.id }))], [icon(h, ICONS.close, 12)]),
											],
										),
									),
								),
							]),
					h.label([h.For("composer"), h.Class("sr-only")], ["Message"]),
					h.textarea([
						h.Id("composer"),
						h.Name("message"),
						h.Rows(1),
						h.Value(model.draft),
						h.Placeholder(model.touch ? "Message the agent" : "Message the agent"),
						h.Autofocus(true),
						h.EnterKeyHint(model.touch ? "enter" : "send"),
						h.AriaDescribedBy("composer-hint"),
						h.Class("block max-h-[160px] min-h-[52px] w-full resize-none overflow-y-auto bg-transparent px-4 pt-3.5 pb-1 text-[16px] leading-[1.5] outline-none placeholder:text-faint sm:text-[15px]"),
						h.OnInput((value) => Message.EditedDraft({ value })),
						h.OnKeyDownPreventDefault((key, modifiers) => (key === "Enter" && !modifiers.shiftKey && !model.touch ? Option.some(Message.PressedComposerKey({ key, shift: false, meta: modifiers.metaKey })) : Option.none())),
						h.OnMount(ComposerBehaviour()),
					]),
					h.div(
						[h.Class("flex items-center gap-2 px-2 pb-2")],
						[
							h.button([h.Type("button"), h.Disabled(true), h.AriaLabel("Attaching files is a subscriber-only feature. Paste an image instead."), h.Title("Attaching files is a subscriber-only feature. Paste an image instead."), h.Class("inline-grid size-8 place-items-center rounded-lg text-faint disabled:cursor-not-allowed disabled:opacity-50")], [icon(h, ICONS.paperclip)]),
							h.p([h.Id("composer-hint"), h.Class("min-w-0 flex-1 truncate text-[12px] text-faint")], [connection ?? (model.touch ? "Return for a new line. Use the Send button to send." : "Enter to send, Shift + Enter for new line")]),
							running
								? h.button([h.Type("button"), h.Id("stop"), h.AriaLabel("Cancel message"), h.Title("Cancel message (Esc)"), h.AriaKeyshortcuts("Escape"), h.Class("inline-grid size-9 place-items-center rounded-full bg-ink text-bg hover:opacity-90"), h.OnClick(Message.ClickedStop())], [icon(h, ICONS.stop)])
								: h.button([h.Type("submit"), h.Id("send"), h.Disabled(empty), h.AriaLabel(empty ? "Message requires text" : "Send message"), h.Title(empty ? "Message requires text" : "Send message"), h.Class("inline-grid size-9 place-items-center rounded-full bg-brand text-white hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-line-strong disabled:text-faint")], [icon(h, ICONS.send)]),
						],
					),
				],
			),
		],
	);
};
