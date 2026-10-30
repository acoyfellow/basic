import { Schema } from "effect";
import { Script } from "./script.ts";

export const ClientFrame = Schema.Union([Schema.TaggedStruct("Turn", { turnId: Schema.String, prompt: Schema.String }), Schema.TaggedStruct("Ping", {})]);

export type ClientFrame = typeof ClientFrame.Type;

export const ServerFrame = Schema.Union([
	Schema.TaggedStruct("Hello", { email: Schema.String }),
	Schema.TaggedStruct("Scripted", { turnId: Schema.String, script: Script }),
	Schema.TaggedStruct("Expired", {}),
	Schema.TaggedStruct("Pong", {}),
]);

export type ServerFrame = typeof ServerFrame.Type;

export const Me = Schema.Struct({ email: Schema.String, account: Schema.NullOr(Schema.String), accounts: Schema.Array(Schema.String) });

export type Me = typeof Me.Type;

export const ACCOUNTS: ReadonlyArray<string> = ["Personal account", "Acme Inc (team account)"];

export const SESSION_COOKIE = "basic_session";
