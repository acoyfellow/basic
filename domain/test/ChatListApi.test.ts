import * as Domain from "@alchemy.run/domain";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { ChatApi } from "../src/Chat.api.ts";
import { Chat, ChatHandlers } from "../src/Chat.model.ts";
import { CurrentOwner } from "../src/CurrentOwner.context.ts";
import { ConversationId, OwnerEmail, TurnId } from "../src/ids.ts";
import { Session } from "../src/Session.middleware.ts";
import { ModelProvider } from "../src/Turn/ModelProvider.external.ts";
import { ada, bob } from "./support.ts";

const silentProvider = ModelProvider.toLayer(Effect.succeed({ respond: () => Effect.never }));

const World = Chat.layer(ChatHandlers).pipe(
  Layer.provide(Layer.mergeAll(silentProvider, Domain.InMemory)),
);

const signedInAs = (email: OwnerEmail) =>
  Layer.succeed(Session, (effect) => Effect.provideService(effect, CurrentOwner, { email }));

const clientFor = (email: OwnerEmail) => ChatApi.clientInProcess.pipe(Effect.provide(signedInAs(email)));

it.live("ChatList refuses to be read by a different owner, and shows an owner their own chat", () =>
  Effect.gen(function* () {
    const owner = yield* clientFor(ada);
    const receipt = yield* owner.StartConversation(ConversationId.make("c1"), {
      title: "Hello",
      turnId: TurnId.make("t1"),
      text: "hi",
    });
    const own = yield* owner.ChatList.get(ada, { atLeast: receipt });
    expect(Object.keys(own?.chats ?? {})).toEqual(["c1"]);
    const intruder = yield* clientFor(bob);
    const refused = yield* intruder.ChatList.get(ada).pipe(Effect.flip);
    expect(refused._tag).toBe("NotOwner");
  }).pipe(Effect.scoped, Effect.provide(World)),
);
