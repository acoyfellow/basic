import * as Domain from "@alchemy.run/domain";
import * as Schema from "effect/Schema";
import { ConversationId, TurnId } from "../ids.ts";
import { NotOwner } from "../NotOwner.rejection.ts";
import { Session } from "../Session.middleware.ts";
import { ChatNotFound, TurnInProgress } from "./rejections.ts";
import { MessageSent } from "./StartConversation.command.ts";

export class SendMessage extends Domain.Command("SendMessage", {
  target: ConversationId,
  middleware: [Session],
  input: { turnId: TurnId, text: Schema.String },
  events: [MessageSent],
  rejects: [ChatNotFound, NotOwner, TurnInProgress],
}) {}
