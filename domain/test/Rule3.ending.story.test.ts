import { it } from "@effect/vitest";
import { Story } from "@alchemy.run/domain/Story";
import { ChatList } from "../src/ChatList.view.ts";
import { EMPTY_REPLY_REASON } from "../src/rules/chatStatus.ts";
import { StartToolCall, ToolCallAbandoned, ToolCallStarted } from "../src/Turn/turnCommands.ts";
import { ada, asOwner, story, turn } from "./support.ts";
import { failed, finished, iso, modelFails, modelReplies, settled, startChat } from "./scenes.ts";

const nine = "2026-01-01T09:00:00Z";
const nineOne = "2026-01-01T09:01:00Z";

it.effect("Rule 3 / A stuck tool row never runs forever: a turn that ends with an open call marks it abandoned", () =>
  story(
    asOwner(ada),
    ...startChat(ada, "c1", "t1", "hi", nine),
    Story.when(turn("t1"), new StartToolCall({ callId: "k1", tool: "search" })),
    Story.then(turn("t1"), new ToolCallStarted({ callId: "k1", tool: "search", at: iso(nine) })),
    Story.clock(nineOne),
    modelReplies("c1/t1", "done anyway"),
    Story.then(turn("t1"), new ToolCallAbandoned({ callId: "k1", at: iso(nineOne) }), finished("c1", "done anyway", nineOne)),
    settled(ada, "c1", "t1", "finished"),
  ),
);

it.effect("Rule 3 / A stuck tool row never runs forever: a failed turn also closes its open call", () =>
  story(
    asOwner(ada),
    ...startChat(ada, "c1", "t1", "hi", nine),
    Story.when(turn("t1"), new StartToolCall({ callId: "k1", tool: "fetch" })),
    Story.then(turn("t1"), new ToolCallStarted({ callId: "k1", tool: "fetch", at: iso(nine) })),
    modelFails("c1/t1", "provider down"),
    Story.then(turn("t1"), new ToolCallAbandoned({ callId: "k1", at: iso(nine) }), failed("c1", "provider down", nine)),
    settled(ada, "c1", "t1", "failed"),
  ),
);

it.effect("Rule 3 / A turn that ends with nothing visible says so: an empty reply fails with the retry line", () =>
  story(
    asOwner(ada),
    ...startChat(ada, "c1", "t1", "hi", nine),
    modelReplies("c1/t1", "   "),
    Story.then(turn("t1"), failed("c1", EMPTY_REPLY_REASON, nine)),
    settled(ada, "c1", "t1", "failed"),
    Story.view(ChatList, ada, (state) => {
      if (state.chats.c1?.status !== "failed") throw new Error(`empty reply shows ${state.chats.c1?.status}`);
    }),
  ),
);
