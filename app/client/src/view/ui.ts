import type { Html, HtmlBuilder } from "foldkit/html";
import type { Message } from "../message.ts";

export type H = HtmlBuilder<Message>;

export const ICONS = {
	left: "M3 4h18v16H3zM9 4v16",
	right: "M3 4h18v16H3zM15 4v16",
	plus: "M12 5v14M5 12h14",
	send: "M5 12h14M13 6l6 6-6 6",
	stop: "M7 7h10v10H7z",
	copy: "M8 8h11v11H8zM5 16V5h11",
	retry: "M4 4v6h6M20 20v-6h-6M5 13a7 7 0 0 0 12 4M19 11A7 7 0 0 0 7 7",
	edit: "M4 20h4L19 9l-4-4L4 16zM14 6l4 4",
	branch: "M6 3v12M18 9a3 3 0 1 0 0-.01M6 21a3 3 0 1 0 0-.01M18 12c0 4-6 3-12 6",
	pin: "M9 4h6l-1 6 4 4H6l4-4zM12 14v6",
	archive: "M3 5h18v4H3zM5 9v10h14V9M10 13h4",
	trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13",
	settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12l2-1-1-3-2 .5-1.5-1.5.5-2-3-1-1 2h-2L9 4 6 5l.5 2L5 8.5 3 8l-1 3 2 1v0l-2 1 1 3 2-.5L6.5 17 6 19l3 1 1-2h2l1 2 3-1-.5-2 1.5-1.5 2 .5 1-3z",
	close: "M6 6l12 12M18 6L6 18",
	down: "M12 5v14M6 13l6 6 6-6",
	menu: "M4 7h16M4 12h16M4 17h16",
	paperclip: "M20 11l-8 8a5 5 0 0 1-7-7l9-9a3 3 0 0 1 5 5l-9 9a1 1 0 0 1-2-2l8-8",
	user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c1-4 4-6 8-6s7 2 8 6",
	signout: "M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10",
	bolt: "M13 3L5 14h6l-1 7 8-11h-6z",
} as const;

export const icon = (h: H, path: string, size = 16): Html =>
	h.svg(
		[h.Attribute("viewBox", "0 0 24 24"), h.Attribute("width", String(size)), h.Attribute("height", String(size)), h.Attribute("fill", "none"), h.Attribute("stroke", "currentColor"), h.Attribute("stroke-width", "1.8"), h.Attribute("stroke-linecap", "round"), h.Attribute("stroke-linejoin", "round"), h.AriaHidden(true)],
		[h.path([h.Attribute("d", path)], [])],
	);

export const iconButton = (h: H, label: string, path: string, message: Message, extra: { readonly id?: string; readonly className?: string; readonly disabled?: boolean; readonly pressed?: boolean; readonly shortcut?: string } = {}): Html =>
	h.button(
		[
			h.Type("button"),
			h.AriaLabel(label),
			h.Title(extra.shortcut === undefined ? label : `${label} (${extra.shortcut})`),
			...(extra.id === undefined ? [] : [h.Id(extra.id)]),
			...(extra.pressed === undefined ? [] : [h.AriaPressed(extra.pressed ? "true" : "false")]),
			...(extra.shortcut === undefined ? [] : [h.AriaKeyshortcuts(extra.shortcut)]),
			h.Disabled(extra.disabled ?? false),
			h.Class(`inline-grid size-8 shrink-0 place-items-center rounded-lg text-dim transition-colors hover:bg-raised hover:text-ink disabled:cursor-not-allowed disabled:opacity-40 ${extra.className ?? ""}`),
			h.OnClick(message),
		],
		[icon(h, path)],
	);

export const BUTTON = "inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-[14px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40";
export const PRIMARY = `${BUTTON} bg-brand text-white hover:bg-brand-strong`;
export const SECONDARY = `${BUTTON} border border-line-strong bg-bg text-ink hover:bg-raised`;
export const DANGER = `${BUTTON} border border-bad/40 bg-bg text-bad hover:bg-bad/10`;

export const cloudflareMark = (h: H): Html => h.img([h.Src("/brand/cloudflare-cloud.svg"), h.Alt(""), h.Width("33"), h.Height("15"), h.Class("block h-[15px] w-[33px]")]);

export const relativeGroup = (at: number, now: number): "Pinned" | "Today" | "Yesterday" | "Last 7 days" | "Older" => {
	const day = 24 * 60 * 60 * 1000;
	const startOfToday = new Date(now).setHours(0, 0, 0, 0);
	if (at >= startOfToday) return "Today";
	if (at >= startOfToday - day) return "Yesterday";
	if (at >= startOfToday - 6 * day) return "Last 7 days";
	return "Older";
};
