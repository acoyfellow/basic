import { it } from "@effect/vitest";
import { Story } from "@alchemy.run/domain/Story";
import { SendMessage } from "../src/Conversation/SendMessage.command.ts";
import { MessageSent } from "../src/Conversation/StartConversation.command.ts";
import { StopTurn, TurnStopRequested } from "../src/Conversation/StopTurn.command.ts";
import { NoTurnRunning, TurnInProgress } from "../src/Conversation/rejections.ts";
import { ModelProvider } from "../src/Turn/ModelProvider.external.ts";
import {
  FinishToolCall,
  StartToolCall,
  ToolCallFinished,
  ToolCallStarted,
  TurnStarted,
} from "../src/Turn/turnCommands.ts";
import { TurnNotRunning } from "../src/Turn/TurnNotRunning.rejection.ts";
import { ConversationId } from "../src/ids.ts";
import { ada, asOwner, chat, story, turn, turnId } from "./support.ts";
import { finished, iso, modelReplies, settled, startChat, stopped } from "./scenes.ts";

const nine = "2026-01-01T09:00:00Z";
const nineOne = "2026-01-01T09:01:00Z";
const nineTwo = "2026-01-01T09:02:30Z";

it.effect("Rule 3 / Send becomes Stop: a running turn refuses a second send and accepts a stop", () =>
  story(
    asOwner(ada),
    ...startChat(ada, "c1", "t1", "hi", nine),
    Story.state(chat("c1"), { runningTurn: turnId("t1") }),
    Story.when(chat("c1"), new SendMessage({ turnId: turnId("t2"), text: "again" })),
    Story.rejected(new TurnInProgress({ turnId: turnId("t1") })),
    Story.then(chat("c1")),
    Story.when(chat("c1"), new StopTurn()),
    Story.then(chat("c1"), new TurnStopRequested({ owner: ada, turnId: turnId("t1") })),
    Story.then(turn("t1"), stopped("c1", nine)),
    settled(ada, "c1", "t1", "stopped"),
    modelReplies("c1/t1", "too late"),
  ),
);

it.effect("Rule 3 / Send becomes Stop: after the turn ends, send works again and stop has nothing to stop", () =>
  story(
    asOwner(ada),
    ...startChat(ada, "c1", "t1", "hi", nine),
    Story.clock(nineOne),
    modelReplies("c1/t1", "hello"),
    Story.then(turn("t1"), finished("c1", "hello", nineOne)),
    settled(ada, "c1", "t1", "finished"),
    Story.when(chat("c1"), new StopTurn()),
    Story.rejected(new NoTurnRunning()),
    Story.when(chat("c1"), new SendMessage({ turnId: turnId("t2"), text: "next" })),
    Story.then(chat("c1"), new MessageSent({ owner: ada, turnId: turnId("t2"), text: "next" })),
    Story.then(
      turn("t2"),
      new TurnStarted({ conversationId: ConversationId.make("c1"), owner: ada, text: "next", at: iso(nineOne) }),
    ),
    Story.call("t2", ModelProvider.respond, { text: "next" }),
    modelReplies("t2", "ok"),
    Story.then(turn("t2"), finished("c1", "ok", nineOne)),
    settled(ada, "c1", "t2", "finished"),
  ),
);

it.effect("Rule 3 / Esc stops the agent: the turn ends with TurnStopped and records nothing afterwards", () =>
  story(
    asOwner(ada),
    ...startChat(ada, "c1", "t1", "hi", nine),
    Story.when(turn("t1"), new StartToolCall({ callId: "k1", tool: "search" })),
    Story.then(turn("t1"), new ToolCallStarted({ callId: "k1", tool: "search", at: iso(nine) })),
    Story.when(chat("c1"), new StopTurn()),
    Story.then(chat("c1"), new TurnStopRequested({ owner: ada, turnId: turnId("t1") })),
    Story.then(turn("t1"), stopped("c1", nine)),
    settled(ada, "c1", "t1", "stopped"),
    Story.state(turn("t1"), { _tag: "Ended" }),
    modelReplies("c1/t1", "late answer"),
    Story.then(turn("t1")),
    Story.when(turn("t1"), new FinishToolCall({ callId: "k1" })),
    Story.rejected(new TurnNotRunning()),
    Story.then(turn("t1")),
  ),
);

it.effect("Rule 3 / Each tool call shows start and finish times", () =>
  story(
    asOwner(ada),
    ...startChat(ada, "c1", "t1", "hi", nine),
    Story.clock(nineOne),
    Story.when(turn("t1"), new StartToolCall({ callId: "k1", tool: "search" })),
    Story.then(turn("t1"), new ToolCallStarted({ callId: "k1", tool: "search", at: iso(nineOne) })),
    Story.clock(nineTwo),
    Story.when(turn("t1"), new FinishToolCall({ callId: "k1" })),
    Story.then(turn("t1"), new ToolCallFinished({ callId: "k1", at: iso(nineTwo) })),
    modelReplies("c1/t1", "done"),
    Story.then(turn("t1"), finished("c1", "done", nineTwo)),
    settled(ada, "c1", "t1", "finished"),
  ),
);

it.effect("Rule 3 / The whole task shows start and finish times: TurnStarted and TurnFinished carry their own times", () =>
  story(
    asOwner(ada),
    ...startChat(ada, "c1", "t1", "hi", nine),
    Story.clock("2026-01-01T09:04:12Z"),
    modelReplies("c1/t1", "done"),
    Story.then(turn("t1"), finished("c1", "done", "2026-01-01T09:04:12Z")),
    settled(ada, "c1", "t1", "finished"),
    Story.state(turn("t1"), { _tag: "Ended" }),
  ),
);
