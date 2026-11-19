import { Story } from "@alchemy.run/domain/Story";
import { ChatStarted, MessageSent, StartConversation } from "../src/Conversation/StartConversation.command.ts";
import { TurnSettled, type TurnOutcome } from "../src/Conversation/SettleTurn.command.ts";
import { ConversationId, OwnerEmail } from "../src/ids.ts";
import { ModelProvider, ModelUnavailable } from "../src/Turn/ModelProvider.external.ts";
import { TurnFailed, TurnFinished, TurnStarted, TurnStopped } from "../src/Turn/turnCommands.ts";
import { chat, turn, turnId } from "./support.ts";

export const iso = (at: string) => new Date(at).toISOString();

export const startChat = (owner: OwnerEmail, chatId: string, turnName: string, text: string, at: string) => [
  Story.clock(at),
  Story.when(chat(chatId), new StartConversation({ title: `Chat ${chatId}`, turnId: turnId(turnName), text })),
  Story.then(
    chat(chatId),
    new ChatStarted({ owner, title: `Chat ${chatId}` }),
    new MessageSent({ owner, turnId: turnId(turnName), text }),
  ),
  Story.then(
    turn(turnName),
    new TurnStarted({ conversationId: ConversationId.make(chatId), owner, text, at: iso(at) }),
  ),
  Story.call(`${chatId}/${turnName}`, ModelProvider.respond, { text }),
];

export const settled = (owner: OwnerEmail, chatId: string, turnName: string, outcome: TurnOutcome) =>
  Story.then(chat(chatId), new TurnSettled({ owner, turnId: turnId(turnName), outcome }));

export const modelReplies = (tag: string, reply: string) =>
  Story.succeed(tag, ModelProvider.respond, { reply });

export const modelFails = (tag: string, reason: string) =>
  Story.fail(tag, ModelProvider.respond, new ModelUnavailable({ reason }));

export const finished = (chatId: string, reply: string, at: string) =>
  new TurnFinished({ conversationId: ConversationId.make(chatId), reply, at: iso(at) });

export const failed = (chatId: string, reason: string, at: string) =>
  new TurnFailed({ conversationId: ConversationId.make(chatId), reason, at: iso(at) });

export const stopped = (chatId: string, at: string) =>
  new TurnStopped({ conversationId: ConversationId.make(chatId), at: iso(at) });
