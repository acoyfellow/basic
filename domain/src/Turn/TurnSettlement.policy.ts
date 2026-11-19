import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import { Conversation } from "../Conversation/Conversation.aggregate.ts";
import { SettleTurn, type TurnOutcome } from "../Conversation/SettleTurn.command.ts";
import { TurnId } from "../ids.ts";
import { Turn } from "./Turn.aggregate.ts";
import { TurnFailed, TurnFinished, TurnNeedsInput, TurnStopped } from "./turnCommands.ts";

const outcomes: Record<string, TurnOutcome> = {
  TurnFinished: "finished",
  TurnFailed: "failed",
  TurnStopped: "stopped",
  TurnNeedsInput: "needs-you",
};

export class TurnSettlement extends Domain.Policy(
  "TurnSettlement",
  { from: Turn, on: [TurnFinished, TurnFailed, TurnStopped, TurnNeedsInput] },
  { description: "Whenever a turn ends, tell its chat how it ended." },
) {}

export const TurnSettlementLive = TurnSettlement.toLayer(
  Effect.gen(function* () {
    const conversations = yield* Conversation;
    return Effect.fn(function* ({ source, event }) {
      yield* conversations
        .send(event.conversationId, new SettleTurn({ turnId: TurnId.make(source.id), outcome: outcomes[event._tag]! }))
        .pipe(Effect.orDie);
    });
  }),
);
