import * as Domain from "@alchemy.run/domain";
import * as Schema from "effect/Schema";
import { ConversationId, OwnerEmail, TurnId } from "../ids.ts";
import { Session } from "../Session.middleware.ts";
import { ChatAlreadyExists } from "./rejections.ts";

export class ChatStarted extends Domain.Event("ChatStarted", {
  owner: OwnerEmail,
  title: Schema.String,
}) {}

export class MessageSent extends Domain.Event("MessageSent", {
  owner: OwnerEmail,
  turnId: TurnId,
  text: Schema.String,
}) {}

export class StartConversation extends Domain.Command("StartConversation", {
  target: ConversationId,
  middleware: [Session],
  input: { title: Schema.String, turnId: TurnId, text: Schema.String },
  events: [ChatStarted, MessageSent],
  rejects: [ChatAlreadyExists],
}) {}
