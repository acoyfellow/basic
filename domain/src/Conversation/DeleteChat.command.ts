import * as Domain from "@alchemy.run/domain";
import { ConversationId, OwnerEmail } from "../ids.ts";
import { NotOwner } from "../NotOwner.rejection.ts";
import { Session } from "../Session.middleware.ts";
import { ChatNotFound } from "./rejections.ts";

export class ChatDeleted extends Domain.Event("ChatDeleted", {
  owner: OwnerEmail,
}) {}

export class DeleteChat extends Domain.Command("DeleteChat", {
  target: ConversationId,
  middleware: [Session],
  events: [ChatDeleted],
  rejects: [ChatNotFound, NotOwner],
}) {}
