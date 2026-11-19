import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import { Conversation } from "../Conversation/Conversation.aggregate.ts";
import { TurnStopRequested } from "../Conversation/StopTurn.command.ts";
import { Turn } from "./Turn.aggregate.ts";
import { StopRun } from "./turnCommands.ts";

export class TurnStop extends Domain.Policy(
  "TurnStop",
  { from: Conversation, on: [TurnStopRequested] },
  { description: "Whenever the owner asks to stop, stop the running turn." },
) {}

export const TurnStopLive = TurnStop.toLayer(
  Effect.gen(function* () {
    const turns = yield* Turn;
    return Effect.fn(function* ({ event }) {
      yield* turns.send(event.turnId, new StopRun()).pipe(Effect.orDie);
    });
  }),
);
