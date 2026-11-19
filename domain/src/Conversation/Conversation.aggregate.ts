import * as Domain from "@alchemy.run/domain";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { CurrentOwner } from "../CurrentOwner.context.ts";
import { ConversationId, OwnerEmail, TurnId } from "../ids.ts";
import { NotOwner } from "../NotOwner.rejection.ts";
import { ChatDeleted, DeleteChat } from "./DeleteChat.command.ts";
import { ChatNotFound, ChatAlreadyExists, NoTurnRunning, TurnInProgress } from "./rejections.ts";
import { ChatRenamed, RenameChat } from "./RenameChat.command.ts";
import { SendMessage } from "./SendMessage.command.ts";
import { SettleTurn, TurnSettled } from "./SettleTurn.command.ts";
import { ChatStarted, MessageSent, StartConversation } from "./StartConversation.command.ts";
import { StopTurn, TurnStopRequested } from "./StopTurn.command.ts";

const ConversationState = Schema.Union([
  Schema.TaggedStruct("Absent", {}),
  Schema.TaggedStruct("Active", {
    owner: OwnerEmail,
    title: Schema.String,
    runningTurn: Schema.NullOr(TurnId),
  }),
  Schema.TaggedStruct("Deleted", { owner: OwnerEmail }),
]);
type ConversationState = typeof ConversationState.Type;
type Active = Extract<ConversationState, { _tag: "Active" }>;

const ownedChat = Effect.fn(function* (state: ConversationState) {
  if (state._tag !== "Active") return yield* new ChatNotFound();
  const current = yield* CurrentOwner;
  if (current.email !== state.owner) return yield* new NotOwner();
  return state;
});

const whenActive = (state: ConversationState, change: (active: Active) => ConversationState) =>
  state._tag === "Active" ? change(state) : state;

export class Conversation extends Domain.Aggregate(
  "Conversation",
  {
    id: ConversationId,
    state: ConversationState,
    initial: { _tag: "Absent" },
    commands: [StartConversation, SendMessage, StopTurn, RenameChat, DeleteChat, SettleTurn],
    decide: {
      StartConversation: Effect.fn(function* (state, command) {
        if (state._tag !== "Absent") return yield* new ChatAlreadyExists();
        const { email } = yield* CurrentOwner;
        return [
          new ChatStarted({ owner: email, title: command.title }),
          new MessageSent({ owner: email, turnId: command.turnId, text: command.text }),
        ];
      }),
      SendMessage: Effect.fn(function* (state, command) {
        const chat = yield* ownedChat(state);
        if (chat.runningTurn !== null) return yield* new TurnInProgress({ turnId: chat.runningTurn });
        return [new MessageSent({ owner: chat.owner, turnId: command.turnId, text: command.text })];
      }),
      StopTurn: Effect.fn(function* (state) {
        const chat = yield* ownedChat(state);
        if (chat.runningTurn === null) return yield* new NoTurnRunning();
        return [new TurnStopRequested({ owner: chat.owner, turnId: chat.runningTurn })];
      }),
      RenameChat: Effect.fn(function* (state, command) {
        const chat = yield* ownedChat(state);
        return [new ChatRenamed({ owner: chat.owner, title: command.title })];
      }),
      DeleteChat: Effect.fn(function* (state) {
        const chat = yield* ownedChat(state);
        return [new ChatDeleted({ owner: chat.owner })];
      }),
      SettleTurn: (state, command) =>
        state._tag === "Active" && state.runningTurn === command.turnId
          ? [new TurnSettled({ owner: state.owner, turnId: command.turnId, outcome: command.outcome })]
          : [],
    },
    evolve: {
      ChatStarted: (_, event) => ({
        _tag: "Active" as const,
        owner: event.owner,
        title: event.title,
        runningTurn: null,
      }),
      MessageSent: (state, event) => whenActive(state, (chat) => ({ ...chat, runningTurn: event.turnId })),
      TurnStopRequested: (state) => state,
      TurnSettled: (state) => whenActive(state, (chat) => ({ ...chat, runningTurn: null })),
      ChatRenamed: (state, event) => whenActive(state, (chat) => ({ ...chat, title: event.title })),
      ChatDeleted: (state) =>
        state._tag === "Active" ? { _tag: "Deleted" as const, owner: state.owner } : state,
    },
  },
  { description: "One chat: its title, its owner, and whether a turn is running." },
) {}
