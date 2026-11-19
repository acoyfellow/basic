import * as Domain from "@alchemy.run/domain";
import * as Schema from "effect/Schema";
import { ConversationId, OwnerEmail } from "../ids.ts";
import { NotOwner } from "../NotOwner.rejection.ts";
import { Session } from "../Session.middleware.ts";
import { ChatNotFound } from "./rejections.ts";

export class ChatRenamed extends Domain.Event("ChatRenamed", {
  owner: OwnerEmail,
  title: Schema.String,
}) {}

export class RenameChat extends Domain.Command("RenameChat", {
  target: ConversationId,
  middleware: [Session],
  input: { title: Schema.String },
  events: [ChatRenamed],
  rejects: [ChatNotFound, NotOwner],
}) {}
