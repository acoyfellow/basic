import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import { Conversation } from "../Conversation/Conversation.aggregate.ts";
import { MessageSent } from "../Conversation/StartConversation.command.ts";
import { ConversationId } from "../ids.ts";
import { TurnRun } from "./TurnRun.saga.ts";

export class TurnLaunch extends Domain.Policy(
  "TurnLaunch",
  { from: Conversation, on: [MessageSent] },
  { description: "Whenever a message is sent, run a turn for it." },
) {}

export const TurnLaunchLive = TurnLaunch.toLayer(
  Effect.gen(function* () {
    const runs = yield* TurnRun;
    return Effect.fn(function* ({ source, event }) {
      yield* runs.start(event.turnId, {
        conversationId: ConversationId.make(source.id),
        owner: event.owner,
        text: event.text,
      });
    });
  }),
);
