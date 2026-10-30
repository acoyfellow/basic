import { Option } from "effect";
import type { Document, Html } from "foldkit/html";
import { Message } from "../message.ts";
import { type Model, PHONE_WIDTH } from "../model.ts";
import { DragEdge } from "../mounts.ts";
import { chatRunning, currentChat } from "../update.ts";
import { activity, composer } from "./composer.ts";
import { chatList, identity, inspector } from "./sidebar.ts";
import { entries, transcript } from "./transcript.ts";
import { cloudflareMark, DANGER, type H, ICONS, icon, iconButton, PRIMARY, SECONDARY } from "./ui.ts";

const logo = (h: H): Html =>
	h.span(
		[h.Class("inline-flex items-center gap-2 text-[15px] font-semibold tracking-tight")],
		[h.span([h.Class("grid size-6 place-items-center rounded-md bg-brand font-mono text-[12px] text-white"), h.AriaHidden(true)], ["b"]), "basic"],
	);

const signInButton = (h: H, returnTo: string): Html =>
	h.a(
		[h.Href(`/auth/sign-in?return=${encodeURIComponent(returnTo)}`), h.Id("sign-in"), h.DataAttribute("sign-in", "cloudflare"), h.Class("inline-flex h-11 items-center gap-3 rounded-xl border border-line-strong bg-white px-4 text-[15px] font-medium text-[#18181b] shadow-[0_1px_2px_rgba(24,24,27,0.06)] hover:border-brand")],
		[cloudflareMark(h), "Sign in with Cloudflare"],
	);

const signedOut = (h: H, error: string | null, returnTo: string): Html =>
	h.main(
		[h.Class("grid min-h-dvh place-items-center bg-brand-soft/50 px-5 py-10")],
		[
			h.div(
				[h.Class("w-full max-w-[460px] rounded-2xl border border-brand-line bg-bg p-7 shadow-[0_8px_30px_rgba(76,47,209,0.08)]")],
				[
					logo(h),
					h.h1([h.Class("mt-5 text-[24px] leading-tight font-semibold tracking-tight")], ["The reference agent chat."]),
					h.p([h.Class("mt-2 text-[15px] leading-[1.6] text-dim")], ["basic shows every behavior an agent chat must keep: streaming, tools, subagents, errors, scroll, panels and sign-in. The agent is a scripted state machine. No model runs and nothing costs money."]),
					...(error === null ? [] : [h.p([h.Id("sign-in-error"), h.Role("alert"), h.Class("mt-4 rounded-lg border border-bad/40 bg-bad/5 px-3 py-2 text-[13.5px] text-bad")], [error])]),
					h.div([h.Class("mt-6")], [signInButton(h, returnTo)]),
					h.p([h.Class("mt-4 text-[12.5px] text-faint")], ["The sign-in page is a simulation. basic asks for your email address and one account choice, nothing else."]),
				],
			),
		],
	);

const expired = (h: H): Html =>
	h.main(
		[h.Class("grid min-h-dvh place-items-center px-5")],
		[
			h.div(
				[h.Class("w-full max-w-[420px] rounded-2xl border border-line bg-bg p-7"), h.Role("alertdialog"), h.AriaLabelledBy("expired-title")],
				[
					h.h1([h.Id("expired-title"), h.Class("text-[20px] font-semibold")], ["Your session expired"]),
					h.p([h.Class("mt-2 text-[14.5px] text-dim")], ["Sign in again to continue. You will come back to this page, and your draft is still saved."]),
					h.button([h.Type("button"), h.Id("sign-in-again"), h.Class(`${PRIMARY} mt-5`), h.OnClick(Message.ClickedSignInAgain())], ["Sign in again"]),
				],
			),
		],
	);

const chooseAccount = (h: H, model: Model): Html => {
	const auth = model.auth;
	if (auth._tag !== "ChooseAccount") return h.div([], []);
	return h.main(
		[h.Class("grid min-h-dvh place-items-center px-5")],
		[
			h.form(
				[h.Class("w-full max-w-[440px] rounded-2xl border border-line bg-bg p-7"), h.OnSubmit(Message.ConfirmedAccount())],
				[
					logo(h),
					h.h1([h.Class("mt-5 text-[20px] font-semibold")], ["Which account pays for models?"]),
					h.p([h.Class("mt-1 text-[14px] text-dim")], [`Signed in as ${auth.email}. basic needs this one choice before you can chat. You can change it later.`]),
					h.fieldset(
						[h.Class("mt-4 space-y-2")],
						[
							h.legend([h.Class("sr-only")], ["Account"]),
							...auth.accounts.map((account) =>
								h.label(
									[h.Key(account), h.Class(`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-[14.5px] ${auth.choice === account ? "border-brand bg-brand-soft" : "border-line hover:border-line-strong"}`)],
									[h.input([h.Type("radio"), h.Name("account"), h.Value(account), h.Checked(auth.choice === account), h.OnChange(() => Message.PickedAccount({ account }))]), account],
								),
							),
						],
					),
					h.button([h.Type("submit"), h.Id("continue"), h.Class(`${PRIMARY} mt-5 w-full`)], ["Continue"]),
				],
			),
		],
	);
};

const emptyState = (h: H, model: Model): Html =>
	h.div(
		[h.Id("empty-state"), h.Class("flex flex-col items-center pt-[8vh] text-center"), h.DataAttribute("empty", "")],
		[
			h.h1([h.Class("text-[26px] font-semibold tracking-tight")], ["How can I help you?"]),
			h.p([h.Class("mt-2 max-w-[440px] text-[15px] text-dim")], ["Pick a starter to watch a scripted agent stream, call tools and recover from failure."]),
			...(model.draft.trim() === ""
				? [
						h.ul(
							[h.Id("starters"), h.Class("mt-6 grid w-full max-w-[560px] gap-2 sm:grid-cols-2")],
							model.settings.starters.map((starter) =>
								h.li([h.Key(starter)], [h.button([h.Type("button"), h.Class("w-full rounded-xl border border-line px-4 py-3 text-left text-[14px] hover:border-brand hover:bg-brand-soft"), h.DataAttribute("starter", ""), h.OnClick(Message.ClickedStarter({ text: starter }))], [starter])]),
							),
						),
					]
				: []),
		],
	);

const loadingState = (h: H): Html =>
	h.div([h.Id("loading"), h.Role("status"), h.Class("flex flex-col gap-3 pt-6"), h.DataAttribute("loading", "")], [h.span([h.Class("sr-only")], ["Loading conversation"]), ...[70, 45, 85].map((width) => h.div([h.Key(String(width)), h.Class("h-4 animate-pulse rounded bg-raised"), h.Style({ width: `${width}%` })], []))]);

const jumpButton = (h: H, model: Model): Html | null =>
	model.pinned || currentChat(model) === null || model.loading
		? null
		: h.button(
				[h.Type("button"), h.Id("jump-to-latest"), h.AriaLabel(model.unread > 0 ? `Scroll to latest, ${model.unread} unread` : "Scroll to latest"), h.Class("absolute -top-11 left-1/2 inline-flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border border-line-strong bg-bg px-3 text-[12.5px] font-medium shadow-[0_2px_8px_rgba(24,24,27,0.1)] hover:border-brand"), h.OnClick(Message.ClickedJump())],
				[icon(h, ICONS.down, 14), "Scroll to latest", ...(model.unread > 0 ? [h.span([h.Id("unread-count"), h.Class("rounded-full bg-brand px-1.5 text-[11px] text-white")], [String(model.unread)])] : [])],
			);

const panelHeader = (h: H, title: string, close: Message): Html =>
	h.div([h.Class("flex items-center justify-between px-3 pt-3 pb-2")], [h.h2([h.Class("text-[13px] font-semibold")], [title]), iconButton(h, `Close ${title.toLowerCase()}`, ICONS.close, close, { className: "md:hidden" })]);

const leftPanel = (h: H, model: Model): Html =>
	h.div(
		[h.Class("flex h-full min-h-0 flex-col")],
		[
			h.div([h.Class("flex items-center justify-between px-3 pt-3 pb-2")], [logo(h), h.div([h.Class("flex items-center")], [iconButton(h, "New chat", ICONS.plus, Message.ClickedNewChat(), { id: "new-chat" }), iconButton(h, "Close conversations", ICONS.close, Message.ClosedMobilePanel(), { className: "md:hidden" })])]),
			chatList(h, model),
			identity(h, model),
		],
	);

const rightPanel = (h: H, model: Model): Html => h.div([h.Class("flex h-full min-h-0 flex-col")], [panelHeader(h, "Inspector", Message.ClosedMobilePanel()), inspector(h, model)]);

const dragEdge = (h: H, model: Model, side: "left" | "right"): Html =>
	h.div(
		[
			h.Role("separator"),
			h.AriaOrientation("vertical"),
			h.AriaLabel(side === "left" ? "Resize conversations panel" : "Resize inspector panel"),
			h.AriaValuenow(side === "left" ? model.panels.leftWidth : model.panels.rightWidth),
			h.Tabindex(0),
			h.Id(`drag-${side}`),
			h.DataAttribute("drag-edge", side),
			h.Class("group/edge relative z-10 w-1.5 shrink-0 cursor-col-resize touch-none"),
			h.OnPointerDown((_type, button, _sx, _sy, _t, clientX) => (button === 0 ? Option.some(Message.StartedDrag({ side, x: clientX })) : Option.none())),
			h.OnDoubleClick(Message.ResetPanel({ side })),
			h.OnKeyDown((key) => (key === "ArrowLeft" || key === "ArrowRight" ? Message.StartedDrag({ side, x: 0 }) : Message.CompletedEffect())),
		],
		[h.span([h.Class(`absolute inset-y-0 left-1/2 w-px -translate-x-1/2 transition-colors ${model.drag?.side === side ? "bg-brand" : "bg-line group-hover/edge:bg-brand"}`)], []), ...(model.drag?.side === side ? [h.span([h.OnMount(DragEdge()), h.Class("hidden")], [])] : [])],
	);

const header = (h: H, model: Model): Html => {
	const chat = currentChat(model);
	const phone = model.viewport < PHONE_WIDTH;
	return h.header(
		[h.Class("flex h-12 shrink-0 items-center gap-1 border-b border-line px-2 @container")],
		[
			iconButton(h, phone ? "Open conversations" : model.panels.leftOpen ? "Hide conversations" : "Show conversations", ICONS.left, phone ? Message.OpenedMobilePanel({ side: "left" }) : Message.ToggledPanel({ side: "left" }), { id: "toggle-left", pressed: phone ? model.mobilePanel === "left" : model.panels.leftOpen, shortcut: "Meta+B" }),
			h.p([h.Class("min-w-0 flex-1 truncate px-1 text-[14px] font-medium")], [chat?.title ?? "New chat"]),
			h.div(
				[h.Class("flex items-center gap-1")],
				[
					h.span([h.Id("notifications"), h.Tabindex(-1), h.Role("region"), h.AriaLabel("Notifications (Alt+T)"), h.AriaKeyshortcuts("Alt+T"), h.Class("hidden sm:inline")], [model.toast === null ? "" : h.span([h.Class("text-[12.5px] text-dim")], [model.toast])]),
					iconButton(h, phone ? "Open inspector" : model.panels.rightOpen ? "Hide inspector" : "Show inspector", ICONS.right, phone ? Message.OpenedMobilePanel({ side: "right" }) : Message.ToggledPanel({ side: "right" }), { id: "toggle-right", pressed: phone ? model.mobilePanel === "right" : model.panels.rightOpen, shortcut: "Meta+J" }),
				],
			),
		],
	);
};

const settingsDialog = (h: H, model: Model): Html | null =>
	model.settingsOpen
		? h.div(
				[h.Class("fixed inset-0 z-40 grid place-items-center bg-ink/30 p-4")],
				[
					h.form(
						[h.Role("dialog"), h.AriaModal(true), h.AriaLabelledBy("settings-title"), h.Id("settings"), h.Class("w-full max-w-[480px] rounded-2xl border border-line bg-bg p-6 shadow-xl"), h.OnSubmit(Message.SavedSettings())],
						[
							h.div([h.Class("flex items-center justify-between")], [h.h2([h.Id("settings-title"), h.Class("text-[18px] font-semibold")], ["Settings"]), iconButton(h, "Close settings", ICONS.close, Message.ClosedSettings())]),
							h.label([h.For("starters-input"), h.Class("mt-4 block text-[13px] font-medium")], ["Starter prompts, one per line (3 to 5)"]),
							h.textarea([h.Id("starters-input"), h.Rows(5), h.Value(model.settingsDraft), h.Class("mt-1 w-full rounded-lg border border-line bg-bg px-3 py-2 text-[14px] outline-none focus:border-brand"), h.OnInput((value) => Message.EditedStarters({ value }))]),
							h.fieldset(
								[h.Class("mt-4")],
								[
									h.legend([h.Class("text-[13px] font-medium")], ["Theme"]),
									h.div(
										[h.Class("mt-1 flex gap-2")],
										(["system", "light", "dark"] as const).map((theme) =>
											h.label([h.Key(theme), h.Class(`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] capitalize ${model.settings.theme === theme ? "border-brand bg-brand-soft" : "border-line"}`)], [h.input([h.Type("radio"), h.Name("theme"), h.Checked(model.settings.theme === theme), h.OnChange(() => Message.PickedTheme({ theme }))]), theme]),
										),
									),
								],
							),
							h.p([h.Class("mt-4 text-[12.5px] text-faint")], ["Shortcuts: Enter sends, Shift + Enter adds a line, Esc stops the agent, Cmd/Ctrl + B toggles conversations, Cmd/Ctrl + J toggles the inspector, Alt + T jumps to notifications."]),
							h.div([h.Class("mt-5 flex justify-end gap-2")], [h.button([h.Type("button"), h.Class(SECONDARY), h.OnClick(Message.ClosedSettings())], ["Cancel"]), h.button([h.Type("submit"), h.Id("save-settings"), h.Class(PRIMARY)], ["Save"])]),
						],
					),
				],
			)
		: null;

const deleteDialog = (h: H, model: Model): Html | null => {
	const chat = model.chats.find((each) => each.id === model.confirmDelete);
	return chat === undefined
		? null
		: h.div(
				[h.Class("fixed inset-0 z-40 grid place-items-center bg-ink/30 p-4")],
				[
					h.div(
						[h.Role("alertdialog"), h.AriaModal(true), h.AriaLabelledBy("delete-title"), h.Id("confirm-delete"), h.Class("w-full max-w-[420px] rounded-2xl border border-line bg-bg p-6 shadow-xl")],
						[
							h.h2([h.Id("delete-title"), h.Class("text-[17px] font-semibold")], [`Delete “${chat.title}”?`]),
							h.p([h.Class("mt-2 text-[14px] text-dim")], ["This removes the conversation from this device. It cannot be undone."]),
							h.div([h.Class("mt-5 flex justify-end gap-2")], [h.button([h.Type("button"), h.Class(SECONDARY), h.Autofocus(true), h.OnClick(Message.CancelledDelete())], ["Cancel"]), h.button([h.Type("button"), h.Id("confirm-delete-button"), h.Class(DANGER), h.OnClick(Message.ConfirmedDelete())], ["Delete"])]),
						],
					),
				],
			);
};

const app = (h: H, model: Model): Html => {
	const chat = currentChat(model);
	const phone = model.viewport < PHONE_WIDTH;
	const leftOpen = !phone && model.panels.leftOpen;
	const rightOpen = !phone && model.panels.rightOpen;
	const jump = jumpButton(h, model);
	const settings = settingsDialog(h, model);
	const remove = deleteDialog(h, model);
	const body = model.loading ? loadingState(h) : chat === null ? emptyState(h, model) : entries(h, model, chat);
	return h.div(
		[h.Class(`flex h-dvh overflow-hidden bg-bg text-ink ${model.drag === null ? "" : "cursor-col-resize select-none"}`), h.DataAttribute("theme", model.settings.theme), h.DataAttribute("connection", model.connection)],
		[
			...(leftOpen
				? [h.aside([h.Id("left-panel"), h.AriaLabel("Conversations"), h.DataAttribute("panel", "left"), h.Class("@container h-full shrink-0 overflow-hidden border-r border-line bg-panel"), h.Style({ width: `${model.panels.leftWidth}px` })], [leftPanel(h, model)]), dragEdge(h, model, "left")]
				: []),
			h.main(
				[h.Id("conversation"), h.Class("@container flex h-full min-w-0 flex-1 flex-col")],
				[header(h, model), transcript(h, model, chat, body), h.div([h.Class("relative shrink-0")], [...(jump === null ? [] : [jump]), activity(h, model), composer(h, model)])],
			),
			...(rightOpen
				? [dragEdge(h, model, "right"), h.aside([h.Id("right-panel"), h.AriaLabel("Inspector"), h.DataAttribute("panel", "right"), h.Class("@container h-full shrink-0 overflow-hidden border-l border-line bg-panel"), h.Style({ width: `${model.panels.rightWidth}px` })], [rightPanel(h, model)])]
				: []),
			...(phone && model.mobilePanel !== "none"
				? [
						h.div([h.Class("fixed inset-0 z-30 bg-ink/30"), h.OnClick(Message.ClosedMobilePanel()), h.AriaHidden(true)], []),
						h.aside(
							[h.Id(`${model.mobilePanel}-panel`), h.AriaLabel(model.mobilePanel === "left" ? "Conversations" : "Inspector"), h.AriaModal(true), h.Role("dialog"), h.DataAttribute("panel", model.mobilePanel), h.DataAttribute("overlay", ""), h.Class(`fixed inset-y-0 z-40 w-[86vw] max-w-[360px] overflow-hidden bg-panel shadow-xl ${model.mobilePanel === "left" ? "left-0 border-r" : "right-0 border-l"} border-line`)],
							[model.mobilePanel === "left" ? leftPanel(h, model) : rightPanel(h, model)],
						),
					]
				: []),
			...(settings === null ? [] : [settings]),
			...(remove === null ? [] : [remove]),
		],
	);
};

const working = (model: Model) => model.chats.some((chat) => chatRunning(chat, model));

export const view = (model: Model, h: H): Document => {
	const chat = currentChat(model);
	const title = `${working(model) ? "● Working · " : ""}${chat?.title ?? "basic"} · basic`;
	switch (model.auth._tag) {
		case "Checking":
			return { title: "basic", body: h.div([h.Class("grid min-h-dvh place-items-center text-[13px] text-faint"), h.Role("status")], ["Loading…"]) };
		case "SignedOut":
			return { title: "Sign in · basic", body: signedOut(h, model.auth.error, model.auth.returnTo) };
		case "Expired":
			return { title: "Session expired · basic", body: expired(h) };
		case "ChooseAccount":
			return { title: "Choose an account · basic", body: chooseAccount(h, model) };
		case "SignedIn":
			return { title, body: app(h, model) };
	}
};
