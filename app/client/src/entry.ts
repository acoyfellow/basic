import { Runtime } from "foldkit";
import { DEFAULT_STARTERS } from "../../shared/script.ts";
import { LoadState } from "./command.ts";
import { Message } from "./message.ts";
import { DEFAULT_PANELS, Model } from "./model.ts";
import { subscriptions } from "./subscriptions.ts";
import { update } from "./update.ts";
import { view } from "./view/index.ts";

const initialModel: Model = {
	auth: { _tag: "Checking" },
	connection: "offline",
	reconnectAttempt: 0,
	socketEpoch: 0,
	now: Date.now(),
	chats: [],
	currentChat: null,
	loading: false,
	draft: "",
	attachments: [],
	search: "",
	renaming: null,
	confirmDelete: null,
	pinned: true,
	unread: 0,
	openRows: [],
	copied: null,
	panels: DEFAULT_PANELS,
	drag: null,
	viewport: globalThis.innerWidth,
	mobilePanel: "none",
	settingsOpen: false,
	settingsDraft: DEFAULT_STARTERS.join("\n"),
	settings: { starters: [...DEFAULT_STARTERS], speed: 1, thinkingDelay: 600, theme: "system" },
	toast: null,
	hidden: false,
	touch: globalThis.matchMedia("(pointer: coarse)").matches && globalThis.innerWidth < 760,
	historyPages: 0,
	loadingOlder: false,
	highlighter: false,
	highlighterRequested: false,
	announced: [],
	seq: 0,
	pinRequest: 0,
};

const application = Runtime.makeApplication({
	Model,
	init: () => ({ model: initialModel, commands: [LoadState()] }),
	update,
	view,
	subscriptions,
	container: document.getElementById("root"),
	routing: {
		onUrlRequest: (request) =>
			request._tag === "External"
				? Message.ClickedLink({ href: request.href })
				: request.url.pathname === "/" || request.url.pathname.startsWith("/c/")
					? Message.RequestedUrl({ url: request.url })
					: Message.ClickedLink({ href: `${request.url.pathname}${request.url.search._tag === "Some" ? `?${request.url.search.value.replace(/^\?/, "")}` : ""}` }),
		onUrlChange: (url) => Message.ChangedUrl({ url }),
	},
});

globalThis.addEventListener("pageshow", (event) => {
	if (event.persisted) location.reload();
});

Runtime.run(application);
