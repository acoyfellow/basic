import { Story } from "@alchemy.run/domain/Story";
import * as Layer from "effect/Layer";
import { Chat, ChatHandlers } from "../src/Chat.model.ts";
import { Conversation } from "../src/Conversation/Conversation.aggregate.ts";
import { ConversationId, OwnerEmail, TurnId } from "../src/ids.ts";
import { CurrentOwner } from "../src/CurrentOwner.context.ts";
import { ModelProvider } from "../src/Turn/ModelProvider.external.ts";
import { Turn } from "../src/Turn/Turn.aggregate.ts";

export const story = Story.make(Chat, {
  layer: ChatHandlers.pipe(Layer.provide(Layer.empty)),
  stub: [ModelProvider],
});

export const ada = OwnerEmail.make("ada@example.com");
export const bob = OwnerEmail.make("bob@example.com");

export const asOwner = (email: OwnerEmail) => Story.provide(CurrentOwner, { email });

export const chat = (id: string) => Conversation.ref(ConversationId.make(id));
export const turn = (id: string) => Turn.ref(TurnId.make(id));
export const turnId = (id: string) => TurnId.make(id);
