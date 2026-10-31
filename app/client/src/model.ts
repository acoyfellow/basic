import { Schema } from "effect";
import { Script } from "../../shared/script.ts";

export const Attachment = Schema.Struct({ id: Schema.String, name: Schema.String, kind: Schema.String, size: Schema.Number, preview: Schema.String });

export type Attachment = typeof Attachment.Type;

export const UserMessage = Schema.TaggedStruct("User", { id: Schema.String, text: Schema.String, attachments: Schema.Array(Attachment), at: Schema.Number });

export const AgentTurn = Schema.TaggedStruct("Agent", {
	id: Schema.String,
	prompt: Schema.String,
	sentAt: Schema.NullOr(Schema.Number),
	receivedAt: Schema.NullOr(Schema.Number),
	script: Script,
	stoppedAt: Schema.NullOr(Schema.Number),
});

export const Notice = Schema.TaggedStruct("Notice", {
	id: Schema.String,
	tone: Schema.Literals(["info", "warn", "bad"]),
	summary: Schema.String,
	detail: Schema.String,
	transient: Schema.Boolean,
	at: Schema.Number,
});

export const Entry = Schema.Union([UserMessage, AgentTurn, Notice]);

export type Entry = typeof Entry.Type;
export type AgentTurn = typeof AgentTurn.Type;
export type UserMessage = typeof UserMessage.Type;
export type Notice = typeof Notice.Type;

export const Chat = Schema.Struct({
	id: Schema.String,
	title: Schema.String,
	createdAt: Schema.Number,
	updatedAt: Schema.Number,
	pinned: Schema.Boolean,
	archived: Schema.Boolean,
	entries: Schema.Array(Entry),
});

export type Chat = typeof Chat.Type;

export const Connection = Schema.Literals(["connecting", "online", "reconnecting", "offline"]);

export type Connection = typeof Connection.Type;

export const Auth = Schema.Union([
	Schema.TaggedStruct("Checking", {}),
	Schema.TaggedStruct("SignedOut", { error: Schema.NullOr(Schema.String), returnTo: Schema.String }),
	Schema.TaggedStruct("ChooseAccount", { email: Schema.String, accounts: Schema.Array(Schema.String), choice: Schema.String }),
	Schema.TaggedStruct("SignedIn", { email: Schema.String, account: Schema.String }),
	Schema.TaggedStruct("Expired", { returnTo: Schema.String }),
]);

export type Auth = typeof Auth.Type;

export const Detail = Schema.Union([Schema.TaggedStruct("Trace", { turnId: Schema.String }), Schema.TaggedStruct("Lab", {})]);

export type Detail = typeof Detail.Type;

export const Panels = Schema.Struct({ leftOpen: Schema.Boolean, rightOpen: Schema.Boolean, leftWidth: Schema.Number, rightWidth: Schema.Number, detail: Schema.NullOr(Detail) });

export type Panels = typeof Panels.Type;

export const Drag = Schema.NullOr(Schema.Struct({ side: Schema.Literals(["left", "right"]), startX: Schema.Number, startWidth: Schema.Number }));

export const Settings = Schema.Struct({ starters: Schema.Array(Schema.String), speed: Schema.Number, thinkingDelay: Schema.Number, theme: Schema.Literals(["system", "light", "dark"]) });

export type Settings = typeof Settings.Type;

export const Model = Schema.Struct({
	auth: Auth,
	connection: Connection,
	reconnectAttempt: Schema.Number,
	socketEpoch: Schema.Number,
	now: Schema.Number,
	chats: Schema.Array(Chat),
	currentChat: Schema.NullOr(Schema.String),
	loading: Schema.Boolean,
	draft: Schema.String,
	attachments: Schema.Array(Attachment),
	search: Schema.String,
	renaming: Schema.NullOr(Schema.Struct({ id: Schema.String, value: Schema.String })),
	confirmDelete: Schema.NullOr(Schema.String),
	pinned: Schema.Boolean,
	unread: Schema.Number,
	openRows: Schema.Array(Schema.String),
	copied: Schema.NullOr(Schema.String),
	panels: Panels,
	drag: Drag,
	viewport: Schema.Number,
	mobilePanel: Schema.Literals(["none", "left", "right"]),
	settingsOpen: Schema.Boolean,
	settingsDraft: Schema.String,
	settings: Settings,
	toast: Schema.NullOr(Schema.String),
	hidden: Schema.Boolean,
	touch: Schema.Boolean,
	historyPages: Schema.Number,
	loadingOlder: Schema.Boolean,
	highlighter: Schema.Boolean,
	highlighterRequested: Schema.Boolean,
	announced: Schema.Array(Schema.String),
	seq: Schema.Number,
	pinRequest: Schema.Number,
});

export type Model = typeof Model.Type;

export const DEFAULT_PANELS: Panels = { leftOpen: true, rightOpen: false, leftWidth: 272, rightWidth: 320, detail: null };

export const PANEL_LIMITS = { min: 200, max: 480, conversationMin: 420 } as const;

export const PHONE_WIDTH = 760;
