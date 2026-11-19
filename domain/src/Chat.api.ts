import * as Domain from "@alchemy.run/domain";
import { Chat } from "./Chat.model.ts";

export class ChatApi extends Domain.Api(
  "ChatApi",
  {
    model: Chat,
    commands: ["StartConversation", "SendMessage", "StopTurn", "RenameChat", "DeleteChat"],
    views: ["ChatList"],
  },
  { description: "What a signed-in chat client can do and see." },
) {}
