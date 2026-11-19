import { it } from "@effect/vitest";
import { Story } from "@alchemy.run/domain/Story";
import { DeleteChat } from "../src/Conversation/DeleteChat.command.ts";
import { RenameChat } from "../src/Conversation/RenameChat.command.ts";
import { SendMessage } from "../src/Conversation/SendMessage.command.ts";
import { StopTurn, TurnStopRequested } from "../src/Conversation/StopTurn.command.ts";
import { MessageSent } from "../src/Conversation/StartConversation.command.ts";
import { ConversationId } from "../src/ids.ts";
import { ModelProvider } from "../src/Turn/ModelProvider.external.ts";
import { NotOwner } from "../src/NotOwner.rejection.ts";
import { ChatList } from "../src/ChatList.view.ts";
import { AskForInput, TurnNeedsInput, TurnStarted } from "../src/Turn/turnCommands.ts";
import { ChatDeleted } from "../src/Conversation/DeleteChat.command.ts";
import { ChatRenamed } from "../src/Conversation/RenameChat.command.ts";
import { ada, asOwner, bob, chat, story, turn, turnId } from "./support.ts";
import { failed, finished, iso, modelFails, modelReplies, settled, startChat, stopped } from "./scenes.ts";

const stopRequested = (turnName: string) => [new TurnStopRequested({ owner: ada, turnId: turnId(turnName) })];

const retryStarted = (chatId: string, turnName: string, text: string, at: string) => [
  Story.then(chat(chatId), new MessageSent({ owner: ada, turnId: turnId(turnName), text })),
  Story.then(
    turn(turnName),
    new TurnStarted({ conversationId: ConversationId.make(chatId), owner: ada, text, at: iso(at) }),
  ),
  Story.call(`${chatId}/${turnName}`, ModelProvider.respond, { text }),
];

const nine = "2026-01-01T09:00:00Z";
const nineOne = "2026-01-01T09:01:00Z";

it.effect("Rule 4 / A new chat appears in the list at once: listed as working before the reply arrives", () =>
  story(
    asOwner(ada),
    ...startChat(ada, "c1", "t1", "hi", nine),
    Story.view(ChatList, ada, { chats: { c1: { title: "Chat c1", status: "working", updatedAt: iso(nine) } } }),
    modelReplies("c1/t1", "hello"),
    Story.then(turn("t1"), finished("c1", "hello", nine)),
    settled(ada, "c1", "t1", "finished"),
  ),
);

it.effect("Rule 4 / Each chat shows working, idle, or failed at a glance", () =>
  story(
    asOwner(ada),
    ...startChat(ada, "working", "tw", "a", nine),
    ...startChat(ada, "idle", "ti", "b", nine),
    ...startChat(ada, "failed", "tf", "c", nine),
    ...startChat(ada, "needs", "tn", "d", nine),
    modelReplies("idle/ti", "fine"),
    Story.then(turn("ti"), finished("idle", "fine", nine)),
    settled(ada, "idle", "ti", "finished"),
    modelFails("failed/tf", "provider down"),
    Story.then(turn("tf"), failed("failed", "provider down", nine)),
    settled(ada, "failed", "tf", "failed"),
    Story.when(turn("tn"), new AskForInput({ question: "which file?" })),
    Story.then(turn("tn"), new TurnNeedsInput({ conversationId: "needs" as never, question: "which file?", at: iso(nine) })),
    settled(ada, "needs", "tn", "needs-you"),
    Story.view(ChatList, ada, (state) => {
      const statuses = Object.fromEntries(Object.entries(state.chats).map(([id, row]) => [id, row.status]));
      if (JSON.stringify(statuses) !== JSON.stringify({ working: "working", idle: "idle", failed: "failed", needs: "needs-you" }))
        throw new Error(`unexpected statuses ${JSON.stringify(statuses)}`);
    }),
    modelReplies("needs/tn", "ignored"),
    Story.then(turn("tn")),
    modelReplies("working/tw", "late"),
    Story.then(turn("tw"), finished("working", "late", nine)),
    settled(ada, "working", "tw", "finished"),
  ),
);

it.effect("Rule 4 / A stopped or failed turn shows correctly: stopped is idle, failed is red, and the next send recovers", () =>
  story(
    asOwner(ada),
    ...startChat(ada, "c1", "t1", "hi", nine),
    ...startChat(ada, "c2", "t2", "yo", nine),
    Story.when(chat("c1"), new StopTurn()),
    Story.then(chat("c1"), ...stopRequested("t1")),
    Story.then(turn("t1"), stopped("c1", nine)),
    settled(ada, "c1", "t1", "stopped"),
    modelReplies("c1/t1", "too late"),
    Story.then(turn("t1")),
    modelFails("c2/t2", "timeout"),
    Story.then(turn("t2"), failed("c2", "timeout", nine)),
    settled(ada, "c2", "t2", "failed"),
    Story.view(ChatList, ada, {
      chats: {
        c1: { title: "Chat c1", status: "idle", updatedAt: iso(nine) },
        c2: { title: "Chat c2", status: "failed", updatedAt: iso(nine) },
      },
    }),
    Story.clock(nineOne),
    Story.when(chat("c2"), new SendMessage({ turnId: turnId("t3"), text: "retry" })),
    ...retryStarted("c2", "t3", "retry", nineOne),
    Story.view(ChatList, ada, (state) => {
      if (state.chats.c2?.status !== "working") throw new Error("retry should show working");
    }),
    modelReplies("c2/t3", "ok"),
    Story.then(turn("t3"), finished("c2", "ok", nineOne)),
    settled(ada, "c2", "t3", "finished"),
  ),
);

it.effect("Rule 4 / Other owners' chats are not visible: each owner's list holds only their own", () =>
  story(
    asOwner(ada),
    ...startChat(ada, "a1", "ta", "mine", nine),
    asOwner(bob),
    ...startChat(bob, "b1", "tb", "his", nine),
    Story.view(ChatList, ada, (state) => {
      if (Object.keys(state.chats).join() !== "a1") throw new Error("ada sees a foreign chat");
    }),
    Story.view(ChatList, bob, (state) => {
      if (Object.keys(state.chats).join() !== "b1") throw new Error("bob sees a foreign chat");
    }),
    modelReplies("a1/ta", "x"),
    Story.then(turn("ta"), finished("a1", "x", nine)),
    settled(ada, "a1", "ta", "finished"),
    modelReplies("b1/tb", "y"),
    Story.then(turn("tb"), finished("b1", "y", nine)),
    settled(bob, "b1", "tb", "finished"),
  ),
);

it.effect("Rule 4 / Other owners' chats are not changeable: send, stop, rename and delete are refused and leave the list alone", () =>
  story(
    asOwner(ada),
    ...startChat(ada, "a1", "ta", "mine", nine),
    modelReplies("a1/ta", "x"),
    Story.then(turn("ta"), finished("a1", "x", nine)),
    settled(ada, "a1", "ta", "finished"),
    asOwner(bob),
    Story.when(chat("a1"), new SendMessage({ turnId: turnId("tx"), text: "hijack" })),
    Story.rejected(new NotOwner()),
    Story.when(chat("a1"), new StopTurn()),
    Story.rejected(new NotOwner()),
    Story.when(chat("a1"), new RenameChat({ title: "pwned" })),
    Story.rejected(new NotOwner()),
    Story.when(chat("a1"), new DeleteChat()),
    Story.rejected(new NotOwner()),
    Story.view(ChatList, ada, { chats: { a1: { title: "Chat a1", status: "idle", updatedAt: iso(nine) } } }),
    Story.view(ChatList, bob, Story.none),
  ),
);

it.effect("Rule 4 / Every chat can be renamed and deleted by its owner, and the list follows", () =>
  story(
    asOwner(ada),
    ...startChat(ada, "c1", "t1", "hi", nine),
    modelReplies("c1/t1", "hello"),
    Story.then(turn("t1"), finished("c1", "hello", nine)),
    settled(ada, "c1", "t1", "finished"),
    Story.clock(nineOne),
    Story.when(chat("c1"), new RenameChat({ title: "Plans" })),
    Story.then(chat("c1"), new ChatRenamed({ owner: ada, title: "Plans" })),
    Story.view(ChatList, ada, { chats: { c1: { title: "Plans", status: "idle", updatedAt: iso(nineOne) } } }),
    Story.when(chat("c1"), new DeleteChat()),
    Story.then(chat("c1"), new ChatDeleted({ owner: ada })),
    Story.view(ChatList, ada, (state) => {
      if (Object.keys(state.chats).length !== 0) throw new Error("a deleted chat is still listed");
    }),
  ),
);
