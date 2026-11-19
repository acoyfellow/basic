import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import { Activity } from "effect/workflow";
import { ConversationId, OwnerEmail, TurnId } from "../ids.ts";
import * as Schema from "effect/Schema";
import { ModelProvider, ModelUnavailable } from "./ModelProvider.external.ts";
import { Turn } from "./Turn.aggregate.ts";
import { FailTurn, FinishTurn, StartTurn } from "./turnCommands.ts";

export class TurnRun extends Domain.Saga(
  "TurnRun",
  {
    key: TurnId,
    input: { conversationId: ConversationId, owner: OwnerEmail, text: Schema.String },
  },
  { description: "Runs one turn: starts it, asks the model, then finishes or fails it." },
) {}

export const TurnRunLive = TurnRun.toLayer(
  Effect.gen(function* () {
    const turns = yield* Turn;
    const provider = yield* ModelProvider;
    return Effect.fn(function* ({ key, conversationId, owner, text }) {
      yield* Activity.make({
        name: "start",
        execute: turns.send(key, new StartTurn({ conversationId, owner, text })).pipe(Effect.orDie),
      });
      const answer = yield* Activity.make({
        name: "ask-model",
        success: Schema.Struct({ reply: Schema.String }),
        error: ModelUnavailable,
        execute: provider.respond({ text }),
      }).pipe(Effect.result);
      if (answer._tag === "Success") {
        yield* Activity.make({
          name: "finish",
          execute: turns
            .send(key, new FinishTurn({ reply: answer.success.reply }))
            .pipe(Effect.catchTag("TurnNotRunning", () => Effect.void), Effect.asVoid),
        });
        return;
      }
      yield* Activity.make({
        name: "fail",
        execute: turns
          .send(key, new FailTurn({ reason: answer.failure.reason }))
          .pipe(Effect.catchTag("TurnNotRunning", () => Effect.void), Effect.asVoid),
      });
    });
  }),
);
